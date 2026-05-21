# Universal Coding Standards Knowledge Base

## 1. Core Principles
- Write clean, maintainable, readable, and scalable code.
- Prefer simplicity over unnecessary complexity.
- Follow SOLID, DRY, KISS, and YAGNI principles.
- Design modular and reusable components.
- Prioritize security, performance, reliability, and maintainability.
- Avoid hardcoding values whenever possible.
- Ensure code is self-explanatory before adding comments.

---

## 2. Naming Conventions
- Use meaningful and descriptive names.
- Variables should clearly describe purpose.
- Functions should use verbs or verb phrases.
- Classes/modules should use nouns.
- Constants should be uppercase where language conventions allow.
- Avoid abbreviations unless universally understood.
- Maintain consistency across the project.

Examples:
- Good: `calculateTotalPrice`
- Bad: `calcTP`

---

## 3. Code Structure
- Keep files focused on a single responsibility.
- Separate concerns properly.
- Organize imports/dependencies clearly.
- Maintain consistent folder structure.
- Avoid deeply nested logic.
- Break large functions into smaller reusable units.
- Prefer composition over inheritance where appropriate.

---

## 4. Function Standards
- Functions should do one thing only.
- Keep functions short and readable.
- Avoid excessive parameters.
- Use default parameters/config objects where appropriate.
- Return predictable outputs.
- Avoid hidden side effects.
- Validate inputs properly.

---

## 5. Error Handling
- Never silently ignore errors.
- Use structured exception handling.
- Provide meaningful error messages.
- Log errors with context.
- Avoid exposing sensitive information in logs.
- Handle edge cases explicitly.

---

## 6. Comments & Documentation
- Write code that minimizes the need for comments.
- Add comments only when logic is complex or non-obvious.
- Keep comments updated with the code.
- Maintain API/module documentation.
- Document assumptions and limitations.
- Include usage examples for reusable components.

---

## 7. Security Standards
- Validate and sanitize all inputs.
- Never trust user input.
- Avoid storing secrets in source code.
- Use environment variables or secret managers.
- Implement proper authentication and authorization.
- Follow least privilege principle.
- Prevent injection vulnerabilities.
- Use secure communication protocols.
- Keep dependencies updated.
- Avoid exposing internal implementation details.

---

## 8. Performance Standards
- Optimize only after measuring.
- Avoid premature optimization.
- Minimize unnecessary computations.
- Use caching appropriately.
- Reduce memory consumption where possible.
- Use asynchronous/concurrent execution carefully.
- Optimize database and API calls.
- Avoid redundant network requests.

---

## 9. Logging Standards
- Use structured logging.
- Include timestamps and contextual metadata.
- Use log levels appropriately:
  - DEBUG
  - INFO
  - WARNING
  - ERROR
  - CRITICAL
- Avoid logging secrets or sensitive data.

---

## 10. Dependency Management
- Use trusted libraries/frameworks.
- Avoid unnecessary dependencies.
- Pin dependency versions where appropriate.
- Regularly audit dependencies for vulnerabilities.
- Remove unused dependencies.

---

## 11. Testing Standards
- Write automated tests wherever possible.
- Include:
  - Unit tests
  - Integration tests
  - End-to-end tests
- Test edge cases and failure scenarios.
- Ensure deterministic tests.
- Avoid flaky tests.
- Maintain meaningful test coverage.

---

## 12. API Standards
- Use consistent request/response structures.
- Implement proper status/error handling.
- Version APIs appropriately.
- Validate request payloads.
- Document APIs clearly.
- Use pagination/filtering for large datasets.

---

## 13. Database Standards
- Normalize data appropriately.
- Use indexing carefully.
- Avoid unnecessary queries.
- Prevent N+1 query problems.
- Use transactions where required.
- Backup and recovery strategy must exist.

---

## 14. Git & Version Control
- Use meaningful commit messages.
- Keep commits focused and atomic.
- Use feature branches.
- Avoid committing generated files or secrets.
- Rebase/merge responsibly.
- Review code before merging.

Commit Format Example:
- feat: add authentication middleware
- fix: resolve API timeout issue
- refactor: simplify validation logic

---

## 15. Code Review Standards
- Review for:
  - Readability
  - Security
  - Performance
  - Scalability
  - Test coverage
  - Maintainability
- Provide constructive feedback.
- Avoid approving untested code.

---

## 16. Scalability Guidelines
- Design systems to handle growth.
- Avoid tightly coupled architecture.
- Use queues/events when appropriate.
- Implement horizontal scaling strategies.
- Ensure stateless services where feasible.

---

## 17. AI Agent Execution Instructions
When generating or modifying code:
1. Analyze requirements completely.
2. Identify architecture and dependencies.
3. Generate modular implementation.
4. Validate edge cases.
5. Include error handling.
6. Add tests where possible.
7. Ensure security compliance.
8. Ensure production readiness.
9. Avoid placeholder implementations unless explicitly requested.
10. Maintain consistency with existing project structure.

---

## 18. Forbidden Practices
- Hardcoded secrets
- Unused code
- Copy-paste duplication
- Silent exception handling
- Massive monolithic functions
- Inconsistent formatting
- Skipping validation
- Ignoring security concerns
- Unverified third-party code
- Writing untested critical logic

---

## 19. Output Expectations for AI Coding Agents
Generated code must:
- Be production-ready
- Follow project conventions
- Include validation/error handling
- Be optimized for readability
- Be maintainable and scalable
- Include documentation where necessary
- Avoid incomplete implementations
- Avoid fake/mock business logic unless requested

---

## 20. Final Quality Checklist
Before finalizing:
- Is the code readable?
- Is the logic modular?
- Are edge cases handled?
- Are errors handled properly?
- Is security considered?
- Are dependencies justified?
- Are tests included?
- Is the implementation production-ready?
