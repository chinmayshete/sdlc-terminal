"""Agile/Project Management NL Parser for Jira, Sprint, Confluence, AI, and Agile operations."""
from __future__ import annotations
import re
from dataclasses import dataclass
from ..utils.llm import parse_intent_with_llm

@dataclass
class AgileIntent:
    command: str
    args: list[str]
    raw: str
    source: str

_RULES = [
    # Project
    (r"^(?:nexus\s+)?project\s+create$", "project-create", []),
    (r"^(?:nexus\s+)?project\s+list$|^(?:list|show)\s+(?:all\s+)?projects?", "project-list", []),
    (r"^(?:nexus\s+)?project\s+info$", "project-info", []),
    (r"^(?:nexus\s+)?project\s+status$|^(?:show\s+)?project\s+status", "project-status", []),
    (r"^(?:nexus\s+)?project\s+delete$", "project-delete", []),
    (r"^(?:nexus\s+)?project\s+archive$", "project-archive", []),

    # Epic
    (r"^(?:nexus\s+)?epic\s+create$", "epic-create", []),
    (r"^(?:nexus\s+)?epic\s+list$|^(?:list|show)\s+(?:all\s+)?epics?", "epic-list", []),
    (r"^(?:nexus\s+)?epic\s+view$", "epic-view", []),
    (r"^(?:nexus\s+)?epic\s+stories$", "epic-stories", []),
    (r"^(?:nexus\s+)?epic\s+progress$", "epic-progress", []),
    (r"^(?:nexus\s+)?epic\s+update$", "epic-update", []),
    (r"^(?:nexus\s+)?epic\s+delete$", "epic-delete", []),
    (r"^(?:nexus\s+)?epic\s+assign$", "epic-assign", []),

    # Story
    (r"^(?:nexus\s+)?story\s+create$", "story-create", []),
    (r"^(?:nexus\s+)?story\s+list$|^(?:list|show|get|give\s+me\s+(?:a\s+)?list\s+of|what\s+are)\s+(?:all\s+)?(?:stories|tickets?)(?:\s+assigned\s+to\s+me)?$|^stories\s+assigned\s+to\s+me$|^my\s+(?:stories|tickets)$", "story-list", []),
    (r"^(?:nexus\s+)?tickets$|^(?:list|show|get)\s+tickets$", "tickets", []),
    (r"^(?:nexus\s+)?story\s+view$", "story-view", []),
    (r"^(?:nexus\s+)?story\s+update$", "story-update", []),
    (r"^(?:nexus\s+)?story\s+move$", "story-move", []),
    (r"^(?:nexus\s+)?story\s+assign$", "story-assign", []),
    (r"^(?:nexus\s+)?story\s+points$", "story-points", []),
    (r"^(?:nexus\s+)?story\s+comment$", "story-comment", []),
    (r"^(?:nexus\s+)?story\s+search$", "story-search", []),
    (r"^(?:nexus\s+)?story\s+close$", "story-close", []),
    (r"^(?:nexus\s+)?story\s+reopen$", "story-reopen", []),
    (r"^(?:nexus\s+)?story\s+delete$", "story-delete", []),

    # Task
    (r"^(?:nexus\s+)?task\s+create$", "task-create", []),
    (r"^(?:nexus\s+)?task\s+list$", "task-list", []),
    (r"^(?:nexus\s+)?task\s+update$", "task-update", []),
    (r"^(?:nexus\s+)?task\s+assign$", "task-assign", []),
    (r"^(?:nexus\s+)?task\s+move$", "task-move", []),
    (r"^(?:nexus\s+)?task\s+complete$", "task-complete", []),
    (r"^(?:nexus\s+)?task\s+delete$", "task-delete", []),

    # Subtask
    (r"^(?:nexus\s+)?subtask\s+create$", "subtask-create", []),
    (r"^(?:nexus\s+)?subtask\s+list$", "subtask-list", []),
    (r"^(?:nexus\s+)?subtask\s+update$", "subtask-update", []),
    (r"^(?:nexus\s+)?subtask\s+assign$", "subtask-assign", []),
    (r"^(?:nexus\s+)?subtask\s+complete$", "subtask-complete", []),
    (r"^(?:nexus\s+)?subtask\s+delete$", "subtask-delete", []),

    # Sprint
    (r"^(?:nexus\s+)?sprint\s+create$", "sprint-create", []),
    (r"^(?:nexus\s+)?sprint\s+list$|^(?:list|show)\s+(?:all\s+)?sprints?", "sprint-list", []),
    (r"^(?:nexus\s+)?sprint\s+active$", "sprint-active", []),
    (r"^(?:nexus\s+)?sprint\s+backlog$", "sprint-backlog", []),
    (r"^(?:nexus\s+)?sprint\s+report$", "sprint-report", []),
    (r"^(?:nexus\s+)?sprint\s+burndown$", "sprint-burndown", []),
    (r"^(?:nexus\s+)?sprint\s+velocity$", "sprint-velocity", []),

    # Board
    (r"^(?:nexus\s+)?board\s+view$|^(?:show|view)\s+(?:the\s+)?board", "board-view", []),
    (r"^(?:nexus\s+)?board\s+backlog$|^(?:show|view)\s+(?:the\s+)?backlog", "board-backlog", []),
    (r"^(?:nexus\s+)?board\s+active$", "board-active", []),
    (r"^(?:nexus\s+)?board\s+roadmap$", "board-roadmap", []),
    (r"^(?:nexus\s+)?board\s+refresh$", "board-refresh", []),

    # Jira
    (r"^(?:nexus\s+)?jira\s+auth$", "jira-auth", []),
    (r"^(?:nexus\s+)?jira\s+login$", "jira-login", []),
    (r"^(?:nexus\s+)?jira\s+logout$", "jira-logout", []),
    (r"^(?:nexus\s+)?jira\s+sync$", "jira-sync", []),
    (r"^(?:nexus\s+)?jira\s+search$", "jira-search", []),
    (r"^(?:nexus\s+)?jira\s+comment$", "jira-comment", []),
    (r"^(?:nexus\s+)?jira\s+transition$", "jira-transition", []),
    (r"^(?:nexus\s+)?jira\s+export$", "jira-export", []),
    (r"^(?:nexus\s+)?jira\s+import$", "jira-import", []),
    (r"^(?:nexus\s+)?jira\s+webhook$", "jira-webhook", []),

    # Confluence
    (r"^(?:nexus\s+)?docs\s+create$", "docs-create", []),
    (r"^(?:nexus\s+)?docs\s+search$", "docs-search", []),
    (r"^(?:nexus\s+)?docs\s+link$", "docs-link", []),
    (r"^(?:nexus\s+)?docs\s+publish$", "docs-publish", []),
    (r"^(?:nexus\s+)?docs\s+export$", "docs-export", []),

    # AI
    (r"^(?:nexus\s+)?ai\s+summarize\s+sprint$", "ai-summarize-sprint", []),
    (r"^(?:nexus\s+)?ai\s+summarize\s+epic$", "ai-summarize-epic", []),
    (r"^(?:nexus\s+)?ai\s+estimate$", "ai-estimate", []),
    (r"^(?:nexus\s+)?ai\s+analyze\s+blockers$", "ai-analyze-blockers", []),
    (r"^(?:nexus\s+)?ai\s+standup\s+report$", "ai-standup-report", []),
    (r"^(?:nexus\s+)?ai\s+sprint\s+review$", "ai-sprint-review", []),
    (r"^(?:nexus\s+)?ai\s+generate\s+stories$", "ai-generate-stories", []),
    (r"^(?:nexus\s+)?ai\s+generate\s+tasks$", "ai-generate-tasks", []),
    (r"^(?:nexus\s+)?ai\s+roadmap$", "ai-roadmap", []),
    (r"^(?:nexus\s+)?ai\s+release\s+notes$", "ai-release-notes", []),

    # Reporting
    (r"^(?:nexus\s+)?report\s+sprint$", "report-sprint", []),
    (r"^(?:nexus\s+)?report\s+epic$", "report-epic", []),
    (r"^(?:nexus\s+)?report\s+velocity$", "report-velocity", []),
    (r"^(?:nexus\s+)?report\s+workload$", "report-workload", []),
    (r"^(?:nexus\s+)?report\s+blockers$", "report-blockers", []),
    (r"^(?:nexus\s+)?report\s+productivity$", "report-productivity", []),
    (r"^(?:nexus\s+)?report\s+releases$", "report-releases", []),

    # User
    (r"^(?:nexus\s+)?user\s+profile$", "user-profile", []),
    (r"^(?:nexus\s+)?user\s+permissions$", "user-permissions", []),
    (r"^(?:nexus\s+)?user\s+list$", "user-list", []),

    # Config
    (r"^(?:nexus\s+)?config\s+view$", "config-view", []),

    # System & Workflow
    (r"^(?:nexus\s+)?status$", "status", []),
    (r"^(?:nexus\s+)?health$", "health", []),
    (r"^(?:nexus\s+)?version$", "version", []),
    (r"^(?:nexus\s+)?doctor$", "doctor", []),
    (r"^(?:nexus\s+)?help$", "help", []),
    (r"^(?:nexus\s+)?push$", "push", []),
    (r"^(?:nexus\s+)?reset$", "reset", []),
    (r"^(?:nexus\s+)?reset-all$", "reset-all", []),
]

_RULES_WITH_ARGS = [
    # Project
    (r"^(?:nexus\s+)?project\s+info\s+(\S+)$", "project-info"),
    (r"^(?:nexus\s+)?project\s+delete\s+(\S+)$", "project-delete"),
    (r"^(?:nexus\s+)?project\s+archive\s+(\S+)$", "project-archive"),

    # Epic
    (r"^(?:nexus\s+)?(?:view\s+)?epic(?:\s+view)?\s+(\S+)$", "epic-view"),
    (r"^(?:nexus\s+)?epic\s+update\s+(\S+)\s+(\S+)\s+(.+)$", "epic-update"),
    (r"^(?:nexus\s+)?epic\s+delete\s+(\S+)$", "epic-delete"),
    (r"^(?:nexus\s+)?(?:list\s+|show\s+)?(?:epic\s+)?stories(?:\s+(?:under|for|of|in))?\s+(\S+)$", "epic-stories"),
    (r"^(?:nexus\s+)?epic\s+progress\s+(\S+)$", "epic-progress"),
    (r"^(?:nexus\s+)?epic\s+assign\s+(\S+)\s+(\S+)$", "epic-assign"),

    # Story
    (r"^(?:nexus\s+)?(?:view\s+)?story(?:\s+view)?\s+(\S+)$", "story-view"),
    (r"^(?:nexus\s+)?story\s+update\s+(\S+)\s+(\S+)\s+(.+)$", "story-update"),
    (r"^(?:nexus\s+)?story\s+move\s+(\S+)\s+(.+)$", "story-move"),
    (r"^(?:nexus\s+)?story\s+assign\s+(\S+)\s+(\S+)$", "story-assign"),
    (r"^(?:nexus\s+)?story\s+close\s+(\S+)$", "story-close"),
    (r"^(?:nexus\s+)?story\s+reopen\s+(\S+)$", "story-reopen"),
    (r"^(?:nexus\s+)?story\s+delete\s+(\S+)$", "story-delete"),
    (r"^(?:nexus\s+)?story\s+points\s+(\S+)\s+(\d+)$", "story-points"),
    (r"^(?:nexus\s+)?story\s+comment\s+(\S+)\s+(.+)$", "story-comment"),
    (r"^(?:nexus\s+)?story\s+search\s+(.+)$", "story-search"),

    # Task
    (r"^(?:nexus\s+)?task\s+update\s+(\S+)\s+(.+)$", "task-update"),
    (r"^(?:nexus\s+)?task\s+assign\s+(\S+)\s+(\S+)$", "task-assign"),
    (r"^(?:nexus\s+)?task\s+move\s+(\S+)\s+(.+)$", "task-move"),
    (r"^(?:nexus\s+)?task\s+complete\s+(\S+)$", "task-complete"),
    (r"^(?:nexus\s+)?task\s+delete\s+(\S+)$", "task-delete"),

    # Subtask
    (r"^(?:nexus\s+)?subtask\s+update\s+(\S+)\s+(.+)$", "subtask-update"),
    (r"^(?:nexus\s+)?subtask\s+assign\s+(\S+)\s+(\S+)$", "subtask-assign"),
    (r"^(?:nexus\s+)?subtask\s+complete\s+(\S+)$", "subtask-complete"),
    (r"^(?:nexus\s+)?subtask\s+delete\s+(\S+)$", "subtask-delete"),

    # Sprint
    (r"^(?:nexus\s+)?sprint\s+create\s+(.+)$", "sprint-create"),
    (r"^(?:nexus\s+)?sprint\s+start\s+(.+)$", "sprint-start"),
    (r"^(?:nexus\s+)?sprint\s+stop\s+(.+)$", "sprint-stop"),
    (r"^(?:nexus\s+)?sprint\s+close\s+(.+)$", "sprint-close"),
    (r"^(?:nexus\s+)?sprint\s+delete\s+(.+)$", "sprint-delete"),

    # Jira
    (r"^(?:nexus\s+)?jira\s+search\s+(.+)$", "jira-search"),
    (r"^(?:nexus\s+)?jira\s+comment\s+(\S+)\s+(.+)$", "jira-comment"),
    (r"^(?:nexus\s+)?jira\s+transition\s+(\S+)\s+(.+)$", "jira-transition"),
    (r"^(?:nexus\s+)?jira\s+import\s+(\S+)$", "jira-import"),

    # Confluence
    (r"^(?:nexus\s+)?docs\s+update\s+(\S+)$", "docs-update"),
    (r"^(?:nexus\s+)?docs\s+delete\s+(\S+)$", "docs-delete"),
    (r"^(?:nexus\s+)?docs\s+link\s+(\S+)\s+(\S+)$", "docs-link"),
    (r"^(?:nexus\s+)?docs\s+search\s+(.+)$", "docs-search"),

    # AI
    (r"^(?:nexus\s+)?ai\s+estimate\s+(\S+)$", "ai-estimate"),

    # Reports
    (r"^(?:nexus\s+)?report\s+sprint\s+(.+)$", "report-sprint"),
    (r"^(?:nexus\s+)?report\s+epic\s+(\S+)$", "report-epic"),

    # Core Execution & Version Control
    (r"^(?:nexus\s+)?plan\s+(\S+)(?:\s+(detailed|comprehensive|basic))?$", "plan"),
    (r"^(?:nexus\s+)?execute\s+(\S+)$", "execute"),
    (r"^(?:nexus\s+)?push\s+(\S+)$", "push"),
    (r"^(?:nexus\s+)?reset\s+(\S+)$", "reset"),
]

def normalize_ticket_id(tid: str) -> str:
    if not isinstance(tid, str) or not tid.strip():
        return tid
    m = re.match(r"^([a-zA-Z]+)(\d+)$", tid.strip())
    if m:
        tid = f"{m.group(1)}-{m.group(2)}"
    m2 = re.match(r"^([a-zA-Z]+)-(\d+)$", tid.strip())
    if m2:
        prefix, num = m2.group(1), m2.group(2)
        try:
            from ..config.env import env
            proj_key = (env.jira_project_key or "SDLC").upper()
        except Exception:
            proj_key = "SDLC"
        def edit_distance(s1: str, s2: str) -> int:
            if len(s1) > len(s2):
                s1, s2 = s2, s1
            distances = range(len(s1) + 1)
            for i2, c2 in enumerate(s2):
                distances_ = [i2+1]
                for i1, c1 in enumerate(s1):
                    if c1 == c2:
                        distances_.append(distances[i1])
                    else:
                        distances_.append(1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
                distances = distances_
            return distances[-1]
        if len(prefix) >= 3 and edit_distance(prefix.lower(), proj_key.lower()) <= 2:
            return f"{proj_key}-{num}"
        if prefix.upper() == proj_key:
            return f"{proj_key}-{num}"
    return tid

def parse_agile_intent(text: str) -> AgileIntent:
    t = re.sub(r"^nexus\s+", "", text.strip(), flags=re.IGNORECASE).strip()
    for pattern, cmd, args in _RULES:
        if re.match(pattern, t, re.IGNORECASE):
            norm_args = [normalize_ticket_id(a) for a in args]
            return AgileIntent(cmd, norm_args, t, "rule")
            
    for pattern, cmd in _RULES_WITH_ARGS:
        m = re.match(pattern, t, re.IGNORECASE)
        if m:
            args = [g for g in m.groups() if g]
            norm_args = [normalize_ticket_id(a) for a in args]
            return AgileIntent(cmd, norm_args, t, "rule")
            
    return AgileIntent("unknown", [], t, "unknown")

async def parse_agile_intent_with_llm(text: str) -> AgileIntent:
    r = parse_agile_intent(text)
    if r.command != "unknown": 
        return r
        
    prompt = '''Agile (Project Management) command parser. Return JSON: {"command": str, "args": str[]}. 
    For the "plan" command, the first argument is the ticket ID, and the second argument (optional) is the mode ("basic", "detailed", or "comprehensive") if the user requests a detailed, comprehensive, or specific plan type. E.g. "detailed plan for SCRUM-12" should parse to {"command": "plan", "args": ["SCRUM-12", "detailed"]}.
    If the user input is conversational, feedback, correction, or a general natural language task request rather than a direct Agile CLI command, you MUST return {"command": "unknown", "args": []}.
    Valid commands: project-create, project-list, project-info, project-status, project-delete, project-archive, epic-create, epic-list, epic-view, epic-update, epic-delete, epic-stories, epic-progress, epic-assign, story-create, story-list, story-view, story-update, story-move, story-assign, story-close, story-reopen, story-delete, story-points, story-comment, story-search, task-create, task-update, task-assign, task-move, task-complete, task-delete, task-list, subtask-create, subtask-update, subtask-assign, subtask-complete, subtask-delete, subtask-list, sprint-create, sprint-start, sprint-stop, sprint-close, sprint-delete, sprint-list, sprint-active, sprint-backlog, sprint-report, sprint-burndown, sprint-velocity, board-view, board-backlog, board-active, board-roadmap, board-refresh, jira-auth, jira-login, jira-logout, jira-sync, jira-search, jira-comment, jira-transition, jira-export, jira-import, jira-webhook, docs-create, docs-update, docs-publish, docs-search, docs-delete, docs-link, docs-export, ai-summarize-sprint, ai-summarize-epic, ai-generate-stories, ai-generate-tasks, ai-estimate, ai-roadmap, ai-analyze-blockers, ai-release-notes, ai-standup-report, ai-sprint-review, report-sprint, report-epic, report-velocity, report-workload, report-blockers, report-releases, report-productivity, user-profile, user-permissions, user-list, config-view, status, health, version, doctor, plan, execute, push, reset, reset-all.'''
    
    parsed = await parse_intent_with_llm(text, prompt)
    if parsed: 
        norm_args = [normalize_ticket_id(a) for a in parsed["args"]]
        return AgileIntent(parsed["command"], norm_args, text, "llm")
    return r

def get_agile_command_help() -> list[str]:
    return [
        "[bold cyan]── PROJECT ACCESS COMMANDS ──[/]",
        "  [bold yellow]project list[/]           Displays all Jira projects accessible to the developer",
        "  [bold yellow]project info[/]           Shows project details like board, members, workflows, and metadata",
        "  [bold yellow]project status[/]         Displays current project health, sprint state, and delivery progress",
        "",
        "[bold cyan]── EPIC ACCESS COMMANDS ──[/]",
        "  [bold yellow]epic list[/]              Lists all Epics available in the project",
        "  [bold yellow]epic view[/]              Displays Epic details, linked stories, and status",
        "  [bold yellow]epic stories[/]           Shows all stories/tasks associated with an Epic",
        "  [bold yellow]epic progress[/]          Displays Epic completion percentage and remaining work",
        "",
        "[bold cyan]── STORY OPERATIONS COMMANDS ──[/]",
        "  [bold yellow]story list[/]             Lists stories assigned to user/project/sprint",
        "  [bold yellow]story view[/]             Displays complete story details",
        "  [bold yellow]story update[/]           Updates story fields like description or progress",
        "  [bold yellow]story move[/]             Changes story workflow status (To Do -> In Progress -> Done)",
        "  [bold yellow]story assign[/]           Assigns story to a developer",
        "  [bold yellow]story points[/]           Adds or updates Agile estimation points",
        "  [bold yellow]story comment[/]          Adds discussion/comments to story",
        "  [bold yellow]story search[/]           Searches stories using keywords or filters",
        "",
        "[bold cyan]── TASK OPERATIONS COMMANDS ──[/]",
        "  [bold yellow]task update[/]            Updates implementation task details",
        "  [bold yellow]task assign[/]            Assigns task to developer",
        "  [bold yellow]task move[/]              Changes task workflow state",
        "  [bold yellow]task complete[/]          Marks task as completed",
        "  [bold yellow]task list[/]              Displays all tasks available to developer",
        "",
        "[bold cyan]── SUBTASK OPERATIONS COMMANDS ──[/]",
        "  [bold yellow]subtask update[/]         Updates subtask details",
        "  [bold yellow]subtask assign[/]         Assigns subtask to team member",
        "  [bold yellow]subtask complete[/]       Marks subtask as done",
        "  [bold yellow]subtask list[/]           Displays child subtasks under task/story",
        "",
        "[bold cyan]── SPRINT ACCESS COMMANDS ──[/]",
        "  [bold yellow]sprint list[/]            Lists all project sprints",
        "  [bold yellow]sprint active[/]          Shows currently running sprint",
        "  [bold yellow]sprint backlog[/]         Displays sprint backlog items",
        "  [bold yellow]sprint report[/]          Generates sprint performance report",
        "  [bold yellow]sprint burndown[/]        Shows sprint burndown progress",
        "  [bold yellow]sprint velocity[/]        Displays team delivery velocity metrics",
        "",
        "[bold cyan]── BOARD ACCESS COMMANDS ──[/]",
        "  [bold yellow]board view[/]             Displays Agile/Kanban board",
        "  [bold yellow]board backlog[/]          Shows pending backlog items",
        "  [bold yellow]board active[/]           Displays active sprint board",
        "  [bold yellow]board roadmap[/]          Shows Epic roadmap and timelines",
        "  [bold yellow]board refresh[/]          Refreshes latest board data from Jira",
        "",
        "[bold cyan]── JIRA OPERATIONS COMMANDS ──[/]",
        "  [bold yellow]jira auth[/]              Authenticates terminal with Jira APIs",
        "  [bold yellow]jira login[/]             Starts Jira session",
        "  [bold yellow]jira logout[/]            Ends Jira session",
        "  [bold yellow]jira sync[/]              Synchronizes Jira tickets and updates",
        "  [bold yellow]jira search[/]            Searches Jira issues/projects",
        "  [bold yellow]jira comment[/]           Adds comments to Jira tickets",
        "  [bold yellow]jira transition[/]        Changes issue workflow status",
        "",
        "[bold cyan]── CONFLUENCE / DOCS COMMANDS ──[/]",
        "  [bold yellow]docs search[/]            Searches Confluence documentation",
        "  [bold yellow]docs link[/]              Links Jira tickets with Confluence pages",
        "",
        "[bold cyan]── AI DEVELOPER OPERATIONS COMMANDS ──[/]",
        "  [bold yellow]ai summarize sprint[/]    AI-generated sprint progress summary",
        "  [bold yellow]ai summarize epic[/]      AI-generated Epic progress summary",
        "  [bold yellow]ai estimate[/]            AI-based complexity estimation",
        "  [bold yellow]ai analyze blockers[/]    Detects blockers and dependencies",
        "  [bold yellow]ai standup report[/]      Generates daily standup report",
        "  [bold yellow]ai sprint review[/]       Creates AI-powered sprint review analysis",
        "",
        "[bold cyan]── REPORTING COMMANDS ──[/]",
        "  [bold yellow]report sprint[/]          Generates sprint analytics report",
        "  [bold yellow]report epic[/]            Displays Epic delivery report",
        "  [bold yellow]report velocity[/]        Shows sprint/team velocity metrics",
        "  [bold yellow]report workload[/]        Displays workload distribution",
        "  [bold yellow]report blockers[/]        Lists blocked tickets/tasks",
        "  [bold yellow]report productivity[/]    Displays engineering productivity metrics",
        "",
        "[bold cyan]── USER ACCESS COMMANDS ──[/]",
        "  [bold yellow]user profile[/]           Displays current developer profile",
        "  [bold yellow]user permissions[/]       Shows user roles and access rights",
        "  [bold yellow]user list[/]              Lists project/team members",
        "",
        "[bold cyan]── CONFIGURATION COMMANDS ──[/]",
        "  [bold yellow]config view[/]            Displays current configuration settings",
        "",
        "[bold cyan]── SYSTEM COMMANDS ──[/]",
        "  [bold yellow]status[/]                 Shows Agile module runtime status",
        "  [bold yellow]health[/]                 Performs health checks on integrations/services",
        "  [bold yellow]version[/]                Displays installed Agile module version",
        "  [bold yellow]doctor[/]                 Runs diagnostics to detect issues",
        "  [bold yellow]help[/]                   Displays Agile command help menu",
        "",
        "  [bold dim]exit[/]                   Leave Agile mode"
    ]
