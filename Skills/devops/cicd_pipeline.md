# CI/CD Pipeline Standards

## Pipeline Stages

```
Commit → Build → Lint → Test → Security Scan → Package → Deploy (Staging) → Smoke Test → Deploy (Prod)
```

## Stage Definitions

### 1. Build
- Compile source and resolve dependencies; fail fast on errors; cache for speed.

### 2. Lint & Static Analysis
- Enforce code style (flake8, pylint, ESLint); run type checking (mypy).
- Fail on any critical lint error.

### 3. Test
- Unit tests must pass 100%; run integration tests; enforce ≥80% coverage.

### 4. Security Scan
- SAST (Bandit, Semgrep), dependency audit (`pip audit`), secrets scan (GitLeaks).
- Block pipeline on Critical/High severity findings.

### 5. Package / Build Image
- Build Docker image tagged with commit SHA; push to registry; sign the image.

### 6. Deploy to Staging
- Auto-deploy on merge to `main`/`develop`; run DB migrations as part of deploy.

### 7. Smoke Test
- Run health check + critical path tests; block promotion to prod on failure.

### 8. Deploy to Production
- Manual approval gate; use blue/green or canary strategy.
- Auto-rollback if error rate exceeds threshold within 15 minutes.

## Branch Strategy

| Branch | Purpose | Deploys to |
|---|---|---|
| `feature/*` | New features | Nothing (PR only) |
| `develop` | Integration | Staging (auto) |
| `main` | Production-ready | Production (manual gate) |
| `hotfix/*` | Emergency fixes | Production (expedited) |

## Pipeline Rules

- No secrets in pipeline config — use CI environment variables or vault.
- Every PR must pass lint + unit tests before review.
- No force pushes to `main` or `develop`.
