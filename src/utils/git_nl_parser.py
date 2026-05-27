"""Git NL Parser for Git and GitHub operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class GitIntent:
    command: str; args: list[str]; raw: str; source: str

_RULES = [
    # System
    (r"^(?:nexus\s+)?help$|^(?:what\s+can\s+you\s+do|list\s+commands)$", "help", []),
    (r"^(?:nexus\s+)?health$", "health", []),
    (r"^(?:nexus\s+)?version$", "version", []),
    (r"^(?:nexus\s+)?doctor$", "doctor", []),
    (r"^(?:nexus\s+)?config\s+view$", "config-view", []),

    # ── Status & Info ──
    (r"^(?:git\s+)?status$|^what(?:'s| is| has)?\s+changed\??$|^show\s+(?:me\s+)?(?:the\s+)?(?:git\s+)?status$", "status", []),
    (r"^(?:git\s+)?log(?:\s+(\d+))?$|^(?:show|view|list)\s+(?:me\s+)?(?:the\s+)?(?:last\s+)?(\d+)\s+commits?$|^history$", "log", None),
    (r"^stats$|^who\s+contributed$|^contribution\s+stats?$|^show\s+(?:me\s+)?(?:author|contributor)\s+stats?$|^commit\s+stats?$", "shortlog", []),
    (r"^(?:git\s+)?diff(?:\s+(.+))?$", "diff", None),
    (r"^(?:git\s+)?diff\s+--staged$|^(?:show|view)\s+(?:me\s+)?(?:the\s+)?staged\s+(?:changes|diff)$|^staged\s+diff$", "diff-staged", []),
    (r"^(?:git\s+)?show\s+([a-f0-9]{6,40})$|^show\s+commit\s+([a-f0-9]{6,40})$", "show", None),
    (r"^(?:git\s+)?blame\s+(.+)$|^who\s+(?:last\s+)?(?:edited|changed|modified|wrote)\s+(.+)$", "blame", None),

    # ── Staging ──
    (r"^(?:git\s+)?add\s+(.+)$|^stage\s+(.+)$", "add", None),
    (r"^stage\s+(?:all|everything)$|^(?:add|stage)\s+all", "add-all", []),
    (r"^(?:git\s+)?reset\s+(?:HEAD\s+)?(.+)$|^unstage\s+(.+)$", "unstage", None),

    # ── Committing ──
    (r"^(?:git\s+)?commit\s+(?:-a\s+)?(?:-m\s+)?[\"']?(.+?)[\"']?$", "commit", None),
    (r"^revert\s+([a-f0-9]{6,40})$|^undo\s+commit\s+([a-f0-9]{6,40})$|^undo\s+([a-f0-9]{6,40})$", "revert", None),

    # ── Reset ──
    (r"^soft\s+reset(?:\s+(?:to\s+)?(.+))?$|^reset\s+soft(?:\s+(?:to\s+)?(.+))?$", "reset-soft", None),
    (r"^mixed\s+reset(?:\s+(?:to\s+)?(.+))?$|^reset\s+mixed(?:\s+(?:to\s+)?(.+))?$", "reset-mixed", None),
    (r"^hard\s+reset(?:\s+(?:to\s+)?(.+))?$|^reset\s+hard(?:\s+(?:to\s+)?(.+))?$|^discard\s+all\s+changes$", "reset-hard", None),

    # ── Clean ──
    (r"^clean(?:\s+(?:working\s+)?(?:dir|directory|tree))?$|^(?:remove|delete)\s+untracked\s+files?$", "clean", []),
    (r"^clean\s+dry\s+run$|^what\s+would\s+(?:be\s+)?cleaned\??$|^preview\s+clean$", "clean-dry-run", []),

    # ── Branching ──
    (r"^(?:git\s+)?branch(?:es)?$|^(?:list|show)\s+(?:all\s+)?(?:the\s+)?branches$", "branch-list", []),
    (r"^(?:create|make|start|new)\s+(?:a\s+)?(?:new\s+)?branch\s+(?:called\s+|named\s+)?(.+)$|^(?:git\s+)?branch\s+([a-z][a-z0-9/_-]+)$", "branch-create", None),
    (r"^(?:git\s+)?checkout\s+(.+)$|^switch\s+(?:to\s+)?(.+)$", "checkout", None),
    (r"^(?:delete|remove)\s+(?:the\s+)?branch\s+(.+)$|^branch\s+delete\s+(.+)$", "branch-delete", None),
    (r"^(?:git\s+)?merge\s+(.+)$", "merge", None),

    # ── Rebase ──
    (r"^rebase\s+(?:onto\s+)?([a-z][a-z0-9/_-]+)$|^(?:git\s+)?rebase\s+([a-z][a-z0-9/_-]+)$", "rebase", None),
    (r"^rebase\s+(?:last\s+)?(\d+)\s+commits?$|^interactive\s+rebase\s+(\d+)$|^(?:git\s+)?rebase\s+-i\s+(\d+)$", "rebase-interactive", None),
    (r"^continue\s+rebase$|^rebase\s+continue$|^(?:git\s+)?rebase\s+--continue$", "rebase-continue", []),
    (r"^abort\s+rebase$|^rebase\s+abort$|^(?:git\s+)?rebase\s+--abort$|^cancel\s+rebase$", "rebase-abort", []),
    (r"^skip\s+(?:rebase|commit)$|^rebase\s+skip$|^(?:git\s+)?rebase\s+--skip$", "rebase-skip", []),

    # ── Remote & Sync ──
    (r"^(?:git\s+)?pull$|^(?:get|sync|download)\s+(?:the\s+)?(?:latest|updates?|changes?)$", "pull", []),
    (r"^(?:git\s+)?push(?:\s+(?:my\s+)?(?:changes?|code)\s+(?:to\s+)?(.+))?$|^(?:git\s+)?push\s+(?:to\s+)?([a-z][a-z0-9/_-]*)$|^push\s+(?:my\s+)?(?:changes?|code)?(?:\s+(?:to\s+)?(.+))?$|^(?:git\s+)?push$", "push", None),
    (r"^(?:git\s+)?fetch$", "fetch", []),
    (r"^(?:git\s+)?remote(?:\s+-v)?$|^(?:list|show)\s+(?:the\s+)?remotes?$", "remote", []),
    (r"^add\s+remote\s+(\S+)\s+(\S+)$|^(?:git\s+)?remote\s+add\s+(\S+)\s+(\S+)$", "remote-add", None),
    (r"^remove\s+remote\s+(.+)$|^delete\s+remote\s+(.+)$|^(?:git\s+)?remote\s+remove\s+(.+)$", "remote-remove", None),
    (r"^rename\s+remote\s+(\S+)\s+(?:to\s+)?(\S+)$|^(?:git\s+)?remote\s+rename\s+(\S+)\s+(\S+)$", "remote-rename", None),
    (r"^(?:git\s+)?clone\s+(\S+)$|^clone\s+(?:repo|repository)?\s*(\S+)$", "clone", None),
    (r"^init(?:\s+(?:a\s+)?(?:new\s+)?(?:repo|repository))?$|^initialize\s+(?:git|repo)$|^(?:git\s+)?init$", "init", []),

    # ── Stash ──
    (r"^(?:git\s+)?stash$|^stash\s+(?:my\s+)?(?:changes|work)$|^save\s+(?:my\s+)?(?:current\s+)?(?:changes|work)$", "stash", []),
    (r"^(?:git\s+)?stash\s+pop$|^(?:pop|restore)\s+(?:the\s+)?stash$|^apply\s+(?:and\s+remove\s+)?(?:the\s+)?(?:top\s+)?stash$", "stash-pop", []),
    (r"^(?:git\s+)?stash\s+list$|^(?:list|show)\s+(?:the\s+)?stash(?:es)?$", "stash-list", []),
    (r"^save\s+stash\s+as\s+(.+)$|^stash\s+save\s+(?:as\s+)?(.+)$|^name\s+stash\s+(.+)$", "stash-save", None),
    (r"^drop\s+stash(?:\s+(\d+))?$|^(?:delete|remove)\s+stash(?:\s+(\d+))?$|^(?:git\s+)?stash\s+drop(?:\s+(\d+))?$", "stash-drop", None),
    (r"^apply\s+stash(?:\s+(\d+))?$|^(?:git\s+)?stash\s+apply(?:\s+(\d+))?$", "stash-apply", None),

    # ── Tags ──
    (r"^(?:git\s+)?tag\s+([a-z0-9._/-]+)\s+([a-f0-9]{6,40})$", "tag-commit", None),
    (r"^(?:git\s+)?tag\s+([a-z0-9._/-]+)$|^(?:create|add|make)\s+(?:a\s+)?tag\s+(.+)$", "tag", None),
    (r"^(?:list|show)\s+(?:all\s+)?(?:the\s+)?tags?$|^(?:git\s+)?tag\s+(?:-l|--list)$|^tags$", "tag-list", []),
    (r"^delete\s+tag\s+(.+)$|^remove\s+tag\s+(.+)$|^(?:git\s+)?tag\s+-d\s+(.+)$", "tag-delete", None),
    (r"^push\s+tags?$|^(?:git\s+)?push\s+(?:origin\s+)?--tags$", "push-tags", []),

    # ── Reflog ──
    (r"^(?:git\s+)?reflog(?:\s+(\d+))?$|^(?:show|view)\s+(?:the\s+)?reflog$|^recovery\s+log$", "reflog", None),

    # ── Cherry-pick ──
    (r"^(?:git\s+)?cherry-?pick\s+(.+)$", "cherry-pick", None),

    # ── Worktree ──
    (r"^(?:list\s+)?worktrees?$|^(?:git\s+)?worktree\s+list$|^show\s+(?:all\s+)?worktrees?$", "worktree-list", []),
    (r"^add\s+worktree\s+(\S+)(?:\s+(.+))?$|^(?:git\s+)?worktree\s+add\s+(\S+)(?:\s+(.+))?$", "worktree-add", None),
    (r"^remove\s+worktree\s+(.+)$|^(?:git\s+)?worktree\s+remove\s+(.+)$", "worktree-remove", None),

    # ── Submodule ──
    (r"^submodule\s+status$|^(?:git\s+)?submodule\s+status$|^show\s+submodules?$|^list\s+submodules?$", "submodule-status", []),
    (r"^update\s+submodules?$|^(?:git\s+)?submodule\s+update$|^sync\s+submodules?$|^pull\s+submodules?$", "submodule-update", []),
    (r"^add\s+submodule\s+(\S+)(?:\s+(.+))?$|^(?:git\s+)?submodule\s+add\s+(\S+)(?:\s+(.+))?$", "submodule-add", None),

    # ── Bisect ──
    (r"^(?:start\s+)?bisect$|^(?:git\s+)?bisect\s+start$|^start\s+bug\s+hunt$", "bisect-start", []),
    (r"^mark\s+(?:this\s+commit\s+as\s+)?good$|^(?:git\s+)?bisect\s+good(?:\s+(.+))?$|^this\s+(?:commit\s+)?is\s+good$", "bisect-good", None),
    (r"^mark\s+(?:this\s+commit\s+as\s+)?bad$|^(?:git\s+)?bisect\s+bad(?:\s+(.+))?$|^this\s+(?:commit\s+)?is\s+bad$", "bisect-bad", None),
    (r"^(?:reset|end|stop|finish)\s+bisect$|^(?:git\s+)?bisect\s+reset$", "bisect-reset", []),

    # ── Config ──
    (r"^(?:git\s+)?config$|^(?:show|list|view)\s+(?:git\s+)?config$", "config", []),
    (r"^set\s+(?:git\s+)?config\s+(\S+)\s+(.+)$|^(?:git\s+)?config\s+--(?:local|global)\s+(\S+)\s+(.+)$", "config-set", None),

    # ── GitHub ──
    (r"^github\s+auth$", "github-auth", []),
    (r"^github\s+commit(?:\s+(.+))?$", "github-commit", None),
    (r"^github\s+push(?:\s+(.+))?$", "github-push", None),
    (r"^github\s+pull$", "github-pull", []),
    (r"^github\s+branches$", "github-branches", []),
    (r"^github\s+issues$", "github-issues", []),
    (r"^github\s+releases$", "github-releases", []),
    (r"^github\s+pr\s+create(?:\s+(.+))?$|^create\s+(?:a\s+)?(?:pull\s+request|pr)(?:\s+(.+))?$", "github-pr-create", None),
    (r"^github\s+pr\s+merge(?:\s+(\d+))?$|^merge\s+pr\s+(\d+)$", "github-pr-merge", None),
]

def parse_git_intent(text: str) -> GitIntent:
    t = re.sub(r"^nexus\s+", "", text.strip(), flags=re.IGNORECASE).strip()
    for pattern, cmd, static_args in _RULES:
        m = re.match(pattern, t, re.IGNORECASE)
        if m:
            if static_args is not None: return GitIntent(cmd, static_args, t, "rule")
            groups = [g for g in m.groups() if g is not None]

            if cmd == "add" and groups and groups[0].strip() in (".", "all", "everything"):
                return GitIntent("add-all", [], t, "rule")
            if cmd == "commit" and ("commit -a" in t.lower() or "commit all" in t.lower() or "commit everything" in t.lower()):
                return GitIntent("commit-all", [groups[0].strip()] if groups else [], t, "rule")
            if cmd == "tag" and groups and groups[0].strip() in ("-l", "--list", "list"):
                return GitIntent("tag-list", [], t, "rule")
            if cmd in ("remote-add", "remote-rename", "worktree-add", "submodule-add", "config-set"):
                return GitIntent(cmd, [g.strip() for g in groups[:2]], t, "rule")

            return GitIntent(cmd, [groups[0].strip()] if groups else [], t, "rule")
    return GitIntent("unknown", [], t, "unknown")

async def parse_git_intent_with_llm(text: str) -> GitIntent:
    r = parse_git_intent(text)
    if r.command != "unknown": return r
    prompt = (
        "Git command parser. Return JSON: {\"command\": str, \"args\": str[]}. "
        "If the user input is conversational or a general question, return {\"command\": \"unknown\", \"args\": []}. "
        "Valid commands: help, health, version, status, log, diff, diff-staged, add, add-all, commit, commit-all, "
        "revert, reset-soft, reset-mixed, reset-hard, clean, clean-dry-run, "
        "branch-list, branch-create, branch-delete, checkout, merge, "
        "rebase, rebase-interactive, rebase-continue, rebase-abort, rebase-skip, "
        "pull, push, fetch, remote, remote-add, remote-remove, remote-rename, clone, init, "
        "stash, stash-pop, stash-list, stash-save, stash-drop, stash-apply, "
        "tag, tag-commit, tag-list, tag-delete, push-tags, "
        "reflog, shortlog, cherry-pick, show, blame, unstage, "
        "worktree-list, worktree-add, worktree-remove, "
        "submodule-status, submodule-update, submodule-add, "
        "bisect-start, bisect-good, bisect-bad, bisect-reset, "
        "config, config-set, "
        "github-auth, github-clone, github-commit, github-push, github-pull, "
        "github-branches, github-pr-create, github-pr-merge, github-issues, github-releases."
    )
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: return GitIntent(parsed["command"], parsed["args"], text, "llm")
    return r

def get_git_command_help() -> list[str]:
    return [
        "[bold cyan]── Basic ──[/]",
        "  [bold magenta]status[/]                   What changed in working tree?",
        "  [bold magenta]log [n][/]                  Show last n commits  (default 10)",
        "  [bold magenta]diff [file][/]              Unstaged changes",
        "  [bold magenta]diff staged[/]              View staged diff",
        "  [bold magenta]show <sha>[/]               Full commit detail",
        "  [bold magenta]blame <file>[/]             Line-by-line authorship",
        "  [bold magenta]stats[/]                    Commit stats per author",
        "",
        "[bold cyan]── Staging & Committing ──[/]",
        "  [bold magenta]add <file> / all[/]         Stage file(s) for commit",
        "  [bold magenta]unstage <file>[/]           Remove file from staging area",
        "  [bold magenta]commit <msg>[/]             Commit staged changes",
        "  [bold magenta]commit all <msg>[/]         Stage everything and commit",
        "  [bold magenta]revert <sha>[/]             Safely undo a pushed commit (new commit)",
        "",
        "[bold cyan]── Reset ──[/]",
        "  [bold magenta]soft reset [ref][/]         Move HEAD, keep changes staged",
        "  [bold magenta]mixed reset [ref][/]        Move HEAD, keep changes unstaged",
        "  [bold magenta]hard reset [ref][/]         Discard all changes  [dim](DANGER)[/]",
        "  [bold magenta]clean[/]                    Delete all untracked files",
        "  [bold magenta]clean dry run[/]            Preview what would be cleaned",
        "",
        "[bold cyan]── Branching ──[/]",
        "  [bold magenta]branch[/]                   List all local branches",
        "  [bold magenta]branch <name>[/]            Create and switch to new branch",
        "  [bold magenta]switch <name>[/]            Checkout an existing branch",
        "  [bold magenta]delete branch <name>[/]     Remove a local branch",
        "  [bold magenta]merge <branch>[/]           Merge branch into current",
        "",
        "[bold cyan]── Rebase ──[/]",
        "  [bold magenta]rebase <branch>[/]          Rebase current branch onto another",
        "  [bold magenta]rebase last <n>[/]          Interactive rebase for last n commits",
        "  [bold magenta]continue rebase[/]          Resume rebase after fixing conflict",
        "  [bold magenta]abort rebase[/]             Cancel ongoing rebase",
        "  [bold magenta]skip rebase[/]              Skip the conflicting commit",
        "",
        "[bold cyan]── Stash ──[/]",
        "  [bold magenta]stash[/]                    Save current changes to stash",
        "  [bold magenta]pop stash[/]                Apply and remove top stash entry",
        "  [bold magenta]save stash as <name>[/]     Save with a descriptive name",
        "  [bold magenta]list stash[/]               Show all stash entries",
        "  [bold magenta]drop stash [n][/]           Remove a stash entry",
        "  [bold magenta]apply stash [n][/]          Apply without removing from stash",
        "",
        "[bold cyan]── Remote & Sync ──[/]",
        "  [bold magenta]pull / push / fetch[/]       Sync with remote",
        "  [bold magenta]push <branch>[/]            Push a specific branch",
        "  [bold magenta]remote[/]                   List configured remotes",
        "  [bold magenta]add remote <name> <url>[/]  Register a new remote",
        "  [bold magenta]remove remote <name>[/]     Delete a remote",
        "  [bold magenta]rename remote <old> <new>[/]Rename a remote",
        "  [bold magenta]clone <url>[/]              Clone a repository",
        "  [bold magenta]init[/]                     Initialize a new git repo",
        "",
        "[bold cyan]── Tags ──[/]",
        "  [bold magenta]tag <name>[/]               Create a lightweight tag",
        "  [bold magenta]tag <name> <sha>[/]         Tag a specific commit",
        "  [bold magenta]list tags[/]                Show all tags",
        "  [bold magenta]delete tag <name>[/]        Remove a local tag",
        "  [bold magenta]push tags[/]                Push all tags to remote",
        "",
        "[bold cyan]── Reflog & Recovery ──[/]",
        "  [bold magenta]reflog [n][/]               HEAD movement history (recover lost commits)",
        "  [bold magenta]cherry-pick <sha>[/]        Apply a commit from any branch",
        "",
        "[bold cyan]── Worktrees ──[/]",
        "  [bold magenta]worktrees[/]                List all linked worktrees",
        "  [bold magenta]add worktree <path>[/]      Create a linked worktree",
        "  [bold magenta]remove worktree <path>[/]   Remove a linked worktree",
        "",
        "[bold cyan]── Submodules ──[/]",
        "  [bold magenta]submodule status[/]         Show submodule state",
        "  [bold magenta]update submodules[/]        Init and pull all submodules",
        "  [bold magenta]add submodule <url>[/]      Add a new submodule",
        "",
        "[bold cyan]── Bug Hunting (Bisect) ──[/]",
        "  [bold magenta]start bisect[/]             Start binary search for a bug",
        "  [bold magenta]mark good[/]                Current commit is bug-free",
        "  [bold magenta]mark bad[/]                 Current commit has the bug",
        "  [bold magenta]reset bisect[/]             End bisect session",
        "",
        "[bold cyan]── Config ──[/]",
        "  [bold magenta]config[/]                   View all git config values",
        "  [bold magenta]set config <key> <val>[/]   Set a local git config value",
        "",
        "[bold cyan]── GitHub ──[/]",
        "  [bold magenta]github auth[/]              Authenticate with GitHub",
        "  [bold magenta]github pr create [title][/] Create a pull request",
        "  [bold magenta]github pr merge <n>[/]      Merge a pull request",
        "  [bold magenta]github issues[/]            List open issues",
        "  [bold magenta]github releases[/]          List releases",
        "",
        "  [bold dim]exit[/]                     Leave Git mode"
    ]
