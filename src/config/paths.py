"""Path configuration — workspace-agnostic, uses cwd as root."""
from pathlib import Path
import os

root_dir = Path(os.getcwd()).resolve()

paths = {
    "root_dir": root_dir,
    "tickets_dir": root_dir / "tickets",
    "repo_dir": root_dir,
    "app_repo_dir": root_dir,
    "state_dir": root_dir / ".sdlc",
    "state_file": root_dir / ".sdlc" / "state.json",
    "skills_dir": root_dir / "skills",
}

