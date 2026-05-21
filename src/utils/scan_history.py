"""Scan History — file fingerprinting, snapshot persistence, delta detection, and scan log management.

Instead of relying on git status, this module computes SHA-256 content hashes of every scanned file,
saves a snapshot after each scan, and compares against the previous snapshot to detect changes.

Storage layout:
  .sdlc/scans/
    scan_2026-05-20_14-52-43/
      report.json        # machine-readable scan results + file fingerprints
      output.log         # plain-text formatted terminal output
      summary.txt        # one-liner: date, files scanned, errors, warnings, info
"""
from __future__ import annotations
import json, hashlib, re
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field, asdict
from ..config.paths import paths
from ..core.types import ScanFinding, ScanReport

_SCANS_DIR = "scans"

def _get_scans_root() -> Path:
    return paths["state_dir"] / _SCANS_DIR

# ── File Fingerprinting ─────────────────────────────────────

def _hash_file(file_path: Path) -> str:
    """Compute SHA-256 hash of file content."""
    h = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""

@dataclass
class FileFingerprint:
    path: str
    sha256: str
    size: int
    mtime: float

def snapshot_files(file_paths: list[Path], base_dir: Path) -> dict[str, FileFingerprint]:
    """Build a fingerprint snapshot of all given files."""
    snap = {}
    for fp in file_paths:
        try:
            rel = str(fp.relative_to(base_dir))
            stat = fp.stat()
            snap[rel] = FileFingerprint(
                path=rel,
                sha256=_hash_file(fp),
                size=stat.st_size,
                mtime=stat.st_mtime
            )
        except Exception:
            continue
    return snap

def detect_changes(current: dict[str, FileFingerprint], previous: dict[str, FileFingerprint]) -> dict:
    """Compare two snapshots and return changed/new/deleted file lists."""
    changed, new, deleted = [], [], []

    for rel, fp in current.items():
        if rel not in previous:
            new.append(rel)
        elif fp.sha256 != previous[rel].sha256:
            changed.append(rel)

    for rel in previous:
        if rel not in current:
            deleted.append(rel)

    return {"changed": changed, "new": new, "deleted": deleted}

# ── Scan Result Persistence ──────────────────────────────────

def _make_scan_dir() -> Path:
    """Create a new timestamped scan directory."""
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    scan_dir = _get_scans_root() / f"scan_{ts}"
    scan_dir.mkdir(parents=True, exist_ok=True)
    return scan_dir

def save_scan_result(
    report: ScanReport,
    formatted_output: list[str],
    fingerprints: dict[str, FileFingerprint],
    delta_info: dict | None = None
) -> Path:
    """Persist scan report, output log, and file fingerprints to a timestamped folder."""
    scan_dir = _make_scan_dir()

    # report.json — machine-readable
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "scanned_files": report.scanned_files,
        "total_findings": report.total_findings,
        "errors": report.errors,
        "warnings": report.warnings,
        "info": report.info,
        "scan_type": "incremental" if delta_info else "full",
        "delta": delta_info,
        "findings": [
            {
                "rule_id": f.rule_id, "category": f.category, "description": f.description,
                "severity": f.severity, "file_path": f.file_path, "line_number": f.line_number,
                "matched_content": f.matched_content, "remediation": f.remediation
            }
            for f in report.findings
        ],
        "fingerprints": {
            rel: {"sha256": fp.sha256, "size": fp.size, "mtime": fp.mtime}
            for rel, fp in fingerprints.items()
        }
    }
    (scan_dir / "report.json").write_text(json.dumps(report_data, indent=2), encoding="utf-8")

    # output.log — plain text (strip Rich markup)
    plain_lines = [re.sub(r"\[.*?\]", "", line) for line in formatted_output]
    (scan_dir / "output.log").write_text("\n".join(plain_lines), encoding="utf-8")

    # summary.txt
    ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    scan_type = "INCREMENTAL" if delta_info else "FULL"
    summary = f"{ts_str} | {scan_type} | Files: {report.scanned_files} | Errors: {report.errors} | Warnings: {report.warnings} | Info: {report.info} | Total: {report.total_findings}"
    (scan_dir / "summary.txt").write_text(summary, encoding="utf-8")

    return scan_dir

# ── Load Previous Scan ───────────────────────────────────────

def load_last_scan() -> tuple[dict | None, dict[str, FileFingerprint] | None]:
    """Load the most recent scan report and its fingerprints. Returns (report_data, fingerprints) or (None, None)."""
    scans_root = _get_scans_root()
    if not scans_root.exists():
        return None, None

    scan_dirs = sorted(
        [d for d in scans_root.iterdir() if d.is_dir() and d.name.startswith("scan_")],
        key=lambda d: d.name,
        reverse=True
    )
    if not scan_dirs:
        return None, None

    report_file = scan_dirs[0] / "report.json"
    if not report_file.exists():
        return None, None

    try:
        data = json.loads(report_file.read_text(encoding="utf-8"))
        fps = {}
        for rel, fp_data in data.get("fingerprints", {}).items():
            fps[rel] = FileFingerprint(
                path=rel,
                sha256=fp_data["sha256"],
                size=fp_data["size"],
                mtime=fp_data["mtime"]
            )
        return data, fps
    except Exception:
        return None, None

def load_previous_findings(report_data: dict) -> list[ScanFinding]:
    """Reconstruct ScanFinding objects from a saved report dict."""
    findings = []
    for f in report_data.get("findings", []):
        findings.append(ScanFinding(
            rule_id=f["rule_id"], category=f["category"], description=f["description"],
            severity=f["severity"], file_path=f["file_path"], line_number=f["line_number"],
            matched_content=f.get("matched_content", ""), remediation=f.get("remediation", "")
        ))
    return findings

# ── Scan History Listing ─────────────────────────────────────

def list_scan_history() -> list[str]:
    """Return formatted list of all past scans for terminal display."""
    scans_root = _get_scans_root()
    if not scans_root.exists():
        return ["[bold yellow]No scan history found.[/] Run [bold cyan]security scan[/] to create one."]

    scan_dirs = sorted(
        [d for d in scans_root.iterdir() if d.is_dir() and d.name.startswith("scan_")],
        key=lambda d: d.name,
        reverse=True
    )
    if not scan_dirs:
        return ["[bold yellow]No scan history found.[/] Run [bold cyan]security scan[/] to create one."]

    lines = [
        f"[bold cyan]Scan History[/] ({len(scan_dirs)} scan(s) recorded)",
        f"[dim]Location: {scans_root}[/]",
        ""
    ]

    for i, sd in enumerate(scan_dirs, 1):
        summary_file = sd / "summary.txt"
        if summary_file.exists():
            summary = summary_file.read_text(encoding="utf-8").strip()
            # Highlight latest scan
            prefix = "[bold green]>> [/]" if i == 1 else "   "
            lines.append(f"{prefix}[bold white]{i}.[/] [cyan]{sd.name}[/] | {summary}")
        else:
            lines.append(f"   [bold white]{i}.[/] [cyan]{sd.name}[/] | [dim]No summary available[/]")

    return lines
