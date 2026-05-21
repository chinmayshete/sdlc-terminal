# SDLC AI Assistant (Nexus) - Project Overview
**Prepared for Management Review**

## 1. Executive Summary
The **SDLC AI Assistant (Nexus)** is an intelligent, interactive terminal-based Orchestration engine designed to unify and automate the entire Software Development Life Cycle. It acts as an omnipresent "AI Co-Pilot" for engineering teams, allowing them to control Security, DevOps, Git workflows, and Agile Project Management entirely through Natural Language or structured CLI commands.

By integrating LLMs directly into the command-line interface, the tool dramatically reduces context-switching, enforces enterprise policies automatically, and accelerates development velocity.

---

## 2. Core Architecture
- **Interactive REPL**: Built using `prompt_toolkit` and `Rich`, offering a beautiful, color-coded, and highly responsive terminal UI.
- **NLP Intent Engine**: Uses LLMs (Azure OpenAI) to translate conversational prompts (e.g., *"is the Dockerfile secure?"*) into deterministic system commands, executing the correct Python functions under the hood.
- **Autonomous Coding Agent**: In its default mode, the AI can read codebase context, generate code, apply diffs, and self-correct, complete with `undo` functionality.
- **High-Performance Incremental Engine**: Custom-built SHA-256 file fingerprinting system (in `.sdlc/scans/`) that caches file states. This allows heavy operations (like SAST scans) to execute instantly by only analyzing files that have changed since the last snapshot.

---

## 3. The Four Specialized Governance Modes

### 🛡️ Security Mode
*A comprehensive Enterprise Security Suite that runs directly in the terminal.*
- **Incremental SAST Scanning**: Rapid code analysis using rule-based patterns, PySA, and LLM-driven deep logical scanning for false-positive reduction.
- **Dependency Auditing**: Automated FOSS vulnerability checks (CVEs) using the OSV database (`pip-audit`).
- **Secrets Detection**: Identifies hardcoded keys, tokens, and passwords across the working tree.
- **Infrastructure Security**: Scans Dockerfiles (via Trivy concepts) and Terraform files (via Checkov concepts) for misconfigurations.
- **File Status Fingerprinting**: Identifies modified, deleted, and new files instantly using cryptographic hashes rather than relying on Git.

### ⚙️ DevOps Mode
*Command-center for CI/CD and Infrastructure.*
- **Pipeline Management**: Validates, triggers, and monitors Jenkins and GitHub Actions pipelines.
- **Container & Cluster Control**: Local and remote control over Docker builds/logs and Kubernetes (K8s) pod scaling and deployments.
- **Environment Management**: Compares environment configurations (e.g., dev vs. prod) and validates system health.

### 🌿 Git Mode
*Automated version control and policy enforcement.*
- **GitFlow Automation**: Streamlined commands to cut releases, create hotfixes, and manage feature branches.
- **Policy Enforcement**: Automatically validates that branch names and commit messages follow enterprise conventions (e.g., Conventional Commits).
- **GitHub Integrations**: Automatically creates, reviews, and merges Pull Requests directly from the terminal.

### 📊 Agile Mode 
*Jira and Sprint management via AI.*
- **Jira Integration**: Authenticates and seamlessly interacts with Jira boards.
- **Sprint & Epic Management**: Creates stories, transitions tickets, estimates story points, and lists active sprint backlogs.
- **AI Analytics**: Generates automated Sprint Reviews, Standup Reports, and roadmaps based on ticket velocity and blockers.

---

## 4. Key Business Value & ROI

1. **Massive Time Savings**: Engineers no longer need to switch between the Terminal, Jira, GitHub, Jenkins, and Security Dashboards. Everything is centralized in one interface.
2. **Reduced Learning Curve**: The Natural Language parser allows junior developers to execute complex CI/CD or Security tasks simply by typing what they want to achieve (e.g., *"check for secrets"*).
3. **Shift-Left Security**: Vulnerabilities and exposed secrets are caught *before* commits are ever made, drastically reducing the cost of remediation.
4. **Instant Performance**: The implementation of the SHA-256 incremental scanner means security checks that used to take minutes now take milliseconds, encouraging developers to run them frequently without workflow interruption.

---

## 5. Next Steps / Roadmap
- Continue refining the LLM prompts for even higher accuracy in intent parsing.
- Expand FOSS scanning capabilities to include automatic license compliance checks (GPL vs MIT).
- Deploy the tool across a pilot engineering pod for initial feedback and telemetry gathering.
