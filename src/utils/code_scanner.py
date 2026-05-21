"""Code Scanner — replaces code-scanner.ts. AI-driven SAST with rule-based fallback."""
from __future__ import annotations
import re
from pathlib import Path
from ..core.types import ScanFinding, ScanReport
from ..utils.llm import perform_ai_vulnerability_scan
from ..utils.scan_history import (
    snapshot_files, detect_changes, save_scan_result,
    load_last_scan, load_previous_findings, FileFingerprint
)

_RULES = [
    ("SEC-001", "Hardcoded Secret", r"(?:password|secret|api[_-]?key)\s*[:=]\s*['\"][^'\"]+['\"]", "ERROR", "Credentials", "Use environment variables or a vault."),
    ("SEC-002", "Hardcoded Token", r"(?:token|bearer|jwt)\s*[:=]\s*['\"][A-Za-z0-9+/=]{16,}['\"]", "ERROR", "Credentials", "Rotate and use vault."),
    ("SEC-003", "eval() Usage", r"\beval\s*\(", "ERROR", "Injection", "Remove eval() calls."),
    ("SEC-004", "exec() Usage", r"\bexec\s*\(", "WARNING", "Injection", "Avoid exec(); use subprocess."),
    ("SEC-005", "SQL Injection", r"(?:execute|query)\s*\(\s*['\"].*\+.*['\"]|f['\"].*(?:SELECT|INSERT|UPDATE|DELETE)", "ERROR", "Injection", "Use parameterized queries."),
    ("SEC-006", "Insecure HTTP", r"http://(?!localhost|127\\.0\\.0\\.1)", "WARNING", "Transport", "Use HTTPS."),
    ("SEC-007", "AWS Key Pattern", r"AKIA[0-9A-Z]{16}", "ERROR", "Credentials", "Rotate immediately; use IAM roles."),
    ("SEC-008", "Private Key", r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", "ERROR", "Credentials", "Never commit private keys."),
    ("SEC-009", "Connection String", r"(?:mongodb|postgres|mysql|redis)://[^\\s]+:[^\\s]+@", "ERROR", "Credentials", "Use vault."),
    ("SEC-010", "Console Logging", r"\bprint\s*\(.*(?:password|secret|token|key)", "WARNING", "Logging", "Never log sensitive data."),
    ("SEC-011", "Debug Mode", r"DEBUG\s*=\s*True|debug\s*:\s*true", "WARNING", "Configuration", "Disable debug in production."),
    ("SEC-012", "CORS Wildcard", r"(?:allow_origins|Access-Control-Allow-Origin).*\\*", "WARNING", "Configuration", "Restrict CORS origins."),
    ("SEC-013", "Weak Crypto", r"\b(?:md5|sha1)\s*\(", "WARNING", "Cryptography", "Use SHA-256 or bcrypt."),
    ("SEC-014", "Path Traversal", r"\.\./|\.\.\\\\", "WARNING", "Injection", "Validate and sanitize paths."),
    ("SEC-015", "Disabled SSL", r"verify\s*=\s*False|rejectUnauthorized\s*:\s*false", "WARNING", "Transport", "Enable SSL verification."),
]
_EXTENSIONS = {".py",".js",".ts",".jsx",".tsx",".java",".go",".rs",".rb",".php",".cs",".json",".yaml",".yml",".env",".tf",".sh"}
_SKIP_DIRS = {"node_modules",".git","dist","build","__pycache__",".venv","venv",".sdlc"}

async def run_code_scan(scan_dir: str | Path, file_filter: list[Path] | None = None) -> ScanReport:
    scan_path = Path(scan_dir)
    findings: list[ScanFinding] = []; scanned = 0
    files_to_scan = file_filter if file_filter else list(_iter_files(scan_path))
    for file_path in files_to_scan:
        scanned += 1
        try: content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception: continue
        rel = str(file_path.relative_to(scan_path))
        # Rule-based scan
        for rule_id, desc, pattern, sev, cat, fix in _RULES:
            for i, line in enumerate(content.splitlines(), 1):
                if re.search(pattern, line, re.IGNORECASE):
                    findings.append(ScanFinding(rule_id, cat, desc, sev, rel, i, line.strip()[:80], fix))
        # AI deep scan for .py/.ts/.js files
        if file_path.suffix in (".py", ".ts", ".js") and len(content) < 8000:
            ai_findings = await perform_ai_vulnerability_scan(rel, content)
            for f in ai_findings:
                if isinstance(f, dict) and "ruleId" in f:
                    findings.append(ScanFinding(f.get("ruleId","AI"), f.get("category","AI"), f.get("description",""),
                        f.get("severity","WARNING"), rel, f.get("lineNumber",0), f.get("matchedContent","")[:80], f.get("remediation","")))
    
    # Run platform-aware PySA (with Bandit fallback) scan
    try:
        from ..utils.pysa_scanner import run_pysa_scan
        pysa_findings = await run_pysa_scan(scan_path)
        findings.extend(pysa_findings)
    except Exception:
        pass

    errors = sum(1 for f in findings if f.severity == "ERROR")
    warnings = sum(1 for f in findings if f.severity == "WARNING")
    info = sum(1 for f in findings if f.severity == "INFO")
    return ScanReport(scanned, len(findings), findings, errors, warnings, info)

async def run_incremental_scan(scan_dir: str | Path) -> tuple[ScanReport, list[str], Path]:
    """Run an incremental scan: only re-scan files that changed since the last scan.
    
    Returns (report, formatted_output, scan_log_dir).
    Uses SHA-256 file fingerprinting for change detection — no git dependency.
    """
    scan_path = Path(scan_dir)
    all_files = list(_iter_files(scan_path))

    # Build current fingerprint snapshot
    current_fps = snapshot_files(all_files, scan_path)

    # Load previous scan
    prev_data, prev_fps = load_last_scan()

    delta_info = None
    if prev_data and prev_fps:
        # Detect changes
        delta = detect_changes(current_fps, prev_fps)
        changed_files = set(delta["changed"] + delta["new"])
        deleted_files = set(delta["deleted"])

        if not changed_files and not deleted_files:
            # Nothing changed — carry forward entire previous report
            prev_findings = load_previous_findings(prev_data)
            report = ScanReport(
                scanned_files=len(all_files),
                total_findings=len(prev_findings),
                findings=prev_findings,
                errors=sum(1 for f in prev_findings if f.severity == "ERROR"),
                warnings=sum(1 for f in prev_findings if f.severity == "WARNING"),
                info=sum(1 for f in prev_findings if f.severity == "INFO")
            )
            formatted = format_scan_report(report)
            formatted.insert(0, "[bold green]>> No files changed since last scan. Showing cached results.[/]")
            formatted.insert(1, "")
            delta_info = {"changed": 0, "new": 0, "deleted": 0, "carried_forward": len(prev_findings)}
            log_dir = save_scan_result(report, formatted, current_fps, delta_info)
            return report, formatted, log_dir

        # Incremental: scan only changed/new files
        delta_files = [fp for fp in all_files if str(fp.relative_to(scan_path)) in changed_files]
        delta_report = await run_code_scan(scan_path, file_filter=delta_files)

        # Carry forward findings from unchanged files
        carried = [f for f in load_previous_findings(prev_data) if f.file_path not in changed_files and f.file_path not in deleted_files]
        all_findings = carried + delta_report.findings

        report = ScanReport(
            scanned_files=len(all_files),
            total_findings=len(all_findings),
            findings=all_findings,
            errors=sum(1 for f in all_findings if f.severity == "ERROR"),
            warnings=sum(1 for f in all_findings if f.severity == "WARNING"),
            info=sum(1 for f in all_findings if f.severity == "INFO")
        )
        formatted = format_scan_report(report)
        formatted.insert(0, f"[bold cyan]>> Incremental Scan[/]: [bold white]{len(changed_files)}[/] changed, [bold white]{len(delta['new'])}[/] new, [bold white]{len(deleted_files)}[/] deleted, [bold white]{len(carried)}[/] carried forward")
        formatted.insert(1, "")
        delta_info = {
            "changed": len(delta["changed"]), "new": len(delta["new"]),
            "deleted": len(delta["deleted"]), "carried_forward": len(carried),
            "changed_files": list(changed_files)
        }
    else:
        # First scan ever — full scan
        report = await run_code_scan(scan_path)
        formatted = format_scan_report(report)
        formatted.insert(0, "[bold cyan]>> Full Scan[/] (first run, no previous baseline)")
        formatted.insert(1, "")

    log_dir = save_scan_result(report, formatted, current_fps, delta_info)
    return report, formatted, log_dir

def format_scan_report(report: ScanReport) -> list[str]:
    # Group findings by category
    categories = {
        "Credentials & Secrets Management": [],
        "Injection Vulnerabilities": [],
        "Transport & Cryptography Security": [],
        "Configuration & Exposure": [],
        "Other Security Findings": []
    }
    
    for f in report.findings:
        rule_id = f.rule_id.upper()
        cat_lower = f.category.lower()
        
        # Determine category group
        if (
            "credential" in cat_lower or 
            rule_id in ("SEC-001", "SEC-002", "SEC-007", "SEC-008", "SEC-009") or
            rule_id.startswith("B105") or rule_id.startswith("B106") or rule_id.startswith("B107")
        ):
            group = "Credentials & Secrets Management"
        elif (
            "injection" in cat_lower or 
            rule_id in ("SEC-003", "SEC-004", "SEC-005", "SEC-014") or
            rule_id.startswith("B6") or rule_id.startswith("B102") or rule_id.startswith("B108")
        ):
            group = "Injection Vulnerabilities"
        elif (
            "transport" in cat_lower or "cryptography" in cat_lower or "crypto" in cat_lower or
            rule_id in ("SEC-006", "SEC-013", "SEC-015") or
            rule_id.startswith("B3") or rule_id.startswith("B5")
        ):
            group = "Transport & Cryptography Security"
        elif (
            "configuration" in cat_lower or "logging" in cat_lower or "config" in cat_lower or
            rule_id in ("SEC-010", "SEC-011", "SEC-012") or
            rule_id.startswith("B1") or rule_id.startswith("B4")
        ):
            group = "Configuration & Exposure"
        else:
            group = "Other Security Findings"
            
        categories[group].append(f)

    lines = [
        f"[bold cyan]Security Scan Report[/]: [bold white]{report.scanned_files}[/] files evaluated",
        f"  [bold red]Errors[/]: {report.errors} | [bold yellow]Warnings[/]: {report.warnings} | [bold cyan]Info[/]: {report.info} | [bold magenta]Total Findings[/]: [bold]{report.total_findings}[/]",
        ""
    ]
    
    has_any = False
    for group, group_findings in categories.items():
        if not group_findings:
            continue
        has_any = True
        lines.append(f"[bold magenta]Category: {group} ({len(group_findings)})[/]")
        for f in group_findings:
            short = f.file_path.split("/")[-1] if "/" in f.file_path else f.file_path
            scolor = "bold red" if f.severity == "ERROR" else "bold yellow" if f.severity == "WARNING" else "cyan"
            lines.append(f"  * [[{scolor}]{f.severity}[/]] [[bold]{f.rule_id}[/]]: [bold white]{f.description}[/] [dim]->[/] [yellow]{short}:{f.line_number}[/]")
            if f.remediation: 
                lines.append(f"    [green]Fix[/]: [white]{f.remediation}[/]")
        lines.append("")
        
    if not has_any:
        lines.append("  [bold green]✓ No security vulnerabilities detected.[/]")
        
    return lines

def _iter_files(root: Path):
    if not root.exists(): return
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in _EXTENSIONS and not any(d in p.parts for d in _SKIP_DIRS):
            yield p
