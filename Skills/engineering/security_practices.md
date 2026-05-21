# Security Practices

## Secure Coding Checklist

### Input Validation
- [ ] Validate ALL user input server-side (never trust client-side validation alone)
- [ ] Use allowlists, not blocklists, for input validation
- [ ] Enforce strict type checking and length limits
- [ ] Reject unexpected fields in request bodies

### Authentication & Authorization
- [ ] Never store passwords in plain text — use bcrypt or Argon2
- [ ] Implement MFA for admin accounts
- [ ] Use short-lived tokens (JWT: 15–60 min); refresh token rotation
- [ ] Verify authorization on every request (not just at login)
- [ ] Principle of Least Privilege — grant minimum required permissions

### Secrets Management
- [ ] No secrets, API keys, or credentials in source code
- [ ] No secrets in git history (use `git-secrets` or pre-commit hooks)
- [ ] All secrets stored in environment variables or a vault (e.g., HashiCorp Vault, AWS Secrets Manager)
- [ ] Rotate secrets regularly; revoke compromised secrets immediately

### Data Protection
- [ ] Sensitive data encrypted at rest (AES-256)
- [ ] All data in transit encrypted via TLS 1.2+
- [ ] PII minimized — collect only what is required
- [ ] Logs do not contain passwords, tokens, or PII

### Dependency Management
- [ ] Run `pip audit` / `npm audit` on every build
- [ ] Pin dependency versions to avoid supply-chain attacks
- [ ] Update dependencies regularly; patch critical CVEs within 24 hours

### API Security
- [ ] All endpoints require authentication (except explicitly public ones)
- [ ] Rate limiting enforced on all endpoints
- [ ] CORS configured to allow only trusted origins
- [ ] Security headers set: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`

### Error Handling
- [ ] Internal errors (stack traces, DB queries) never exposed to clients
- [ ] Generic error messages returned to users; detailed logs server-side only
- [ ] Audit log maintained for all sensitive operations (login, data modification, admin actions)

## OWASP Top 10 Reference

| # | Risk | Key Mitigation |
|---|---|---|
| A01 | Broken Access Control | Enforce authorization on every endpoint |
| A02 | Cryptographic Failures | Use TLS; encrypt sensitive data at rest |
| A03 | Injection | Parameterized queries; input validation |
| A04 | Insecure Design | Threat model during design phase |
| A05 | Security Misconfiguration | Disable default credentials; minimal exposure |
| A06 | Vulnerable Components | Audit dependencies in CI |
| A07 | Auth Failures | Strong auth, session management |
| A08 | Software Integrity Failures | Verify packages; SBOM |
| A09 | Logging Failures | Centralized, tamper-proof audit logs |
| A10 | SSRF | Validate and allowlist outbound URLs |

## Security in the SDLC

- **Design** — include security requirements in story acceptance criteria
- **Development** — follow secure coding checklist above
- **Code Review** — reviewer checks for security issues explicitly
- **CI** — run SAST (static analysis) on every PR
- **Pre-release** — run DAST (dynamic analysis) on staging
- **Post-release** — monitor for anomalies and security alerts
