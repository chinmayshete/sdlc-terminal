"""Git NL Parser for Git and GitHub operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class GitIntent:
    command: str; args: list[str]; raw: str; source: str

_RULES = [
    # Basic Git
    (r"^(?:nexus\s+)?(?:show|what(?:'s| is)?|check|view)?\s*(?:the\s+)?(?:git\s+)?status$|^what(?:'s| is| has)?\s+changed\??$", "status", []),
    (r"^(?:nexus\s+)?(?:show|view|list)\s+(?:me\s+)?(?:the\s+)?(?:last\s+)?(\d+)\s+commits?$|^(?:nexus\s+)?(?:git\s+)?log(?:\s+(\d+))?$|^history$", "log", None),
    (r"^(?:nexus\s+)?(?:git\s+)?diff(?:\s+(.+))?$", "diff", None),
    (r"^(?:nexus\s+)?diff\s+--staged$|^(?:show|view)\s+(?:me\s+)?(?:the\s+)?staged\s+(?:changes|diff)$", "diff-staged", []),
    (r"^(?:nexus\s+)?(?:git\s+)?add\s+(.+)$|^stage\s+(.+)$", "add", None),
    (r"^(?:nexus\s+)?stage\s+(?:all|everything)$|^(?:add|stage)\s+all", "add-all", []),
    (r"^(?:nexus\s+)?(?:git\s+)?commit\s+(?:-a\s+)?(?:-m\s+)?[\"']?(.+?)[\"']?$", "commit", None),
    (r"^(?:nexus\s+)?(?:git\s+)?branch(?:es)?$|^(?:list|show)\s+(?:all\s+)?(?:the\s+)?branches$", "branch-list", []),
    (r"^(?:nexus\s+)?(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?branch\s+(?:called\s+|named\s+)?(.+)$|^(?:git\s+)?branch\s+(.+)$", "branch-create", None),
    (r"^(?:nexus\s+)?(?:git\s+)?checkout\s+(.+)$|^switch\s+(?:to\s+)?(.+)$", "checkout", None),
    (r"^(?:nexus\s+)?(?:git\s+)?pull$|^(?:get|sync)\s+(?:the\s+)?(?:latest|updates?)", "pull", []),
    (r"^(?:nexus\s+)?(?:git\s+)?push(?:\s+(.+))?$|^push\s+(?:my\s+)?changes?", "push", None),
    (r"^(?:nexus\s+)?(?:git\s+)?fetch$", "fetch", []),
    (r"^(?:nexus\s+)?(?:git\s+)?stash$|^stash\s+(?:my\s+)?(?:changes|work)$", "stash", []),
    (r"^(?:nexus\s+)?(?:git\s+)?stash\s+pop$|^(?:pop|apply|restore)\s+(?:the\s+)?stash$", "stash-pop", []),
    (r"^(?:nexus\s+)?(?:git\s+)?stash\s+list$|^(?:list|show)\s+(?:the\s+)?stash", "stash-list", []),
    (r"^(?:nexus\s+)?(?:git\s+)?tag\s+(.+)$|^(?:create|add)\s+(?:a\s+)?tag\s+(.+)$", "tag", None),
    (r"^(?:nexus\s+)?(?:list|show)\s+(?:all\s+)?(?:the\s+)?tags?$|^(?:git\s+)?tag\s+(?:-l|--list)$", "tag-list", []),
    (r"^(?:nexus\s+)?(?:git\s+)?remote(?:\s+-v)?$|^(?:list|show)\s+(?:the\s+)?remotes?$", "remote", []),
    (r"^(?:nexus\s+)?(?:git\s+)?reset\s+(.+)$|^unstage\s+(.+)$", "unstage", None),
    (r"^(?:nexus\s+)?(?:git\s+)?cherry-?pick\s+(.+)$", "cherry-pick", None),
    (r"^(?:nexus\s+)?(?:git\s+)?blame\s+(.+)$|^who\s+(?:last\s+)?(?:edited|changed|modified)\s+(.+)$", "blame", None),
    (r"^(?:nexus\s+)?(?:git\s+)?show\s+([a-f0-9]{6,40})$", "show", None),
    (r"^(?:nexus\s+)?(?:git\s+)?merge\s+(.+)$", "merge", None),
    (r"^(?:nexus\s+)?(?:delete|remove)\s+(?:the\s+)?branch\s+(.+)$", "branch-delete", None),

    # GitHub
    (r"^(?:nexus\s+)?github\s+auth$", "github-auth", []),
    (r"^(?:nexus\s+)?github\s+commit(?:\s+(.+))?$", "github-commit", None),
    (r"^(?:nexus\s+)?github\s+push(?:\s+(.+))?$", "github-push", None),
    (r"^(?:nexus\s+)?github\s+pull$", "github-pull", []),
    (r"^(?:nexus\s+)?github\s+branches$", "github-branches", []),
    (r"^(?:nexus\s+)?github\s+issues$", "github-issues", []),
    (r"^(?:nexus\s+)?github\s+releases$", "github-releases", []),
    (r"^(?:nexus\s+)?github\s+pr\s+create(?:\s+(.+))?$", "github-pr-create", None),
    (r"^(?:nexus\s+)?github\s+pr\s+merge(?:\s+(\d+))?$", "github-pr-merge", None),
    (r"^(?:nexus\s+)?github\s+clone\s+(\S+)$", "github-clone", None),
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
            if cmd in ("github-commit", "github-push", "github-pr-create", "github-pr-merge", "github-clone"):
                return GitIntent(cmd, [groups[0].strip()] if groups else [], t, "rule")
            return GitIntent(cmd, [groups[0].strip()] if groups else [], t, "rule")
    return GitIntent("unknown", [], t, "unknown")

async def parse_git_intent_with_llm(text: str) -> GitIntent:
    r = parse_git_intent(text)
    if r.command != "unknown": return r
    prompt = '''Git command parser. Return JSON: {"command": str, "args": str[]}. If the user input is conversational, feedback, correction, or a general natural language task request rather than a direct Git CLI command, you MUST return {"command": "unknown", "args": []}. Valid: status, log, diff, diff-staged, add, add-all, commit, commit-all, branch-list, branch-create, branch-delete, checkout, pull, push, fetch, stash, stash-pop, stash-list, tag, tag-list, remote, unstage, cherry-pick, blame, show, merge, github-auth, github-clone, github-commit, github-push, github-pull, github-branches, github-pr-create, github-pr-merge, github-issues, github-releases.'''
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: return GitIntent(parsed["command"], parsed["args"], text, "llm")
    return r

def get_git_command_help() -> list[str]:
    return [
        "[bold cyan]── Basic Operations ──[/]",
        "  [bold magenta]status[/]             Check working tree status",
        "  [bold magenta]log [n][/]            Show recent commit history",
        "  [bold magenta]diff [file][/]        Show unstaged changes",
        "  [bold magenta]add <file> / .[/]     Stage changes for commit",
        "  [bold magenta]commit <msg>[/]       Commit staged changes",
        "",
        "[bold cyan]── Branch & Remote ──[/]",
        "  [bold magenta]branch [name][/]      List or create branches",
        "  [bold magenta]checkout <name>[/]    Switch branches",
        "  [bold magenta]merge <branch>[/]     Merge branch into current",
        "  [bold magenta]pull / push / fetch[/] Sync with remote repository",
        "",
        "[bold cyan]── GitHub Integrations ──[/]",
        "  [bold magenta]github auth / clone[/]Authenticate and clone repos",
        "  [bold magenta]github pr create[/]   Create pull request with AI summary",
        "  [bold magenta]github issues/rel[/]  List active issues and releases",
        "",
        "  [bold dim]exit[/]               Leave Git mode"
    ]
