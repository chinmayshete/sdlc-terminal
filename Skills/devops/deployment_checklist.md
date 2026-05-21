# Deployment Checklist

## Pre-Deployment

- [ ] All stories in scope marked Done and acceptance criteria verified
- [ ] All CI/CD pipeline stages passed (build, lint, test, security scan)
- [ ] Release branch created and tagged (`v1.2.3`)
- [ ] DB migration scripts reviewed and tested on a copy of production data
- [ ] Rollback plan documented and communicated to the team
- [ ] Change window communicated to stakeholders

## Deployment Steps

- [ ] Deploy to staging; run smoke tests; confirm health checks pass
- [ ] Get sign-off from QA / product owner on staging
- [ ] Trigger production deployment with manual approval
- [ ] Monitor error rates, latency, and logs for 15 minutes post-deploy
- [ ] Confirm no new alerts fired in monitoring (Datadog, Prometheus, CloudWatch)

## Post-Deployment

- [ ] Announce deployment in team channel (what changed, version, time)
- [ ] Jira tickets linked to the release version and set to Done
- [ ] Confluence release notes page updated
- [ ] Monitoring dashboard bookmarked for on-call engineer

## Rollback Triggers

Initiate rollback immediately if any of the following occur within 30 minutes of deployment:
- Error rate increases by > 5% above baseline
- P95 latency increases by > 20%
- Any Critical/High severity alert fires
- Data integrity issue detected
