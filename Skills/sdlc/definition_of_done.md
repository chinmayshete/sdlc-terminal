# Definition of Done (DoD)

The Definition of Done is a shared agreement on what "complete" means for any deliverable. A ticket is not done until ALL items below are checked.

## Code Level

- [ ] Code written and self-reviewed by the developer
- [ ] Follows the team's coding standards (`skills/engineering/coding_standards.md`)
- [ ] No hardcoded secrets, credentials, or environment-specific values
- [ ] Meaningful variable/function names — no abbreviations
- [ ] Dead code and debug statements removed
- [ ] Functions are small and single-responsibility (SRP)
- [ ] Complex logic has inline comments explaining **why**, not what

## Testing Level

- [ ] Unit tests written for all new logic (target: ≥ 80% coverage on new code)
- [ ] Integration tests written where applicable
- [ ] All existing tests still pass
- [ ] Edge cases and error paths tested
- [ ] No `skip` or `xfail` markers left without justification

## Review Level

- [ ] Pull/Merge Request raised with a clear description
- [ ] PR linked to the Jira ticket
- [ ] At least 1 peer code review approval received
- [ ] All review comments addressed or discussed
- [ ] Branch merged and feature branch deleted

## Documentation Level

- [ ] Public APIs have docstrings
- [ ] README updated if setup steps changed
- [ ] Confluence page updated if feature changes user-facing behavior
- [ ] Changelog entry added (for versioned releases)

## Deployment Level

- [ ] Feature deployed to staging/dev environment
- [ ] Smoke test passed on staging
- [ ] No new critical/high security vulnerabilities introduced
- [ ] Performance baseline maintained (no unexplained regressions)
- [ ] Rollback plan documented for major changes

## Jira Level

- [ ] Ticket status set to Done
- [ ] Actual story points logged
- [ ] Acceptance criteria verified and marked met
- [ ] Ticket linked to the merged PR/commit
