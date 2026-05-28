"use strict";
/**
 * Security Operations — Comprehensive Security Command Wrappers
 *
 * Covers code scanning, secret detection, dependency auditing,
 * vault/config security, compliance policy, infrastructure security,
 * and OWASP best-practice checks.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFullScan = runFullScan;
exports.getSecurityScanStatus = getSecurityScanStatus;
exports.runScanErrorsOnly = runScanErrorsOnly;
exports.runScanWarningsOnly = runScanWarningsOnly;
exports.runScanSummary = runScanSummary;
exports.scanSingleFile = scanSingleFile;
exports.getScanRules = getScanRules;
exports.checkSecrets = checkSecrets;
exports.auditEnvFile = auditEnvFile;
exports.getSensitiveFieldsReport = getSensitiveFieldsReport;
exports.auditDeps = auditDeps;
exports.checkLicenseCompliance = checkLicenseCompliance;
exports.getVaultStatus = getVaultStatus;
exports.validateConfigSecurity = validateConfigSecurity;
exports.runComplianceCheck = runComplianceCheck;
exports.getGitFlowPolicy = getGitFlowPolicy;
exports.getCodeOwnersReport = getCodeOwnersReport;
exports.checkDockerSecurity = checkDockerSecurity;
exports.checkTerraformSecurity = checkTerraformSecurity;
exports.getSecurityDashboard = getSecurityDashboard;
exports.getSecurityPosture = getSecurityPosture;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const chalk_1 = __importDefault(require("chalk"));
const paths_1 = require("../config/paths");
const code_scanner_1 = require("./code-scanner");
const crypto_1 = __importDefault(require("crypto"));
const llm_1 = require("./llm");
const git_1 = require("./git");
const git_policy_1 = require("./git-policy");
const git_2 = require("./git");
const config_manager_1 = require("../config/config-manager");
const config_schema_1 = require("../config/config-schema");
const vault_1 = require("../config/vault");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function runShell(cmd, cwd) {
    return new Promise((resolve) => {
        (0, child_process_1.exec)(cmd, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
            resolve({
                stdout: stdout ?? "",
                stderr: stderr ?? "",
                code: error?.code ?? 0,
            });
        });
    });
}
async function getFileHash(filePath) {
    try {
        const content = await fs_1.promises.readFile(filePath);
        return crypto_1.default.createHash("md5").update(content).digest("hex");
    }
    catch {
        return "";
    }
}
// ---------------------------------------------------------------------------
// A — Code Scanning (NFR Static Analysis)
// ---------------------------------------------------------------------------
async function detectFileChanges() {
    const cachePath = path_1.default.join(process.cwd(), ".sdlc", "security-scan-cache.json");
    let cache = null;
    try {
        const cacheData = await fs_1.promises.readFile(cachePath, "utf8");
        cache = JSON.parse(cacheData);
    }
    catch {
        // No cache yet
    }
    const scannableExtensions = [".ts", ".js", ".json", ".env", ".yaml", ".yml"];
    async function collectAllFiles(dir) {
        const files = [];
        const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (![".git", "node_modules", "dist", ".sdlc"].includes(entry.name)) {
                    files.push(...(await collectAllFiles(fullPath)));
                }
            }
            else {
                if (scannableExtensions.includes(path_1.default.extname(entry.name).toLowerCase()) || [".env", ".env.example"].includes(entry.name)) {
                    files.push(fullPath);
                }
            }
        }
        return files;
    }
    const files = await collectAllFiles(paths_1.paths.repoDir);
    const changedFiles = [];
    const currentHashes = {};
    for (const f of files) {
        const hash = await getFileHash(f);
        currentHashes[f] = hash;
        if (!cache || cache.files[f] !== hash) {
            changedFiles.push(f);
        }
    }
    return { files, changedFiles, currentHashes, cache };
}
async function runFullScan() {
    const { files, changedFiles, currentHashes, cache } = await detectFileChanges();
    const cachePath = path_1.default.join(process.cwd(), ".sdlc", "security-scan-cache.json");
    let report;
    if (cache && changedFiles.length === 0) {
        // Use cached results
        report = {
            scannedFiles: files.length,
            totalFindings: cache.findings.length,
            errors: cache.findings.filter(f => f.severity === "ERROR").length,
            warnings: cache.findings.filter(f => f.severity === "WARNING").length,
            infos: cache.findings.filter(f => f.severity === "INFO").length,
            findings: cache.findings,
            scannedAt: cache.lastScanAt
        };
    }
    else {
        // Scan changed files
        const scanResult = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir, changedFiles.length > 0 ? changedFiles : undefined);
        if (cache && changedFiles.length > 0) {
            // Merge: remove old findings for changed files, add new ones
            const normalizedChanged = changedFiles.map(f => f.replace(/\\/g, "/"));
            const keptFindings = cache.findings.filter(f => !normalizedChanged.includes(f.filePath));
            const mergedFindings = [...keptFindings, ...scanResult.findings];
            report = {
                ...scanResult,
                scannedFiles: files.length, // total in project
                findings: mergedFindings,
                totalFindings: mergedFindings.length,
                errors: mergedFindings.filter(f => f.severity === "ERROR").length,
                warnings: mergedFindings.filter(f => f.severity === "WARNING").length,
                infos: mergedFindings.filter(f => f.severity === "INFO").length,
            };
        }
        else {
            report = scanResult;
        }
        // Update cache
        const newCache = {
            lastScanAt: report.scannedAt,
            files: currentHashes,
            findings: report.findings
        };
        await fs_1.promises.mkdir(path_1.default.dirname(cachePath), { recursive: true });
        await fs_1.promises.writeFile(cachePath, JSON.stringify(newCache, null, 2));
        // Save Log
        const logPath = await (0, code_scanner_1.saveScanLog)(report);
        if (logPath) {
            // Add a note to the report that it was saved
        }
    }
    const formatted = (0, code_scanner_1.formatScanReport)(report);
    const incrementalNote = changedFiles.length > 0
        ? chalk_1.default.yellow(`Incremental scan: ${changedFiles.length} file(s) changed.`)
        : cache
            ? chalk_1.default.green("No changes detected. Using cached results.")
            : chalk_1.default.blue("First run: Full codebase scan performed.");
    const finalOutput = [
        incrementalNote,
        ...formatted
    ];
    if (report.findings.length > 0) {
        const analysis = await (0, llm_1.aiAnalyzeScanResults)("AI Deep Logical Scan", report.findings, "Prioritize these SAST findings, identify false positives, and suggest remediation strategies.");
        finalOutput.push("");
        finalOutput.push(chalk_1.default.bold.underline.blue("── AI Security Analysis ──"));
        finalOutput.push(...analysis.map(line => `  ${chalk_1.default.cyan(line)}`));
    }
    return finalOutput;
}
async function getSecurityScanStatus() {
    const { files, changedFiles, cache } = await detectFileChanges();
    const lines = [
        chalk_1.default.bold.blue("Security Scan Status:"),
        `  Total scannable files: ${chalk_1.default.cyan(files.length)}`,
        `  Last scan: ${cache ? chalk_1.default.gray(cache.lastScanAt) : chalk_1.default.red("Never")}`,
        "",
    ];
    if (!cache) {
        lines.push(chalk_1.default.yellow("⚠ No scan cache found. Next 'scan' will be a full codebase scan."));
        return lines;
    }
    if (changedFiles.length === 0) {
        lines.push(chalk_1.default.green("✓ All files are up to date. Next 'scan' will use cached results."));
    }
    else {
        lines.push(chalk_1.default.bold.yellow(`${changedFiles.length} file(s) changed since last scan:`));
        for (const f of changedFiles.slice(0, 10)) {
            const shortPath = f.replace(paths_1.paths.repoDir, "").replace(/\\/g, "/");
            lines.push(`  • ${chalk_1.default.yellow(shortPath)}`);
        }
        if (changedFiles.length > 10) {
            lines.push(`  ... and ${changedFiles.length - 10} more`);
        }
        lines.push("");
        lines.push(chalk_1.default.italic.gray("Run 'scan' to analyze these changes."));
    }
    return lines;
}
async function runScanErrorsOnly() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    if (errors.length === 0)
        return [chalk_1.default.bold.green("✓ No ERROR-level findings.")];
    const lines = [chalk_1.default.bold.red(`${errors.length} ERROR-level finding(s):`)];
    for (const f of errors) {
        const shortPath = f.filePath.split("/").slice(-3).join("/");
        lines.push(`  [${f.ruleId}] ${f.description}`);
        lines.push(`    File: ${shortPath}:${f.lineNumber}`);
        lines.push(`    Fix: ${f.remediation}`);
    }
    return lines;
}
async function runScanWarningsOnly() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    const warnings = report.findings.filter((f) => f.severity === "WARNING");
    if (warnings.length === 0)
        return ["✓ No WARNING-level findings."];
    const lines = [`${warnings.length} WARNING-level finding(s):`];
    for (const f of warnings) {
        const shortPath = f.filePath.split("/").slice(-3).join("/");
        lines.push(`  [${f.ruleId}] ${f.description}`);
        lines.push(`    File: ${shortPath}:${f.lineNumber}`);
        lines.push(`    Fix: ${f.remediation}`);
    }
    return lines;
}
async function runScanSummary() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    return [
        chalk_1.default.bold.blue("Security Scan Summary:"),
        `  Scanned files: ${chalk_1.default.cyan(report.scannedFiles)}`,
        `  Total findings: ${chalk_1.default.bold(report.totalFindings)}`,
        `  Errors: ${chalk_1.default.bold.red(report.errors)}`,
        `  Warnings: ${chalk_1.default.bold.yellow(report.warnings)}`,
        `  Info: ${chalk_1.default.bold.cyan(report.infos)}`,
        `  Scanned at: ${chalk_1.default.gray(report.scannedAt)}`,
        "",
        report.errors === 0
            ? chalk_1.default.bold.green("✓ No critical security violations.")
            : chalk_1.default.bold.red(`⚠ ${report.errors} ERROR-level finding(s) require immediate attention.`),
    ];
}
async function scanSingleFile(filePath) {
    const fullPath = path_1.default.resolve(paths_1.paths.repoDir, filePath);
    try {
        await fs_1.promises.access(fullPath);
    }
    catch {
        return [`File not found: ${filePath}`];
    }
    // Run a targeted scan on just this file
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    const normalizedTarget = fullPath.replace(/\\/g, "/");
    const fileFindings = report.findings.filter((f) => f.filePath.replace(/\\/g, "/") === normalizedTarget ||
        f.filePath.replace(/\\/g, "/").endsWith(filePath.replace(/\\/g, "/")));
    if (fileFindings.length === 0)
        return [`✓ No findings for ${filePath}`];
    const lines = [`${fileFindings.length} finding(s) for ${filePath}:`];
    for (const f of fileFindings) {
        lines.push(`  [${f.ruleId}] ${f.severity} — ${f.description}`);
        lines.push(`    Line ${f.lineNumber}: ${f.matchedContent}`);
        lines.push(`    Fix: ${f.remediation}`);
    }
    const analysis = await (0, llm_1.aiAnalyzeScanResults)("AI Deep Scan (Single File)", fileFindings, `Analyze findings for file: ${filePath}`);
    return [
        ...lines,
        "",
        "── AI Security Analysis ──",
        ...analysis.map(line => `  ${line}`)
    ];
}
async function getScanRules() {
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
async function checkSecrets() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    const secretRules = ["SEC-001", "SEC-002", "SEC-003", "SEC-007", "SEC-008", "SEC-009", "SEC-010"];
    const secrets = report.findings.filter((f) => secretRules.includes(f.ruleId));
    if (secrets.length === 0)
        return [chalk_1.default.bold.green("✓ No hardcoded secrets detected.")];
    const lines = [chalk_1.default.bold.red(`⚠ ${secrets.length} potential secret(s) found:`)];
    for (const f of secrets) {
        const shortPath = f.filePath.split("/").slice(-3).join("/");
        lines.push(`  [${f.ruleId}] ${f.severity} — ${f.description}`);
        lines.push(`    File: ${shortPath}:${f.lineNumber}`);
        lines.push(`    Match: ${f.matchedContent}`);
    }
    lines.push("");
    lines.push("Remediation: Move all secrets to HashiCorp Vault or environment variables.");
    const analysis = await (0, llm_1.aiAnalyzeScanResults)("AI Secret Scanner", secrets, "Determine if any of these are likely false positives (e.g. test data) vs real secrets.");
    return [
        ...lines,
        "",
        "── AI Security Analysis ──",
        ...analysis.map(line => `  ${line}`)
    ];
}
async function auditEnvFile() {
    const lines = [".env File Security Audit:"];
    // Check if .env is in .gitignore
    try {
        const gitignore = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, ".gitignore"), "utf8");
        const envIgnored = gitignore.split(/\r?\n/).some((line) => line.trim() === ".env" || line.trim() === "*.env");
        lines.push(envIgnored
            ? chalk_1.default.green("  ✓ .env is listed in .gitignore")
            : chalk_1.default.bold.red("  ✗ .env is NOT in .gitignore — secrets may be committed!"));
    }
    catch {
        lines.push(chalk_1.default.yellow("  ⚠ No .gitignore found"));
    }
    // Check .env file contents for sensitive patterns
    try {
        const envContent = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, ".env"), "utf8");
        const envLines = envContent.split(/\r?\n/);
        let secretCount = 0;
        for (const line of envLines) {
            if (line.trim().startsWith("#") || !line.includes("="))
                continue;
            const key = line.split("=")[0].trim().toUpperCase();
            if (/(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)/.test(key)) {
                const value = line.split("=").slice(1).join("=").trim();
                if (value && value !== '""' && value !== "''") {
                    secretCount++;
                }
            }
        }
        lines.push(`  Total environment variables: ${envLines.filter((l) => l.includes("=") && !l.startsWith("#")).length}`);
        lines.push(secretCount === 0
            ? "  ✓ No sensitive keys with non-empty values found"
            : `  ⚠ ${secretCount} sensitive key(s) have values — use Vault in production`);
    }
    catch {
        lines.push("  ⚠ No .env file found");
    }
    // Check .env.example exists
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".env.example"));
        lines.push("  ✓ .env.example exists for onboarding reference");
    }
    catch {
        lines.push("  ⚠ No .env.example found — add one for team onboarding");
    }
    return lines;
}
async function getSensitiveFieldsReport() {
    const lines = ["Sensitive Configuration Fields:"];
    for (const field of config_schema_1.SENSITIVE_FIELDS) {
        lines.push(`  • ${field} — must be sourced from Vault in production`);
    }
    // Check vault status
    const provider = (0, vault_1.createSecretProvider)();
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
async function auditDeps() {
    const result = await runShell("npm audit --json 2>&1", paths_1.paths.rootDir);
    try {
        const data = JSON.parse(result.stdout);
        const vulns = data.metadata?.vulnerabilities ?? {};
        const total = data.metadata?.totalDependencies ?? 0;
        const lines = [
            `Dependency Security Audit (${total} packages):`,
            `  Critical: ${vulns.critical ?? 0}`,
            `  High:     ${vulns.high ?? 0}`,
            `  Moderate: ${vulns.moderate ?? 0}`,
            `  Low:      ${vulns.low ?? 0}`,
        ];
        const critical = (vulns.critical ?? 0) + (vulns.high ?? 0);
        lines.push(critical === 0
            ? "  ✓ No critical or high vulnerabilities."
            : `  ✗ ${critical} critical/high vulnerability(ies) — run 'npm audit fix'.`);
        const analysis = await (0, llm_1.aiAnalyzeScanResults)("npm audit (FOSS)", [data.metadata ?? {}], "Summarize the dependency vulnerability risk and provide a high-level mitigation strategy.");
        return [
            ...lines,
            "",
            chalk_1.default.bold.underline.blue("── AI Security Analysis ──"),
            ...analysis.map(line => `  ${chalk_1.default.cyan(line)}`)
        ];
    }
    catch {
        const lines = result.stdout.split(/\r?\n/).slice(0, 15);
        return ["Dependency Audit:", ...lines.map((l) => `  ${l}`)];
    }
}
async function checkLicenseCompliance() {
    const pkgPath = path_1.default.join(paths_1.paths.rootDir, "package.json");
    const RISKY_LICENSES = ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0", "EUPL-1.1"];
    try {
        const content = await fs_1.promises.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(content);
        const deps = Object.keys(pkg.dependencies ?? {});
        const lines = [`License Compliance Check (${deps.length} dependencies):`];
        let riskyCount = 0;
        for (const dep of deps) {
            try {
                const depPkg = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, "node_modules", dep, "package.json"), "utf8");
                const depData = JSON.parse(depPkg);
                const license = depData.license ?? "unknown";
                const isRisky = RISKY_LICENSES.some((r) => license.toUpperCase().includes(r.toUpperCase()));
                if (isRisky) {
                    lines.push(`  ⚠ ${dep}: ${license} (restrictive — review required)`);
                    riskyCount++;
                }
                else {
                    lines.push(`  ✓ ${dep}: ${license}`);
                }
            }
            catch {
                lines.push(`  ? ${dep}: license not readable`);
            }
        }
        lines.push("");
        lines.push(riskyCount === 0
            ? "✓ All dependencies have permissive licenses."
            : `⚠ ${riskyCount} dependency(ies) with restrictive licenses — review before distribution.`);
        return lines;
    }
    catch {
        return ["Could not read package.json."];
    }
}
// ---------------------------------------------------------------------------
// D — Vault & Config Security
// ---------------------------------------------------------------------------
async function getVaultStatus() {
    const provider = (0, vault_1.createSecretProvider)();
    const vaultEnabled = process.env.VAULT_ENABLED?.trim().toLowerCase() === "true";
    const vaultAddr = process.env.VAULT_ADDR?.trim() ?? "(not set)";
    const lines = [
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
        }
        catch {
            lines.push("  ✗ Vault is not reachable");
        }
    }
    else {
        lines.push("  ⚠ Using environment variables as secret source.");
        lines.push("  In production, enable Vault: VAULT_ENABLED=true");
    }
    return lines;
}
async function validateConfigSecurity() {
    const lines = ["Configuration Security Validation:"];
    try {
        const config = (0, config_manager_1.getConfig)();
        const errors = (0, config_schema_1.validateConfig)(config);
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
    }
    catch {
        lines.push("  ⚠ Configuration not loaded. Run loadConfig() at startup.");
    }
    return lines;
}
// ---------------------------------------------------------------------------
// E — Compliance & Policy
// ---------------------------------------------------------------------------
async function runComplianceCheck() {
    const lines = ["Freddie Mac Compliance Check:"];
    // Branch policy
    const branch = await (0, git_1.getCurrentBranch)();
    const branchViolations = (0, git_policy_1.validateBranchName)(branch);
    lines.push(branchViolations.length === 0
        ? `  ✓ Branch '${branch}' follows GitFlow naming`
        : `  ✗ Branch '${branch}': ${branchViolations[0].message}`);
    // Commit policy
    const commits = await (0, git_2.listRecentCommits)(1);
    if (commits.length > 0 && !commits[0].startsWith("Unable")) {
        const msg = commits[0].split(" | ").pop() ?? "";
        const msgViolations = (0, git_policy_1.validateCommitMessage)(msg);
        const msgErrors = msgViolations.filter((v) => v.severity === "error");
        lines.push(msgErrors.length === 0
            ? "  ✓ Latest commit follows conventional format"
            : `  ✗ Commit: ${msgErrors[0].message}`);
    }
    // CODEOWNERS
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".github", "CODEOWNERS"));
        lines.push("  ✓ CODEOWNERS file present");
    }
    catch {
        lines.push("  ✗ CODEOWNERS file missing — required for PR reviews");
    }
    // PR template
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".github", "PULL_REQUEST_TEMPLATE.md"));
        lines.push("  ✓ PR template present");
    }
    catch {
        lines.push("  ⚠ PR template missing");
    }
    // Security scan
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    lines.push(report.errors === 0
        ? "  ✓ No security errors in code"
        : `  ✗ ${report.errors} security ERROR(s) in code`);
    // .gitignore checks
    try {
        const gitignore = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, ".gitignore"), "utf8");
        const mustIgnore = [".env", "node_modules", "dist", "coverage"];
        for (const item of mustIgnore) {
            const isIgnored = gitignore.split(/\r?\n/).some((l) => l.trim() === item || l.trim() === `/${item}`);
            lines.push(isIgnored
                ? `  ✓ ${item} is in .gitignore`
                : `  ⚠ ${item} is NOT in .gitignore`);
        }
    }
    catch {
        lines.push("  ⚠ No .gitignore found");
    }
    // Uncommitted changes
    const changed = await (0, git_1.getChangedFiles)();
    lines.push(changed.length === 0
        ? "  ✓ No uncommitted changes"
        : `  ⚠ ${changed.length} uncommitted file(s)`);
    return lines;
}
function getGitFlowPolicy() {
    return (0, git_policy_1.getGitFlowGuide)();
}
async function getCodeOwnersReport() {
    try {
        const content = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, ".github", "CODEOWNERS"), "utf8");
        const entries = content
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith("#"));
        const lines = [`CODEOWNERS (${entries.length} rules):`];
        for (const entry of entries) {
            const parts = entry.trim().split(/\s+/);
            const pattern = parts[0];
            const owners = parts.slice(1).join(", ");
            lines.push(`  ${pattern} → ${owners}`);
        }
        return lines;
    }
    catch {
        return ["No CODEOWNERS file found at .github/CODEOWNERS"];
    }
}
// ---------------------------------------------------------------------------
// F — Infrastructure Security
// ---------------------------------------------------------------------------
async function checkDockerSecurity() {
    const dockerfilePath = path_1.default.join(paths_1.paths.rootDir, "Dockerfile");
    const checks = ["Docker Security Assessment:"];
    try {
        const content = await fs_1.promises.readFile(dockerfilePath, "utf8");
        // Non-root user
        checks.push(content.match(/^USER\s+(?!root)/m)
            ? "  ✓ Non-root user configured"
            : "  ✗ Running as root — add USER directive");
        // HEALTHCHECK
        checks.push(content.includes("HEALTHCHECK")
            ? "  ✓ Healthcheck defined"
            : "  ⚠ No HEALTHCHECK — container health may not be monitored");
        // No ADD (use COPY instead)
        checks.push(!content.includes("ADD ")
            ? "  ✓ Uses COPY (no ADD)"
            : "  ⚠ Uses ADD — prefer COPY to avoid auto-extraction vulnerabilities");
        // No secrets in ENV
        const envLines = content.match(/^ENV\s+.+$/gm) || [];
        const hasSecretEnv = envLines.some((l) => /(?:PASSWORD|SECRET|TOKEN|API_KEY)/i.test(l));
        checks.push(!hasSecretEnv
            ? "  ✓ No secret-like values in ENV directives"
            : "  ✗ Possible secrets in ENV directives — inject at runtime");
        // Alpine base (smaller attack surface)
        checks.push(content.includes("alpine")
            ? "  ✓ Uses Alpine base image (smaller attack surface)"
            : "  ⚠ Not using Alpine — consider a minimal base image");
        // Multi-stage build
        checks.push(content.includes("AS ")
            ? "  ✓ Multi-stage build (reduces final image size)"
            : "  ⚠ No multi-stage build — dev dependencies may leak into production");
        // npm ci (not npm install)
        checks.push(content.includes("npm ci")
            ? "  ✓ Uses npm ci (deterministic, no unplanned upgrades)"
            : "  ⚠ Uses npm install — prefer npm ci for reproducible builds");
        // npm prune
        checks.push(content.includes("npm prune")
            ? "  ✓ Prunes dev dependencies in production stage"
            : "  ⚠ No npm prune — devDependencies may bloat the image");
    }
    catch {
        checks.push("  No Dockerfile found.");
    }
    // Try real Trivy if installed
    const trivyRes = await runShell("trivy config --format json Dockerfile", paths_1.paths.rootDir);
    let rawFindings = [];
    if (trivyRes.code === 0 && trivyRes.stdout.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(trivyRes.stdout);
            rawFindings = parsed.Results || [];
            checks.push("", "  [INFO] Real Trivy scan executed successfully.");
        }
        catch {
            // Ignore parse error
        }
    }
    else {
        rawFindings = [...checks]; // Pass baseline checks as raw findings
    }
    const analysis = await (0, llm_1.aiAnalyzeScanResults)(trivyRes.code === 0 ? "Trivy" : "Baseline Docker Scanner", rawFindings, "Review Docker security findings, prioritize risks, and suggest exact Dockerfile remediations.");
    return [
        ...checks,
        "",
        "── AI Security Analysis ──",
        ...analysis.map(line => `  ${line}`)
    ];
}
async function checkTerraformSecurity() {
    const tfDir = path_1.default.join(paths_1.paths.rootDir, "terraform");
    const checks = ["Terraform Security Assessment:"];
    try {
        const content = await fs_1.promises.readFile(path_1.default.join(tfDir, "main.tf"), "utf8");
        // State encryption
        checks.push(content.includes('encrypt')
            ? "  ✓ State encryption enabled"
            : "  ⚠ State encryption not configured — add encrypt = true");
        // Remote backend
        checks.push(content.includes('backend "s3"') || content.includes('backend "gcs"') || content.includes('backend "azurerm"')
            ? "  ✓ Remote backend configured"
            : "  ⚠ Using local state — configure remote backend for team collaboration");
        // State locking
        checks.push(content.includes("dynamodb_table")
            ? "  ✓ State locking enabled (DynamoDB)"
            : "  ⚠ No state locking — risk of concurrent modifications");
        // ECR scan on push
        checks.push(content.includes("scan_on_push")
            ? "  ✓ Container image scanning enabled on push"
            : "  ⚠ ECR scan_on_push not found");
        // KMS encryption
        checks.push(content.includes("KMS") || content.includes("kms")
            ? "  ✓ KMS encryption configured"
            : "  ⚠ No KMS encryption found");
        // IAM roles (not hardcoded access keys)
        checks.push(content.includes("iam_role") && !content.includes("access_key")
            ? "  ✓ Uses IAM roles (no hardcoded access keys)"
            : content.includes("access_key")
                ? "  ✗ Hardcoded access keys found — use IAM roles"
                : "  ⚠ No IAM configuration found");
    }
    catch {
        checks.push("  No terraform/main.tf found.");
    }
    // Try real Checkov if installed
    const checkovRes = await runShell("checkov -f terraform/main.tf -o json", paths_1.paths.rootDir);
    let rawFindings = [];
    if (checkovRes.stdout.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(checkovRes.stdout);
            rawFindings = parsed.results?.failed_checks || [];
            checks.push("", "  [INFO] Real Checkov scan executed successfully.");
        }
        catch {
            // Ignore parse error
        }
    }
    else {
        rawFindings = [...checks]; // Pass baseline checks as raw findings
    }
    const analysis = await (0, llm_1.aiAnalyzeScanResults)(checkovRes.stdout.trim().startsWith("{") ? "Checkov" : "Baseline Terraform Scanner", rawFindings, "Review IaC misconfigurations, identify false positives, and suggest HCL snippet fixes.");
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
async function getSecurityDashboard() {
    const lines = ["Security Dashboard:"];
    // Code scan summary
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
    lines.push("");
    lines.push("Code Scan:");
    lines.push(`  Files scanned: ${report.scannedFiles}`);
    lines.push(`  Errors: ${report.errors} | Warnings: ${report.warnings} | Info: ${report.infos}`);
    // Secrets
    const secretRules = ["SEC-001", "SEC-002", "SEC-003", "SEC-007", "SEC-008", "SEC-009"];
    const secrets = report.findings.filter((f) => secretRules.includes(f.ruleId));
    lines.push("");
    lines.push("Secrets:");
    lines.push(secrets.length === 0
        ? "  ✓ No hardcoded secrets"
        : `  ✗ ${secrets.length} hardcoded secret(s) found`);
    // Vault
    const provider = (0, vault_1.createSecretProvider)();
    lines.push("");
    lines.push("Vault:");
    lines.push(`  Provider: ${provider.providerName}`);
    lines.push(`  Enabled: ${process.env.VAULT_ENABLED?.trim().toLowerCase() === "true" ? "yes" : "no"}`);
    // Compliance
    const branch = await (0, git_1.getCurrentBranch)();
    const branchOk = (0, git_policy_1.validateBranchName)(branch).length === 0;
    lines.push("");
    lines.push("Compliance:");
    lines.push(`  Branch policy: ${branchOk ? "✓" : "✗"}`);
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".github", "CODEOWNERS"));
        lines.push("  CODEOWNERS: ✓");
    }
    catch {
        lines.push("  CODEOWNERS: ✗");
    }
    // Uncommitted
    const changed = await (0, git_1.getChangedFiles)();
    lines.push(`  Clean workspace: ${changed.length === 0 ? "✓" : `✗ (${changed.length} files)`}`);
    // Overall score
    const issues = report.errors + secrets.length + (branchOk ? 0 : 1) + (changed.length > 0 ? 1 : 0);
    lines.push("");
    lines.push(issues === 0
        ? "✓ Overall: PASS — no critical security issues."
        : `⚠ Overall: ${issues} issue(s) to address.`);
    return lines;
}
async function getSecurityPosture() {
    const lines = ["Security Posture Summary:"];
    // Quick counts
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.repoDir);
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
