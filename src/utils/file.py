"""File utilities — replaces file.ts."""
from __future__ import annotations
from pathlib import Path
from ..config.paths import paths
from ..core.types import CodeChange, FileSnapshot

def _normalize_repo_path(input_path: str) -> str:
    unix = input_path.replace("\\", "/").lstrip("/")
    clean = unix.replace("repo/app/", "").replace("repo/", "").replace("app/", "")
    candidate = f"repo/app/{clean}"
    if not candidate.startswith("repo/app/"): raise ValueError(f"Refusing to write outside repo/app: {input_path}")
    return candidate

async def write_changes(changes: list[CodeChange]) -> None:
    for c in changes:
        p = paths["root_dir"] / _normalize_repo_path(c.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(c.content, encoding="utf-8")

async def apply_changes_with_snapshots(changes: list[CodeChange]) -> list[FileSnapshot]:
    snaps = []
    for c in changes:
        p = paths["root_dir"] / _normalize_repo_path(c.path)
        prev = p.read_text(encoding="utf-8") if p.exists() else None
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(c.content, encoding="utf-8")
        snaps.append(FileSnapshot(c.path, prev, c.content))
    return snaps

async def restore_snapshots(snapshots: list[FileSnapshot]) -> None:
    for s in snapshots:
        p = paths["root_dir"] / _normalize_repo_path(s.path)
        if s.previous_content is None:
            if p.exists(): p.unlink()
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(s.previous_content, encoding="utf-8")

async def read_workspace_file(rel_path: str) -> str:
    return (paths["root_dir"] / _normalize_repo_path(rel_path)).read_text(encoding="utf-8")
