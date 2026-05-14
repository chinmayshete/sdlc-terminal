/**
 * Security Operations — Comprehensive Security Command Wrappers
 *
 * Covers code scanning, secret detection, dependency auditing,
 * vault/config security, compliance policy, infrastructure security,
 * and OWASP best-practice checks.
 */

import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import chalk from "chalk";
import { paths } from "../config/paths";
import { runCodeScan, formatScanReport, ScanReport } from "./code-scanner";
import { checkAiHealth, aiAnalyzeScanResults } from "./llm";
import { getChangedFiles, getCurrentBranch } from "./git";
import { validateBranchName, validateCommitMessage, getGitFlowGuide } from "./git-policy";
import { listRecentCommits } from "./git";
import {
  getConfig,
  getConfigSummary,
  getRedactedConfig,
} from "../config/config-manager";
import { SENSITIVE_FIELDS, validateConfig } from "../config/config-schema";
import { createSecretProvider } from "../config/vault";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runShell(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: error?.code ?? 0,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// A — Code Scanning (NFR Static Analysis)
// ---------------------------------------------------------------------------

export async function runFullScan(): Promise<string[]> {
  const report = await runCodeScan(paths.repoDir);
  const formatted = formatScanReport(report);
  
  if (report.findings.length > 0) {
    const analysis = await aiAnalyzeScanResults(
      "AI Deep Logical Scan", 
      report.findings,
      "Prioritize these SAST findings, identify false positives, and suggest remediation strategies."
    );
    return [
      ...formatted,
      "",
      chalk.bold.underline.blue("── AI Security Analysis ──"),
      ...analysis.map(line => `  ${chalk.cyan(line)}`)
    ];
  }
  
  return formatted;
}

export async function runScanErrorsOnly(): Promise<string[]> {
  const report = await runCodeScan(paths.repoDir);
  const errors = report.findings.filter((f) => f.severity === "ERROR");
  if (errors.length === 0) return [chalk.bold.green("✓ No ERROR-level findings.")];
  const lines: string[] = [chalk.bold.red(`${errors.length} ERROR-level finding(s):`)];
  for (const f of errors) {
    const shortPath = f.filePath.split("/").slice(-3).join("/");
    lines.push(`  [${f.ruleId}] ${f.description}`);
    lines.push(`    File: ${shortPath}:${f.lineNumber}`);
    lines.push(`    Fix: ${f.remediation}`);
  }
  return lines;
}

export async function runScanWarningsOnly(): Promise<string[]> {
  const report = await runCodeScan(paths.repoDir);
  const warnings = report.findings.filter((f) => f.severity === "WARNING");
  if (warnings.length === 0) return ["✓ No WARNING-level findings."];
  const lines: string[] = [`${warnings.length} WARNING-level finding(s):`];
  for (const f of warnings) {
    const shortPath = f.filePath.split("/").slice(-3).join("/");
    lines.push(`  [${f.ruleId}] ${f.description}`);
    lines.push(`    File: ${shortPath}:${f.lineNumber}`);
    lines.push(`    Fix: ${f.remediation}`);
  }
  return lines;
}

export async function runScanSummary(): Promise<string[]> {
  const report = await runCodeScan(paths.repoDir);
  return [
    chalk.bold.blue("Security Scan Summary:"),
    `  Scanned files: ${chalk.cyan(report.scannedFiles)}`,
    `  Total findings: ${chalk.bold(report.totalFindings)}`,
    `  Errors: ${chalk.bold.red(report.errors)}`,
    `  Warnings: ${chalk.bold.yellow(report.warnings)}`,
    `  Info: ${chalk.bold.cyan(report.infos)}`,
    `  Scanned at: ${chalk.gray(report.scannedAt)}`,
    "",
    report.errors === 0
      ? chalk.bold.green("✓ No critical security violations.")
      : chalk.bold.red(`⚠ ${report.errors} ERROR-level finding(s) require immediate attention.`),
  ];
}

export async function scanSingleFile(filePath: string): Promise<string[]> {
  const fullPath = path.resolve(paths.repoDir, filePath);
  try {
    await fs.access(fullPath);
  } catch {
    return [`File not found: ${filePath}`];
  }

  // Run a targeted scan on just this file
  const report = await runCodeScan(paths.repoDir);
  const normalizedTarget = fullPath.replace(/\\/g, "/");
  const fileFindings = report.findings.filter(
    (f) => f.filePath.replace(/\\/g, "/") === normalizedTarget ||
           f.filePath.replace(/\\/g, "/").endsWith(filePath.replace(/\\/g, "/"))
  );

  if (fileFindings.length === 0) return [`✓ No findings for ${filePath}`];
  const lines: string[] = [`${fileFindings.length} finding(s) for ${filePath}:`];
  for (const f of fileFindings) {
    lines.push(`  [${f.ruleId}] ${f.severity} — ${f.description}`);
    lines.push(`    Line ${f.lineNumber}: ${f.matchedContent}`);
    lines.push(`    Fix: ${f.remediation}`);
  }

  const analysis = await aiAnalyzeScanResults(
    "AI Deep Scan (Single File)",
    fileFindings,
    `Analyze findings for file: ${filePath}`
  );

  return [
    ...lines,
    "",
    "── AI Security Analysis ──",
    ...analysis.map(line => `  ${line}`)
  ];
}

export async function getScanRules(): Promise<string[]> {
  return [
    "Security Scan Rules:",
    "  SEC-001 — Hardcoded password (ERROR)",
    "  SEC-002 — Hardcoded API key (ERROR)",
    "  SEC-003 — Hardcoded connection string (ERROR)",
    "  SEC-004 — Hardcoded IP address (WARNING)",
    "  SEC-005 — Inline process.env usage (INFO)",
    "  SEC-006 — Hardcoded external URL (INFO)",
    "  SEC-007 — Private key material (ERROR)",
    "  SEC-008 — AWS credential pattern (ERROR)",
    "  SEC-009 — Bearer token pattern (ERROR)",
    "  SEC-010 — Base64-encoded secret (WARNING)",
  ];
}

// ---------------------------------------------------------------------------
// B — Secret Detection
// ---------------------------------------------------------------------------

export async function checkSecrets(): Promise<string[]> {
  const report = await runCodeScan(paths.repoDir);
  const secretRules = ["SEC-001", "SEC-002", "SEC-003", "SEC-007", "SEC-008", "SEC-009", "SEC-010"];
  const secrets = report.findings.filter((f) => secretRules.includes(f.ruleId));
  if (secrets.length === 0) return [chalk.bold.green("✓ No hardcoded secrets detected.")];
  const lines: string[] = [chalk.bold.red(`⚠ ${secrets.length} potential secret(s) found:`)];
  for (const f of secrets) {
    const shortPath = f.filePath.split("/").slice(-3).join("/");
    lines.push(`  [${f.ruleId}] ${f.severity} — ${f.description}`);
    lines.push(`    File: ${shortPath}:${f.lineNumber}`);
    lines.push(`    Match: ${f.matchedContent}`);
  }
  lines.push("");
  lines.push("Remediation: Move all secrets to HashiCorp Vault or environment variables.");

  const analysis = await aiAnalyzeScanResults(
    "AI Secret Scanner",
    secrets,
    "Determine if any of these are likely false positives (e.g. test data) vs real secrets."
  );

  return [
    ...lines,
    "",
    "── AI Security Analysis ──",
    ...analysis.map(line => `  ${line}`)
  ];
}

export async function auditEnvFile(): Promise<string[]> {
  const lines: string[] = [".env File Security Audit:"];

  // Check if .env is in .gitignore
  try {
    const gitignore = await fs.readFile(path.join(paths.rootDir, ".gitignore"), "utf8");
    const envIgnored = gitignore.split(/\r?\n/).some(
      (line) => line.trim() === ".env" || line.trim() === "*.env"
    );
    lines.push(
      envIgnored
        ? chalk.green("  ✓ .env is listed in .gitignore")
        : chalk.bold.red("  ✗ .env is NOT in .gitignore — secrets may be committed!")
    );
  } catch {
    lines.push(chalk.yellow("  ⚠ No .gitignore found"));
  }

  // Check .env file contents for sensitive patterns
  try {
    const envContent = await fs.readFile(path.join(paths.rootDir, ".env"), "utf8");
    const envLines = envContent.split(/\r?\n/);
    let secretCount = 0;

    for (const line of envLines) {
      if (line.trim().startsWith("#") || !line.includes("=")) continue;
      const key = line.split("=")[0].trim().toUpperCase();
      if (/(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)/.test(key)) {
        const value = line.split("=").slice(1).join("=").trim();
        if (value && value !== '""' && value !== "''") {
          secretCount++;
        }
      }
    }

    lines.push(`  Total environment variables: ${envLines.filter((l) => l.includes("=") && !l.startsWith("#")).length}`);
    lines.push(
      secretCount === 0
        ? "  ✓ No sensitive keys with non-empty values found"
        : `  ⚠ ${secretCount} sensitive key(s) have values — use Vault in production`
    );
  } catch {
    lines.push("  ⚠ No .env file found");
  }

  // Check .env.example exists
  try {
    await fs.access(path.join(paths.rootDir, ".env.example"));
    lines.push("  ✓ .env.example exists for onboarding reference");
  } catch {
    lines.push("  ⚠ No .env.example found — add one for team onboarding");
  }

  return lines;
}

export async function getSensitiveFieldsReport(): Promise<string[]> {
  const lines: string[] = ["Sensitive Configuration Fields:"];

  for (const field of SENSITIVE_FIELDS) {
    lines.push(`  • ${field} — must be sourced from Vault in production`);
  }

  // Check vault status
  const provider = createSecretProvider();
  lines.push("");
  lines.push(`Secret Provider: ${provider.providerName}`);

  const vaultEnabled = process.env.VAULT_ENABLED?.trim().toLowerCase() === "true";
  lines.push(`Vault enabled: ${vaultEnabled ? "yes" : "no"}`);

  if (!vaultEnabled) {
    lines.push("⚠ Vault is disabled — secrets are read from environment variables.");
    lines.push("  In production, set VAULT_ENABLED=true and configure VAULT_ADDR/VAULT_TOKEN.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// C — Dependency Security
// ---------------------------------------------------------------------------

export async function auditDeps(): Promise<string[]> {
  const result = await runShell("npm audit --json 2>&1", paths.rootDir);
  try {
    const data = JSON.parse(result.stdout) as {
      metadata?: {
        vulnerabilities?: Record<string, number>;
        totalDependencies?: number;
      };
    };
    const vulns = data.metadata?.vulnerabilities ?? {};
    const total = data.metadata?.totalDependencies ?? 0;
    const lines: string[] = [
      `Dependency Security Audit (${total} packages):`,
      `  Critical: ${vulns.critical ?? 0}`,
      `  High:     ${vulns.high ?? 0}`,
      `  Moderate: ${vulns.moderate ?? 0}`,
      `  Low:      ${vulns.low ?? 0}`,
    ];
    const critical = (vulns.critical ?? 0) + (vulns.high ?? 0);
    lines.push(
      critical === 0
        ? "  ✓ No critical or high vulnerabilities."
        : `  ✗ ${critical} critical/high vulnerability(ies) — run 'npm audit fix'.`
    );

    const analysis = await aiAnalyzeScanResults(
      "npm audit (FOSS)",
      [data.metadata ?? {}],
      "Summarize the dependency vulnerability risk and provide a high-level mitigation strategy."
    );

    return [
      ...lines,
      "",
      chalk.bold.underline.blue("── AI Security Analysis ──"),
      ...analysis.map(line => `  ${chalk.cyan(line)}`)
    ];
  } catch {
    const lines = result.stdout.split(/\r?\n/).slice(0, 15);
    return ["Dependency Audit:", ...lines.map((l) => `  ${l}`)];
  }
}

export async function checkLicenseCompliance(): Promise<string[]> {
  const pkgPath = path.join(paths.rootDir, "package.json");
  const RISKY_LICENSES = ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0", "EUPL-1.1"];

  try {
    const content = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(content) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const lines: string[] = [`License Compliance Check (${deps.length} dependencies):`];
    let riskyCount = 0;

    for (const dep of deps) {
      try {
        const depPkg = await fs.readFile(
          path.join(paths.rootDir, "node_modules", dep, "package.json"),
          "utf8",
        );
        const depData = JSON.parse(depPkg) as { license?: string };
        const license = depData.license ?? "unknown";
        const isRisky = RISKY_LICENSES.some((r) => license.toUpperCase().includes(r.toUpperCase()));
        if (isRisky) {
          lines.push(`  ⚠ ${dep}: ${license} (restrictive — review required)`);
          riskyCount++;
        } else {
          lines.push(`  ✓ ${dep}: ${license}`);
        }
      } catch {
        lines.push(`  ? ${dep}: license not readable`);
      }
    }

    lines.push("");
    lines.push(
      riskyCount === 0
        ? "✓ All dependencies have permissive licenses."
        : `⚠ ${riskyCount} dependency(ies) with restrictive licenses — review before distribution.`
    );
    return lines;
  } catch {
    return ["Could not read package.json."];
  }
}

// ---------------------------------------------------------------------------
// D — Vault & Config Security
// ---------------------------------------------------------------------------

export async function getVaultStatus(): Promise<string[]> {
  const provider = createSecretProvider();
  const vaultEnabled = process.env.VAULT_ENABLED?.trim().toLowerCase() === "true";
  const vaultAddr = process.env.VAULT_ADDR?.trim() ?? "(not set)";

  const lines: string[] = [
    "Vault Integration Status:",
    `  Provider: ${provider.providerName}`,
    `  Vault enabled: ${vaultEnabled ? "yes" : "no"}`,
    `  Vault address: ${vaultEnabled ? vaultAddr : "(disabled)"}`,
    `  Secret path: ${process.env.VAULT_SECRET_PATH ?? "secret/data/sdlc"}`,
    "",
  ];

  if (vaultEnabled) {
    // Try to reach vault
    try {
      const secret = await provider.getSecret("AZURE_OPENAI_API_KEY");
      lines.push(secret ? "  ✓ Vault is reachable and returning secrets" : "  ⚠ Vault reachable but key not found");
    } catch {
      lines.push("  ✗ Vault is not reachable");
    }
  } else {
    lines.push("  ⚠ Using environment variables as secret source.");
    lines.push("  In production, enable Vault: VAULT_ENABLED=true");
  }

  return lines;
}

export async function validateConfigSecurity(): Promise<string[]> {
  const lines: string[] = ["Configuration Security Validation:"];

  try {
    const config = getConfig();
    const errors = validateConfig(config);

    const criticalErrors = errors.filter((e) => e.severity === "error");
    const warnings = errors.filter((e) => e.severity === "warning");

    lines.push(`  Environment: ${config.appEnv}`);
    lines.push(`  Validation errors: ${criticalErrors.length}`);
    lines.push(`  Validation warnings: ${warnings.length}`);

    if (criticalErrors.length > 0) {
      lines.push("");
      lines.push("  Errors:");
      for (const e of criticalErrors) {
        lines.push(`    ✗ ${e.field}: ${e.message}`);
      }
    }

    if (warnings.length > 0) {
      lines.push("");
      lines.push("  Warnings:");
      for (const w of warnings) {
        lines.push(`    ⚠ ${w.field}: ${w.message}`);
      }
    }

    if (criticalErrors.length === 0 && warnings.length === 0) {
      lines.push("  ✓ Configuration passes all validation checks.");
    }

    // Check if production config is using mock mode
    if (config.appEnv === "prod" && config.features.useMock) {
      lines.push("");
      lines.push("  ✗ CRITICAL: Mock mode is enabled in production!");
    }

    // Check database SSL in production
    if (config.appEnv === "prod" && !config.database.ssl) {
      lines.push("  ✗ Database SSL is disabled in production.");
    }
  } catch {
    lines.push("  ⚠ Configuration not loaded. Run loadConfig() at startup.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// E — Compliance & Policy
// ---------------------------------------------------------------------------

export async function runComplianceCheck(): Promise<string[]> {
  const lines: string[] = ["Freddie Mac Compliance Check:"];

  // Branch policy
  const branch = await getCurrentBranch();
  const branchViolations = validateBranchName(branch);
  lines.push(
    branchViolations.length === 0
      ? `  ✓ Branch '${branch}' follows GitFlow naming`
      : `  ✗ Branch '${branch}': ${branchViolations[0].message}`
  );

  // Commit policy
  const commits = await listRecentCommits(1);
  if (commits.length > 0 && !commits[0].startsWith("Unable")) {
    const msg = commits[0].split(" | ").pop() ?? "";
    const msgViolations = validateCommitMessage(msg);
    const msgErrors = msgViolations.filter((v) => v.severity === "error");
    lines.push(
      msgErrors.length === 0
        ? "  ✓ Latest commit follows conventional format"
        : `  ✗ Commit: ${msgErrors[0].message}`
    );
  }

  // CODEOWNERS
  try {
    await fs.access(path.join(paths.rootDir, ".github", "CODEOWNERS"));
    lines.push("  ✓ CODEOWNERS file present");
  } catch {
    lines.push("  ✗ CODEOWNERS file missing — required for PR reviews");
  }

  // PR template
  try {
    await fs.access(path.join(paths.rootDir, ".github", "PULL_REQUEST_TEMPLATE.md"));
    lines.push("  ✓ PR template present");
  } catch {
    lines.push("  ⚠ PR template missing");
  }

  // Security scan
  const report = await runCodeScan(paths.repoDir);
  lines.push(
    report.errors === 0
      ? "  ✓ No security errors in code"
      : `  ✗ ${report.errors} security ERROR(s) in code`
  );

  // .gitignore checks
  try {
    const gitignore = await fs.readFile(path.join(paths.rootDir, ".gitignore"), "utf8");
    const mustIgnore = [".env", "node_modules", "dist", "coverage"];
    for (const item of mustIgnore) {
      const isIgnored = gitignore.split(/\r?\n/).some((l) => l.trim() === item || l.trim() === `/${item}`);
      lines.push(
        isIgnored
          ? `  ✓ ${item} is in .gitignore`
          : `  ⚠ ${item} is NOT in .gitignore`
      );
    }
  } catch {
    lines.push("  ⚠ No .gitignore found");
  }

  // Uncommitted changes
  const changed = await getChangedFiles();
  lines.push(
    changed.length === 0
      ? "  ✓ No uncommitted changes"
      : `  ⚠ ${changed.length} uncommitted file(s)`
  );

  return lines;
}

export function getGitFlowPolicy(): string[] {
  return getGitFlowGuide();
}

export async function getCodeOwnersReport(): Promise<string[]> {
  try {
    const content = await fs.readFile(
      path.join(paths.rootDir, ".github", "CODEOWNERS"),
      "utf8",
    );
    const entries = content
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));

    const lines: string[] = [`CODEOWNERS (${entries.length} rules):`];
    for (const entry of entries) {
      const parts = entry.trim().split(/\s+/);
      const pattern = parts[0];
      const owners = parts.slice(1).join(", ");
      lines.push(`  ${pattern} → ${owners}`);
    }
    return lines;
  } catch {
    return ["No CODEOWNERS file found at .github/CODEOWNERS"];
  }
}

// ---------------------------------------------------------------------------
// F — Infrastructure Security
// ---------------------------------------------------------------------------

export async function checkDockerSecurity(): Promise<string[]> {
  const dockerfilePath = path.join(paths.rootDir, "Dockerfile");
  const checks: string[] = ["Docker Security Assessment:"];

  try {
    const content = await fs.readFile(dockerfilePath, "utf8");

    // Non-root user
    checks.push(
      content.match(/^USER\s+(?!root)/m)
        ? "  ✓ Non-root user configured"
        : "  ✗ Running as root — add USER directive"
    );

    // HEALTHCHECK
    checks.push(
      content.includes("HEALTHCHECK")
        ? "  ✓ Healthcheck defined"
        : "  ⚠ No HEALTHCHECK — container health may not be monitored"
    );

    // No ADD (use COPY instead)
    checks.push(
      !content.includes("ADD ")
        ? "  ✓ Uses COPY (no ADD)"
        : "  ⚠ Uses ADD — prefer COPY to avoid auto-extraction vulnerabilities"
    );

    // No secrets in ENV
    const envLines = content.match(/^ENV\s+.+$/gm) || [];
    const hasSecretEnv = envLines.some((l) =>
      /(?:PASSWORD|SECRET|TOKEN|API_KEY)/i.test(l)
    );
    checks.push(
      !hasSecretEnv
        ? "  ✓ No secret-like values in ENV directives"
        : "  ✗ Possible secrets in ENV directives — inject at runtime"
    );

    // Alpine base (smaller attack surface)
    checks.push(
      content.includes("alpine")
        ? "  ✓ Uses Alpine base image (smaller attack surface)"
        : "  ⚠ Not using Alpine — consider a minimal base image"
    );

    // Multi-stage build
    checks.push(
      content.includes("AS ")
        ? "  ✓ Multi-stage build (reduces final image size)"
        : "  ⚠ No multi-stage build — dev dependencies may leak into production"
    );

    // npm ci (not npm install)
    checks.push(
      content.includes("npm ci")
        ? "  ✓ Uses npm ci (deterministic, no unplanned upgrades)"
        : "  ⚠ Uses npm install — prefer npm ci for reproducible builds"
    );

    // npm prune
    checks.push(
      content.includes("npm prune")
        ? "  ✓ Prunes dev dependencies in production stage"
        : "  ⚠ No npm prune — devDependencies may bloat the image"
    );
  } catch {
    checks.push("  No Dockerfile found.");
  }

  // Try real Trivy if installed
  const trivyRes = await runShell("trivy config --format json Dockerfile", paths.rootDir);
  let rawFindings: any[] = [];
  if (trivyRes.code === 0 && trivyRes.stdout.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(trivyRes.stdout);
      rawFindings = parsed.Results || [];
      checks.push("", "  [INFO] Real Trivy scan executed successfully.");
    } catch {
      // Ignore parse error
    }
  } else {
    rawFindings = [...checks]; // Pass baseline checks as raw findings
  }

  const analysis = await aiAnalyzeScanResults(
    trivyRes.code === 0 ? "Trivy" : "Baseline Docker Scanner",
    rawFindings,
    "Review Docker security findings, prioritize risks, and suggest exact Dockerfile remediations."
  );

  return [
    ...checks,
    "",
    "── AI Security Analysis ──",
    ...analysis.map(line => `  ${line}`)
  ];
}

export async function checkTerraformSecurity(): Promise<string[]> {
  const tfDir = path.join(paths.rootDir, "terraform");
  const checks: string[] = ["Terraform Security Assessment:"];

  try {
    const content = await fs.readFile(path.join(tfDir, "main.tf"), "utf8");

    // State encryption
    checks.push(
      content.includes('encrypt')
        ? "  ✓ State encryption enabled"
        : "  ⚠ State encryption not configured — add encrypt = true"
    );

    // Remote backend
    checks.push(
      content.includes('backend "s3"') || content.includes('backend "gcs"') || content.includes('backend "azurerm"')
        ? "  ✓ Remote backend configured"
        : "  ⚠ Using local state — configure remote backend for team collaboration"
    );

    // State locking
    checks.push(
      content.includes("dynamodb_table")
        ? "  ✓ State locking enabled (DynamoDB)"
        : "  ⚠ No state locking — risk of concurrent modifications"
    );

    // ECR scan on push
    checks.push(
      content.includes("scan_on_push")
        ? "  ✓ Container image scanning enabled on push"
        : "  ⚠ ECR scan_on_push not found"
    );

    // KMS encryption
    checks.push(
      content.includes("KMS") || content.includes("kms")
        ? "  ✓ KMS encryption configured"
        : "  ⚠ No KMS encryption found"
    );

    // IAM roles (not hardcoded access keys)
    checks.push(
      content.includes("iam_role") && !content.includes("access_key")
        ? "  ✓ Uses IAM roles (no hardcoded access keys)"
        : content.includes("access_key")
          ? "  ✗ Hardcoded access keys found — use IAM roles"
          : "  ⚠ No IAM configuration found"
    );
  } catch {
    checks.push("  No terraform/main.tf found.");
  }

  // Try real Checkov if installed
  const checkovRes = await runShell("checkov -f terraform/main.tf -o json", paths.rootDir);
  let rawFindings: any[] = [];
  if (checkovRes.stdout.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(checkovRes.stdout);
      rawFindings = parsed.results?.failed_checks || [];
      checks.push("", "  [INFO] Real Checkov scan executed successfully.");
    } catch {
      // Ignore parse error
    }
  } else {
    rawFindings = [...checks]; // Pass baseline checks as raw findings
  }

  const analysis = await aiAnalyzeScanResults(
    checkovRes.stdout.trim().startsWith("{") ? "Checkov" : "Baseline Terraform Scanner",
    rawFindings,
    "Review IaC misconfigurations, identify false positives, and suggest HCL snippet fixes."
  );

  return [
    ...checks,
    "",
    "── AI Security Analysis ──",
    ...analysis.map(line => `  ${line}`)
  ];
}

// ---------------------------------------------------------------------------
// G — Security Dashboard & Reports
// ---------------------------------------------------------------------------

export async function getSecurityDashboard(): Promise<string[]> {
  const lines: string[] = ["Security Dashboard:"];

  // Code scan summary
  const report = await runCodeScan(paths.repoDir);
  lines.push("");
  lines.push("Code Scan:");
  lines.push(`  Files scanned: ${report.scannedFiles}`);
  lines.push(`  Errors: ${report.errors} | Warnings: ${report.warnings} | Info: ${report.infos}`);

  // Secrets
  const secretRules = ["SEC-001", "SEC-002", "SEC-003", "SEC-007", "SEC-008", "SEC-009"];
  const secrets = report.findings.filter((f) => secretRules.includes(f.ruleId));
  lines.push("");
  lines.push("Secrets:");
  lines.push(
    secrets.length === 0
      ? "  ✓ No hardcoded secrets"
      : `  ✗ ${secrets.length} hardcoded secret(s) found`
  );

  // Vault
  const provider = createSecretProvider();
  lines.push("");
  lines.push("Vault:");
  lines.push(`  Provider: ${provider.providerName}`);
  lines.push(`  Enabled: ${process.env.VAULT_ENABLED?.trim().toLowerCase() === "true" ? "yes" : "no"}`);

  // Compliance
  const branch = await getCurrentBranch();
  const branchOk = validateBranchName(branch).length === 0;
  lines.push("");
  lines.push("Compliance:");
  lines.push(`  Branch policy: ${branchOk ? "✓" : "✗"}`);

  try {
    await fs.access(path.join(paths.rootDir, ".github", "CODEOWNERS"));
    lines.push("  CODEOWNERS: ✓");
  } catch {
    lines.push("  CODEOWNERS: ✗");
  }

  // Uncommitted
  const changed = await getChangedFiles();
  lines.push(`  Clean workspace: ${changed.length === 0 ? "✓" : `✗ (${changed.length} files)`}`);

  // Overall score
  const issues = report.errors + secrets.length + (branchOk ? 0 : 1) + (changed.length > 0 ? 1 : 0);
  lines.push("");
  lines.push(
    issues === 0
      ? "✓ Overall: PASS — no critical security issues."
      : `⚠ Overall: ${issues} issue(s) to address.`
  );

  return lines;
}

export async function getSecurityPosture(): Promise<string[]> {
  const lines: string[] = ["Security Posture Summary:"];

  // Quick counts
  const report = await runCodeScan(paths.repoDir);
  const secretRules = ["SEC-001", "SEC-002", "SEC-003", "SEC-007", "SEC-008", "SEC-009"];

  const metrics = [
    { label: "Code scan errors", value: report.errors, good: report.errors === 0 },
    { label: "Hardcoded secrets", value: report.findings.filter((f) => secretRules.includes(f.ruleId)).length, good: report.findings.filter((f) => secretRules.includes(f.ruleId)).length === 0 },
    { label: "Scan warnings", value: report.warnings, good: report.warnings <= 2 },
  ];

  for (const m of metrics) {
    lines.push(`  ${m.good ? "✓" : "✗"} ${m.label}: ${m.value}`);
  }

  return lines;
}
