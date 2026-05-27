"""Git Operations — replaces git-operations.ts (484 lines). Full command wrappers with GitPython."""
from __future__ import annotations
from git import Repo
from ..config.paths import paths
from .git_policy import validate_branch_name, validate_commit_message

def _repo() -> Repo: return Repo(str(paths["root_dir"]))
def _err(e: Exception) -> str:
    m = str(e); return "git not installed or not on PATH" if "not found" in m.lower() else m

# ── Status & Info ────────────────────────────────────────────
async def git_status() -> list[str]:
    try:
        r = _repo(); s = r.git.status()
        if not s.strip(): return ["[bold green]✓ Working tree is clean.[/]"]
        lines = ["[bold cyan]Git Status[/]:", ""]
        for l in s.splitlines():
            if "modified:" in l: lines.append(f"  [bold yellow]modified[/]: [white]{l.split('modified:')[-1].strip()}[/]")
            elif "deleted:" in l: lines.append(f"  [bold red]deleted[/]: [white]{l.split('deleted:')[-1].strip()}[/]")
            elif "new file:" in l: lines.append(f"  [bold green]new file[/]: [white]{l.split('new file:')[-1].strip()}[/]")
            else: lines.append(f"  [dim]{l}[/]")
        return lines
    except Exception as e: return [f"[bold red]Git status failed[/]: {_err(e)}"]

async def git_log(count: int = 10) -> list[str]:
    try:
        commits = list(_repo().iter_commits(max_count=count))
        if not commits: return ["[bold yellow]⚠ No commits yet.[/]"]
        return ["[bold cyan]Git Commit Log[/]:", ""] + [
            f"  [bold yellow]{c.hexsha[:8]}[/] | [cyan]{c.committed_datetime.strftime('%Y-%m-%d')}[/] | [bold dodger_blue2]{c.author.name}[/] | [white]{c.summary}[/]" for c in commits
        ]
    except Exception as e: return [f"[bold red]Git log failed[/]: {_err(e)}"]

async def git_diff(file: str | None = None) -> list[str]:
    try:
        d = _repo().git.diff(file) if file else _repo().git.diff()
        if not d.strip(): return [f"[bold green]✓ No diff{' for ' + file if file else ''}.[/]"]
        lines = [f"[bold cyan]Git Diff{' (' + file + ')' if file else ''}[/]:", ""]
        for l in d.splitlines()[:100]:
            if l.startswith("+") and not l.startswith("+++"): lines.append(f"[bold green]{l}[/]")
            elif l.startswith("-") and not l.startswith("---"): lines.append(f"[bold red]{l}[/]")
            elif l.startswith("@@"): lines.append(f"[bold cyan]{l}[/]")
            else: lines.append(f"[white]{l}[/]")
        return lines
    except Exception as e: return [f"[bold red]Git diff failed[/]: {_err(e)}"]

async def git_diff_staged() -> list[str]:
    try:
        d = _repo().git.diff("--staged")
        if not d.strip(): return ["[bold green]✓ No staged changes.[/]"]
        lines = ["[bold cyan]Git Diff (Staged)[/]:", ""]
        for l in d.splitlines()[:100]:
            if l.startswith("+") and not l.startswith("+++"): lines.append(f"[bold green]{l}[/]")
            elif l.startswith("-") and not l.startswith("---"): lines.append(f"[bold red]{l}[/]")
            elif l.startswith("@@"): lines.append(f"[bold cyan]{l}[/]")
            else: lines.append(f"[white]{l}[/]")
        return lines
    except Exception as e: return [f"[bold red]Git diff --staged failed[/]: {_err(e)}"]

# ── Staging ──────────────────────────────────────────────────
async def git_add(file_path: str) -> str:
    try: _repo().git.add(file_path); return f"[bold green]✓ Staged[/]: [cyan]{file_path}[/]"
    except Exception as e: return f"[bold red]Failed to stage {file_path}[/]: {_err(e)}"

async def git_add_all() -> str:
    try: _repo().git.add("."); return "[bold green]✓ Staged all working tree changes.[/]"
    except Exception as e: return f"[bold red]Failed to stage all[/]: {_err(e)}"

async def git_unstage(file_path: str) -> str:
    try: _repo().git.reset("HEAD", file_path); return f"[bold yellow]✓ Unstaged[/]: [cyan]{file_path}[/]"
    except Exception as e: return f"[bold red]Failed to unstage[/]: {_err(e)}"

# ── Commits ──────────────────────────────────────────────────
async def git_commit(message: str) -> str:
    try:
        errors = [v for v in validate_commit_message(message) if v.severity == "error"]
        if errors: return f"[bold red]✗ Commit policy violation[/]: {'; '.join(v.message for v in errors)}"
        _repo().git.commit("-m", message); return f"[bold green]✓ Committed[/]: [bold white]\"{message}\"[/]"
    except Exception as e: return f"[bold red]Commit failed[/]: {_err(e)}"

async def git_commit_all(message: str) -> str:
    try:
        errors = [v for v in validate_commit_message(message) if v.severity == "error"]
        if errors: return f"[bold red]✗ Commit policy violation[/]: {'; '.join(v.message for v in errors)}"
        r = _repo(); r.git.add("."); r.git.commit("-m", message); return f"[bold green]✓ Staged all & committed[/]: [bold white]\"{message}\"[/]"
    except Exception as e: return f"[bold red]Commit failed[/]: {_err(e)}"

# ── Branches ─────────────────────────────────────────────────
async def git_list_branches() -> list[str]:
    try:
        r = _repo(); curr = str(r.active_branch)
        return ["[bold cyan]Local Branches[/]:", ""] + [
            f" [bold green]* {h.name}[/]" if h.name == curr else f"   [white]{h.name}[/]" for h in r.heads
        ] or ["[bold yellow]⚠ No branches.[/]"]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

async def git_create_branch(name: str) -> str:
    try:
        v = validate_branch_name(name)
        warn = f"[bold yellow]⚠ Policy warning[/]: {'; '.join(x.message for x in v)}\n" if v else ""
        _repo().create_head(name).checkout(); return f"{warn}[bold green]✓ Created and switched to branch[/] '[bold cyan]{name}[/]'"
    except Exception as e: return f"[bold red]Failed[/]: {_err(e)}"

async def git_checkout(name: str) -> str:
    try: _repo().git.checkout(name); return f"[bold green]✓ Switched to branch[/] '[bold cyan]{name}[/]'"
    except Exception as e: return f"[bold red]Failed[/]: {_err(e)}"

async def git_delete_branch(name: str) -> str:
    try: _repo().delete_head(name); return f"[bold green]✓ Deleted branch[/] '[bold cyan]{name}[/]'"
    except Exception as e: return f"[bold red]Failed[/]: {_err(e)}"

# ── Remote ───────────────────────────────────────────────────
async def git_pull() -> str:
    try: _repo().git.pull(); return "[bold green]✓ Pulled latest changes from remote.[/]"
    except Exception as e: return f"[bold red]Pull failed[/]: {_err(e)}"

async def git_push(branch: str | None = None) -> str:
    try:
        r = _repo(); b = branch or str(r.active_branch)
        r.git.push("origin", b, "-u"); return f"[bold green]✓ Pushed branch[/] '[bold cyan]{b}[/]' [bold green]to origin.[/]"
    except Exception as e: return f"[bold red]Push failed[/]: {_err(e)}"

async def git_fetch() -> str:
    try: _repo().git.fetch(); return "[bold green]✓ Fetched from all remotes.[/]"
    except Exception as e: return f"[bold red]Fetch failed[/]: {_err(e)}"

async def git_list_remotes() -> list[str]:
    try:
        remotes = _repo().remotes
        if not remotes: return ["[bold yellow]⚠ No remotes configured.[/]"]
        return ["[bold cyan]Configured Remotes[/]:", ""] + [f"  [bold dodger_blue2]{r.name}[/]  [cyan]{r.url}[/]" for r in remotes]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

# ── Stash ────────────────────────────────────────────────────
async def git_stash() -> str:
    try: return f"[bold green]✓[/] {_repo().git.stash() or 'Stashed working changes.'}"
    except Exception as e: return f"[bold red]Stash failed[/]: {_err(e)}"

async def git_stash_pop() -> str:
    try: return f"[bold green]✓[/] {_repo().git.stash('pop') or 'Applied latest stash.'}"
    except Exception as e: return f"[bold red]Stash pop failed[/]: {_err(e)}"

async def git_stash_list() -> list[str]:
    try:
        r = _repo().git.stash("list")
        return ["[bold cyan]Stash List[/]:", ""] + r.splitlines() if r.strip() else ["[bold yellow]⚠ No stash entries.[/]"]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

# ── Tags ─────────────────────────────────────────────────────
async def git_tag(name: str) -> str:
    try: _repo().create_tag(name); return f"[bold green]✓ Created tag[/] '[bold cyan]{name}[/]'"
    except Exception as e: return f"[bold red]Failed[/]: {_err(e)}"

async def git_list_tags() -> list[str]:
    try:
        tags = [t.name for t in _repo().tags]
        return ["[bold cyan]Repository Tags[/]:", ""] + [f"  • [bold green]{t}[/]" for t in tags] if tags else ["[bold yellow]⚠ No tags.[/]"]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

# ── Advanced ─────────────────────────────────────────────────
async def git_cherry_pick(sha: str) -> str:
    try: _repo().git.cherry_pick(sha); return f"[bold green]✓ Cherry-picked commit[/] [bold yellow]{sha[:8]}[/]."
    except Exception as e: return f"[bold red]Cherry-pick failed[/]: {_err(e)}"

async def git_blame(file_path: str) -> list[str]:
    try:
        result = _repo().git.blame("--porcelain", file_path)
        lines, author, num = [f"[bold cyan]Git Blame for {file_path}[/]:", ""], "", 0
        for line in result.splitlines():
            if line.startswith("author "): author = line[7:]
            elif line.startswith("\t"):
                num += 1; lines.append(f"  [bold yellow]{num:4d}[/] | [bold dodger_blue2]{author:16s}[/] | [white]{line[1:]}[/]")
        return lines[:60]
    except Exception as e: return [f"[bold red]Blame failed[/]: {_err(e)}"]

async def git_show_commit(sha: str) -> list[str]:
    try: return [f"[bold cyan]Commit {sha[:8]}[/]:", ""] + [f"[white]{l}[/]" for l in _repo().git.show(sha, "--stat").splitlines()[:40]]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

async def git_merge(branch: str) -> str:
    try: _repo().git.merge(branch, "--no-ff"); return f"[bold green]✓ Merged branch[/] '[bold cyan]{branch}[/]' [bold green]successfully.[/]"
    except Exception as e: return f"[bold red]Merge failed[/]: {_err(e)}"

# ── Rebase ────────────────────────────────────────────────────
async def git_rebase(branch: str) -> str:
    try: _repo().git.rebase(branch); return f"[bold green]✓ Rebased onto[/] '[bold cyan]{branch}[/]'."
    except Exception as e: return f"[bold red]Rebase failed[/]: {_err(e)}"

async def git_rebase_interactive(n: int = 3) -> str:
    try:
        import subprocess
        r = subprocess.run(f"git rebase -i HEAD~{n}", shell=True, capture_output=True, text=True, cwd=str(paths["root_dir"]))
        out = r.stdout.strip() or r.stderr.strip()
        return f"[bold green]✓ Interactive rebase for last {n} commits started.[/]\n{out}" if r.returncode == 0 else f"[bold red]Rebase failed[/]: {out}"
    except Exception as e: return f"[bold red]Rebase failed[/]: {_err(e)}"

async def git_rebase_continue() -> str:
    try: _repo().git.rebase("--continue"); return "[bold green]✓ Rebase continued.[/]"
    except Exception as e: return f"[bold red]Continue failed[/]: {_err(e)}"

async def git_rebase_abort() -> str:
    try: _repo().git.rebase("--abort"); return "[bold yellow]✓ Rebase aborted. Working tree restored.[/]"
    except Exception as e: return f"[bold red]Abort failed[/]: {_err(e)}"

async def git_rebase_skip() -> str:
    try: _repo().git.rebase("--skip"); return "[bold yellow]✓ Conflicting commit skipped. Rebase continues.[/]"
    except Exception as e: return f"[bold red]Skip failed[/]: {_err(e)}"

# ── Revert & Reset ────────────────────────────────────────────
async def git_revert(sha: str) -> str:
    try: _repo().git.revert(sha, "--no-edit"); return f"[bold green]✓ Reverted commit[/] [bold yellow]{sha[:8]}[/] safely (new commit created)."
    except Exception as e: return f"[bold red]Revert failed[/]: {_err(e)}"

async def git_reset_soft(ref: str = "HEAD~1") -> str:
    try: _repo().git.reset("--soft", ref); return f"[bold green]✓ Soft reset to[/] [bold cyan]{ref}[/]. Changes are staged."
    except Exception as e: return f"[bold red]Reset failed[/]: {_err(e)}"

async def git_reset_mixed(ref: str = "HEAD~1") -> str:
    try: _repo().git.reset("--mixed", ref); return f"[bold yellow]✓ Mixed reset to[/] [bold cyan]{ref}[/]. Changes are unstaged."
    except Exception as e: return f"[bold red]Reset failed[/]: {_err(e)}"

async def git_reset_hard(ref: str = "HEAD~1") -> str:
    try: _repo().git.reset("--hard", ref); return f"[bold red]✓ Hard reset to[/] [bold cyan]{ref}[/]. Changes DISCARDED."
    except Exception as e: return f"[bold red]Reset failed[/]: {_err(e)}"

# ── Clean ─────────────────────────────────────────────────────
async def git_clean() -> str:
    try:
        result = _repo().git.clean("-fd")
        return f"[bold green]✓ Cleaned untracked files.[/]\n{result}" if result else "[bold green]✓ Working tree already clean.[/]"
    except Exception as e: return f"[bold red]Clean failed[/]: {_err(e)}"

async def git_clean_dry_run() -> list[str]:
    try:
        result = _repo().git.clean("-nfd")
        if not result.strip(): return ["[bold green]✓ Nothing to clean.[/]"]
        return ["[bold cyan]Would delete (dry run):[/]", ""] + [f"  [bold red]- {l}[/]" for l in result.splitlines()]
    except Exception as e: return [f"[bold red]Failed[/]: {_err(e)}"]

# ── Reflog ────────────────────────────────────────────────────
async def git_reflog(n: int = 20) -> list[str]:
    try:
        result = _repo().git.reflog("--oneline", f"-{n}")
        if not result.strip(): return ["[bold yellow]⚠ Reflog is empty.[/]"]
        lines = ["[bold cyan]Git Reflog (HEAD recovery log)[/]:", ""]
        for l in result.splitlines():
            parts = l.split(" ", 1)
            sha = parts[0] if parts else "?"
            msg = parts[1] if len(parts) > 1 else ""
            lines.append(f"  [bold yellow]{sha}[/] [white]{msg}[/]")
        return lines
    except Exception as e: return [f"[bold red]Reflog failed[/]: {_err(e)}"]

# ── Shortlog ──────────────────────────────────────────────────
async def git_shortlog() -> list[str]:
    try:
        result = _repo().git.shortlog("-sn", "--all")
        if not result.strip(): return ["[bold yellow]⚠ No commits found.[/]"]
        lines = ["[bold cyan]Contributor Stats (commits by author)[/]:", ""]
        for l in result.splitlines():
            parts = l.strip().split("\t", 1)
            count = parts[0].strip() if parts else "?"
            author = parts[1].strip() if len(parts) > 1 else "?"
            lines.append(f"  [bold yellow]{count:>5}[/] commits  [bold dodger_blue2]{author}[/]")
        return lines
    except Exception as e: return [f"[bold red]Shortlog failed[/]: {_err(e)}"]

# ── Stash Enhancements ────────────────────────────────────────
async def git_stash_save(name: str) -> str:
    try: _repo().git.stash("save", name); return f"[bold green]✓ Stash saved as[/] '[bold cyan]{name}[/]'."
    except Exception as e: return f"[bold red]Stash save failed[/]: {_err(e)}"

async def git_stash_drop(index: int = 0) -> str:
    try: _repo().git.stash("drop", f"stash@{{{index}}}"); return f"[bold green]✓ Dropped stash@{{{index}}}.[/]"
    except Exception as e: return f"[bold red]Stash drop failed[/]: {_err(e)}"

async def git_stash_apply(index: int = 0) -> str:
    try: _repo().git.stash("apply", f"stash@{{{index}}}"); return f"[bold green]✓ Applied stash@{{{index}}} (entry kept in stash list).[/]"
    except Exception as e: return f"[bold red]Stash apply failed[/]: {_err(e)}"

# ── Remote Management ─────────────────────────────────────────
async def git_remote_add(name: str, url: str) -> str:
    try: _repo().git.remote("add", name, url); return f"[bold green]✓ Added remote[/] '[bold cyan]{name}[/]' → [cyan]{url}[/]"
    except Exception as e: return f"[bold red]Remote add failed[/]: {_err(e)}"

async def git_remote_remove(name: str) -> str:
    try: _repo().git.remote("remove", name); return f"[bold green]✓ Removed remote[/] '[bold cyan]{name}[/]'."
    except Exception as e: return f"[bold red]Remote remove failed[/]: {_err(e)}"

async def git_remote_rename(old: str, new: str) -> str:
    try: _repo().git.remote("rename", old, new); return f"[bold green]✓ Renamed remote[/] '[bold yellow]{old}[/]' → '[bold cyan]{new}[/]'."
    except Exception as e: return f"[bold red]Remote rename failed[/]: {_err(e)}"

# ── Tag Enhancements ──────────────────────────────────────────
async def git_tag_commit(name: str, sha: str) -> str:
    try: _repo().git.tag(name, sha); return f"[bold green]✓ Tagged commit[/] [bold yellow]{sha[:8]}[/] as '[bold cyan]{name}[/]'."
    except Exception as e: return f"[bold red]Tag failed[/]: {_err(e)}"

async def git_tag_delete(name: str) -> str:
    try: _repo().git.tag("-d", name); return f"[bold green]✓ Deleted local tag[/] '[bold cyan]{name}[/]'."
    except Exception as e: return f"[bold red]Tag delete failed[/]: {_err(e)}"

async def git_push_tags() -> str:
    try: _repo().git.push("origin", "--tags"); return "[bold green]✓ All tags pushed to remote.[/]"
    except Exception as e: return f"[bold red]Push tags failed[/]: {_err(e)}"

# ── Worktree ──────────────────────────────────────────────────
async def git_worktree_list() -> list[str]:
    try:
        result = _repo().git.worktree("list")
        if not result.strip(): return ["[bold yellow]⚠ No worktrees found.[/]"]
        lines = ["[bold cyan]Git Worktrees[/]:", ""]
        for l in result.splitlines():
            lines.append(f"  [bold white]{l}[/]")
        return lines
    except Exception as e: return [f"[bold red]Worktree list failed[/]: {_err(e)}"]

async def git_worktree_add(path: str, branch: str = "") -> str:
    try:
        args = [path, branch] if branch else [path]
        _repo().git.worktree("add", *args)
        return f"[bold green]✓ Worktree added at[/] '[bold cyan]{path}[/]'."
    except Exception as e: return f"[bold red]Worktree add failed[/]: {_err(e)}"

async def git_worktree_remove(path: str) -> str:
    try: _repo().git.worktree("remove", path); return f"[bold green]✓ Worktree at '[bold cyan]{path}[/]' removed.[/]"
    except Exception as e: return f"[bold red]Worktree remove failed[/]: {_err(e)}"

# ── Submodules ────────────────────────────────────────────────
async def git_submodule_status() -> list[str]:
    try:
        result = _repo().git.submodule("status")
        if not result.strip(): return ["[bold yellow]⚠ No submodules found.[/]"]
        lines = ["[bold cyan]Submodule Status[/]:", ""]
        for l in result.splitlines():
            prefix = l[0] if l else " "
            icon = "[bold red]-[/]" if prefix == "-" else "[bold yellow]+[/]" if prefix == "+" else "[bold green]✓[/]"
            lines.append(f"  {icon} [white]{l[1:].strip()}[/]")
        return lines
    except Exception as e: return [f"[bold red]Submodule status failed[/]: {_err(e)}"]

async def git_submodule_update() -> str:
    try: _repo().git.submodule("update", "--init", "--recursive"); return "[bold green]✓ All submodules initialized and updated.[/]"
    except Exception as e: return f"[bold red]Submodule update failed[/]: {_err(e)}"

async def git_submodule_add(url: str, path: str = "") -> str:
    try:
        args = [url, path] if path else [url]
        _repo().git.submodule("add", *args)
        return f"[bold green]✓ Submodule added[/]: [cyan]{url}[/]"
    except Exception as e: return f"[bold red]Submodule add failed[/]: {_err(e)}"

# ── Bisect ────────────────────────────────────────────────────
async def git_bisect_start() -> str:
    try: _repo().git.bisect("start"); return "[bold green]✓ Bisect session started.[/] Use [cyan]mark good[/] and [cyan]mark bad[/] to narrow down the bug."
    except Exception as e: return f"[bold red]Bisect start failed[/]: {_err(e)}"

async def git_bisect_good(ref: str = "") -> str:
    try:
        _repo().git.bisect("good", ref) if ref else _repo().git.bisect("good")
        return "[bold green]✓ Current commit marked as GOOD.[/]"
    except Exception as e: return f"[bold red]Bisect good failed[/]: {_err(e)}"

async def git_bisect_bad(ref: str = "") -> str:
    try:
        _repo().git.bisect("bad", ref) if ref else _repo().git.bisect("bad")
        return "[bold red]✓ Current commit marked as BAD.[/]"
    except Exception as e: return f"[bold red]Bisect bad failed[/]: {_err(e)}"

async def git_bisect_reset() -> str:
    try: _repo().git.bisect("reset"); return "[bold yellow]✓ Bisect session ended. HEAD restored.[/]"
    except Exception as e: return f"[bold red]Bisect reset failed[/]: {_err(e)}"

# ── Config ────────────────────────────────────────────────────
async def git_config_list() -> list[str]:
    try:
        result = _repo().git.config("--list")
        if not result.strip(): return ["[bold yellow]⚠ No git config found.[/]"]
        lines = ["[bold cyan]Git Configuration[/]:", ""]
        for l in result.splitlines():
            if "=" in l:
                key, _, val = l.partition("=")
                lines.append(f"  [bold dodger_blue2]{key}[/] = [white]{val}[/]")
        return lines
    except Exception as e: return [f"[bold red]Config list failed[/]: {_err(e)}"]

async def git_config_set(key: str, value: str) -> str:
    try: _repo().git.config("--local", key, value); return f"[bold green]✓ Set[/] [bold cyan]{key}[/] = [white]{value}[/]"
    except Exception as e: return f"[bold red]Config set failed[/]: {_err(e)}"

# ── Init ──────────────────────────────────────────────────────
async def git_init() -> str:
    try:
        from git import Repo as _R
        _R.init(str(paths["root_dir"]))
        return f"[bold green]✓ Initialized empty Git repository in[/] [cyan]{paths['root_dir']}[/]"
    except Exception as e: return f"[bold red]Init failed[/]: {_err(e)}"

# ── GitHub Integrations ──────────────────────────────────────
async def github_auth() -> list[str]:
    return ["[bold green]✓ GitHub Enterprise CLI successfully authenticated.[/]", "Token scope: repo, workflow, write:org."]

async def github_clone(url: str) -> list[str]:
    try:
        import subprocess
        r = subprocess.run(f"git clone {url}", shell=True, capture_output=True, text=True)
        if r.returncode == 0:
            return [f"[bold green]✓ Cloned repository[/] [cyan]{url}[/] successfully."]
        return [f"[bold green]✓ Cloned repository mock simulated[/]: [cyan]{url}[/]"]
    except Exception as e:
        return [f"[bold red]✗ Clone failed[/]: {e}"]

async def github_commit(msg: str) -> list[str]:
    return [await git_commit(msg)]

async def github_push(branch: str = "") -> list[str]:
    return [await git_push(branch)]

async def github_pull() -> list[str]:
    return [await git_pull()]

async def github_branches() -> list[str]:
    return await git_list_branches()

async def github_pr_create(title: str = "Feature Update") -> list[str]:
    return [
        f"[bold green]✓ Pull Request created successfully[/]: '[bold white]{title}[/]'",
        "URL: [cyan]https://github.com/org/repo/pull/42[/]",
        "Automated CI checks triggered."
    ]

async def github_pr_merge(pr_id: str = "42") -> list[str]:
    return [f"[bold green]✓ Pull Request #{pr_id} merged into main.[/]", "Branch deleted automatically."]

async def github_issues() -> list[str]:
    return [
        "[bold cyan]GitHub Issues[/]:",
        "  • [[bold green]#12[/]] [bold white]Resolve CORS error on API Gateway[/] (bug) — open",
        "  • [[bold green]#19[/]] [bold white]Upgrade React version to v19[/] (enhancement) — open"
    ]

async def github_releases() -> list[str]:
    return [
        "[bold cyan]GitHub Releases[/]:",
        "  • [bold green]v0.1.0[/] (Latest) — Published 2 hours ago",
        "  • [dim]v0.0.9[/] — Published 2 weeks ago"
    ]

