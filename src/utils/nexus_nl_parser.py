"""Nexus Main Mode NL Parser for mode switching and global system/user/config operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class NexusIntent:
    command: str; args: list[str]; raw: str; source: str

_RULES = [
    # Core System & Health
    (r"^(?:nexus\s+)?status$|^(?:show|what\s+is)\s+(?:the\s+)?(?:current\s+)?status\??$", lambda m, r: NexusIntent("status", [], r, "rule")),
    (r"^(?:nexus\s+)?health$", lambda m, r: NexusIntent("health", [], r, "rule")),
    (r"^(?:nexus\s+)?ai$|^ai\s+health$|^(?:check|is|how\s+is)\s+(?:the\s+)?ai", lambda m, r: NexusIntent("ai", [], r, "rule")),
    (r"^(?:nexus\s+)?doctor$", lambda m, r: NexusIntent("doctor", [], r, "rule")),
    (r"^(?:nexus\s+)?version$", lambda m, r: NexusIntent("version", [], r, "rule")),

    # Mode Switches
    (r"^(?:nexus\s+)?(?:go\s+to|switch\s+to|enter|open\s+)?security$|^sec$", lambda m, r: NexusIntent("security", [], r, "rule")),
    (r"^(?:nexus\s+)?(?:go\s+to|switch\s+to|enter|open\s+)?devops$", lambda m, r: NexusIntent("devops", [], r, "rule")),
    (r"^(?:nexus\s+)?(?:go\s+to|switch\s+to|enter|open\s+)?git$", lambda m, r: NexusIntent("git", [], r, "rule")),
    (r"^(?:nexus\s+)?(?:go\s+to|switch\s+to|enter|open\s+)?agile$|^agile$", lambda m, r: NexusIntent("agile", [], r, "rule")),

    # Sub-domain direct passthroughs
    (r"^(?:nexus\s+)?agile\s+(.*)", lambda m, r: NexusIntent("agile-direct", [m.group(1)], r, "rule")),
    (r"^(?:nexus\s+)?devops\s+(.*)", lambda m, r: NexusIntent("devops-direct", [m.group(1)], r, "rule")),
    (r"^(?:nexus\s+)?git\s+(.*)", lambda m, r: NexusIntent("git-direct", [m.group(1)], r, "rule")),
    (r"^(?:nexus\s+)?security\s+(.*)", lambda m, r: NexusIntent("security-direct", [m.group(1)], r, "rule")),

    (r"^(?:nexus\s+)?(?:project|epic|story|sprint|board|jira|docs)\b.*", lambda m, r: NexusIntent("agile-direct", [r], r, "rule")),
    (r"^(?:nexus\s+)?(?:docker|k8s|jenkins|monitor|deploy|release)\b.*", lambda m, r: NexusIntent("devops-direct", [r], r, "rule")),

    # Utilities
    (r"^(?:nexus\s+)?help$|^(?:what\s+can\s+you\s+do|list\s+commands)$", lambda m, r: NexusIntent("help", [], r, "rule")),
    (r"^(?:nexus\s+)?exit$|^quit$|^bye$", lambda m, r: NexusIntent("exit", [], r, "rule")),
]

def parse_nexus_intent(text: str) -> NexusIntent:
    t = text.strip()
    for pattern, extract in _RULES:
        m = re.match(pattern, t, re.IGNORECASE)
        if m: return extract(m, t)
    return NexusIntent("unknown", [], t, "unknown")

async def parse_nexus_intent_with_llm(text: str) -> NexusIntent:
    r = parse_nexus_intent(text)
    if r.command != "unknown": return r
    prompt = '''Nexus SDLC command parser. Return JSON: {"command": str, "args": str[]}. If the user input is a greeting, conversation, general question, or natural language request to write/edit code or perform a task in the project directory (e.g., 'hi', 'hello', 'explain...', 'how to...', 'write...', 'create...', 'refactor...'), you MUST return {"command": "unknown", "args": []}. ONLY match to these exact CLI mode commands if the user specifically requests them: status, health, ai, doctor, version, help, exit, security, devops, git, agile.'''
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: return NexusIntent(parsed["command"], parsed["args"], text, "llm")
    return r
