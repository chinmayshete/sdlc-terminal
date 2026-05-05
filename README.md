# Freddie Mac Enterprise SDLC Assistant POC

An enterprise-grade, local-first terminal SDLC (Software Development Life Cycle) assistant built with Node.js and TypeScript. 

This POC demonstrates an intelligent CLI that helps developers plan, write code, and execute DevOps tasks while strictly adhering to Freddie Mac's enterprise standards (Code Quality, Vault Secrets, GitFlow, Jenkins CI/CD, and NFR Code Scanning).

---

## 🌟 Enterprise Features Included

1. **Code Standards & Config Management**
   - Multi-environment configurations (`dev`, `staging`, `prod`) stored in `config/environments/`
   - Strict runtime configuration schema validation
   - HashiCorp Vault abstraction for secure secret injection (API keys, DB credentials)

2. **Git Version Control Standards (GitFlow)**
   - Policy-driven branch naming (`feature/`, `release/`, `hotfix/`)
   - Conventional commit message validation
   - Audit-friendly rollback using `git revert` (preserves history)
   - `--no-ff` merge policies to maintain feature traceability

3. **CI/CD via Jenkins**
   - Full Declarative Pipeline (`Jenkinsfile`) with 8 stages
   - Vault-backed credential bindings
   - Automated testing, code scanning, and manual production deployment gates

4. **NFR Code Security Scanning**
   - Built-in static analysis tool targeting hardcoded secrets
   - Detects hardcoded passwords, API keys, connection strings, AWS credentials, and private keys
   - Flags inline `process.env` usage to encourage centralized configuration

---

## 🛠️ Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
copy .env.example .env
```

Edit the `.env` file to include your Azure OpenAI credentials and Vault setup:
```env
# Azure OpenAI Config
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# Application Environment (dev | staging | prod)
APP_ENV=dev

# Vault Integration
VAULT_ENABLED=false
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=
VAULT_SECRET_PATH=secret/data/sdlc
```
> **Note**: If you want to test the CLI without Azure AI, set `SDLC_USE_MOCK=true`.

### 3. Build the CLI
Compile the TypeScript code:
```bash
npm run build
```

---

## 🚀 Execution & Usage

The application can be run via direct commands or via an interactive terminal.

### Direct Commands

```bash
# List all available tickets
node dist/index.js tickets

# Generate an AI implementation plan for a specific ticket
node dist/index.js plan AUTH-101

# Execute the ticket (generates code and tests locally)
node dist/index.js execute AUTH-101

# View the workflow status of all tickets
node dist/index.js status

# View the resolved configuration (secrets redacted)
node dist/index.js config

# Run the NFR security scanner
node dist/index.js scan

# View the Jenkins CI/CD pipeline definition
node dist/index.js cicd
```

### 💻 Interactive Terminal (Recommended)

Start the interactive session:
```bash
npm run terminal
```

Once inside the `sdlc >` prompt, you have access to three modes:

#### 1. Command Mode (Default)
Manage tickets and workflow states.
- `tickets`: List available work items
- `plan <id>`: Create an execution plan
- `execute <id>`: Generate code for the ticket
- `status`: Show ticket states

#### 2. NLP Mode
Enter free-form AI chat with context of your local repository.
- Type `nlp` to enter this mode.
- *Chat normally*: `hi`, `summarize the repo`
- *Explain code*: `explain repo/app/src/routes.ts`
- *Request edits*: `edit repo/app/src/routes.ts: add versioned api routes`
- *Diff & Undo*: `show diff` or `undo last nlp change`
- Type `exit` to return to normal mode.

#### 3. DevOps Mode
Enter enterprise operations and governance mode.
- Type `devops` to enter this mode.
- `summary`: View AI health and changed files
- `scan`: Run the NFR code security scanner to find hardcoded secrets
- `cicd`: View the Jenkins pipeline stages
- `merge <ticketId>`: Merge a feature branch into develop using GitFlow standards
- `rollback`: Revert the last commit safely preserving history
- `push <ticketId>`: Push branch to remote (requires confirmation)
- Type `exit` to return to normal mode.

---

## 🧪 Testing the Repo App

The CLI generates application code into the sandboxed `repo/app/` directory.

To test the generated application code:
```bash
cd repo/app
npm install
npm test
```

## 🎫 Sample Tickets Included

- `AUTH-101` Add login endpoint
- `AUTH-102` Add register endpoint
- `AUTH-103` Add logout endpoint
- `USER-201` Add current user profile endpoint
- `USER-202` Add user listing endpoint
- `OPS-301` Add healthcheck and readiness support
- `SEC-401` Add request logging middleware
