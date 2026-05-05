## Description
<!-- What does this PR do? Reference the ticket: feature/FM-XXX -->

**Ticket:** <!-- FM-XXX -->
**Type:** <!-- Feature | Bug Fix | Hotfix | Refactor | Chore -->

## Changes Made
<!-- Bullet points: what files/modules changed and why -->
-

## Testing
- [ ] Unit tests added / updated
- [ ] All existing tests pass locally (`npm test`)
- [ ] Security scan passes (`npm run dev -- scan`)
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] Tested manually in dev environment

## Freddie Mac Compliance Checklist
- [ ] No hardcoded passwords, API keys, or connection strings (SEC-001 to SEC-010)
- [ ] Secrets reference Vault or environment config (`secretProvider.getSecret(...)`)
- [ ] Environment-specific values in `config/environments/*.json`, not in code
- [ ] Branch name follows GitFlow convention (`feature/FM-XXX-description`)
- [ ] Commit messages follow conventional format (`feat: [FM-XXX] description`)
- [ ] No direct `process.env` access outside `env.ts` / `config-manager.ts`
- [ ] Database connections use parameterized config from `config-manager.ts`

## NFR Sign-off
- [ ] Code reviewed for OWASP Top 10 concerns
- [ ] No new `console.log` with sensitive data
- [ ] SonarQube quality gate expected to pass (no new critical issues)

## Rollback Plan
<!-- How do we roll back if this breaks in production? -->
- Automated: Jenkins FORCE_ROLLBACK=true job parameter reverts ECS task definition
- Manual: `git revert <commit-sha>` (non-destructive, preserves audit trail)

## Screenshots (if UI change)
<!-- Add screenshots or remove this section -->
