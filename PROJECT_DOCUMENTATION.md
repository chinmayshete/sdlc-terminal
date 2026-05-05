# Freddie Mac Enterprise SDLC Assistant POC — Full Documentation

This document serves as the comprehensive technical guide and reference for the SDLC Assistant POC built for Freddie Mac. It covers the architecture, the implemented enterprise features, local setup, command reference, and security guidelines.

---

## 1. Project Overview

The SDLC Assistant is an intelligent, terminal-based Software Development Life Cycle CLI tool. It acts as an autonomous pair-programmer capable of reading tickets, planning implementations, generating code, generating tests, and executing DevOps workflows securely.

### Core Architecture
- **Language**: TypeScript / Node.js
- **CLI Framework**: Commander.js & custom interactive terminal
- **AI Integration**: Azure OpenAI (or local mock mode) for code generation and NLP chat
- **Sandboxed Execution**: Generated code is isolated entirely within the `repo/app/` directory

---

## 2. Enterprise Features Implemented

To meet Freddie Mac's stringent enterprise requirements, this POC includes five major robust features:

### A. Parameterized Configuration & Vault Integration
- **Mechanism**: Configurations are deep-merged from `base.json` and environment-specific overrides (`dev.json`, `staging.json`, `prod.json`).
- **Vault Provider**: Sensitive secrets (like database passwords or API keys) are never hardcoded. They are fetched securely via a simulated HashiCorp Vault implementation (`src/config/vault.ts`). If Vault is disabled, it gracefully falls back to local `.env` variables.
- **Validation**: Configurations are strictly validated at runtime via TypeScript schemas (`src/config/config-schema.ts`).

### B. Git Version Control Standards (GitFlow)
- **Governance**: The tool strictly enforces Freddie Mac's Git policies via `src/utils/git-policy.ts`.
- **Branch Naming**: Enforces the `feature/`, `release/`, and `hotfix/` prefix conventions.
- **Commit Messages**: Enforces conventional commits (`feat:`, `fix:`, `chore:`).
- **Merges & Rollbacks**: Uses `--no-ff` for all merges to preserve feature history. Uses non-destructive `git revert` for rollbacks instead of dangerous `git reset` commands.

### C. Jenkins CI/CD Pipeline
- **Implementation**: Includes a fully declarative `Jenkinsfile` at the root of the project.
- **Stages**: Includes 8 stages spanning Dependency Installation, Code Formatting, Security Scanning, Unit Testing (with JUnit reports), Staging Deployment, and Production Deployment.
- **Production Gate**: The production deployment stage includes a manual `input()` step that pauses the pipeline until an authorized Release Manager approves the deployment.

### D. NFR Static Code Security Scanning
- **Scanner**: A local static analysis tool (`src/utils/code-scanner.ts`) built to detect security vulnerabilities before code is merged.
- **Rules (`SEC-001` to `SEC-010`)**: Hunts for hardcoded passwords, API keys, connection strings, AWS credentials, private keys, and inline `process.env` usage.
- **Exclusions**: Intelligently skips `.git`, `node_modules`, and `package-lock.json` to prevent false positives and improve scanning performance.

---

## 3. Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- Git installed locally

### Installation Steps
1. **Clone the Repository**: Navigate to your project folder.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Environment Setup**:
   Create a `.env` file in the root directory and configure it.
   ```env
   # Azure OpenAI Settings
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your-api-key
   AZURE_OPENAI_DEPLOYMENT=gpt-4.1
   AZURE_OPENAI_API_VERSION=2024-12-01-preview
   SDLC_USE_MOCK=false

   # Application Environment
   APP_ENV=dev

   # Vault Integration
   VAULT_ENABLED=false
   VAULT_ADDR=http://127.0.0.1:8200
   ```
4. **Build the CLI**:
   ```bash
   npm run build
   ```

---

## 4. Interactive Terminal Reference

The core of the SDLC Assistant is its interactive terminal. Start it by running:

```bash
npm run terminal
```

Once inside the `sdlc >` prompt, you have access to three distinct modes:

### 🛠️ Command Mode (Default)
Used for standard SDLC workflows (planning and executing tickets).
- `tickets`: List all available JSON tickets in the `/tickets` folder.
- `plan <ticketId>`: AI analyzes the repo and generates a step-by-step implementation plan.
- `execute <ticketId>`: AI writes the code, updates the sandbox repo, and writes unit tests.
- `status`: Displays the current workflow state of all tracked tickets.
- `reset <ticketId>`: Resets a ticket's status back to `TODO`.
- `ai`: Verifies the Azure OpenAI connection.

### 🤖 NLP Mode
Used for free-form conversation and direct AI code editing. Type `nlp` to enter.
- **Explain files**: `explain repo/app/routes/auth.ts`
- **Request edits**: `edit repo/app/routes/auth.ts: add JWT verification`
- **General chat**: `summarize the codebase` or `how does the Vault integration work?`
- **Diffs**: `show diff` displays changes made by the AI.
- **Rollback**: `undo last nlp change` reverts the last modification safely.
- Type `exit` to return to Command mode.

### ⚙️ DevOps Mode
Used for enterprise governance, GitFlow, and CI/CD operations. Type `devops` to enter.
- `summary`: Views changed files and AI health.
- `scan`: Runs the NFR Code Security Scanner and prints a vulnerability report.
- `cicd`: Displays the Jenkins pipeline status and defined stages.
- `changed`: Shows a list of locally modified files.
- `merge <ticketId>`: Merges a feature branch into the `develop` branch using `--no-ff`.
- `rollback`: Safely reverts the last commit and preserves the audit trail.
- `push <ticketId>`: Pushes the branch to a remote origin (requires manual Yes/No confirmation).
- Type `exit` to return to Command mode.

---

## 5. Directory Structure

```text
SDLC/
├── src/                    # Core CLI Source Code
│   ├── agents/             # AI Agents (Planner, Code, Test)
│   ├── cli/                # CLI setup and Terminal interface
│   ├── config/             # Config Manager, Vault, Schemas
│   ├── core/               # Orchestrator and state management
│   └── utils/              # DevOps utilities (Git, CI/CD, Scanner)
├── config/                 # Application Configurations
│   ├── base.json           # Base config schema
│   └── environments/       # dev.json, staging.json, prod.json
├── repo/                   # Generated Code Sandbox
│   └── app/                # Express application written by the AI
├── tickets/                # JSON ticket definitions (e.g. AUTH-101.json)
├── Jenkinsfile             # Declarative CI/CD pipeline
├── package.json            # CLI dependencies
└── tsconfig.json           # TypeScript configuration
```

---

## 6. Testing the Generated Sandbox Application

When the AI `execute`s a ticket, it writes code into `repo/app`. This is a fully functional, separate Node.js project.

To test the code generated by the AI:
```bash
cd repo/app
npm install
npm test          # Runs the Jest unit tests
npm run start     # Starts the Express server
```

---

## 7. Extending the POC

If you wish to add new features to the CLI:
1. **New DevOps Rules**: Add Regex patterns to `SCAN_RULES` in `src/utils/code-scanner.ts`.
2. **New Tickets**: Create a new `.json` file in the `/tickets` directory following the schema.
3. **New Pipeline Stages**: Edit the `Jenkinsfile` at the root directory. The CLI will automatically parse and display the updated stages when running `devops > cicd`.
