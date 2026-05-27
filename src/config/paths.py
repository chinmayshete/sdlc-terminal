"""Path configuration — workspace-agnostic, uses cwd as root."""
from pathlib import Path
import os

# Determine the root directory dynamically. We check NEXUS_CWD first (which is injected
# by the VS Code extension to point to the active workspace folder) and fallback to CWD.
nexus_cwd = os.environ.get("NEXUS_CWD")
if nexus_cwd:
    root_dir = Path(nexus_cwd).resolve()
else:
    root_dir = Path.cwd().resolve()

paths = {
    "root_dir": root_dir,
    "tickets_dir": root_dir / "tickets",
    "repo_dir": root_dir,
    "app_repo_dir": root_dir,
    "state_dir": root_dir / ".sdlc",
    "state_file": root_dir / ".sdlc" / "state.json",
    "skills_dir": root_dir / "skills",
}

