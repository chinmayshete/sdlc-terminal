"""Azure OpenAI LLM wrapper — replaces llm.ts. Uses httpx for async HTTP."""
from __future__ import annotations
import json
from typing import Any
import httpx
from ..config.env import env, has_azure_openai_config
from ..core.types import AiHealth, CodeChange, NlpChatResult, NlpChatTurn, RepoFile, Ticket

async def _call_azure_json(messages: list[dict[str, str]], temperature: float = 0.2) -> dict[str, Any]:
    url = f"{env.azure_endpoint}/openai/deployments/{env.azure_deployment}/chat/completions?api-version={env.azure_api_version}"
    async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=60.0) as c:
        r = await c.post(url, headers={"Content-Type": "application/json", "api-key": env.azure_api_key or ""},
            json={"messages": messages, "temperature": temperature, "response_format": {"type": "json_object"}})
    if r.status_code != 200: raise RuntimeError(f"Azure OpenAI error ({r.status_code}): {r.text}")
    content = r.json().get("choices", [{}])[0].get("message", {}).get("content")
    if not content: raise RuntimeError("Azure OpenAI: no content in response.")
    return json.loads(content)

def _use_azure() -> bool:
    return not env.use_mock and has_azure_openai_config()

# ── Plan ─────────────────────────────────────────────────────
async def generate_plan(ticket: Ticket, files: list[RepoFile], mode: str = "basic") -> list[str]:
    fallback = [f"Read ticket {ticket.id}: {ticket.title}.", "Review relevant files.", "Implement changes.", "Generate tests.", "Prepare commit."]
    if not _use_azure(): return fallback
    try:
        if mode == "comprehensive":
            sys_desc = "Provide a COMPREHENSIVE end-to-end technical plan. Include exact code structure, verification steps, test cases, and edge cases to consider (typically 15-25 highly detailed steps)."
        elif mode == "detailed":
            sys_desc = "Provide a DETAILED technical plan. Break down the implementation into specific files, classes, or function changes (typically 10-15 steps with technical details)."
        else:
            sys_desc = "Provide a concise high-level plan (typically 5-10 steps)."
        
        sys = f'Return JSON only: {{"steps": string[]}}. {sys_desc}'
        r = await _call_azure_json([{"role": "system", "content": sys}, {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title, "description": ticket.description}, "files": [f.path for f in files]})}])
        return r.get("steps") or fallback
    except Exception: return fallback

# ── Code ─────────────────────────────────────────────────────
async def generate_code(ticket: Ticket, files: list[RepoFile]) -> list[CodeChange]:
    if not _use_azure(): return []
    try:
        r = await _call_azure_json([{"role": "system", "content": 'Return JSON: {"files": [{"path": str, "content": str}]}. Complete file contents.'},
            {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title, "description": ticket.description}, "files": [{"path": f.path, "content": f.content} for f in files]})}])
        return [CodeChange(path=f["path"], content=f["content"]) for f in r.get("files", []) if isinstance(f, dict) and "path" in f and "content" in f]
    except Exception: return []

# ── Tests ────────────────────────────────────────────────────
async def generate_tests(ticket: Ticket, changes: list[CodeChange]) -> list[CodeChange]:
    if not _use_azure(): return []
    try:
        r = await _call_azure_json([{"role": "system", "content": 'Write pytest tests. Return JSON: {"files": [{"path": str, "content": str}]}.'},
            {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title}, "changes": [{"path": c.path, "content": c.content} for c in changes]})}])
        return [CodeChange(path=f["path"], content=f["content"]) for f in r.get("files", []) if isinstance(f, dict) and "path" in f and "content" in f]
    except Exception: return []

# ── Free NLP Chat ────────────────────────────────────────────
async def generate_free_nlp_chat(files: list[RepoFile], history: list[NlpChatTurn], prompt: str, ticket_info: list[str] | None = None) -> NlpChatResult:
    if not _use_azure():
        lower = prompt.lower().strip()
        if any(w in lower for w in ("hi", "hello", "hey", "greetings")):
            msg = "Hello! I am Nexus AI, your SDLC coding assistant. How can I help you with your codebase today?"
        elif any(w in lower for w in ("explain", "how", "what", "why", "list", "show", "tell")):
            msg = f"[Nexus AI] Analyzing query: '{prompt}'\nI have scanned the project repository ({len(files)} tracked files). In mock mode, real-time code comprehension is simulated. Configure Azure OpenAI in .env for live semantic analysis."
        else:
            msg = f"[Nexus AI] Processing task: '{prompt}'\nTo generate actual code modifications or automated test files in the project directory, please provide valid Azure OpenAI API credentials."
        return NlpChatResult(message=msg, changes=[])
    try:
        sys = (
            'Terminal coding assistant. Return JSON: '
            '{"message": str, "files": [{"path": str, "content": str, "action": "create"|"update"|"delete"}], "commands": string[]}. '
            'Only include files/folders for changes/deletions/creations. '
            'To create a folder/directory, end the path with a trailing slash (e.g. "calc/") and set content to "". '
            'To delete a file or folder, set "action": "delete" and "content": "". '
            'If the user asks to execute any project/git/security/devops/pm command or action (e.g. "plan ticket SCRUM-12", "execute SCRUM-12", "run scan", "check git status", "reset status of SCRUM-12", etc.), '
            'populate "commands" with the list of CLI commands to run (e.g. ["pm plan SCRUM-12"], ["security scan"], ["git status"], ["pm reset SCRUM-12"], etc.).'
        )
        if ticket_info: sys += f"\n\nCurrent Workspace Jira Ticket Statuses:\n" + "\n".join(ticket_info)
        r = await _call_azure_json([{"role": "system", "content": sys},
            {"role": "user", "content": json.dumps({"prompt": prompt, "history": [{"role": t.role, "content": t.content} for t in history], "repoFiles": [{"path": f.path, "content": f.content} for f in files]})}])
        changes = [CodeChange(path=f["path"], content=f.get("content", ""), action=f.get("action", "update")) for f in r.get("files", []) if isinstance(f, dict) and "path" in f]
        commands = r.get("commands", [])
        if not isinstance(commands, list): commands = []
        return NlpChatResult(message=r.get("message", "Processing complete.").strip(), changes=changes, commands=[str(c) for c in commands])
    except Exception as e: return NlpChatResult(message=f"NLP error: {e}")

# ── Explain File ─────────────────────────────────────────────
async def explain_file_with_chat(file_path: str, content: str, history: list[NlpChatTurn]) -> str:
    fallback = f"File {file_path} has {len(content.splitlines())} lines."
    if not _use_azure(): return fallback
    try:
        r = await _call_azure_json([{"role": "system", "content": 'Explain code clearly. Return JSON: {"message": str}.'},
            {"role": "user", "content": json.dumps({"filePath": file_path, "content": content})}])
        return r.get("message", fallback).strip()
    except Exception: return fallback

# ── AI Vulnerability Scan ────────────────────────────────────
async def perform_ai_vulnerability_scan(file_path: str, content: str) -> list[dict[str, Any]]:
    if not _use_azure(): return []
    try:
        numbered = "\n".join(f"{i+1}: {line}" for i, line in enumerate(content.splitlines()))
        r = await _call_azure_json([{"role": "system", "content": 'SAST scanner. Return {"findings": [{"ruleId": str, "category": str, "description": str, "severity": "ERROR"|"WARNING"|"INFO", "lineNumber": int, "matchedContent": str, "remediation": str}]}.'},
            {"role": "user", "content": f"File: {file_path}\n\n{numbered}"}])
        return r.get("findings", [])
    except Exception: return []

# ── AI Analyze Scan Results ──────────────────────────────────
async def ai_analyze_scan_results(title: str, findings: list, prompt: str) -> list[str]:
    if not _use_azure(): return ["AI analysis unavailable in mock mode."]
    try:
        r = await _call_azure_json([{"role": "system", "content": 'Security analyst. Return JSON: {"analysis": string[]}.'},
            {"role": "user", "content": json.dumps({"title": title, "prompt": prompt, "findings": [{"ruleId": getattr(f, "rule_id", ""), "description": getattr(f, "description", ""), "severity": getattr(f, "severity", "")} for f in findings]})}])
        return r.get("analysis", ["No analysis available."])
    except Exception: return ["AI analysis failed."]

# ── AI Health Check ──────────────────────────────────────────
async def check_ai_health() -> AiHealth:
    configured = has_azure_openai_config()
    mode = "mock" if env.use_mock else "azure"
    if not configured or env.use_mock:
        return AiHealth(configured=configured, mode=mode, reachable=True, message="Mock mode." if configured else "Azure config missing.")
    try:
        await _call_azure_json([{"role": "system", "content": 'Return JSON: {"ok": true}.'}, {"role": "user", "content": "Health check"}])
        return AiHealth(configured=True, mode="azure", reachable=True, message="Azure OpenAI OK.")
    except Exception as e:
        return AiHealth(configured=True, mode="azure", reachable=False, message=str(e))

# ── Intent parsing helper (used by all NL parsers) ───────────
async def parse_intent_with_llm(input_text: str, system_prompt: str) -> dict[str, Any] | None:
    if not _use_azure(): return None
    try:
        r = await _call_azure_json([{"role": "system", "content": system_prompt}, {"role": "user", "content": input_text}], temperature=0)
        cmd = r.get("command")
        if cmd and cmd != "unknown": return {"command": cmd, "args": r.get("args", [])}
        return None
    except Exception: return None
