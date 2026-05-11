# Nexus — Enterprise AI SDLC Terminal Assistant
# Nexus: Represents a central hub where all development modes (NLP, Git, DevOps, Security) meet. 
> **Proof of Concept** | Built on Node.js + TypeScript | AI-Powered | Terminal-Native

An intelligent, enterprise-grade CLI assistant that accelerates the full Software Development Lifecycle — from ticket planning through secure deployment — while enforcing strict engineering standards at every step.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Functional Requirements (FRs)](#3-functional-requirements)
   - [FR-1: Code Standards & Dynamic Configuration](#fr-1-code-standards--dynamic-configuration)
   - [FR-2: Version Control Standards (GitFlow)](#fr-2-version-control-standards-gitflow)
   - [FR-3: CI/CD via Jenkins](#fr-3-cicd-via-jenkins)
   - [FR-4: Application Configuration Management](#fr-4-application-configuration-management)
   - [FR-5: AI-Assisted Development (NLP Mode)](#fr-5-ai-assisted-development-nlp-mode)
   - [FR-6: Ticket & Workflow Management](#fr-6-ticket--workflow-management)
4. [Non-Functional Requirements (NFRs)](#4-non-functional-requirements)
   - [NFR-1: Security — Code Scanning](#nfr-1-security--code-scanning)
   - [NFR-2: Secret Management via HashiCorp Vault](#nfr-2-secret-management-via-hashicorp-vault)
   - [NFR-3: Container Security (Docker)](#nfr-3-container-security-docker)
   - [NFR-4: Infrastructure as Code Security (Terraform)](#nfr-4-infrastructure-as-code-security-terraform)
   - [NFR-5: Compliance & Governance](#nfr-5-compliance--governance)
   - [NFR-6: Dependency Vulnerability Management](#nfr-6-dependency-vulnerability-management)
5. [Terminal Modes Reference](#5-terminal-modes-reference)
6. [Installation & Setup](#6-installation--setup)
7. [Demo Commands](#7-demo-commands)
8. [Project Structure](#8-project-structure)

---

## 1. Executive Summary

The **Nexus — AI SDLC Terminal Assistant** is a local-first AI assistant that unifies the entire development workflow into a single, intelligent command-line interface. It demonstrates how Freddie Mac's engineering standards — code quality, secure secret management, GitFlow branching, Jenkins CI/CD, and NFR security scanning — can be enforced automatically throughout the development lifecycle.

### What This POC Demonstrates

| Capability | Industry Standard | Freddie Mac Implementation |
|---|---|---|
| Code Quality | TypeScript strict mode + ESLint | Zero-warning policy enforced at build |
| Secret Management | HashiCorp Vault / AWS Secrets Manager | `VaultSecretProvider` abstraction + env fallback |
| Version Control | GitFlow branching strategy | Policy engine validates branch names + commit messages |
| CI/CD Pipeline | Jenkins Declarative Pipeline | 8-stage pipeline with manual prod gate |
| Security Scanning | OWASP / static analysis | 10-rule NFR scanner built into the terminal |
| Infrastructure | Terraform + AWS ECS | IAM-role-only access, S3 state with DynamoDB locking |
| Container Security | Docker best practices | Multi-stage, non-root, healthcheck, no secrets in image |
| AI Integration | Azure OpenAI (GPT-4) | Repo-aware NLP chat + code generation |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  SDLC Terminal (CLI)                         │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Command  │ │   NLP    │ │  DevOps  │ │   Security   │  │
│  │   Mode   │ │   Mode   │ │   Mode   │ │     Mode     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘  │
│       └────────────┴────────────┴───────────────┘          │
│                         │                                   │
│               ┌──────────▼──────────┐                      │
│               │     Orchestrator     │                      │
│               └──────────┬──────────┘                      │
│    ┌──────────┬───────────┼───────────┬──────────┐         │
│    ▼          ▼           ▼           ▼          ▼         │
│  Git Ops  DevOps Ops  Security   Config Mgr  AI/LLM        │
│  (simple- (cicd.ts,   Ops       (config-    (Azure         │
│   git)    docker,tf)  (scanner) manager)    OpenAI)        │
└─────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    Jenkinsfile       Terraform        .github/
    (CI/CD)           (AWS ECS/ECR)    (Actions/CODEOWNERS)
```

**Technology Stack:**
- **Runtime:** Node.js 18 + TypeScript (strict)
- **AI:** Azure OpenAI (GPT-4.1) with mock fallback
- **Git:** simple-git library
- **Secret Provider:** HashiCorp Vault (AppRole) / Environment Variables
- **Container:** Docker multi-stage (Alpine-based)
- **Infrastructure:** Terraform + AWS ECS Fargate + ECR
- **Pipeline:** Jenkins Declarative + GitHub Actions

---

## 3. Functional Requirements

### FR-1: Code Standards & Dynamic Configuration

**Requirement:** All code must follow strict TypeScript standards with no hardcoded configuration values.

**Implementation:**

The project enforces zero-tolerance code quality:
```bash
# TypeScript strict compilation — zero errors allowed
npx tsc --noEmit

# ESLint with zero-warning policy
npx eslint src/ --ext .ts --max-warnings 0

# Prettier formatting check
npx prettier --check "src/**/*.ts"
```

All configuration is **dynamically parameterized** — no values are hardcoded:

```typescript
// ✗ WRONG — hardcoded value (caught by SEC-001 scanner)
const password = "mypassword123";

// ✓ CORRECT — parameterized via config system
const config = getConfig();
const password = await secretProvider.getSecret("DB_PASSWORD");
```

Configuration is resolved in order of precedence:
```
Vault secrets → Environment variables → config/environments/{env}.json → config/base.json
```

**Terminal Demo:**
```bash
sdlc config            # Show resolved config (secrets redacted)
sdlc security-scan     # Detect any hardcoded values
```

---

### FR-2: Version Control Standards (GitFlow)

**Requirement:** All Git operations must follow Freddie Mac's GitFlow branching strategy and conventional commit standards.

**GitFlow Branch Structure:**

```
main          ← Production only. No direct commits. Tagged releases.
  └── develop ← Integration branch. All features merge here first.
        ├── feature/AUTH-101    ← New features
        ├── bugfix/login-error  ← Bug fixes
        ├── release/1.2.0       ← Release stabilization
        └── hotfix/sec-patch    ← Emergency production fixes
```

**Enforced Branch Naming Rules** (`src/utils/git-policy.ts`):
- Must start with: `feature/`, `release/`, `hotfix/`, `bugfix/`
- Lowercase only, hyphens and dots allowed
- Must have a descriptor after the prefix (e.g., `feature/auth-101`)

**Enforced Commit Message Format:**
```
feat: [AUTH-101] Add JWT login endpoint
fix: [AUTH-102] Resolve null pointer in register
hotfix: [SEC-401] Patch hardcoded credential exposure
chore: Update npm dependencies
```

**Merge Policy:**
- All merges use `--no-ff` to preserve feature traceability in history
- `git revert` (non-destructive) for rollbacks — audit trail always preserved
- `git reset --hard` is **never** used on shared branches

**Terminal Demo (Git Mode):**
```bash
sdlc terminal
git > status                              # Working tree status
git > log 5                               # Last 5 commits
git > branch                             # List all branches
git > create branch feature/auth-101     # Create feature branch
git > commit all "feat: Add login"       # Stage + commit
git > push                               # Push with confirmation prompt
git > merge develop                      # Merge with --no-ff
git > rollback                           # Safe git revert
```

**Natural Language (Git Mode):**
```bash
git > show me what changed
git > commit everything with message fix auth bug
git > create a hotfix branch for SEC-401
git > what branches do we have
```

---

### FR-3: CI/CD via Jenkins

**Requirement:** All deployments must go through the Jenkins pipeline with automated gates at every stage.

**Pipeline Stages** (`Jenkinsfile`):

| Stage | What It Does | Gate |
|---|---|---|
| **1. Checkout** | SCM checkout with GitHub credentials | Auto |
| **2. Install Dependencies** | `npm ci` from lockfile (reproducible) | Auto |
| **3. Lint & Standards** | TypeScript compile + ESLint + Prettier | Fails build on violation |
| **4. Security Scan** | Built-in secret scanner (10 rules) | Fails on ERROR findings |
| **5. SonarQube** | Static analysis quality gate | Optional; fails on quality gate |
| **6. Build & Push** | Docker build → ECR push → Trivy scan | Auto |
| **7. Deploy Dev** | ECS Fargate update (`--force-new-deployment`) | Auto |
| **8. Deploy Production** | Manual approval required | **Human gate** (release-managers only) |

**Key Pipeline Features:**
- `disableConcurrentBuilds` — prevents race conditions
- 45-minute timeout — prevents runaway builds
- All secrets via `credentials()` — **zero hardcoded values in Jenkinsfile**
- Slack + SNS notifications on success/failure
- Automatic workspace cleanup after every build

**Terminal Demo (DevOps Mode):**
```bash
sdlc pipeline                      # View all 8 stages
sdlc terminal
devops > cicd                      # Full pipeline overview
devops > jenkins validate          # Validate Jenkinsfile structure
devops > jenkins stages            # List pipeline stages
devops > pipeline health           # Combined health report
devops > deploy check staging      # Pre-deploy checklist for staging
```

---

### FR-4: Application Configuration Management

**Requirement:** Configuration must be separated from code, support multiple environments, and never expose sensitive values.

**Configuration Layers:**

```
config/
├── base.json                    ← Shared defaults (all environments)
└── environments/
    ├── dev.json                 ← Development overrides
    ├── staging.json             ← Staging overrides
    └── prod.json                ← Production overrides (Vault-mandatory)
```

**Environment-Specific Overrides (example `staging.json`):**
```json
{
  "features": {
    "useMock": false,
    "enableCicdIntegration": true
  },
  "logging": { "level": "info", "format": "json" },
  "database": { "ssl": true }
}
```

**Sensitive Fields** — must come from Vault in production:
- `azure.apiKey`
- `database.username`
- `database.password`

**Terminal Demo (DevOps / Security Mode):**
```bash
sdlc config                        # Show current resolved config
sdlc terminal
devops > env show                  # Current environment config
devops > env compare               # Diff dev / staging / prod
devops > env validate              # Check all config files + .env
security > config security         # Validate security posture of config
security > sensitive fields        # Show which fields must use Vault
```

---

### FR-5: AI-Assisted Development (NLP Mode)

**Requirement:** Developers can interact with the repository using natural language for code explanation, planning, and editing.

**Capabilities:**
- Free-form chat with full repo context
- File-targeted explanations
- AI-generated code edits with diff preview
- Undo last change (snapshot-based rollback)
- Azure OpenAI GPT-4.1 backend with mock fallback

**Terminal Demo (NLP Mode):**
```bash
sdlc terminal
nlp > summarize the repo
nlp > explain src/utils/code-scanner.ts
nlp > how does the Vault integration work
nlp > edit src/core/orchestrator.ts: add a method to get deployment status
nlp > show diff
nlp > undo last nlp change
```

---

### FR-6: Ticket & Workflow Management

**Requirement:** The terminal manages development tickets through defined SDLC states.

**Ticket Lifecycle:**
```
TODO → PLANNED → IN_DEVELOPMENT → COMPLETED
```

**Sample Tickets:**

| Ticket | Description |
|---|---|
| AUTH-101 | Add JWT login endpoint |
| AUTH-102 | Add user registration endpoint |
| AUTH-103 | Add logout endpoint |
| USER-201 | Add current user profile endpoint |
| SEC-401 | Add request logging middleware |
| OPS-301 | Add healthcheck and readiness endpoint |

**Terminal Demo:**
```bash
sdlc tickets                      # List all tickets
sdlc plan AUTH-101                # AI generates implementation plan
sdlc execute AUTH-101             # AI generates code + tests locally
sdlc status                       # Show all ticket states
sdlc push AUTH-101                # Push to remote (requires confirmation)
```

---

## 4. Non-Functional Requirements

### NFR-1: Security — Code Scanning

**Requirement:** All source code must be scanned for security violations before merge or deployment. ERROR-level findings **block the CI/CD pipeline**.

**Built-in Scanner — 10 Rules** (`src/utils/code-scanner.ts`):

| Rule | Description | Severity | Example Match |
|---|---|---|---|
| **SEC-001** | Hardcoded password | ERROR | `password = "mypass123"` |
| **SEC-002** | Hardcoded API key | ERROR | `api_key = "sk-abc123..."` |
| **SEC-003** | Hardcoded connection string | ERROR | `mongodb://user:pass@host/db` |
| **SEC-004** | Hardcoded non-localhost IP | WARNING | `192.168.1.100` |
| **SEC-005** | Direct `process.env` access | INFO | `process.env.DB_PASSWORD` |
| **SEC-006** | Hardcoded external URL | INFO | `https://api.internal.com` |
| **SEC-007** | Private key material | ERROR | `-----BEGIN RSA PRIVATE KEY-----` |
| **SEC-008** | AWS access key pattern | ERROR | `AKIAIOSFODNN7EXAMPLE` |
| **SEC-009** | Bearer token hardcoded | ERROR | `"Bearer eyJhbGci..."` |
| **SEC-010** | Base64-encoded secret | WARNING | `secret = "c2VjcmV0..."` |

**Remediation Guidance:** Every finding includes a specific fix recommendation:
```
[SEC-001] Hardcoded password detected
  File: src/db/connection.ts:14
  Match: password = "admin123"
  Fix:  Move password to Vault. Use: secretProvider.getSecret('DB_PASSWORD')
```

**Terminal Demo:**
```bash
sdlc security-scan                 # Full scan
sdlc secrets                       # Secrets only

sdlc terminal
security > scan                    # Full NFR scan
security > scan errors             # Only ERROR findings
security > scan warnings           # Only WARNING findings
security > scan summary            # Quick statistics
security > scan file src/db/connection.ts   # Scan one file
security > rules                   # Show all 10 scan rules
security > check for secrets       # Natural language
```

**CI/CD Integration** (from `Jenkinsfile`):
```groovy
stage('Security Scan') {
    when { expression { params.RUN_SECURITY_SCAN } }
    steps {
        sh 'npm run dev -- scan 2>&1 | tee security-scan.log'
        // Fails build if any ERROR-level (SEC-001 to SEC-009) found
        sh '''
            if grep -q "\\[ERROR\\]" security-scan.log; then
                echo "FATAL: Security violations found. Fix before merge."
                exit 1
            fi
        '''
    }
}
```

---

### NFR-2: Secret Management via HashiCorp Vault

**Requirement:** No secrets (passwords, API keys, tokens) may appear in source code or configuration files. Production systems must use Vault.

**Architecture (`src/config/vault.ts`):**

```
Development:  EnvSecretProvider  → reads from .env (local only)
Production:   VaultSecretProvider → authenticates via AppRole, fetches from Vault KV
```

**Vault AppRole Flow (Production):**
```
Jenkins → Vault ROLE_ID + SECRET_ID → Vault Token → Secret fetched at runtime
```

**API Contract:**
```typescript
interface SecretProvider {
  getSecret(key: string): Promise<string | undefined>;
}

// Usage — identical regardless of provider:
const db_password = await secretProvider.getSecret("DB_PASSWORD");
```

**Environment variable `.env` (development only — in `.gitignore`):**
```env
VAULT_ENABLED=false          # true in production
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=                 # Set in Jenkins credentials store
VAULT_SECRET_PATH=secret/data/sdlc
```

**Terminal Demo:**
```bash
security > vault                   # Vault status + provider info
security > sensitive fields        # Which fields require Vault in prod
security > env audit               # Is .env in .gitignore? Any risky values?
```

---

### NFR-3: Container Security (Docker)

**Requirement:** Docker images must follow security best practices — minimal attack surface, no root, no secrets baked in.

**Implementation** (`Dockerfile`):

| Check | Status | Detail |
|---|---|---|
| Multi-stage build | ✓ | Builder stage separate from runtime |
| Non-root user | ✓ | `appuser` in `appgroup` |
| Alpine base image | ✓ | `node:18-alpine` — minimal attack surface |
| No secrets in ENV | ✓ | Secrets injected at ECS runtime only |
| `npm ci` (not install) | ✓ | Reproducible, lockfile-enforced builds |
| `npm prune --production` | ✓ | Dev dependencies removed from final image |
| HEALTHCHECK defined | ✓ | 30s interval, 3 retries |
| Uses COPY not ADD | ✓ | No auto-extraction vulnerabilities |

**Trivy scan** runs in pipeline to catch CVEs in the final image before push.

**Terminal Demo:**
```bash
sdlc docker-info                   # Dockerfile analysis
sdlc terminal
security > docker security         # Full Docker security assessment
devops > docker info               # Metadata (stages, port, user)
devops > docker validate           # Best-practice checklist
```

---

### NFR-4: Infrastructure as Code Security (Terraform)

**Requirement:** Infrastructure must be defined as code, version-controlled, and follow security best practices.

**Implementation** (`terraform/main.tf`):

| Resource | Purpose | Security Feature |
|---|---|---|
| `aws_ecr_repository` | Docker image registry | `scan_on_push = true` |
| `aws_iam_role` | Jenkins execution role | Principle of least privilege |
| `aws_iam_role_policy_attachment` | ECR permissions only | Scoped, not admin |
| `aws_iam_instance_profile` | EC2/ECS access | No static access keys |

**Terraform State Security:**
```hcl
backend "s3" {
  bucket         = "freddie-mac-terraform-state"
  key            = "sdlc/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-lock"   # Prevents concurrent modifications
  encrypt        = true               # State encrypted at rest
}
```

**Terminal Demo:**
```bash
sdlc infra                         # List all AWS resources

sdlc terminal
security > terraform security      # Security assessment
devops > terraform info            # Terraform config overview
devops > infra resources           # List all defined resources
```

---

### NFR-5: Compliance & Governance

**Requirement:** All changes must go through approved review processes with clear code ownership.

**CODEOWNERS** (`.github/CODEOWNERS`):

```
*                        → @sdlc-core-team          (all files)
Jenkinsfile              → @devops-leads             (pipeline changes)
terraform/               → @devops-leads             (infrastructure)
src/config/vault.ts      → @security-team            (secret management)
src/utils/code-scanner.ts → @security-team           (security rules)
config/environments/prod.json → @release-managers    (prod config)
src/core/orchestrator.ts → @sdlc-core-team + @devops-leads
```

**PR Template** enforces checklist before merge:
- [ ] Branch follows GitFlow naming
- [ ] Commit messages follow conventional format
- [ ] Security scan passes (no ERROR findings)
- [ ] No hardcoded secrets
- [ ] Config changes reviewed by security team

**GitHub Actions** (`.github/workflows/pr-validation.yml`):
- Branch name validation
- Commit message validation
- Security scan on every PR
- Blocks merge on violations

**Terminal Demo:**
```bash
sdlc compliance                    # Full Freddie Mac compliance check
sdlc pr-check                      # PR readiness (branch + scan + commits)

sdlc terminal
security > compliance              # Compliance check
security > codeowners              # Show ownership rules
security > gitflow                 # GitFlow policy guide
```

---

### NFR-6: Dependency Vulnerability Management

**Requirement:** All third-party dependencies must be regularly audited for known vulnerabilities.

**Checks Implemented:**

1. **`npm audit`** — scans against npm vulnerability database
2. **License compliance** — flags GPL/AGPL licenses that may be legally risky
3. **Outdated packages** — identifies packages behind their latest versions
4. **Lockfile enforcement** — `npm ci` in CI/CD ensures no unplanned upgrades

**Terminal Demo:**
```bash
sdlc terminal
security > audit                   # npm vulnerability audit
security > licenses                # License compliance check
devops > deps audit                # Full dependency audit
devops > deps check                # Outdated packages
devops > deps licenses             # License review
```

---

## 5. Terminal Modes Reference

Start the interactive terminal:
```bash
sdlc terminal
# or
npm run terminal
```

### Available Modes

| Mode | Enter | Prompt | Purpose |
|---|---|---|---|
| **Command** | Default | `sdlc >` | Ticket management, workflow |
| **NLP** | `nlp` | `nlp >` | AI repo chat + code editing |
| **DevOps** | `devops` | `devops >` | CI/CD, Docker, Terraform, deploy |
| **Git** | `git` | `git >` | Full Git operations + NL |
| **Security** | `security` | `security >` | Scanning, secrets, compliance |

All modes support **natural language input** — type commands or sentences:
```bash
security > check for secrets
security > is the Dockerfile secure
security > are we compliant
devops > validate the Jenkinsfile
devops > is the app ready to deploy to staging
git > show me what changed
git > commit everything with message fix auth bug
```

---

## 6. Installation & Setup

### Prerequisites
- Node.js 18+
- Git (installed and on PATH)
- Azure OpenAI credentials (or set `SDLC_USE_MOCK=true`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
copy .env.example .env
```

Edit `.env`:
```env
# AI — Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# Run without AI (mock mode)
SDLC_USE_MOCK=true

# Environment
APP_ENV=dev

# Vault (disabled for local dev)
VAULT_ENABLED=false
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=
VAULT_SECRET_PATH=secret/data/sdlc
```

### 3. Build & Link Global Command
```bash
npm run build
npm link
```

### 4. Run
```bash
sdlc --help          # All commands
sdlc terminal        # Interactive terminal
```

---

## 7. Demo Commands

### Recommended Demo Flow

```bash
# === 1. FUNCTIONAL DEMO ===

# Ticket workflow
sdlc tickets
sdlc plan AUTH-101
sdlc execute AUTH-101
sdlc status

# === 2. GIT STANDARDS ===
sdlc terminal
git > status
git > branch
git > create branch feature/auth-101
git > commit all "feat: [AUTH-101] Add login endpoint"
exit

# === 3. CI/CD PIPELINE ===
sdlc pipeline
sdlc terminal
devops > cicd
devops > jenkins stages
devops > jenkins validate
devops > deploy check staging
exit

# === 4. CONFIG MANAGEMENT ===
sdlc config
sdlc terminal
devops > env show
devops > env compare
devops > env validate
exit

# === 5. SECURITY NFRs ===
sdlc security-scan
sdlc secrets
sdlc compliance
sdlc security-dashboard
sdlc terminal
security > scan summary
security > scan errors
security > vault
security > docker security
security > terraform security
security > compliance
exit

# === 6. HEALTH OVERVIEW ===
sdlc health
sdlc pr-check
sdlc infra
sdlc docker-info
```

---

## 8. Project Structure

```
├── src/
│   ├── cli/
│   │   ├── program.ts           # CLI command definitions (35+ commands)
│   │   └── terminal.ts          # Interactive terminal (5 modes)
│   ├── core/
│   │   ├── orchestrator.ts      # Central coordinator (80+ methods)
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── state-service.ts     # Ticket state persistence
│   │   └── ticket-service.ts    # Ticket file reader
│   ├── config/
│   │   ├── config-manager.ts    # Multi-layer config loader
│   │   ├── config-schema.ts     # Runtime validation + sensitive field list
│   │   ├── vault.ts             # HashiCorp Vault / env secret provider
│   │   └── env.ts               # Raw environment variable access
│   ├── agents/
│   │   ├── planner-agent.ts     # AI plan generator
│   │   ├── code-agent.ts        # AI code generator
│   │   └── test-agent.ts        # AI test generator
│   └── utils/
│       ├── git-operations.ts    # 20+ git commands (simple-git)
│       ├── git-nl-parser.ts     # Git NL intent parser
│       ├── git-policy.ts        # Branch + commit policy rules
│       ├── git.ts               # GitFlow operations
│       ├── devops-operations.ts # CI/CD, Docker, Terraform, env, deps
│       ├── devops-nl-parser.ts  # DevOps NL intent parser
│       ├── security-operations.ts # Scan, secrets, vault, compliance
│       ├── security-nl-parser.ts  # Security NL intent parser
│       ├── code-scanner.ts      # 10-rule NFR static scanner
│       ├── cicd.ts              # Jenkins pipeline introspection
│       ├── llm.ts               # Azure OpenAI client
│       └── theme.ts             # Terminal UI (chalk panels)
├── config/
│   ├── base.json                # Default configuration
│   └── environments/
│       ├── dev.json
│       ├── staging.json
│       └── prod.json
├── tickets/                     # Work items (AUTH-101, SEC-401 ...)
├── .github/
│   ├── CODEOWNERS               # Code ownership rules
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       └── pr-validation.yml    # PR gate (branch + commit + scan)
├── terraform/
│   └── main.tf                  # AWS ECR + IAM (S3 state + DynamoDB lock)
├── Dockerfile                   # Multi-stage, non-root, Alpine
├── Jenkinsfile                  # 8-stage declarative pipeline
├── .env.example                 # Environment variable template
└── package.json                 # bin: { "sdlc": "dist/index.js" }
```

---

## Key Design Principles

| Principle | Implementation |
|---|---|
| **Secrets never in code** | Vault abstraction, `.env` in `.gitignore`, scanner blocks violations |
| **Config separate from code** | `config/environments/` per environment, base + override pattern |
| **Audit trail preserved** | `git revert` only (no `reset --hard`), `--no-ff` merges |
| **Manual gate for production** | Jenkins `input()` step, submitter restricted to `release-managers` |
| **Zero hardcoded credentials** | All Jenkins values via `credentials()`, Dockerfile uses build args only |
| **Least privilege access** | IAM roles (not static keys), scoped ECR-only policy |
| **Fail fast on security** | Scanner errors block pipeline; PR gate blocks merge |
| **Natural language interface** | Rule-based regex + GPT-4 fallback for all 5 terminal modes |
