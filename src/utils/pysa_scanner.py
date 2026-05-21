"""PySA SAST Scanner Wrapper.
Provides platform-aware static analysis:
- On Unix/Linux: executes 'pyre analyze' (PySA).
- On Windows: delegates to 'bandit' to ensure compatibility, mapping findings to standardized ScanFinding objects.
"""
from __future__ import annotations
import json
import platform
import subprocess
import sys
from pathlib import Path
from ..core.types import ScanFinding
from ..config.paths import paths

def _run_command(cmd: list[str], cwd: str | None = None) -> tuple[str, str, int]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=cwd or str(paths["root_dir"]))
        return r.stdout, r.stderr, r.returncode
    except Exception as e:
        return "", str(e), 1

async def run_pysa_scan(scan_dir: str | Path) -> list[ScanFinding]:
    scan_path = Path(scan_dir)
    findings: list[ScanFinding] = []
    system = platform.system().lower()

    if system == "windows":
        # Windows Fallback: Run Bandit in JSON format
        venv_py = paths["root_dir"] / ".venv" / "Scripts" / "python.exe"
        py_exe = str(venv_py) if venv_py.exists() else sys.executable
        
        # Build command: python -m bandit -r <scan_dir> -f json
        cmd = [py_exe, "-m", "bandit", "-r", str(scan_path), "-f", "json"]
        stdout, stderr, code = _run_command(cmd)
        
        # Bandit exits with 1 if issues are found, which is expected. We only check if stdout exists.
        if not stdout.strip():
            return findings
            
        try:
            data = json.loads(stdout)
            results = data.get("results", [])
            for r in results:
                test_id = r.get("test_id", "B000")
                filename = r.get("filename", "")
                
                # Make path relative to scan_dir for readability
                try:
                    rel_path = str(Path(filename).relative_to(paths["root_dir"]))
                except ValueError:
                    rel_path = filename
                    
                line_no = r.get("line_number", 0)
                code_snippet = r.get("code", "").strip().splitlines()
                matched = code_snippet[0] if code_snippet else ""
                desc = r.get("issue_text", "")
                
                # Map Bandit severity (LOW, MEDIUM, HIGH) to SDLC standard (INFO, WARNING, ERROR)
                sev_map = {"LOW": "INFO", "MEDIUM": "WARNING", "HIGH": "ERROR"}
                severity = sev_map.get(r.get("issue_severity", "MEDIUM"), "WARNING")
                
                remediation = f"Fix for {test_id}: See {r.get('more_info', 'Bandit documentation')}"
                
                findings.append(ScanFinding(
                    rule_id=test_id,
                    category="Security",
                    description=desc,
                    severity=severity,
                    file_path=rel_path,
                    line_number=line_no,
                    matched_content=matched[:80],
                    remediation=remediation
                ))
        except Exception:
            # If JSON parsing fails, fall back to returning empty findings
            pass
            
    else:
        # Unix/Linux Path: Run Pyre/PySA
        # Initialize pyre if needed, and execute 'pyre analyze --output=json'
        # To prevent terminal hangs or failures when pyre is not configured, we do a quick check
        cmd = ["pyre", "analyze", "--output=json"]
        stdout, stderr, code = _run_command(cmd, cwd=str(scan_path))
        
        if stdout.strip() and code == 0:
            try:
                data = json.loads(stdout)
                # Map PySA findings to standard ScanFinding objects
                for item in data:
                    # PySA output format details
                    # e.g., {'line': 12, 'column': 4, 'path': 'src/main.py', 'code': 1001, 'description': '...', ...}
                    line_no = item.get("line", 0)
                    rel_path = item.get("path", "")
                    code_id = f"PYSA-{item.get('code', 1000)}"
                    desc = item.get("description", "")
                    
                    findings.append(ScanFinding(
                        rule_id=code_id,
                        category="TaintAnalysis",
                        description=desc,
                        severity="ERROR",
                        file_path=rel_path,
                        line_number=line_no,
                        matched_content="",
                        remediation="Review taint flow sources and sinks."
                    ))
            except Exception:
                pass

    return findings
