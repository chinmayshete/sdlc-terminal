"""Nexus API Bridge Server — FastAPI application exposing the Orchestrator as HTTP/WebSocket endpoints.

This server acts as a bridge between the VS Code extension (TypeScript) and the Python
core engine. It wraps the same Orchestrator, NL parsers, and operation modules that the
terminal REPL uses, exposing them over HTTP/JSON.

Start with:  nexus serve [--port 9500] [--host 127.0.0.1]
"""
from __future__ import annotations
import asyncio
import traceback
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ChatRequest, ChatResponse, FileChangeModel,
    CommandRequest, CommandResponse,
    IntentRequest, IntentResponse,
    StatusResponse, TicketStatusModel,
    HealthResponse,
    TicketModel,
    TicketPlanRequest, PlanResponse,
    ExecuteResponse,
    ModeInfo, ModesResponse,
    ScanFileRequest,
    ServerInfo,
)
from ..core.orchestrator import Orchestrator
from ..core.types import NlpChatTurn
from ..utils.nexus_nl_parser import parse_nexus_intent_with_llm
from ..utils.git_nl_parser import parse_git_intent_with_llm, get_git_command_help
from ..utils.security_nl_parser import parse_security_intent_with_llm, get_security_command_help
from ..utils.devops_nl_parser import parse_devops_intent_with_llm, get_devops_command_help
from ..utils.agile_nl_parser import parse_agile_intent_with_llm, get_agile_command_help
from ..utils import git_operations as gitops
from ..utils import devops_operations as devops
from ..utils import security_operations as secops
from ..utils import agile_operations as pmops
from ..utils import system_operations as sysops
from ..utils.git import create_release_branch, create_hotfix_branch, merge_feature_to_develop, rollback_last_commit, rollback_to_commit
from ..config.paths import paths

# ── Global state ─────────────────────────────────────────────
_orchestrator: Orchestrator | None = None
_chat_history: list[NlpChatTurn] = []

def _get_orchestrator() -> Orchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Orchestrator()
    return _orchestrator

# ── App lifecycle ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _orchestrator
    _orchestrator = Orchestrator()
    yield
    _orchestrator = None

app = FastAPI(
    title="Nexus SDLC API",
    description="Bridge API for the Nexus VS Code extension",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow VS Code webview origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def reload_env_middleware(request, call_next):
    from ..config.env import reload_env
    reload_env()
    return await call_next(request)

# ── Utility ──────────────────────────────────────────────────
AVAILABLE_MODES = [
    ModeInfo(id="command", label="Nexus", color="#00ff00", description="Main command hub & freeform AI chat"),
    ModeInfo(id="git", label="Git", color="#ff00ff", description="Conversational version control"),
    ModeInfo(id="security", label="Security", color="#ff0000", description="AI-driven SAST & governance"),
    ModeInfo(id="devops", label="DevOps", color="#ffff00", description="CI/CD, Docker, Terraform & infra"),
    ModeInfo(id="agile", label="Agile", color="#0088ff", description="Jira, sprints & project management"),
]

def _safe_list(val: Any) -> list[str]:
    """Ensure a value is a list of strings."""
    if isinstance(val, list):
        return [str(v) for v in val]
    if isinstance(val, str):
        return [val]
    return [str(val)]

async def _try_execute_mode_command(o: Orchestrator, raw: str, mode: str) -> CommandResponse | None:
    """Parses intent for active mode and runs it if the command is recognized."""
    cleaned = raw.strip().lower()

    # Intercept exit/quit in non-command modes to return to command mode
    if cleaned in ("exit", "quit") and mode != "command":
        return CommandResponse(title="Nexus Mode", output=["Returning to main mode."], mode="command")

    if mode == "command":
        # Check if they typed a mode name to switch to it
        if cleaned in ("git", "security", "devops", "agile"):
            return CommandResponse(title=f"{cleaned.title()} Mode", output=[f"Switched to {cleaned} mode."], mode=cleaned)

        intent = await parse_nexus_intent_with_llm(raw)
        if intent.command != "unknown":
            return await _exec_command_mode(o, raw)
    elif mode == "git":
        return await _exec_git_mode(o, raw)
    elif mode == "security":
        return await _exec_security_mode(o, raw)
    elif mode == "devops":
        return await _exec_devops_mode(o, raw)
    elif mode == "agile":
        return await _exec_agile_mode(o, raw)
    return None

# ── Root ─────────────────────────────────────────────────────
@app.get("/", response_model=ServerInfo)
async def root():
    return ServerInfo()

@app.post("/api/shutdown")
async def shutdown_server():
    import os, signal
    # Send SIGINT to own process to trigger uvicorn graceful shutdown
    os.kill(os.getpid(), signal.SIGINT)
    return {"status": "shutting down"}

# ── Chat ─────────────────────────────────────────────────────
@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    o = _get_orchestrator()
    try:
        # Build history from request
        history = [NlpChatTurn(role=t.role, content=t.content) for t in req.history]
        if not history:
            history = _chat_history.copy()

        # Try executing as mode command
        cmd_res = await _try_execute_mode_command(o, req.message, req.mode)
        if cmd_res:
            # Update server-side history
            _chat_history.append(NlpChatTurn("user", req.message))
            _chat_history.append(NlpChatTurn("assistant", "\n".join(cmd_res.output)))
            return ChatResponse(
                message="\n".join(cmd_res.output),
                changes=[],
                commands=[],
                mode=cmd_res.mode
            )

        result = await o.run_free_nlp_chat(history, req.message)

        # Update server-side history
        _chat_history.append(NlpChatTurn("user", req.message))
        _chat_history.append(NlpChatTurn("assistant", result.message))

        # Apply file changes if any
        changes = []
        if result.changes:
            await o.apply_nlp_changes(result.changes)
            changes = [
                FileChangeModel(
                    path=str((paths["root_dir"] / c.path).resolve()) if c.path else "",
                    content=c.content,
                    action=getattr(c, "action", "update")
                ) for c in result.changes
            ]

        return ChatResponse(
            message=result.message,
            changes=changes,
            commands=result.commands if result.commands else [],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Intent Parsing ───────────────────────────────────────────
@app.post("/api/intent", response_model=IntentResponse)
async def parse_intent(req: IntentRequest):
    """Parse natural language to a structured intent for a given mode."""
    parsers = {
        "command": parse_nexus_intent_with_llm,
        "git": parse_git_intent_with_llm,
        "security": parse_security_intent_with_llm,
        "devops": parse_devops_intent_with_llm,
        "agile": parse_agile_intent_with_llm,
    }
    parser = parsers.get(req.mode, parse_nexus_intent_with_llm)
    try:
        intent = await parser(req.input)
        return IntentResponse(command=intent.command, args=intent.args)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Command Execution ────────────────────────────────────────
@app.post("/api/command", response_model=CommandResponse)
async def execute_command(req: CommandRequest):
    """Execute a command in a specific mode. This is the universal command executor."""
    o = _get_orchestrator()
    try:
        if req.mode == "command":
            return await _exec_command_mode(o, req.input)
        elif req.mode == "git":
            return await _exec_git_mode(o, req.input)
        elif req.mode == "security":
            return await _exec_security_mode(o, req.input)
        elif req.mode == "devops":
            return await _exec_devops_mode(o, req.input)
        elif req.mode == "agile":
            return await _exec_agile_mode(o, req.input)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Status ───────────────────────────────────────────────────
@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    o = _get_orchestrator()
    s = await o.status("command")
    return StatusResponse(
        ai_mode=s.ai_mode,
        ai_configured=s.ai_configured,
        tickets=[TicketStatusModel(ticket_id=t.ticket_id, status=t.status, note=t.note) for t in s.tickets],
    )

# ── Health ───────────────────────────────────────────────────
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    o = _get_orchestrator()
    h = await o.ai_health()
    return HealthResponse(configured=h.configured, mode=h.mode, reachable=h.reachable, message=h.message)

# ── Modes ────────────────────────────────────────────────────
@app.get("/api/modes", response_model=ModesResponse)
async def get_modes():
    return ModesResponse(modes=AVAILABLE_MODES)

# ── Tickets ──────────────────────────────────────────────────
@app.get("/api/tickets", response_model=list[TicketModel])
async def list_tickets():
    o = _get_orchestrator()
    tickets = await o.list_tickets()
    return [TicketModel(id=t.id, title=t.title, description=t.description, priority=t.priority) for t in tickets]

@app.post("/api/tickets/{ticket_id}/plan", response_model=PlanResponse)
async def plan_ticket(ticket_id: str, req: TicketPlanRequest | None = None):
    o = _get_orchestrator()
    mode = req.mode if req else "basic"
    try:
        plan = await o.plan(ticket_id, mode)
        return PlanResponse(ticket_id=ticket_id, steps=plan.steps)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/tickets/{ticket_id}/execute", response_model=ExecuteResponse)
async def execute_ticket(ticket_id: str):
    o = _get_orchestrator()
    try:
        r = await o.execute(ticket_id)
        return ExecuteResponse(
            ticket_id=ticket_id,
            updated_files=r.updated_files,
            generated_tests=r.generated_tests,
            ticket_status=r.ticket_status,
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

# ── Security ─────────────────────────────────────────────────
@app.post("/api/security/scan", response_model=CommandResponse)
async def run_security_scan():
    output = await secops.run_full_scan()
    return CommandResponse(title="Security Scan", output=_safe_list(output))

@app.post("/api/security/scan-file", response_model=CommandResponse)
async def scan_file(req: ScanFileRequest):
    output = await secops.run_scan_file(req.file_path)
    return CommandResponse(title=f"Scan: {req.file_path}", output=_safe_list(output))

@app.get("/api/security/dashboard", response_model=CommandResponse)
async def security_dashboard():
    output = await secops.get_security_dashboard()
    return CommandResponse(title="Security Dashboard", output=_safe_list(output))

@app.get("/api/security/posture", response_model=CommandResponse)
async def security_posture():
    output = await secops.get_security_posture()
    return CommandResponse(title="Security Posture", output=_safe_list(output))

# ── Git ──────────────────────────────────────────────────────
@app.get("/api/git/status", response_model=CommandResponse)
async def git_status():
    output = await gitops.git_status()
    return CommandResponse(title="Git Status", output=_safe_list(output))

@app.get("/api/git/log", response_model=CommandResponse)
async def git_log(count: int = 10):
    output = await gitops.git_log(count)
    return CommandResponse(title="Git Log", output=_safe_list(output))

@app.get("/api/git/branches", response_model=CommandResponse)
async def git_branches():
    output = await gitops.git_list_branches()
    return CommandResponse(title="Git Branches", output=_safe_list(output))

@app.get("/api/git/diff", response_model=CommandResponse)
async def git_diff(file: str | None = None):
    output = await gitops.git_diff(file)
    return CommandResponse(title="Git Diff", output=_safe_list(output))

# ── System ───────────────────────────────────────────────────
@app.get("/api/system/health", response_model=CommandResponse)
async def system_health():
    output = await sysops.run_system_health()
    return CommandResponse(title="System Health", output=_safe_list(output))

@app.get("/api/system/doctor", response_model=CommandResponse)
async def system_doctor():
    output = await sysops.run_system_doctor()
    return CommandResponse(title="System Doctor", output=_safe_list(output))

@app.get("/api/system/version", response_model=CommandResponse)
async def system_version():
    output = await sysops.run_system_version()
    return CommandResponse(title="System Version", output=_safe_list(output))

# ── WebSocket Chat (for streaming) ───────────────────────────
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    from ..config.env import reload_env
    reload_env()
    from ..core.agent_loop import AgentLoop
    agent = AgentLoop()

    async def handle_agent_result(res: dict):
        res_type = res.get("type")
        if res_type == "permission_request":
            await websocket.send_json({
                "type": "permission_request",
                "id": res["request_id"],
                "tool": res["tool"],
                "args": res["args"],
                "thought": res.get("thought", ""),
                "message": res.get("message", "")
            })
        elif res_type == "clarification":
            await websocket.send_json({
                "type": "clarification",
                "thought": res.get("thought", ""),
                "question": res["question"]
            })
        elif res_type == "response":
            # Collect file changes made during this turn
            changes = []
            start_idx = getattr(agent, "current_turn_start_idx", 0)
            for i in range(start_idx, len(agent.history)):
                turn = agent.history[i]
                if turn.get("role") == "assistant":
                    try:
                        content_data = json.loads(turn.get("content", "{}"))
                        if content_data.get("tool") == "edit_file":
                            if i + 1 < len(agent.history):
                                res_turn = agent.history[i + 1]
                                if "Tool execution result for 'edit_file'" in res_turn.get("content", ""):
                                    args = content_data.get("args", {})
                                    raw_path = args.get("path")
                                    abs_path = str((paths["root_dir"] / raw_path).resolve()) if raw_path else ""
                                    changes.append({
                                        "path": abs_path,
                                        "content": args.get("content", ""),
                                        "action": args.get("action", "update")
                                    })
                    except Exception:
                        pass

            await websocket.send_json({
                "type": "response",
                "message": res["message"],
                "changes": changes
            })
        elif res_type == "error":
            await websocket.send_json({
                "type": "error",
                "message": res["message"]
            })

    active_task: asyncio.Task | None = None

    async def run_agent_turn(coro):
        nonlocal active_task
        try:
            res = await coro
            await handle_agent_result(res)
        except asyncio.CancelledError:
            agent.pending_tool = None
            agent.pending_tool_id = None
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": "Execution stopped by user."
                })
            except Exception:
                pass
        except Exception as e:
            try:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Execution failed: {str(e)}"
                })
            except Exception:
                pass
        finally:
            active_task = None

    try:
        import json
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "chat")

            if msg_type == "chat":
                if active_task and not active_task.done():
                    await websocket.send_json({"type": "error", "message": "An execution is already in progress."})
                    continue
                message = data.get("message", "")
                if not message:
                    await websocket.send_json({"type": "error", "message": "Empty message"})
                    continue

                from ..config.env import reload_env
                reload_env()
                await websocket.send_json({"type": "thinking", "message": "Thinking..."})

                mode = data.get("mode", "command")
                o = _get_orchestrator()
                cmd_res = await _try_execute_mode_command(o, message, mode)
                if cmd_res:
                    # Update server-side history
                    from ..core.types import NlpChatTurn
                    global _chat_history
                    _chat_history.append(NlpChatTurn("user", message))
                    _chat_history.append(NlpChatTurn("assistant", "\n".join(cmd_res.output)))
                    # Sync agent.history
                    agent.history.append({"role": "user", "content": message})
                    agent.history.append({"role": "assistant", "content": json.dumps({"thought": "Direct mode command executed", "tool": None, "message": "\n".join(cmd_res.output)})})

                    await websocket.send_json({
                        "type": "response",
                        "message": "\n".join(cmd_res.output),
                        "changes": [],
                        "mode": cmd_res.mode
                    })
                else:
                    active_task = asyncio.create_task(run_agent_turn(agent.start_turn(message)))

            elif msg_type == "permission_response":
                if active_task and not active_task.done():
                    await websocket.send_json({"type": "error", "message": "An execution is already in progress."})
                    continue
                allowed = data.get("allowed", False)
                req_id = data.get("id")

                if not agent.pending_tool or agent.pending_tool_id != req_id:
                    await websocket.send_json({"type": "error", "message": "No matching pending tool request."})
                    continue

                await websocket.send_json({"type": "thinking", "message": "Executing..."})
                active_task = asyncio.create_task(run_agent_turn(agent.resume_with_permission(allowed)))

            elif msg_type == "stop":
                if active_task and not active_task.done():
                    active_task.cancel()
                else:
                    await websocket.send_json({"type": "error", "message": "No execution in progress."})

    except WebSocketDisconnect:
        if active_task and not active_task.done():
            active_task.cancel()


# ── Mode-specific command executors (mirrors terminal.py logic) ──

async def _exec_command_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in main/nexus mode."""
    intent = await parse_nexus_intent_with_llm(raw)
    c, a = intent.command, intent.args

    if c == "status":
        s = await o.status("command")
        lines = [f"AI Service: {s.ai_mode} ({'configured' if s.ai_configured else 'not configured'})", ""]
        for t in s.tickets:
            lines.append(f"  • {t.ticket_id}: {t.status} ({t.note or 'No notes'})")
        return CommandResponse(title="Workspace Status", output=lines)
    elif c == "health":
        r = await sysops.run_system_health()
        return CommandResponse(title="System Health", output=_safe_list(r))
    elif c == "doctor":
        r = await sysops.run_system_doctor()
        return CommandResponse(title="System Doctor", output=_safe_list(r))
    elif c == "version":
        r = await sysops.run_system_version()
        return CommandResponse(title="System Version", output=_safe_list(r))
    elif c == "ai":
        h = await o.ai_health()
        return CommandResponse(title="AI Service Health", output=[
            f"Mode: {h.mode}", f"Configured: {h.configured}",
            f"Reachable: {h.reachable}", f"Message: {h.message}",
        ])
    elif c in ("security", "devops", "git", "agile"):
        return CommandResponse(title=f"{c.title()} Mode", output=[f"Switched to {c} mode."], mode=c)
    elif c == "help":
        return CommandResponse(title="Nexus Help", output=[
            "── Core System ──",
            "  status       Show workspace runtime status",
            "  health       Check integrations & services health",
            "  ai           Check AI service health & reachability",
            "  doctor       Run comprehensive system diagnostics",
            "  version      Display installed module version",
            "",
            "── Specialized Modes ──",
            "  security     Security & SAST governance",
            "  devops       CI/CD, Docker, Terraform & infra",
            "  git          Git command & policy mode",
            "  agile        Jira/Sprints/Agile",
        ])
    else:
        # Default: NLP chat
        global _chat_history
        result = await o.run_free_nlp_chat(_chat_history, raw)
        _chat_history.append(NlpChatTurn("user", raw))
        _chat_history.append(NlpChatTurn("assistant", result.message))
        output = [result.message]
        if result.changes:
            await o.apply_nlp_changes(result.changes)
            output.append("Updated files: " + ", ".join(c.path for c in result.changes))
        return CommandResponse(title="Nexus AI", output=output)


async def _exec_git_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in git mode."""
    intent = await parse_git_intent_with_llm(raw)
    c, a = intent.command, intent.args

    if c == "help":
        return CommandResponse(title="Git Help", output=get_git_command_help())
    elif c == "health":
        r = sysops.run_system_health()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Health", output=_safe_list(r))
    elif c == "version":
        r = sysops.run_system_version()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Version", output=_safe_list(r))
    elif c == "doctor":
        r = sysops.run_system_doctor()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Doctor", output=_safe_list(r))
    elif c == "config-view":
        r = sysops.run_config_view()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="Active Configuration", output=_safe_list(r))

    handlers = {
        "status": gitops.git_status, "log": lambda: gitops.git_log(int(a[0]) if a else 10),
        "diff": lambda: gitops.git_diff(a[0] if a else None), "diff-staged": gitops.git_diff_staged,
        "add": lambda: gitops.git_add(a[0]) if a else gitops.git_add_all(), "add-all": gitops.git_add_all,
        "commit": lambda: gitops.git_commit(a[0]) if a else "Usage: commit <message>",
        "commit-all": lambda: gitops.git_commit_all(a[0]) if a else "Usage: commit -a <message>",
        "branch-list": gitops.git_list_branches, "branch-create": lambda: gitops.git_create_branch(a[0]) if a else "Usage: branch <name>",
        "checkout": lambda: gitops.git_checkout(a[0]) if a else "Usage: checkout <name>",
        "branch-delete": lambda: gitops.git_delete_branch(a[0]) if a else "Usage: delete branch <name>",
        "pull": gitops.git_pull, "push": lambda: gitops.git_push(a[0] if a else None), "fetch": gitops.git_fetch,
        "stash": gitops.git_stash, "stash-pop": gitops.git_stash_pop, "stash-list": gitops.git_stash_list,
        "tag": lambda: gitops.git_tag(a[0]) if a else "Usage: tag <name>", "tag-list": gitops.git_list_tags,
        "remote": gitops.git_list_remotes, "unstage": lambda: gitops.git_unstage(a[0]) if a else "Usage: reset <file>",
        "cherry-pick": lambda: gitops.git_cherry_pick(a[0]) if a else "Usage: cherry-pick <sha>",
        "blame": lambda: gitops.git_blame(a[0]) if a else "Usage: blame <file>",
        "show": lambda: gitops.git_show_commit(a[0]) if a else "Usage: show <sha>",
        "merge": lambda: gitops.git_merge(a[0]) if a else "Usage: merge <branch>",
        "github-auth": gitops.github_auth,
        "github-clone": lambda: gitops.github_clone(a[0] if a else "https://github.com/org/repo"),
        "github-commit": lambda: gitops.github_commit(a[0] if a else "Update files"),
        "github-push": lambda: gitops.github_push(a[0] if a else ""),
        "github-pull": gitops.github_pull,
        "github-branches": gitops.github_branches,
        "github-issues": gitops.github_issues,
        "github-releases": gitops.github_releases,
        "github-pr-create": lambda: gitops.github_pr_create(a[0] if a else "Feature Update"),
        "github-pr-merge": lambda: gitops.github_pr_merge(a[0] if a else "42")
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="Git", output=[f"Unknown git command: {c}"])
    r = fn() if callable(fn) else fn
    if asyncio.iscoroutine(r):
        r = await r
    return CommandResponse(title=f"Git: {c}", output=_safe_list(r))


async def _exec_security_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in security mode."""
    intent = await parse_security_intent_with_llm(raw)
    c, a = intent.command, intent.args

    if c == "help":
        return CommandResponse(title="Security Help", output=get_security_command_help())
    elif c == "health":
        r = sysops.run_system_health()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Health", output=_safe_list(r))
    elif c == "version":
        r = sysops.run_system_version()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Version", output=_safe_list(r))
    elif c == "doctor":
        r = sysops.run_system_doctor()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Doctor", output=_safe_list(r))
    elif c == "config-view":
        r = sysops.run_config_view()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="Active Configuration", output=_safe_list(r))

    handlers = {
        "status": secops.check_file_status,
        "scan": secops.run_full_scan, "scan-errors": secops.run_scan_errors_only, "scan-warnings": secops.run_scan_warnings_only,
        "scan-summary": secops.run_scan_summary, "scan-file": lambda: secops.run_scan_file(a[0]) if a else ["Usage: scan file <path>"],
        "rules": secops.get_scan_rules, "secrets": secops.check_for_secrets, "env-audit": secops.audit_env_file,
        "sensitive-fields": secops.get_sensitive_fields, "deps-audit": secops.audit_dependencies,
        "licenses": secops.check_licenses, "vault": secops.check_vault_status, "config-security": secops.check_config_security,
        "compliance": secops.run_compliance_check, "gitflow": secops.get_gitflow_policy, "codeowners": secops.check_codeowners,
        "docker-security": secops.check_docker_security, "terraform-security": secops.check_terraform_security,
        "dashboard": secops.get_security_dashboard, "posture": secops.get_security_posture,
        "sast": secops.run_security_sast, "dast": secops.run_security_dast, "dependencies": secops.run_security_dependencies,
        "report": secops.run_security_report, "scan-history": secops.get_scan_history
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="Security", output=[f"Unknown security command: {c}"])
    r = fn() if callable(fn) else fn
    if asyncio.iscoroutine(r):
        r = await r
    return CommandResponse(title=f"Security: {c}", output=_safe_list(r))


async def _exec_devops_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in devops mode."""
    intent = await parse_devops_intent_with_llm(raw)
    c, a = intent.command, intent.args

    if c == "help":
        return CommandResponse(title="DevOps Help", output=get_devops_command_help())
    elif c == "status":
        r = sysops.run_system_status()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Status", output=_safe_list(r))
    elif c == "version":
        r = sysops.run_system_version()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Version", output=_safe_list(r))
    elif c == "doctor":
        r = sysops.run_system_doctor()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="System Doctor", output=_safe_list(r))
    elif c == "config-view":
        r = sysops.run_config_view()
        if asyncio.iscoroutine(r): r = await r
        return CommandResponse(title="Active Configuration", output=_safe_list(r))

    handlers = {
        "cicd": devops.get_cicd_overview, "jenkins-validate": devops.validate_jenkins, "jenkins-stages": devops.get_jenkins_stages,
        "jenkins-params": devops.get_jenkins_params, "actions": devops.get_github_actions_info, "actions-validate": devops.validate_github_actions,
        "pipeline-health": devops.get_pipeline_health, "scan": devops.run_full_security_scan, "scan-errors": devops.run_security_scan_errors_only,
        "secrets-check": devops.check_for_secrets, "docker-info": devops.get_dockerfile_info, "docker-stages": devops.get_docker_stages,
        "docker-validate": devops.validate_dockerfile, "terraform-info": devops.get_terraform_info, "infra-resources": devops.list_infra_resources,
        "env-show": devops.show_environment_config, "env-compare": devops.compare_environments, "env-validate": devops.validate_environment_files,
        "deps-audit": devops.audit_dependencies, "deps-check": devops.check_outdated_deps, "deps-licenses": devops.check_licenses,
        "deploy-status": devops.get_deployment_status, "deploy-check": lambda: devops.pre_deploy_check(a[0]) if a else ["Usage: deploy check <env>"],
        "release": lambda: create_release_branch(a[0]) if a else "Usage: release <version>",
        "hotfix": lambda: create_hotfix_branch(a[0]) if a else "Usage: hotfix <ticketId>",
        "merge": lambda: merge_feature_to_develop(a[0]) if a else "Usage: merge <ticketId>",
        "rollback": lambda: rollback_to_commit(a[0]) if a else rollback_last_commit(),
        "push": lambda: o.push(a[0]) if a else "Usage: push <ticketId>",
        "summary": devops.get_full_devops_summary, "changed": lambda: o.changed_files(),
        "health": devops.get_system_health, "pr-check": devops.run_pr_readiness_check,
        "jenkins-auth": devops.jenkins_auth, "jenkins-jobs": devops.jenkins_jobs, "jenkins-status": devops.jenkins_status,
        "jenkins-trigger": lambda: devops.jenkins_trigger(a[0] if a else "nexus-core-build"),
        "jenkins-logs": lambda: devops.jenkins_logs(a[0] if a else "nexus-core-build"),
        "jenkins-stop": lambda: devops.jenkins_stop(a[0] if a else "nexus-core-build"),
        "docker-build": lambda: devops.docker_build(a[0] if a else "latest"),
        "docker-run": lambda: devops.docker_run(a[0] if a else "nexus-app:latest"),
        "docker-stop": lambda: devops.docker_stop(a[0] if a else "d9b32a18f4"),
        "docker-images": devops.docker_images, "docker-ps": devops.docker_ps,
        "docker-logs": lambda: devops.docker_logs(a[0] if a else "d9b32a18f4"),
        "docker-remove": lambda: devops.docker_remove(a[0] if a else "d9b32a18f4"),
        "k8s-deploy": lambda: devops.k8s_deploy(a[0] if a else "k8s/deployment.yaml"),
        "k8s-pods": devops.k8s_pods, "k8s-services": devops.k8s_services,
        "k8s-logs": lambda: devops.k8s_logs(a[0] if a else "nexus-backend-7c859d"),
        "k8s-scale": lambda: devops.k8s_scale(a[0] if a else "nexus-backend", a[1] if len(a)>1 else "3"),
        "k8s-restart": lambda: devops.k8s_restart(a[0] if a else "nexus-backend"),
        "k8s-delete": lambda: devops.k8s_delete(a[0] if a else "pod/old-worker"),
        "monitor-status": devops.monitor_status, "monitor-logs": devops.monitor_logs, "monitor-metrics": devops.monitor_metrics,
        "monitor-alerts": devops.monitor_alerts, "monitor-health": devops.monitor_health,
        "deploy-start": lambda: devops.deploy_start(a[0] if a else "production"),
        "deploy-rollback": lambda: devops.deploy_rollback(a[0] if a else "v0.0.9"),
        "deploy-history": devops.deploy_history,
        "release-create": lambda: devops.release_create(a[0] if a else "v0.1.0"),
        "release-deploy": lambda: devops.release_deploy(a[0] if a else "v0.1.0", a[1] if len(a)>1 else "production"),
        "release-notes": lambda: devops.release_notes(a[0] if a else "v0.1.0"),
        "release-rollback": lambda: devops.release_rollback(a[0] if a else "v0.0.9"),
        "release-history": devops.release_history
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="DevOps", output=[f"Unknown devops command: {c}"])
    r = fn() if callable(fn) else fn
    if asyncio.iscoroutine(r):
        r = await r
    return CommandResponse(title=f"DevOps: {c}", output=_safe_list(r))


async def _exec_agile_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in agile mode."""
    intent = await parse_agile_intent_with_llm(raw)
    c, a = intent.command, intent.args

    # Ticket-related commands
    if c == "tickets":
        tickets = await o.list_tickets()
        return CommandResponse(title="Jira Tickets", output=[
            f"{t.id} — {t.title} [{t.priority}]" for t in tickets
        ] or ["No tickets found."])
    elif c == "plan":
        import re
        tid = a[0] if a else ""
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            return CommandResponse(title="Plan", output=[f"Invalid ticket ID: {tid}"])
        plan = await o.plan(tid, a[1] if len(a) > 1 else "basic")
        return CommandResponse(title=f"Plan: {tid}", output=[f"{i+1}. {s}" for i, s in enumerate(plan.steps)])
    elif c == "execute":
        import re
        tid = a[0] if a else ""
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            return CommandResponse(title="Execute", output=[f"Invalid ticket ID: {tid}"])
        r = await o.execute(tid)
        return CommandResponse(title=f"Execute: {tid}", output=[
            f"Updated files: {', '.join(r.updated_files) or 'none'}",
            f"Generated tests: {', '.join(r.generated_tests) or 'none'}",
            f"Ticket status: {r.ticket_status}",
        ])
    elif c in ("jira-auth", "jira-login"):
        auth_ok = await o.pm_jira_auth()
        return CommandResponse(title="Jira Auth", output=["[bold green]✓ Authenticated[/]" if auth_ok else "[bold red]✗ Authentication Failed[/]"])
    elif c == "story-create":
        summary = a[0] if a else ""
        if not summary:
            return CommandResponse(title="Create Story", output=["Usage: story create <summary>"])
        desc = " ".join(a[1:]) if len(a) > 1 else ""
        key = await o.pm_story_create(summary, desc)
        return CommandResponse(title="Create Story", output=[f"[bold green]✓ Created story:[/] {key}" if key else "[bold red]✗ Failed to create story.[/]"])
    elif c == "jira-transition":
        if len(a) < 2:
            return CommandResponse(title="Jira Transition", output=["Usage: jira transition <ticket_id> <status_name>"])
        ticket_id, target_status = a[0], " ".join(a[1:])
        transitions = await o.pm_fetch_transitions(ticket_id)
        target = next((t for t in transitions if t.get("name", "").lower() == target_status.lower() or t.get("to", {}).get("name", "").lower() == target_status.lower()), None)
        if not target:
            valid = ", ".join([t.get("name") for t in transitions]) if transitions else "none"
            return CommandResponse(title="Jira Transition", output=[f"[bold red]✗ Invalid target status '{target_status}'.[/]", f"Valid options: {valid}"])
        success = await o.pm_execute_transition(ticket_id, target["id"])
        return CommandResponse(title="Jira Transition", output=[f"[bold green]✓ Successfully transitioned {ticket_id} to {target['name']}[/]" if success else f"[bold red]✗ Failed to transition {ticket_id}[/]"])
    elif c == "status-ticket":
        s = await o.status("command")
        lines = [f"[bold dodger_blue2]AI Service[/]: [bold cyan]{s.ai_mode}[/] ({'configured' if s.ai_configured else 'not configured'})", ""]
        for t in s.tickets:
            scolor = "bold green" if t.status == "COMPLETED" else "bold yellow" if t.status == "IN_DEVELOPMENT" else "cyan"
            lines.append(f"  • [bold white]{t.ticket_id}[/]: [{scolor}]{t.status}[/] ([dim italic]{t.note or 'No notes'}[/])")
        return CommandResponse(title="Workspace Status", output=lines)
    elif c == "push":
        tid = a[0] if a else ""
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            return CommandResponse(title="Push", output=[f"Invalid ticket ID: {tid}"])
        r = await o.push(tid)
        return CommandResponse(title=f"Push: {tid}", output=[f"[bold green]✓[/] {r}"])
    elif c == "reset":
        tid = a[0] if a else ""
        import re
        if not re.match(r"^[a-zA-Z]+-\d+$", tid):
            return CommandResponse(title="Reset", output=[f"Invalid ticket ID: {tid}"])
        await o.reset_ticket_status(tid)
        return CommandResponse(title=f"Reset: {tid}", output=[f"[bold green]✓[/] Reset workflow status for [bold cyan]{tid}[/]."])
    elif c == "reset-all":
        await o.reset_all_ticket_statuses()
        return CommandResponse(title="Reset All Tickets", output=["[bold green]✓[/] Successfully reset all ticket statuses to TODO."])

    # Handle system-wide commands
    if c == "help":
        from ..utils.agile_nl_parser import get_agile_command_help
        return CommandResponse(title="Agile Help", output=get_agile_command_help())
    elif c == "status":
        r = sysops.run_system_status()
    elif c == "health":
        r = sysops.run_system_health()
    elif c == "version":
        r = sysops.run_system_version()
    elif c == "doctor":
        r = sysops.run_system_doctor()
    elif c == "config-view":
        r = sysops.run_config_view()
    else:
        # Check if user asked for "assigned to me" or "my stories/tickets/tasks"
        is_me = "assignee" in raw.lower() or "me" in raw.lower() or "my" in raw.lower()

        # Dynamically find the command handler in pmops (utils.agile_operations)
        func_name = "pm_" + c.replace("-", "_")
        fn = getattr(pmops, func_name, None)
        if not fn:
            return CommandResponse(title="Agile", output=[f"Unknown agile command: {c}"])

        if c in ("story-list", "task-list"):
            r = fn(assignee="me" if is_me else None)
        else:
            # Build arguments dynamically based on function signature
            import inspect
            sig = inspect.signature(fn)
            params = list(sig.parameters.values())
            args_to_pass = []
            for i, param in enumerate(params):
                if i < len(a):
                    args_to_pass.append(a[i])
                elif param.default == inspect.Parameter.empty:
                    # Pass empty string fallback for required positional arguments
                    args_to_pass.append("")
            r = fn(*args_to_pass)

    if asyncio.iscoroutine(r):
        r = await r
    return CommandResponse(title=f"Agile: {c}", output=_safe_list(r))
