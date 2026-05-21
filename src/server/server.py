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
from ..utils.git_nl_parser import parse_git_intent_with_llm
from ..utils.security_nl_parser import parse_security_intent_with_llm
from ..utils.devops_nl_parser import parse_devops_intent_with_llm
from ..utils.agile_nl_parser import parse_agile_intent_with_llm
from ..utils import git_operations as gitops
from ..utils import devops_operations as devops
from ..utils import security_operations as secops
from ..utils import agile_operations as pmops
from ..utils import system_operations as sysops

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
    """Free NLP chat — same as typing at the nexus > prompt."""
    global _chat_history
    o = _get_orchestrator()
    try:
        # Build history from request
        history = [NlpChatTurn(role=t.role, content=t.content) for t in req.history]
        if not history:
            history = _chat_history.copy()

        result = await o.run_free_nlp_chat(history, req.message)

        # Update server-side history
        _chat_history.append(NlpChatTurn("user", req.message))
        _chat_history.append(NlpChatTurn("assistant", result.message))

        # Apply file changes if any
        changes = []
        if result.changes:
            await o.apply_nlp_changes(result.changes)
            changes = [FileChangeModel(path=c.path, content=c.content, action=getattr(c, "action", "update")) for c in result.changes]

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
    o = _get_orchestrator()
    ws_history: list[NlpChatTurn] = []

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            if not message:
                await websocket.send_json({"type": "error", "message": "Empty message"})
                continue

            await websocket.send_json({"type": "thinking", "message": "Processing..."})

            try:
                result = await o.run_free_nlp_chat(ws_history, message)
                ws_history.append(NlpChatTurn("user", message))
                ws_history.append(NlpChatTurn("assistant", result.message))

                changes = []
                if result.changes:
                    await o.apply_nlp_changes(result.changes)
                    changes = [{"path": c.path, "content": c.content, "action": getattr(c, "action", "update")} for c in result.changes]

                await websocket.send_json({
                    "type": "response",
                    "message": result.message,
                    "changes": changes,
                    "commands": result.commands if result.commands else [],
                })
            except Exception as e:
                await websocket.send_json({"type": "error", "message": str(e)})
    except WebSocketDisconnect:
        pass


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

    handlers = {
        "status": gitops.git_status, "log": lambda: gitops.git_log(int(a[0]) if a else 10),
        "diff": lambda: gitops.git_diff(a[0] if a else None), "diff-staged": gitops.git_diff_staged,
        "add": lambda: gitops.git_add(a[0]) if a else gitops.git_add_all(), "add-all": gitops.git_add_all,
        "commit": lambda: gitops.git_commit(a[0]) if a else "Usage: commit <message>",
        "branch-list": gitops.git_list_branches, "branch-create": lambda: gitops.git_create_branch(a[0]) if a else "Usage: branch <name>",
        "checkout": lambda: gitops.git_checkout(a[0]) if a else "Usage: checkout <name>",
        "pull": gitops.git_pull, "push": lambda: gitops.git_push(a[0] if a else None), "fetch": gitops.git_fetch,
        "stash": gitops.git_stash, "stash-pop": gitops.git_stash_pop, "stash-list": gitops.git_stash_list,
        "merge": lambda: gitops.git_merge(a[0]) if a else "Usage: merge <branch>",
        "remote": gitops.git_list_remotes,
        "blame": lambda: gitops.git_blame(a[0]) if a else "Usage: blame <file>",
        "show": lambda: gitops.git_show_commit(a[0]) if a else "Usage: show <sha>",
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="Git", output=[f"Unknown git command: {c}"])
    r = await fn() if asyncio.iscoroutinefunction(fn) else fn()
    return CommandResponse(title=f"Git: {c}", output=_safe_list(r))


async def _exec_security_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in security mode."""
    intent = await parse_security_intent_with_llm(raw)
    c, a = intent.command, intent.args

    handlers = {
        "scan": secops.run_full_scan, "scan-errors": secops.run_scan_errors_only,
        "scan-warnings": secops.run_scan_warnings_only, "scan-summary": secops.run_scan_summary,
        "scan-file": lambda: secops.run_scan_file(a[0]) if a else ["Usage: scan file <path>"],
        "secrets": secops.check_for_secrets, "env-audit": secops.audit_env_file,
        "deps-audit": secops.audit_dependencies, "compliance": secops.run_compliance_check,
        "dashboard": secops.get_security_dashboard, "posture": secops.get_security_posture,
        "docker-security": secops.check_docker_security, "terraform-security": secops.check_terraform_security,
        "sast": secops.run_security_sast, "dast": secops.run_security_dast,
        "report": secops.run_security_report, "scan-history": secops.get_scan_history,
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="Security", output=[f"Unknown security command: {c}"])
    r = await fn() if asyncio.iscoroutinefunction(fn) else fn()
    return CommandResponse(title=f"Security: {c}", output=_safe_list(r))


async def _exec_devops_mode(o: Orchestrator, raw: str) -> CommandResponse:
    """Execute a command in devops mode."""
    intent = await parse_devops_intent_with_llm(raw)
    c, a = intent.command, intent.args

    handlers = {
        "cicd": devops.get_cicd_overview, "jenkins-validate": devops.validate_jenkins,
        "jenkins-stages": devops.get_jenkins_stages, "docker-info": devops.get_dockerfile_info,
        "docker-validate": devops.validate_dockerfile, "terraform-info": devops.get_terraform_info,
        "infra-resources": devops.list_infra_resources, "env-show": devops.show_environment_config,
        "env-validate": devops.validate_environment_files, "deps-audit": devops.audit_dependencies,
        "deploy-status": devops.get_deployment_status, "summary": devops.get_full_devops_summary,
        "health": devops.get_system_health, "pr-check": devops.run_pr_readiness_check,
        "docker-images": devops.docker_images, "docker-ps": devops.docker_ps,
        "monitor-status": devops.monitor_status, "monitor-alerts": devops.monitor_alerts,
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="DevOps", output=[f"Unknown devops command: {c}"])
    r = await fn() if asyncio.iscoroutinefunction(fn) else fn()
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

    handlers = {
        "story-list": pmops.pm_story_list, "sprint-list": pmops.pm_sprint_list,
        "sprint-active": pmops.pm_sprint_active, "sprint-backlog": pmops.pm_sprint_backlog,
        "sprint-report": pmops.pm_sprint_report, "board-view": pmops.pm_board_view,
        "board-backlog": pmops.pm_board_backlog, "epic-list": pmops.pm_epic_list,
        "project-list": pmops.pm_project_list,
        "story-view": lambda: pmops.pm_story_view(a[0] if a else ""),
        "epic-view": lambda: pmops.pm_epic_view(a[0] if a else ""),
        "story-search": lambda: pmops.pm_story_search(a[0] if a else ""),
        "ai-standup-report": pmops.pm_ai_standup_report,
        "ai-sprint-review": pmops.pm_ai_sprint_review,
        "report-sprint": pmops.pm_report_sprint,
        "report-velocity": pmops.pm_report_velocity,
    }
    fn = handlers.get(c)
    if not fn:
        return CommandResponse(title="Agile", output=[f"Unknown agile command: {c}"])
    r = await fn() if asyncio.iscoroutinefunction(fn) else fn()
    return CommandResponse(title=f"Agile: {c}", output=_safe_list(r))
