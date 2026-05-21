# Coding Standards

## General Principles

- **Readability first** — code is written once and read many times.
- **Single Responsibility Principle (SRP)** — each function/class does one thing.
- **DRY** — Don't Repeat Yourself. Extract shared logic into utilities.
- **KISS** — Keep It Simple. Prefer clarity over cleverness.
- **YAGNI** — You Aren't Gonna Need It. Don't add features before they're required.

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Variables | `snake_case` | `user_name`, `is_active` |
| Functions | `snake_case`, verb-first | `get_user()`, `create_ticket()` |
| Classes | `PascalCase` | `JiraService`, `ContextBuilder` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Files | `snake_case` | `agile_operations.py` |
| Folders | `snake_case` | `core/`, `utils/` |

## Function Design

- Max **20–30 lines** per function; if longer, extract sub-functions.
- Max **3 parameters**; use dataclasses or dicts for complex inputs.
- Functions should have **one exit point** where possible.
- Avoid boolean parameters — prefer two named functions or an enum.

## Error Handling

- **Never swallow exceptions silently** — always log or re-raise.
- Use **specific exception types**, not bare `except:`.
- Return structured error objects rather than `None` where callers need detail.
- Validate inputs at function boundaries.

```python
# Bad
try:
    result = do_something()
except:
    pass

# Good
try:
    result = do_something()
except ValueError as e:
    logger.error(f"Invalid input: {e}")
    raise
```

## Comments & Documentation

- Write comments explaining **why**, not **what** (the code explains what).
- All public functions, classes, and modules must have **docstrings**.
- TODOs must include a ticket reference: `# TODO(SCRUM-42): fix edge case`

## Code Review Standards

- PRs should be **< 400 lines** changed for reviewability.
- Every PR must have a description explaining **what** and **why**.
- Reviewers check: correctness, security, test coverage, naming, complexity.
- Authors must respond to all comments before merging.

## Import Organization

Order imports in this sequence:
1. Standard library
2. Third-party packages
3. Internal project modules

Separate each group with a blank line.

---

## ⚡ Performance Standards

- **Measure first** — optimize only after measuring bottlenecks. Avoid premature optimization.
- **Minimize computations** — avoid unnecessary database, API, and network requests.
- **Caching** — use caching layer appropriately for frequently read, rarely changed data.
- **Asynchrony** — use asynchronous/concurrent execution (`async`/`await`) carefully for I/O bound tasks.

## 📝 Logging Standards

- **Log levels** — use log levels appropriately:
  - `DEBUG`: Verbose details for troubleshooting.
  - `INFO`: Significant lifecycle events (start, complete).
  - `WARNING`: Exceptional events that are not errors (e.g. rate limit near).
  - `ERROR`: Recoverable errors.
  - `CRITICAL`: Unrecoverable errors that require immediate attention.
- **No secrets in logs** — never log passwords, tokens, API keys, or sensitive PII.
- **Metadata** — include timestamps and contextual metadata to make logs searchable.

## 🗄️ Database Standards

- **Normalize** — design schema with appropriate normalization rules.
- **Indexes** — index query lookup columns but avoid over-indexing to keep writes fast.
- **N+1 Queries** — prevent N+1 query patterns; use eager loading / prefetching.
- **Transactions** — group sequential write operations that must succeed or fail together into database transactions.

## 📈 Scalability Guidelines

- **Loose Coupling** — design components and services with minimal direct dependencies.
- **Queues/Events** — use background task queues or event brokers for non-blocking asynchronous actions.
- **Statelessness** — keep application servers stateless to allow seamless horizontal scaling.

## 🤖 AI Agent Execution Instructions

When generating or modifying code:
1. Analyze requirements completely before writing a line of code.
2. Identify architecture, dependencies, and imports.
3. Generate modular, single-responsibility implementations.
4. Validate edge cases and inputs.
5. Include thorough error handling.
6. Add unit/integration tests.
7. Ensure security compliance.
8. Avoid placeholder implementations (`pass` or `TODO`) in production code.

## 🚫 Forbidden Practices

- **Hardcoded secrets** (e.g. passwords, API keys in source code).
- **Dead/Unused code** (clean up obsolete imports, functions, and variables).
- **Copy-paste duplication** (extract to reusable helpers).
- **Silent exception handling** (`except: pass`).
- **Massive monolithic functions**.
- **Skipping validation** on external request payloads or configurations.

## 🔒 Security Best Practices

### Input Validation
- **Sanitize all inputs**: Validate and sanitize data from all sources (user input, APIs, files) to prevent injection attacks (SQLi, XSS).
- **Use allow-lists, not block-lists**: Define explicitly what is allowed, rather than trying to block bad patterns.
- **Validate data types and formats**: Ensure inputs match expected types (e.g., integers, dates) and formats.

### Authentication & Authorization
- **Never store plain-text credentials**: Use strong hashing algorithms like Argon2 or bcrypt for passwords.
- **Implement proper session management**: Use secure, HttpOnly, SameSite cookies for session tokens.
- **Enforce least privilege**: Users should only have access to resources and actions strictly necessary for their role.
- **Regularly rotate secrets**: API keys, tokens, and certificates should have rotation policies.

### Data Protection
- **Encrypt sensitive data**: Use encryption for data at rest (database encryption) and in transit (TLS/SSL).
- **Minimize data exposure**: Only collect and store data that is absolutely necessary for the application's function.
- **Anonymize or pseudonymize**: Use techniques to de-identify personal data when possible.

### Error Handling & Logging
- **Avoid leaking sensitive information**: Error messages should not reveal stack traces, system information, or internal implementation details.
- **Log security events**: Track authentication attempts (success and failure), permission changes, and access to sensitive data.

### Dependency Management
- **Regularly update dependencies**: Keep libraries and frameworks up to date to patch known vulnerabilities.
- **Audit dependencies**: Use tools to scan for vulnerable dependencies (e.g., `safety`, `npm audit`).

### Infrastructure Security
- **Use rate limiting**: Protect against brute-force attacks and abuse.
- **Implement proper network segmentation**: Isolate sensitive services and databases.
- **Use security headers**: Implement headers like `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`.
