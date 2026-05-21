# Ticket Planning & Breakdown Standards

## Epic → Story → Task Hierarchy

```
Epic  (large feature, spans multiple sprints)
  └── Story  (single user-facing feature, fits in one sprint)
        └── Task  (technical implementation step, < 1 day)
              └── Subtask  (granular work item, hours)
```

## Breaking Down an Epic

1. **Identify the user journeys** the epic enables.
2. **Write one story per journey** — each story should be independently deliverable.
3. **Identify shared infrastructure tasks** (DB migrations, API setup) as standalone Tasks.
4. **Sequence stories** by dependency order — foundational stories first.

## Sprint Capacity Planning

- **Velocity baseline** — use the average story points completed in the last 3 sprints.
- **Buffer** — reserve 20% of capacity for bugs, tech debt, and unplanned work.
- **Max stories per developer per sprint** — typically 2–4 depending on complexity.

## Ticket Fields Checklist

Every Jira ticket should include:

| Field | Required | Notes |
|---|---|---|
| Summary | ✅ | Clear, action-oriented title |
| Description | ✅ | As a / I want / So that + ACs |
| Issue Type | ✅ | Epic / Story / Task / Bug / Subtask |
| Priority | ✅ | Critical / High / Medium / Low |
| Story Points | ✅ | Required before sprint starts |
| Assignee | ✅ | One owner per ticket |
| Epic Link | ✅ | Every story linked to an Epic |
| Sprint | ✅ | Assigned at sprint planning |
| Labels | Optional | Feature area tags |

## Splitting Strategies for Oversized Stories

If a story is > 8 points, split it using one of:

1. **By workflow step** — separate the happy path from edge cases
2. **By data type** — e.g., handle PDF first, then CSV
3. **By CRUD operation** — Create, Read, Update, Delete as separate stories
4. **By user role** — admin vs. regular user flows separately
5. **Defer performance** — basic functionality first, optimized version second
