# Testing Strategy

## Testing Pyramid

```
         /\
        /  \   E2E Tests (few, slow, high confidence)
       /----\
      /      \  Integration Tests (moderate, test contracts)
     /--------\
    /          \ Unit Tests (many, fast, isolated)
   /____________\
```

## Unit Tests

**Goal:** Test a single function or class in isolation.

- Mock all external dependencies (DB, APIs, file system).
- One assertion concept per test.
- Test naming: `test_<function>_<scenario>_<expected_result>`

```python
# Example
def test_get_user_returns_none_when_not_found():
    result = get_user(user_id=999)
    assert result is None
```

- **Coverage target:** ≥ 80% on all new code.
- Run on every commit via CI.

## Integration Tests

**Goal:** Test that two or more components work together correctly.

- Use real databases (test containers or in-memory SQLite).
- Test API endpoints end-to-end within the application.
- Cover the happy path + at least one error path per endpoint.
- Run on every PR before merge.

## End-to-End (E2E) Tests

**Goal:** Simulate real user workflows from the UI or CLI.

- Cover the most critical business flows only.
- Run on staging deployment, not on every commit.
- Use stable test data — no dependency on production data.

## Test File Structure

```
src/
  core/
    jira_service.py
tests/
  unit/
    test_jira_service.py     ← mirrors src/ structure
  integration/
    test_jira_integration.py
  e2e/
    test_cli_workflow.py
```

## Test Conventions

- **Arrange / Act / Assert** (AAA) pattern in every test.
- Use **fixtures** for shared setup (pytest `@pytest.fixture`).
- **Parameterize** tests for multiple input scenarios using `@pytest.mark.parametrize`.
- Never test implementation details — test behavior and outcomes.

## What Must Always Be Tested

- ✅ All public functions with business logic
- ✅ All error and exception paths
- ✅ All boundary conditions (empty input, max values, null)
- ✅ All REST API endpoints (happy path + 4xx errors)
- ✅ Authentication and authorization rules
- ❌ Getters/setters with no logic
- ❌ Third-party library internals

## CI Test Gates

- Unit tests **must pass** before any PR can merge.
- Coverage drop > 5% blocks the merge.
- Integration tests run nightly if not on every PR.
