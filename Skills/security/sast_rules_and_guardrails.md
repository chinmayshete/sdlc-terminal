# SAST Security Rules and Guardrails

This document establishes the official SAST scanning rules, classification categories, and pipeline enforcement guardrails for the AI SDLC Terminal.

---

## 📂 1. SAST Test Categories and Rules

### 🔑 Category A: Credentials and Secret Management
Focuses on preventing the exposure of credentials, access keys, tokens, and database passwords in source code.

| Rule ID | Rule Name | Pattern/Trigger | Severity | Remediation Guideline |
|---|---|---|---|---|
| `SEC-001` | Hardcoded Secret | Assigning password/api key variables to literal strings | **CRITICAL / ERROR** | Move credential to `.env` or retrieve from HashiCorp Vault. |
| `SEC-002` | Hardcoded Token | Hardcoded bearer tokens, JWT strings, or OAuth access keys | **CRITICAL / ERROR** | Rotate token immediately; fetch via environment variables. |
| `SEC-007` | AWS Access Key | 16-character string starting with `AKIA` | **CRITICAL / ERROR** | Revoke credential immediately in AWS IAM; parameterize roles. |
| `SEC-008` | Private Key Block | Committing raw private key strings (`-----BEGIN...`) | **CRITICAL / ERROR** | Remove file/string from history; store in secure secret storage. |
| `SEC-009` | DB Connection String | Hardcoded database connection strings containing passwords | **CRITICAL / ERROR** | Parameterize hosts/passwords; use Vault injection. |

---

### 💉 Category B: Injection Vulnerabilities
Prevents remote code execution, SQL injections, path traversals, and command execution flaws.

| Rule ID | Rule Name | Pattern/Trigger | Severity | Remediation Guideline |
|---|---|---|---|---|
| `SEC-003` | `eval()` Usage | Call expression utilizing python's `eval()` | **HIGH / ERROR** | Avoid execution of dynamic strings; use structured parsing. |
| `SEC-004` | `exec()` Usage | Call expression utilizing python's `exec()` | **MEDIUM / WARNING**| Restrict to trusted configurations or replace with subprocess. |
| `SEC-005` | SQL Injection | Using string concatenations/f-strings in DB execute/query calls | **HIGH / ERROR** | Implement parameterized queries or use secure ORM interfaces. |
| `SEC-014` | Path Traversal | Input patterns containing dot-dot-slash (`../` or `..\`) | **MEDIUM / WARNING**| Validate and resolve canonical absolute paths before file I/O. |

---

### 🔒 Category C: Transport and Cryptography Security
Ensures communications are encrypted and modern cryptographic algorithms are utilized.

| Rule ID | Rule Name | Pattern/Trigger | Severity | Remediation Guideline |
|---|---|---|---|---|
| `SEC-006` | Insecure HTTP | String matches utilizing `http://` protocols | **MEDIUM / WARNING**| Enforce HTTPS endpoint redirection. |
| `SEC-013` | Weak Cryptography | Use of deprecated hash algorithms like `md5` or `sha1` | **MEDIUM / WARNING**| Replace with robust hash algorithms (e.g., `SHA-256`, `bcrypt`). |
| `SEC-015` | Disabled SSL | Disabling SSL verification options (e.g. `verify=False`) | **MEDIUM / WARNING**| Enforce certificate authority validation. |

---

### ⚙️ Category D: Configuration & Exposure
Blocks logging of secrets and open API permissions.

| Rule ID | Rule Name | Pattern/Trigger | Severity | Remediation Guideline |
|---|---|---|---|---|
| `SEC-010` | Console Logging | Printing variable structures labeled key/password/token | **MEDIUM / WARNING**| Redact sensitive values before logging to standard stdout. |
| `SEC-011` | Production Debug | Leaving debug modes configured as `True` | **MEDIUM / WARNING**| Extract parameter to environment config; set to `False` by default. |
| `SEC-012` | Wildcard CORS | Allowing origin access via `*` | **MEDIUM / WARNING**| Specify explicit origin domains inside policy handlers. |

---

## 🛡️ 2. Security Scan Guardrails

To maintain structural integrity, the terminal enforces the following guardrails:

### ⚠️ A. Pipeline-Breaker Severity Thresholds
Any discovery of **`ERROR` / `CRITICAL`** level vulnerabilities triggers an immediate scan failure (return code != 0).
- Builds containing `SEC-001` (Secrets), `SEC-002` (Tokens), `SEC-003` (`eval`), `SEC-005` (SQL Injection), `SEC-007` (AWS Key), `SEC-008` (Private Key), or `SEC-009` (Connection Strings) **must be blocked from code merges** (`git push` or deployment).

> [!CAUTION]
> Hardcoded secrets (`SEC-001`, `SEC-002`, `SEC-007`, `SEC-008`) must never bypass CI checks. Any bypass attempts will trigger automated warnings to the project lead.

---

### 🔍 B. Scan Exclusions and Scope Control
To prevent infinite loops and false warnings, scanning is restricted to core files:
- **Scanned Extensions**: `.py`, `.js`, `.ts`, `.env`, `.tf`, `.sh`, `.json`, `.yaml`.
- **Blocked/Skipped Paths**: `node_modules/`, `.venv/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.sdlc/`.
- **Max File Size**: Files larger than **8KB** are skipped for AI Deep Scans to maintain responsive execution, falling back purely to the high-speed regex engine.

---

### 📝 C. False Positive Resolution Process
If a vulnerability is identified as a false positive:
1. **Developer Mitigation Comments**: Add an inline annotation to bypass the warning.
   ```python
   # nosec: SEC-006 - HTTP is explicitly required for mock local server
   mock_url = "http://localhost:8080"
   ```
2. **AI Verification**: The scan results are analyzed by the LLM post-scan. If the AI detects a false positive (e.g. a public, non-secret token in a mock test), it appends metadata flagging it as resolved.
3. **Manual Override**: Project leads can archive the finding by executing:
   ```bash
   security override <finding_id>
   ```

---

### ⚖️ D. Compliance Gate Requirements
All code must score a **Security Posture Score** of **80/100** or higher to qualify for release:
- **Score Deduction Matrix**:
  - Each `ERROR` finding: **-10 points**
  - Each `WARNING` finding: **-3 points**
  - Each hardcoded secret finding: **-15 points**
