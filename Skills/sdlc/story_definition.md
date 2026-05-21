# User Story Definition Standards

## What Is a User Story?

A user story captures a software feature from the end user's perspective. It describes **who** wants something, **what** they want, and **why** they want it.

**Format:**
```
As a <type of user>,
I want <some goal>,
So that <some reason/benefit>.
```

## INVEST Criteria

Every story should satisfy the INVEST model:

| Letter | Meaning | Check |
|---|---|---|
| **I** | Independent | Can be developed without relying on another unfinished story |
| **N** | Negotiable | Details are open to discussion until the sprint begins |
| **V** | Valuable | Delivers clear value to the user or business |
| **E** | Estimable | Team can estimate effort with enough clarity |
| **S** | Small | Completable within a single sprint |
| **T** | Testable | Acceptance criteria are clear and verifiable |

## Acceptance Criteria

Every story must have acceptance criteria in **Given / When / Then** format:

```
Given <some initial context>
When <an action is taken>
Then <an expected outcome occurs>
```

**Example:**
```
Given I am a logged-in user
When I submit the login form with valid credentials
Then I am redirected to the dashboard and see a welcome message
```

## Definition of Ready (Before Sprint)

A story is sprint-ready when:
- [ ] Written in As a / I want / So that format
- [ ] Acceptance criteria defined (Given/When/Then)
- [ ] Story points estimated by the team
- [ ] Dependencies identified and resolved
- [ ] UI mockups linked (if applicable)
- [ ] No open blocking questions

## Story Sizing Guide

| Points | Complexity | Effort |
|---|---|---|
| 1 | Trivial | < 2 hours |
| 2 | Simple | Half day |
| 3 | Moderate | 1 day |
| 5 | Complex | 2–3 days |
| 8 | Very complex | Full sprint (consider splitting) |
| 13+ | Too big | Must be split before sprint |
