"""Git utilities — replaces git.ts. Uses GitPython for all Git operations."""
from __future__ import annotations
from git import Repo, InvalidGitRepositoryError
from ..config.paths import paths
from ..core.types import Ticket
from .git_policy import build_branch_name, build_commit_message, validate_branch_name, validate_commit_message

def _get_repo() -> Repo:
    return Repo(str(paths["root_dir"]))

def _fmt_err(e: Exception) -> str:
    msg = str(e)
    if "git" in msg.lower() and "not found" in msg.lower(): return "git is not installed or not on PATH"
    return msg

# ── Push Ticket ──────────────────────────────────────────────
async def push_ticket(ticket: Ticket) -> str:
    try:
        repo = _get_repo()
        branch = build_branch_name(ticket.id, "feature")
        commit_msg = build_commit_message(ticket.id, ticket.title, "feat")
        bv = validate_branch_name(branch)
        if bv: return f"Policy violation: {'; '.join(v.message for v in bv)}"
        cv = validate_commit_message(commit_msg)
        if any(v.severity == "error" for v in cv): return f"Commit policy violation: {'; '.join(v.message for v in cv)}"
        if branch not in [h.name for h in repo.heads]:
            repo.create_head(branch).checkout()
        else:
            repo.heads[branch].checkout()
        repo.git.add(".")
        repo.index.commit(commit_msg)
        repo.git.push("origin", branch, "-u")
        return f"Pushed changes to origin/{branch}."
    except Exception as e: return f"Skipped push: {_fmt_err(e)}"

async def get_changed_files() -> list[str]:
    try:
        repo = _get_repo()
        s = repo.git.status("--porcelain")
        return [line.strip().split(None, 1)[-1] for line in s.splitlines() if line.strip()] if s.strip() else []
    except Exception as e: return [f"Git unavailable: {_fmt_err(e)}"]

async def create_feature_branch(ticket_id: str) -> str:
    try:
        repo = _get_repo()
        branch = build_branch_name(ticket_id, "feature")
        if branch in [h.name for h in repo.heads]:
            repo.heads[branch].checkout(); return f"Switched to existing branch '{branch}'."
        if "develop" in [h.name for h in repo.heads]: repo.heads.develop.checkout()
        repo.create_head(branch).checkout()
        return f"Created and switched to branch '{branch}'."
    except Exception as e: return f"Failed: {_fmt_err(e)}"

async def create_release_branch(version: str) -> str:
    try:
        repo = _get_repo()
        branch = f"release/{version}"
        if "develop" in [h.name for h in repo.heads]: repo.heads.develop.checkout()
        repo.create_head(branch).checkout()
        return f"Created release branch '{branch}'."
    except Exception as e: return f"Failed: {_fmt_err(e)}"

async def create_hotfix_branch(ticket_id: str) -> str:
    try:
        repo = _get_repo()
        branch = build_branch_name(ticket_id, "hotfix")
        if "main" in [h.name for h in repo.heads]: repo.heads.main.checkout()
        repo.create_head(branch).checkout()
        return f"Created hotfix branch '{branch}'."
    except Exception as e: return f"Failed: {_fmt_err(e)}"

async def merge_feature_to_develop(ticket_id: str) -> str:
    try:
        repo = _get_repo()
        branch = build_branch_name(ticket_id, "feature")
        if branch not in [h.name for h in repo.heads]: return f"Branch '{branch}' does not exist."
        target = "develop" if "develop" in [h.name for h in repo.heads] else repo.active_branch.name
        repo.heads[target].checkout()
        repo.git.merge(branch, "--no-ff", "-m", f"merge: {branch} into {target}")
        return f"Merged '{branch}' into '{target}' with --no-ff."
    except Exception as e: return f"Merge failed: {_fmt_err(e)}"

async def rollback_last_commit() -> str:
    try:
        _get_repo().git.revert("HEAD", "--no-edit")
        return "Reverted last commit. Reversal commit created (audit trail preserved)."
    except Exception as e: return f"Rollback failed: {_fmt_err(e)}"

async def rollback_to_commit(sha: str) -> str:
    try:
        _get_repo().git.revert(sha, "--no-edit")
        return f"Reverted commit {sha[:8]}."
    except Exception as e: return f"Rollback failed: {_fmt_err(e)}"

async def list_recent_commits(count: int = 10) -> list[str]:
    try:
        repo = _get_repo()
        return [f"{c.hexsha[:8]} | {c.committed_datetime.strftime('%Y-%m-%d')} | {c.summary}" for c in repo.iter_commits(max_count=count)]
    except Exception as e: return [f"Unable to read git log: {_fmt_err(e)}"]

async def get_current_branch() -> str:
    try: return str(_get_repo().active_branch)
    except Exception: return "unknown"
