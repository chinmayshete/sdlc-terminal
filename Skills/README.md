# Skills Knowledge Base

This folder contains the **global knowledge base** for the Nexus AI agent. These documents are automatically loaded into the agent's context during `plan`, `execute`, and freeform AI chat operations.

## Structure

```
skills/
├── sdlc/           — SDLC process & workflow guidelines
├── engineering/    — Code quality, architecture & testing standards
└── devops/         — CI/CD, Docker & deployment guidelines
```

## How the Agent Uses These Docs

- **`plan <ticket_id>`** — The agent reads relevant skill docs matching the ticket's keywords before generating an execution plan.
- **`execute <ticket_id>`** — The agent reads skill docs before generating code and tests to ensure output conforms to team standards.
- **Freeform chat** — All skill docs are loaded so the agent can answer questions like *"what's our testing strategy?"* or *"how do we structure REST APIs?"*

## Editing These Files

These files contain **generic SDLC best practices** as defaults. Edit them to reflect your team's specific conventions, tools, and standards.
