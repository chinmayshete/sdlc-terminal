# REST API Design Guidelines

## URL Design

- Use **nouns**, not verbs, in URL paths.
- Use **plural** resource names.
- Use **lowercase** with hyphens for multi-word resources.
- Resource relationships reflected in path hierarchy.

```
# Good
GET    /api/v1/users
GET    /api/v1/users/{id}
POST   /api/v1/users
PUT    /api/v1/users/{id}
DELETE /api/v1/users/{id}
GET    /api/v1/users/{id}/tickets

# Bad
GET /api/getUsers
POST /api/createUser
GET /api/user_tickets/{userId}
```

## HTTP Methods

| Method | Use | Idempotent |
|---|---|---|
| GET | Read resource(s) | ✅ |
| POST | Create a new resource | ❌ |
| PUT | Replace a resource completely | ✅ |
| PATCH | Update specific fields | ✅ |
| DELETE | Remove a resource | ✅ |

## Versioning

- Always version APIs: `/api/v1/`, `/api/v2/`
- Increment major version only for **breaking changes**.
- Support the previous version for at least 6 months after deprecation notice.

## HTTP Status Codes

| Code | When to Use |
|---|---|
| 200 OK | Successful GET, PUT, PATCH |
| 201 Created | Successful POST (include `Location` header) |
| 204 No Content | Successful DELETE |
| 400 Bad Request | Invalid request body or parameters |
| 401 Unauthorized | Missing or invalid authentication |
| 403 Forbidden | Authenticated but not authorized |
| 404 Not Found | Resource does not exist |
| 409 Conflict | Resource state conflict (e.g., duplicate) |
| 422 Unprocessable Entity | Validation failure |
| 500 Internal Server Error | Unexpected server error |

## Request & Response Format

- Use **JSON** for all request and response bodies.
- Always set `Content-Type: application/json`.
- Use **camelCase** for JSON field names.
- Wrap list responses in an object with metadata:

```json
{
  "data": [...],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

## Error Response Format

Always return structured error responses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The 'email' field is required.",
    "field": "email"
  }
}
```

## Security

- Require authentication on all non-public endpoints.
- Use short-lived JWT tokens (15–60 min expiry) with refresh tokens.
- Validate and sanitize ALL input server-side.
- Never expose internal error details (stack traces, DB errors) in responses.
- Rate-limit all endpoints to prevent abuse.

## Documentation

- Every API must have an OpenAPI/Swagger spec.
- Document all parameters, request bodies, and response schemas.
- Include example requests and responses.
