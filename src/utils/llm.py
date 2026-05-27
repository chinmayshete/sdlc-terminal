"""Azure OpenAI LLM wrapper — replaces llm.ts. Uses httpx for async HTTP."""
from __future__ import annotations
import json
from typing import Any
import httpx
from ..config.env import env, has_azure_openai_config, has_custom_llm_config, has_llm_config, get_active_provider
from ..core.types import AiHealth, CodeChange, NlpChatResult, NlpChatTurn, RepoFile, Ticket

async def _call_openai_style(url: str, headers: dict, model: str, messages: list[dict], temperature: float) -> dict[str, Any]:
    async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=60.0) as c:
        payload = {
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "model": model
        }
        r = await c.post(url, headers=headers, json=payload)
    if r.status_code != 200: raise RuntimeError(f"LLM API error ({r.status_code}): {r.text}")
    content = r.json().get("choices", [{}])[0].get("message", {}).get("content")
    if not content: raise RuntimeError("LLM API: no content in response.")
    return json.loads(content)

async def _call_llm_json(messages: list[dict[str, str]], temperature: float = 0.2) -> dict[str, Any]:
    provider = get_active_provider()
    
    if provider == "azure":
        url = f"{env.azure_endpoint}/openai/deployments/{env.azure_deployment}/chat/completions?api-version={env.azure_api_version}"
        headers = {"Content-Type": "application/json", "api-key": env.azure_api_key or ""}
        async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=60.0) as c:
            r = await c.post(url, headers=headers, json={"messages": messages, "temperature": temperature, "response_format": {"type": "json_object"}})
        if r.status_code != 200: raise RuntimeError(f"Azure OpenAI error ({r.status_code}): {r.text}")
        content = r.json().get("choices", [{}])[0].get("message", {}).get("content")
        if not content: raise RuntimeError("Azure OpenAI: no content in response.")
        return json.loads(content)
        
    elif provider == "gemini":
        url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env.gemini_api_key or ''}"}
        return await _call_openai_style(url, headers, env.gemini_model, messages, temperature)
        
    elif provider == "nvidia":
        url = "https://integrate.api.nvidia.com/v1/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env.nvidia_api_key or ''}"}
        return await _call_openai_style(url, headers, env.nvidia_model, messages, temperature)
        
    elif provider == "mistral":
        url = "https://api.mistral.ai/v1/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env.mistral_api_key or ''}"}
        return await _call_openai_style(url, headers, env.mistral_model, messages, temperature)
        
    elif provider == "azure_ai_foundry":
        url = env.foundry_endpoint
        if url and not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env.foundry_api_key or ''}"}
        return await _call_openai_style(url, headers, env.foundry_model or "", messages, temperature)
        
    elif provider == "open_source":
        url = env.os_base_url
        if url and not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if env.os_api_key:
            headers["Authorization"] = f"Bearer {env.os_api_key}"
        return await _call_openai_style(url, headers, env.os_model, messages, temperature)
        
    elif provider == "generic":
        url = env.llm_base_url
        if url and not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {env.llm_api_key or ''}"}
        return await _call_openai_style(url, headers, env.llm_model, messages, temperature)
        
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": env.anthropic_api_key or "",
            "anthropic-version": "2023-06-01"
        }
        anthropic_messages = []
        system_prompt = None
        for msg in messages:
            if msg["role"] == "system":
                system_prompt = msg["content"]
            else:
                anthropic_messages.append({"role": msg["role"], "content": msg["content"]})
                
        payload = {
            "model": env.anthropic_model,
            "max_tokens": 4000,
            "messages": anthropic_messages,
            "temperature": temperature
        }
        if system_prompt:
            payload["system"] = system_prompt
            
        async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=60.0) as c:
            r = await c.post(url, headers=headers, json=payload)
        if r.status_code != 200: raise RuntimeError(f"Anthropic error ({r.status_code}): {r.text}")
        content = r.json().get("content", [{}])[0].get("text")
        if not content: raise RuntimeError("Anthropic: no content in response.")
        return json.loads(content)
        
    elif provider == "bedrock":
        try:
            import boto3
        except ImportError:
            raise RuntimeError("boto3 is required for AWS Bedrock. Install with: pip install boto3")
        
        session = boto3.Session(
            aws_access_key_id=env.aws_access_key_id,
            aws_secret_access_key=env.aws_secret_access_key,
            region_name=env.aws_region
        )
        client = session.client("bedrock-runtime")
        
        system_prompts = []
        bedrock_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_prompts.append({"text": msg["content"]})
            else:
                role = msg["role"]
                if role not in ("user", "assistant"):
                    role = "user"
                bedrock_messages.append({
                    "role": role,
                    "content": [{"text": msg["content"]}]
                })
                
        response = client.converse(
            modelId=env.bedrock_model_id,
            messages=bedrock_messages,
            system=system_prompts,
            inferenceConfig={"temperature": temperature}
        )
        content = response["output"]["message"]["content"][0]["text"]
        if not content: raise RuntimeError("Bedrock: no content in response.")
        return json.loads(content)
        
    else:
        raise RuntimeError(f"Unsupported LLM provider: {provider}")

def _use_llm() -> bool:
    return not env.use_mock and has_llm_config()

# ── Plan ─────────────────────────────────────────────────────
async def generate_plan(ticket: Ticket, files: list[RepoFile], mode: str = "basic") -> list[str]:
    fallback = [f"Read ticket {ticket.id}: {ticket.title}.", "Review relevant files.", "Implement changes.", "Generate tests.", "Prepare commit."]
    if not _use_llm(): return fallback
    try:
        if mode == "comprehensive":
            sys_desc = "Provide a COMPREHENSIVE end-to-end technical plan. Include exact code structure, verification steps, test cases, and edge cases to consider (typically 15-25 highly detailed steps)."
        elif mode == "detailed":
            sys_desc = "Provide a DETAILED technical plan. Break down the implementation into specific files, classes, or function changes (typically 10-15 steps with technical details)."
        else:
            sys_desc = "Provide a concise high-level plan (typically 5-10 steps)."
        
        sys = (
            f'Return JSON only: {{"steps": string[]}}. {sys_desc} '
            'You MUST base the project plan steps on the requirements, architecture, and constraints defined in the `[Confluence Requirement]` file. '
            'Use the Confluence project plan as your primary knowledge base for planning this story. '
            'Also, follow the coding standards and guidelines in the `[Skill: ...]` files.'
        )
        r = await _call_llm_json([{"role": "system", "content": sys},
            {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title, "description": ticket.description}, "files": [{"path": f.path, "content": f.content} for f in files]})}] )
        return r.get("steps") or fallback
    except Exception: return fallback

# ── Code ─────────────────────────────────────────────────────
async def generate_code(ticket: Ticket, files: list[RepoFile]) -> list[CodeChange]:
    if not _use_llm(): return []
    try:
        sys = (
            'Return JSON: {"files": [{"path": str, "content": str}]}. Complete file contents. '
            'You MUST follow the constraints, details, and requirements outlined in the `[Confluence Requirement]` file '
            'and use the coding standards/guidelines in the `[Skill: ...]` files as your knowledge base for generating code.'
        )
        r = await _call_llm_json([{"role": "system", "content": sys},
            {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title, "description": ticket.description}, "files": [{"path": f.path, "content": f.content} for f in files]})}])
        return [CodeChange(path=f["path"], content=f["content"]) for f in r.get("files", []) if isinstance(f, dict) and "path" in f and "content" in f]
    except Exception: return []

# ── Tests ────────────────────────────────────────────────────
async def generate_tests(ticket: Ticket, changes: list[CodeChange]) -> list[CodeChange]:
    if not _use_llm(): return []
    try:
        r = await _call_llm_json([{"role": "system", "content": 'Write pytest tests. Return JSON: {"files": [{"path": str, "content": str}]}.'},
            {"role": "user", "content": json.dumps({"ticket": {"id": ticket.id, "title": ticket.title}, "changes": [{"path": c.path, "content": c.content} for c in changes]})}])
        return [CodeChange(path=f["path"], content=f["content"]) for f in r.get("files", []) if isinstance(f, dict) and "path" in f and "content" in f]
    except Exception: return []

# ── Free NLP Chat ────────────────────────────────────────────
async def generate_free_nlp_chat(files: list[RepoFile], history: list[NlpChatTurn], prompt: str, ticket_info: list[str] | None = None) -> NlpChatResult:
    if not _use_llm():
        lower = prompt.lower().strip()
        if any(w in lower for w in ("hi", "hello", "hey", "greetings")):
            msg = "Hello! I am Nexus AI, your SDLC coding assistant. How can I help you with your codebase today?"
        elif any(w in lower for w in ("explain", "how", "what", "why", "list", "show", "tell")):
            msg = f"[Nexus AI] Analyzing query: '{prompt}'\nI have scanned the project repository ({len(files)} tracked files). In mock mode, real-time code comprehension is simulated. Configure an LLM in .env for live semantic analysis."
        else:
            msg = f"[Nexus AI] Processing task: '{prompt}'\nTo generate actual code modifications or automated test files in the project directory, please provide valid LLM API credentials."
        return NlpChatResult(message=msg, changes=[])
    try:
        sys = (
            'Terminal coding assistant. Return JSON: '
            '{"message": str, "files": [{"path": str, "content": str, "action": "create"|"update"|"delete"}], "commands": string[]}. '
            'Only include files/folders for changes/deletions/creations. '
            'To create a folder/directory, end the path with a trailing slash (e.g. "calc/") and set content to "". '
            'To delete a file or folder, set "action": "delete" and "content": "". '
            'You MUST follow the coding standards, patterns, and guidelines defined in the `[Skill: ...]` files. '
            'Use the skills folder as your primary knowledge base for generating code. '
            'If the user asks to execute any project/git/security/devops/pm command or action (e.g. "plan ticket SCRUM-12", "execute SCRUM-12", "run scan", "check git status", "reset status of SCRUM-12", etc.), '
            'populate "commands" with the list of CLI commands to run (e.g. ["pm plan SCRUM-12"], ["security scan"], ["git status"], ["pm reset SCRUM-12"], etc.).'
        )
        if ticket_info: sys += f"\n\nCurrent Workspace Jira Ticket Statuses:\n" + "\n".join(ticket_info)
        r = await _call_llm_json([{"role": "system", "content": sys},
            {"role": "user", "content": json.dumps({"prompt": prompt, "history": [{"role": t.role, "content": t.content} for t in history], "repoFiles": [{"path": f.path, "content": f.content} for f in files]})}])
        changes = [CodeChange(path=f["path"], content=f.get("content", ""), action=f.get("action", "update")) for f in r.get("files", []) if isinstance(f, dict) and "path" in f]
        commands = r.get("commands", [])
        if not isinstance(commands, list): commands = []
        return NlpChatResult(message=r.get("message", "Processing complete.").strip(), changes=changes, commands=[str(c) for c in commands])
    except Exception as e: return NlpChatResult(message=f"NLP error: {e}")

# ── Explain File ─────────────────────────────────────────────
async def explain_file_with_chat(file_path: str, content: str, history: list[NlpChatTurn]) -> str:
    fallback = f"File {file_path} has {len(content.splitlines())} lines."
    if not _use_llm(): return fallback
    try:
        r = await _call_llm_json([{"role": "system", "content": 'Explain code clearly. Return JSON: {"message": str}.'},
            {"role": "user", "content": json.dumps({"filePath": file_path, "content": content})}])
        return r.get("message", fallback).strip()
    except Exception: return fallback

# ── AI Vulnerability Scan ────────────────────────────────────
async def perform_ai_vulnerability_scan(file_path: str, content: str) -> list[dict[str, Any]]:
    if not _use_llm(): return []
    try:
        numbered = "\n".join(f"{i+1}: {line}" for i, line in enumerate(content.splitlines()))
        r = await _call_llm_json([{"role": "system", "content": 'SAST scanner. Return {"findings": [{"ruleId": str, "category": str, "description": str, "severity": "ERROR"|"WARNING"|"INFO", "lineNumber": int, "matchedContent": str, "remediation": str}]}.'},
            {"role": "user", "content": f"File: {file_path}\n\n{numbered}"}])
        return r.get("findings", [])
    except Exception: return []

# ── AI Analyze Scan Results ──────────────────────────────────
async def ai_analyze_scan_results(title: str, findings: list, prompt: str) -> list[str]:
    if not _use_llm(): return ["AI analysis unavailable in mock mode."]
    try:
        r = await _call_llm_json([{"role": "system", "content": 'Security analyst. Return JSON: {"analysis": string[]}.'},
            {"role": "user", "content": json.dumps({"title": title, "prompt": prompt, "findings": [{"ruleId": getattr(f, "rule_id", ""), "description": getattr(f, "description", ""), "severity": getattr(f, "severity", "")} for f in findings]})}])
        return r.get("analysis", ["No analysis available."])
    except Exception: return ["AI analysis failed."]

# ── AI Health Check ──────────────────────────────────────────
async def check_ai_health() -> AiHealth:
    configured = has_llm_config()
    mode = "mock" if env.use_mock else get_active_provider()
    if not configured or env.use_mock:
        return AiHealth(configured=configured, mode=mode, reachable=True, message="Mock mode." if configured else "LLM config missing.")
    try:
        await _call_llm_json([{"role": "system", "content": 'Return JSON: {"ok": true}.'}, {"role": "user", "content": "Health check"}])
        return AiHealth(configured=True, mode=mode, reachable=True, message="LLM API OK.")
    except Exception as e:
        return AiHealth(configured=True, mode=mode, reachable=False, message=str(e))

# ── Intent parsing helper (used by all NL parsers) ───────────
async def parse_intent_with_llm(input_text: str, system_prompt: str) -> dict[str, Any] | None:
    if not _use_llm(): return None
    try:
        r = await _call_llm_json([{"role": "system", "content": system_prompt}, {"role": "user", "content": input_text}], temperature=0)
        cmd = r.get("command")
        if cmd and cmd != "unknown": return {"command": cmd, "args": r.get("args", [])}
        return None
    except Exception: return None
