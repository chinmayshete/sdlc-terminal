# Sprint Workflow Standards

## Sprint Lifecycle

```
Backlog Refinement → Sprint Planning → Development → Daily Standup → Sprint Review → Retrospective
```

## Sprint Ceremonies

### 1. Backlog Refinement (Mid-sprint, ~1 hr)
- Review and prioritize upcoming stories
- Ensure top 2 sprints worth of backlog is refined and estimated
- Identify missing acceptance criteria or dependencies

### 2. Sprint Planning (Start of sprint, ~2 hrs)
- Select stories from the refined backlog up to team velocity
- Break stories into tasks; assign owners
- Confirm sprint goal — one clear sentence summarizing the sprint's objective

### 3. Daily Standup (Daily, 15 min max)
Each team member answers:
1. What did I complete yesterday?
2. What am I working on today?
3. Are there any blockers?

Blockers must be resolved **outside** the standup.

### 4. Sprint Review (End of sprint, ~1 hr)
- Demo completed features to stakeholders
- Accept or reject stories based on acceptance criteria
- Capture feedback for the backlog

### 5. Sprint Retrospective (End of sprint, ~1 hr)
Structure: **Start / Stop / Continue**
- **Start** — what should we begin doing?
- **Stop** — what is hurting the team?
- **Continue** — what is working well?
Produce at least 2 actionable improvement items for next sprint.

## Workflow States

| Status | Meaning |
|---|---|
| Backlog | Not yet scheduled for a sprint |
| To Do | In the current sprint, not started |
| In Progress | Actively being developed |
| In Review | PR raised, awaiting code review |
| Testing | Under QA or acceptance testing |
| Done | Meets Definition of Done, deployed |
| Blocked | Cannot progress — blocker logged |

## Sprint Health Metrics

- **Velocity** — story points completed per sprint
- **Commitment accuracy** — % of committed points delivered
- **Bug escape rate** — bugs found after sprint review
- **Cycle time** — average days from In Progress to Done
