"""Git Policy — GitFlow branching & conventional commits. Replaces git-policy.ts."""
from __future__ import annotations
import re
from ..core.types import PolicyViolation

BRANCH_PREFIXES = ("feature/", "release/", "hotfix/", "bugfix/")
PROTECTED_BRANCHES = ("main", "master", "develop")
COMMIT_PREFIXES = ("feat:", "fix:", "hotfix:", "chore:", "docs:", "refactor:", "test:", "ci:", "perf:")

def validate_branch_name(name: str) -> list[PolicyViolation]:
    v, n = [], name.strip().lower()
    if n in PROTECTED_BRANCHES: return v
    if not any(n.startswith(p) for p in BRANCH_PREFIXES):
        v.append(PolicyViolation("GIT-001", f"Branch '{name}' must start with: {', '.join(BRANCH_PREFIXES)}", "error"))
    if name != name.lower():
        v.append(PolicyViolation("GIT-002", f"Branch '{name}' has uppercase chars. Use lowercase.", "error"))
    if re.search(r"[^a-z0-9\-/._]", n):
        v.append(PolicyViolation("GIT-003", f"Branch '{name}' has invalid characters.", "error"))
    after = n
    for p in BRANCH_PREFIXES:
        if n.startswith(p): after = n[len(p):]; break
    if any(n.startswith(p) for p in BRANCH_PREFIXES) and not after:
        v.append(PolicyViolation("GIT-004", f"Branch '{name}' missing descriptor after prefix.", "error"))
    return v

def validate_commit_message(msg: str) -> list[PolicyViolation]:
    v, t = [], msg.strip()
    if not t: return [PolicyViolation("GIT-010", "Commit message cannot be empty.", "error")]
    if not any(t.lower().startswith(p) for p in COMMIT_PREFIXES):
        v.append(PolicyViolation("GIT-011", f"Commit must start with: {', '.join(COMMIT_PREFIXES)}", "error"))
    first = t.split("\n")[0]
    if len(first) > 72: v.append(PolicyViolation("GIT-012", f"Subject line exceeds 72 chars ({len(first)}).", "warning"))
    if first.endswith("."): v.append(PolicyViolation("GIT-013", "Subject should not end with period.", "warning"))
    return v

def get_gitflow_guide() -> list[str]:
    return ["GitFlow Branching Strategy:", "", "  main       Production-ready. Protected.", "  develop    Integration branch.",
        "  feature/*  New features from develop.", "  release/*  Release prep from develop.", "  hotfix/*   Emergency patches from main.",
        "  bugfix/*   Bug fixes from develop.", "", "Workflow:", "  1. Create feature branch: feature/<ticket-id>",
        "  2. Develop with conventional commits", "  3. Merge to develop with --no-ff", "  4. Cut release: release/<version>",
        "  5. Merge release to main AND develop", "  6. Tag the release on main", "",
        "Rollback: Use 'git revert' (non-destructive, audit trail preserved)."]

def build_commit_message(ticket_id: str, title: str, commit_type: str = "feat") -> str:
    return f"{commit_type}: [{ticket_id.upper()}] {title}"

def build_branch_name(ticket_id: str, branch_type: str = "feature") -> str:
    return f"{branch_type}/{ticket_id.lower()}"
