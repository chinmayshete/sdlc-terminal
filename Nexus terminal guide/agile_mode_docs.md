# Nexus Agile Mode — Complete Command Reference

> **Entering Agile Mode**: At the main `nexus >` prompt, type `agile` and press Enter.
> Your prompt will change to `agile >`. Type `exit` to return to the main mode.

---

## How to Run a Command

```bash
nexus > agile          # Enter Agile mode
agile > <command>      # Execute any Agile command
agile > exit           # Return to main mode
```

You can also run **one-shot** from the main prompt for Jira/Confluence keywords:
```bash
nexus > story list          # Auto-routes directly to agile > story list
nexus > epic view SCRUM-5   # Auto-routes directly to agile > epic view SCRUM-5
```

---

## 📁 1. Project Commands

| Command | Syntax | What It Does |
|---|---|---|
| `project list` | `project list` | Lists all Jira projects you have access to |
| `project info` | `project info [project_key]` | Shows metadata: board, lead, velocity, backlog count |
| `project status` | `project status [project_key]` | Displays health: CI/CD, Confluence sync, compliance gate |
| `project create` | `project create` | Creates a new Jira project |
| `project delete` | `project delete <project_key>` | Permanently deletes a project |
| `project archive` | `project archive <project_key>` | Archives a project (read-only) |

### Examples
```bash
agile > project list
agile > project info SCRUM
agile > project status SCRUM
agile > project archive DEMO
```

> [!NOTE]
> `project_key` is optional — if omitted, it uses the default project from `.env` (`JIRA_PROJECT_KEY`).

---

## 🗂️ 2. Epic Commands

| Command | Syntax | What It Does |
|---|---|---|
| `epic list` | `epic list` | Lists all Epics in the project with their status |
| `epic view` | `epic view <epic_id>` | Shows Epic details, progress bar, and linked item count |
| `epic stories` | `epic stories <epic_id>` | Lists all stories/tasks linked to the Epic |
| `epic progress` | `epic progress <epic_id>` | Shows completion % and story point delivery |
| `epic create` | `epic create` | Creates a new Epic |
| `epic update` | `epic update <epic_id> <field> <value>` | Updates an Epic field |
| `epic assign` | `epic assign <epic_id> <username>` | Assigns the Epic to a team member |
| `epic delete` | `epic delete <epic_id>` | Deletes the Epic |

### Examples
```bash
agile > epic list
agile > epic view SCRUM-5
agile > epic stories SCRUM-5
agile > epic progress SCRUM-5
agile > epic update SCRUM-5 summary "New Epic Title"
agile > epic assign SCRUM-5 chinmay.shete
```

---

## 📖 3. Story Commands

| Command | Syntax | What It Does |
|---|---|---|
| `story list` | `story list` | Lists **only Story** issue types from Jira |
| `story view` | `story view <story_id>` | Displays full story details: title, status, priority, description |
| `story create` | `story create` | Prompts for summary and description; creates Story in Jira |
| `story update` | `story update <story_id> <field> <value>` | Updates a specific field on a story |
| `story move` | `story move <story_id> <status>` | Transitions story to a new workflow status |
| `story assign` | `story assign <story_id> <username>` | Assigns the story to a developer |
| `story points` | `story points <story_id> <points>` | Sets story point estimation |
| `story comment` | `story comment <story_id> <comment text>` | Adds a comment to the story |
| `story search` | `story search <keyword>` | Searches stories by keyword |
| `story close` | `story close <story_id>` | Marks story as Done |
| `story reopen` | `story reopen <story_id>` | Reopens a closed story back to To Do |
| `story delete` | `story delete <story_id>` | Deletes the story |

### Examples
```bash
agile > story list
agile > story view SCRUM-10
agile > story create                       # Prompts: summary then description
agile > story move SCRUM-10 "In Progress"
agile > story assign SCRUM-10 chinmay.shete
agile > story points SCRUM-10 8
agile > story comment SCRUM-10 "Ready for code review"
agile > story search authentication
agile > story close SCRUM-10
agile > story delete SCRUM-10
```

> [!IMPORTANT]
> **`story list` now only shows Stories** — not Tasks, Subtasks, or Epics. This was fixed to use the Jira `issuetype=Story` filter.

> [!TIP]
> Valid status names for `story move`: `To Do`, `In Progress`, `In Review`, `Done`

---

## ✅ 4. Task Commands

| Command | Syntax | What It Does |
|---|---|---|
| `task list` | `task list` | Lists all Task issue types from Jira |
| `task create` | `task create` | Creates a new Task |
| `task update` | `task update <task_id> <new_summary>` | Updates task summary |
| `task assign` | `task assign <task_id> <username>` | Assigns task to a developer |
| `task move` | `task move <task_id> <status>` | Changes task workflow state |
| `task complete` | `task complete <task_id>` | Marks task as completed |
| `task delete` | `task delete <task_id>` | Deletes the task |

### Examples
```bash
agile > task list
agile > task create
agile > task assign SCRUM-301 chinmay.shete
agile > task move SCRUM-301 "In Progress"
agile > task complete SCRUM-301
```

---

## 🔩 5. Subtask Commands

| Command | Syntax | What It Does |
|---|---|---|
| `subtask list` | `subtask list` | Lists all Subtasks |
| `subtask create` | `subtask create <parent_id> <summary>` | Creates a subtask under a parent story/task |
| `subtask update` | `subtask update <subtask_id> <summary>` | Updates subtask summary |
| `subtask assign` | `subtask assign <subtask_id> <username>` | Assigns subtask to a team member |
| `subtask complete` | `subtask complete <subtask_id>` | Marks subtask as done |
| `subtask delete` | `subtask delete <subtask_id>` | Deletes the subtask |

### Examples
```bash
agile > subtask list
agile > subtask create SCRUM-10 "Write unit tests for auth module"
agile > subtask assign SUB-5 chinmay.shete
agile > subtask complete SUB-5
```

---

## 🏃 6. Sprint Commands

| Command | Syntax | What It Does |
|---|---|---|
| `sprint list` | `sprint list` | Lists all sprints in the project |
| `sprint active` | `sprint active` | Shows the currently running sprint |
| `sprint backlog` | `sprint backlog` | Displays all backlog items not in a sprint |
| `sprint report` | `sprint report` | Generates sprint performance report |
| `sprint burndown` | `sprint burndown` | Shows sprint burndown chart data |
| `sprint velocity` | `sprint velocity` | Displays team velocity across sprints |
| `sprint create` | `sprint create <name>` | Creates a new sprint |
| `sprint start` | `sprint start <name>` | Starts a sprint |
| `sprint stop` | `sprint stop <name>` | Stops an active sprint |
| `sprint close` | `sprint close <name>` | Closes and completes a sprint |
| `sprint delete` | `sprint delete <name>` | Deletes a sprint |

### Examples
```bash
agile > sprint list
agile > sprint active
agile > sprint backlog
agile > sprint report
agile > sprint create "Sprint 4"
agile > sprint start "Sprint 4"
agile > sprint close "Sprint 3"
```

---

## 📊 7. Board Commands

| Command | Syntax | What It Does |
|---|---|---|
| `board view` | `board view` | Displays the full Agile / Kanban board |
| `board backlog` | `board backlog` | Shows all backlog items |
| `board active` | `board active` | Shows only active sprint items on the board |
| `board roadmap` | `board roadmap` | Shows Epic roadmap and timelines |
| `board refresh` | `board refresh` | Fetches fresh data from Jira |

### Examples
```bash
agile > board view
agile > board backlog
agile > board active
agile > board roadmap
agile > board refresh
```

---

## 🔗 8. Jira Operations Commands

| Command | Syntax | What It Does |
|---|---|---|
| `jira auth` | `jira auth` | Verifies Jira API authentication |
| `jira login` | `jira login` | Starts Jira session |
| `jira logout` | `jira logout` | Ends Jira session |
| `jira sync` | `jira sync` | Synchronizes Jira issues and updates |
| `jira search` | `jira search <query>` | Searches issues using JQL/keywords |
| `jira comment` | `jira comment <ticket_id> <comment>` | Adds a comment to any Jira issue |
| `jira transition` | `jira transition <ticket_id> <status>` | Transitions any issue to a new status |
| `jira export` | `jira export` | Exports all issues to a file |
| `jira import` | `jira import <filename>` | Imports issues from a JSON file |
| `jira webhook` | `jira webhook` | Displays configured Jira webhooks |

### Examples
```bash
agile > jira auth
agile > jira search "payment gateway"
agile > jira comment SCRUM-10 "Reviewed and approved"
agile > jira transition SCRUM-10 "Done"
agile > jira sync
```

> [!NOTE]
> `jira transition` is interactive — it will show you the valid transition options from Jira and ask you to confirm before executing.

---

## 📚 9. Confluence / Docs Commands

| Command | Syntax | What It Does |
|---|---|---|
| `docs search` | `docs search <keyword>` | Searches Confluence space for matching documents |
| `docs link` | `docs link <page_name> <ticket_id>` | Links a Confluence page to a Jira ticket |
| `docs create` | `docs create <title>` | Creates a new Confluence page |
| `docs publish` | `docs publish <title>` | Publishes a draft Confluence page |
| `docs export` | `docs export` | Exports all Confluence pages |

### Examples
```bash
agile > docs search requirements
agile > docs search "project plan"
agile > docs link "Architecture Plan" SCRUM-10
agile > docs create "API Design Spec"
```

> [!NOTE]
> `docs search` queries the live Confluence Space `NEXUS SDLC` (`CONFLUENCE_SPACE_KEY=NS`) and automatically uses the `Project Plan – AI SDLC Terminal` document as knowledge base for `plan` and `execute` commands.

---

## 🤖 10. AI Developer Operations Commands

| Command | Syntax | What It Does |
|---|---|---|
| `ai summarize sprint` | `ai summarize sprint` | AI-generated sprint progress summary |
| `ai summarize epic` | `ai summarize epic` | AI-generated Epic progress narrative |
| `ai estimate` | `ai estimate <ticket_id>` | AI-powered complexity estimation |
| `ai analyze blockers` | `ai analyze blockers` | Detects blockers and circular dependencies |
| `ai standup report` | `ai standup report` | Generates daily standup report |
| `ai sprint review` | `ai sprint review` | Creates AI-powered sprint retrospective |
| `ai generate stories` | `ai generate stories` | Auto-generates User Stories from Epics |
| `ai generate tasks` | `ai generate tasks` | Auto-generates Tasks from Stories |
| `ai roadmap` | `ai roadmap` | Generates AI product roadmap from Epics |
| `ai release notes` | `ai release notes` | AI-crafted release notes from closed sprints |

### Examples
```bash
agile > ai summarize sprint
agile > ai summarize epic
agile > ai estimate SCRUM-10
agile > ai analyze blockers
agile > ai standup report
agile > ai sprint review
agile > ai generate stories
agile > ai roadmap
agile > ai release notes
```

---

## 📈 11. Reporting Commands

| Command | Syntax | What It Does |
|---|---|---|
| `report sprint` | `report sprint` | Full sprint analytics report |
| `report epic` | `report epic <epic_id>` | Epic delivery and progress report |
| `report velocity` | `report velocity` | Team velocity metrics across sprints |
| `report workload` | `report workload` | Developer workload distribution |
| `report blockers` | `report blockers` | All currently blocked tickets and tasks |
| `report productivity` | `report productivity` | Engineering productivity metrics |
| `report releases` | `report releases` | Release history report |

### Examples
```bash
agile > report sprint
agile > report epic SCRUM-5
agile > report velocity
agile > report workload
agile > report blockers
agile > report productivity
```

---

## 👤 12. User & Config Commands

| Command | Syntax | What It Does |
|---|---|---|
| `user profile` | `user profile` | Displays your Jira user profile |
| `user permissions` | `user permissions` | Shows your current roles and access rights |
| `user list` | `user list` | Lists all project team members |
| `config view` | `config view` | Displays current Jira/Agile configuration settings |

### Examples
```bash
agile > user profile
agile > user permissions
agile > user list
agile > config view
```

---

## 🚀 13. Ticket Execution & Version Control Commands

These are the core SDLC workflow commands — run them from **inside `agile >` mode**:

| Command | Syntax | What It Does |
|---|---|---|
| `tickets` | `tickets` | Lists all Jira tickets (any type) |
| `plan <id>` | `plan <ticket_id>` | Generates an AI execution plan using Jira + Confluence context |
| `execute <id>` | `execute <ticket_id>` | Runs AI agents to generate code & tests for the ticket |
| `push <id>` | `push <ticket_id>` | Pushes the ticket's code branch to the remote git repository |
| `reset <id>` | `reset <ticket_id>` | Resets a single ticket's workflow status |
| `reset-all` | `reset-all` | Resets all tickets back to TODO |

### Examples
```bash
agile > tickets
agile > plan SCRUM-10
agile > execute SCRUM-10
agile > push SCRUM-10
agile > reset SCRUM-10
agile > reset-all
```

> [!IMPORTANT]
> `plan` and `execute` automatically inject your **Confluence Project Plan document** from the `NEXUS SDLC` space as live requirements context into the AI agent.

---

## 🔧 14. System Commands (Available in Agile Mode)

| Command | What It Does |
|---|---|
| `status` | Shows Agile module runtime status |
| `health` | Checks Jira and Confluence connectivity |
| `version` | Displays installed module version |
| `doctor` | Runs full diagnostics on integrations |
| `help` | Displays the Agile mode help menu |
| `exit` | Returns to the main `nexus >` prompt |

---

## Quick Reference Card

```
agile > project list / info / status / archive
agile > epic list / view <id> / stories <id> / progress <id> / assign <id> <user>
agile > story list / view <id> / create / move <id> <status> / assign <id> <user>
agile > story points <id> <pts> / comment <id> <text> / close <id> / delete <id>
agile > task list / create / assign <id> <user> / move <id> <status> / complete <id>
agile > subtask create <parent> <summary> / complete <id> / assign <id> <user>
agile > sprint list / active / backlog / report / burndown / velocity
agile > board view / backlog / active / roadmap
agile > jira auth / search <q> / comment <id> <text> / transition <id> <status>
agile > docs search <q> / link <page> <ticket>
agile > ai summarize sprint | ai estimate <id> | ai standup report | ai roadmap
agile > report sprint | report velocity | report workload | report blockers
agile > plan <id> | execute <id> | push <id> | reset <id> | reset-all
agile > exit
```

<!-- 
things to do:
similarly for other cmds the output should be displayed as per the work type in jira and check there are cmds for all work types,
these work types are : story,task,feature,bug,epic,and report -->
