"""Security NL Parser for SAST, DAST, Secrets, Dependencies, and Compliance operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class SecurityIntent:
    command: str; args: list[str]; raw: str; source: str

_RULES = [
    # Core Scan & Aliases
    (r"^(?:nexus\s+)?(?:security\s+)?scan$", "scan"),
    (r"^(?:nexus\s+)?(?:security\s+)?sast$", "sast"),
    (r"^(?:nexus\s+)?(?:security\s+)?dast$", "dast"),
    (r"^(?:nexus\s+)?(?:security\s+)?dependencies$", "dependencies"),
    (r"^(?:nexus\s+)?(?:security\s+)?secrets$", "secrets"),
    (r"^(?:nexus\s+)?(?:security\s+)?report$", "report"),

    # Granular Commands
    (r"^(?:nexus\s+)?scan\s+errors$", "scan-errors"),
    (r"^(?:nexus\s+)?scan\s+warnings$", "scan-warnings"),
    (r"^(?:nexus\s+)?scan\s+summary$", "scan-summary"),
    (r"^(?:nexus\s+)?(?:security\s+)?scan\s+history$", "scan-history"),
    (r"^(?:nexus\s+)?status$", "status"),
    (r"^(?:nexus\s+)?rules$", "rules"),
    (r"^(?:nexus\s+)?env\s+audit$", "env-audit"),
    (r"^(?:nexus\s+)?deps?\s+audit$", "deps-audit"),
    (r"^(?:nexus\s+)?audit$", "deps-audit"),
    (r"^(?:nexus\s+)?licenses?$", "licenses"),
    (r"^(?:nexus\s+)?vault$", "vault"),
    (r"^(?:nexus\s+)?compliance$", "compliance"),
    (r"^(?:nexus\s+)?gitflow$", "gitflow"),
    (r"^(?:nexus\s+)?codeowners$", "codeowners"),
    (r"^(?:nexus\s+)?docker\s+security$", "docker-security"),
    (r"^(?:nexus\s+)?terraform\s+security$", "terraform-security"),
    (r"^(?:nexus\s+)?dashboard$", "dashboard"),
    (r"^(?:nexus\s+)?posture$", "posture"),
]

def parse_security_intent(text: str) -> SecurityIntent:
    t = re.sub(r"^nexus\s+", "", text.strip(), flags=re.IGNORECASE).strip()
    for pattern, cmd in _RULES:
        if re.match(pattern, t, re.IGNORECASE): return SecurityIntent(cmd, [], t, "rule")
    m = re.match(r"^(?:scan|check)\s+(?:the\s+)?file\s+(\S+)$", t, re.IGNORECASE)
    if m: return SecurityIntent("scan-file", [m.group(1)], t, "rule")
    return SecurityIntent("unknown", [], t, "unknown")

async def parse_security_intent_with_llm(text: str) -> SecurityIntent:
    r = parse_security_intent(text)
    if r.command != "unknown": return r
    prompt = '''Security command parser. Return JSON: {"command": str, "args": str[]}. If the user input is conversational, feedback, correction, or a general natural language task request rather than a direct Security CLI command, you MUST return {"command": "unknown", "args": []}.
    Valid: scan, sast, dast, dependencies, secrets, report, scan-errors, scan-warnings, scan-summary, scan-history, scan-file, status, rules, env-audit, deps-audit, licenses, vault, compliance, gitflow, codeowners, docker-security, terraform-security, dashboard, posture.'''
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: return SecurityIntent(parsed["command"], parsed["args"], text, "llm")
    return r

def get_security_command_help() -> list[str]:
    return [
        "[bold cyan]── Code Scanning ──[/]",
        "  [bold green]scan[/]                 Full security scan (SAST)",
        "  [bold green]scan errors[/]          Show only ERROR findings",
        "  [bold green]scan warnings[/]        Show only WARNING findings",
        "  [bold green]scan summary[/]         Quick scan statistics",
        "  [bold green]scan file <path>[/]     Scan a specific file",
        "  [bold green]scan history[/]         View all past scan results and logs",
        "  [bold green]status[/]               Check changed files using SHA-256 fingerprinting",
        "",
        "[bold cyan]── Secret Detection ──[/]",
        "  [bold green]secrets[/]              Check for hardcoded secrets (Gitleaks/Rules)",
        "",
        "[bold cyan]── Dependency Security ──[/]",
        "  [bold green]audit / deps audit[/]   Run vulnerability audit (FOSS)",
        "",
        "[bold cyan]── Compliance & Policy ──[/]",
        "  [bold green]compliance[/]           Full compliance check",
        "  [bold green]report / dash[/]        Show unified security posture dashboard",
        "",
        "[bold cyan]── Infrastructure ──[/]",
        "  [bold green]docker security[/]      Docker security assessment (Trivy)",
        "  [bold green]terraform security[/]   Terraform security assessment (Checkov)",
        "",
        "[bold cyan]Or type naturally:[/]",
        "  [dim]\"check for secrets\"[/]",
        "  [dim]\"is the Dockerfile secure\"[/]",
        "  [dim]\"are we compliant\"[/]",
        "  [dim]\"how secure are we\"[/]",
        "  [dim]\"check for vulnerabilities\"[/]",
        "",
        "  [bold dim]exit / quit[/]          Leave Security mode"
    ]
