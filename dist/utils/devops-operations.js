"use strict";
/**
 * DevOps Operations — Comprehensive DevOps Command Wrappers
 *
 * Covers CI/CD, security, Docker, Terraform, environment config,
 * dependency auditing, deployment lifecycle, and health reporting.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHotfixBranch = exports.createReleaseBranch = void 0;
exports.getCicdOverview = getCicdOverview;
exports.validateJenkins = validateJenkins;
exports.getJenkinsStages = getJenkinsStages;
exports.getJenkinsParams = getJenkinsParams;
exports.getGitHubActionsInfo = getGitHubActionsInfo;
exports.validateGitHubActions = validateGitHubActions;
exports.getPipelineHealth = getPipelineHealth;
exports.runFullSecurityScan = runFullSecurityScan;
exports.runSecurityScanErrorsOnly = runSecurityScanErrorsOnly;
exports.checkForSecrets = checkForSecrets;
exports.getDockerfileInfo = getDockerfileInfo;
exports.getDockerStages = getDockerStages;
exports.validateDockerfile = validateDockerfile;
exports.getTerraformInfo = getTerraformInfo;
exports.listInfraResources = listInfraResources;
exports.showEnvironmentConfig = showEnvironmentConfig;
exports.compareEnvironments = compareEnvironments;
exports.validateEnvironmentFiles = validateEnvironmentFiles;
exports.auditDependencies = auditDependencies;
exports.checkOutdatedDeps = checkOutdatedDeps;
exports.checkLicenses = checkLicenses;
exports.getDeploymentStatus = getDeploymentStatus;
exports.preDeployCheck = preDeployCheck;
exports.getSystemHealth = getSystemHealth;
exports.getFullDevOpsSummary = getFullDevOpsSummary;
exports.runPrReadinessCheck = runPrReadinessCheck;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const paths_1 = require("../config/paths");
const cicd_1 = require("./cicd");
const code_scanner_1 = require("./code-scanner");
const llm_1 = require("./llm");
const git_1 = require("./git");
Object.defineProperty(exports, "createReleaseBranch", { enumerable: true, get: function () { return git_1.createReleaseBranch; } });
Object.defineProperty(exports, "createHotfixBranch", { enumerable: true, get: function () { return git_1.createHotfixBranch; } });
const git_policy_1 = require("./git-policy");
const config_manager_1 = require("../config/config-manager");
// ---------------------------------------------------------------------------
// A — CI/CD Pipeline
// ---------------------------------------------------------------------------
async function getCicdOverview() {
    const info = await (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    return (0, cicd_1.formatPipelineInfo)(info);
}
async function validateJenkins() {
    return (0, cicd_1.validateJenkinsfile)(paths_1.paths.rootDir);
}
async function getJenkinsStages() {
    const info = await (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    const lines = ["Jenkins Pipeline Stages:"];
    for (const [i, stage] of info.stages.entries()) {
        const icon = stage.status === "passed" ? "✓" : stage.status === "failed" ? "✗" : "○";
        lines.push(`  ${i + 1}. [${icon}] ${stage.name} — ${stage.description}`);
    }
    return lines;
}
async function getJenkinsParams() {
    const info = await (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    return ["Pipeline Parameters:", ...info.parameters.map((p) => `  • ${p}`)];
}
async function getGitHubActionsInfo() {
    const workflowDir = path_1.default.join(paths_1.paths.rootDir, ".github", "workflows");
    try {
        const entries = await fs_1.promises.readdir(workflowDir);
        const ymls = entries.filter((e) => e.endsWith(".yml") || e.endsWith(".yaml"));
        if (ymls.length === 0)
            return ["No GitHub Actions workflows found."];
        const lines = ["GitHub Actions Workflows:"];
        for (const file of ymls) {
            const content = await fs_1.promises.readFile(path_1.default.join(workflowDir, file), "utf8");
            const nameMatch = content.match(/^name:\s*(.+)$/m);
            const name = nameMatch ? nameMatch[1].trim() : file;
            const triggers = content.match(/^on:\s*$/m)
                ? "complex trigger"
                : (content.match(/^on:\s+(.+)$/m)?.[1] ?? "unknown");
            lines.push(`  • ${file}: ${name} (trigger: ${triggers})`);
        }
        return lines;
    }
    catch {
        return ["No .github/workflows directory found."];
    }
}
async function validateGitHubActions() {
    const workflowDir = path_1.default.join(paths_1.paths.rootDir, ".github", "workflows");
    const issues = [];
    try {
        const entries = await fs_1.promises.readdir(workflowDir);
        const ymls = entries.filter((e) => e.endsWith(".yml") || e.endsWith(".yaml"));
        for (const file of ymls) {
            const content = await fs_1.promises.readFile(path_1.default.join(workflowDir, file), "utf8");
            if (!content.includes("name:"))
                issues.push(`${file}: missing 'name' field`);
            if (!content.includes("on:"))
                issues.push(`${file}: missing 'on' trigger`);
            if (!content.includes("jobs:"))
                issues.push(`${file}: missing 'jobs' block`);
            if (!content.includes("runs-on:"))
                issues.push(`${file}: missing 'runs-on' in jobs`);
        }
        if (issues.length === 0)
            issues.push("✓ All workflows pass basic checks.");
        return ["GitHub Actions Validation:", ...issues.map((i) => `  ${i}`)];
    }
    catch {
        return ["No .github/workflows directory found."];
    }
}
async function getPipelineHealth() {
    const jenkins = await validateJenkins();
    const actions = await validateGitHubActions();
    return [
        "── Pipeline Health ──",
        "",
        "Jenkins:",
        ...jenkins.map((l) => `  ${l}`),
        "",
        "GitHub Actions:",
        ...actions.map((l) => `  ${l}`),
    ];
}
// ---------------------------------------------------------------------------
// B — Security & Code Quality
// ---------------------------------------------------------------------------
async function runFullSecurityScan() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    return (0, code_scanner_1.formatScanReport)(report);
}
async function runSecurityScanErrorsOnly() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    if (errors.length === 0)
        return ["✓ No ERROR-level findings."];
    const lines = [`${errors.length} ERROR-level finding(s):`];
    for (const f of errors) {
        const shortPath = f.filePath.split("/").slice(-3).join("/");
        lines.push(`  [${f.ruleId}] ${f.description}`);
        lines.push(`    File: ${shortPath}:${f.lineNumber}`);
        lines.push(`    Fix: ${f.remediation}`);
    }
    return lines;
}
async function checkForSecrets() {
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    const secrets = report.findings.filter((f) => ["SEC-001", "SEC-002", "SEC-007", "SEC-008", "SEC-009"].includes(f.ruleId));
    if (secrets.length === 0)
        return ["✓ No hardcoded secrets detected."];
    const lines = [`⚠ ${secrets.length} secret(s) found:`];
    for (const f of secrets) {
        lines.push(`  [${f.ruleId}] ${f.description} — ${f.filePath}:${f.lineNumber}`);
    }
    return lines;
}
// ---------------------------------------------------------------------------
// C — Docker
// ---------------------------------------------------------------------------
async function getDockerfileInfo() {
    const dockerfilePath = path_1.default.join(paths_1.paths.rootDir, "Dockerfile");
    try {
        const content = await fs_1.promises.readFile(dockerfilePath, "utf8");
        const lines = ["Dockerfile Analysis:"];
        const froms = content.match(/^FROM\s+.+$/gm) || [];
        lines.push(`  Stages: ${froms.length}`);
        for (const [i, f] of froms.entries())
            lines.push(`    ${i + 1}. ${f.trim()}`);
        const expose = content.match(/^EXPOSE\s+(\d+)/m);
        if (expose)
            lines.push(`  Port: ${expose[1]}`);
        const user = content.match(/^USER\s+(\S+)/m);
        if (user)
            lines.push(`  User: ${user[1]} (non-root ✓)`);
        const healthcheck = content.includes("HEALTHCHECK");
        lines.push(`  Healthcheck: ${healthcheck ? "✓ present" : "✗ missing"}`);
        const entrypoint = content.match(/^ENTRYPOINT\s+(.+)$/m);
        if (entrypoint)
            lines.push(`  Entrypoint: ${entrypoint[1].trim()}`);
        return lines;
    }
    catch {
        return ["No Dockerfile found at project root."];
    }
}
async function getDockerStages() {
    const dockerfilePath = path_1.default.join(paths_1.paths.rootDir, "Dockerfile");
    try {
        const content = await fs_1.promises.readFile(dockerfilePath, "utf8");
        const froms = content.match(/^FROM\s+.+$/gm) || [];
        if (froms.length === 0)
            return ["No FROM statements found."];
        return [
            "Docker Build Stages:",
            ...froms.map((f, i) => `  ${i + 1}. ${f.trim()}`),
        ];
    }
    catch {
        return ["No Dockerfile found."];
    }
}
async function validateDockerfile() {
    const dockerfilePath = path_1.default.join(paths_1.paths.rootDir, "Dockerfile");
    const checks = ["Dockerfile Best-Practice Checks:"];
    try {
        const content = await fs_1.promises.readFile(dockerfilePath, "utf8");
        checks.push(content.includes("HEALTHCHECK")
            ? "  ✓ Healthcheck defined"
            : "  ✗ Missing HEALTHCHECK");
        checks.push(content.match(/^USER\s+(?!root)/m)
            ? "  ✓ Non-root user configured"
            : "  ✗ Running as root (security risk)");
        checks.push(content.includes("npm ci")
            ? "  ✓ Uses npm ci (deterministic installs)"
            : "  ⚠ Consider using npm ci instead of npm install");
        checks.push(content.includes("AS ")
            ? "  ✓ Multi-stage build"
            : "  ⚠ Single-stage build (larger image)");
        checks.push(content.includes(".dockerignore") || true
            ? "  ✓ Check .dockerignore exists separately"
            : "  ⚠ No .dockerignore reference");
        checks.push(!content.includes("ADD ")
            ? "  ✓ Uses COPY instead of ADD"
            : "  ⚠ Uses ADD — prefer COPY unless extracting archives");
        return checks;
    }
    catch {
        return ["No Dockerfile found at project root."];
    }
}
// ---------------------------------------------------------------------------
// D — Terraform / IaC
// ---------------------------------------------------------------------------
async function getTerraformInfo() {
    const tfDir = path_1.default.join(paths_1.paths.rootDir, "terraform");
    try {
        const content = await fs_1.promises.readFile(path_1.default.join(tfDir, "main.tf"), "utf8");
        const lines = ["Terraform Configuration:"];
        const providerMatch = content.match(/provider\s+"(\w+)"/);
        if (providerMatch)
            lines.push(`  Provider: ${providerMatch[1]}`);
        const backendMatch = content.match(/backend\s+"(\w+)"/);
        if (backendMatch)
            lines.push(`  Backend: ${backendMatch[1]}`);
        const versionMatch = content.match(/required_version\s*=\s*"(.+)"/);
        if (versionMatch)
            lines.push(`  Required version: ${versionMatch[1]}`);
        const resources = content.match(/resource\s+"(\w+)"\s+"(\w+)"/g) || [];
        if (resources.length > 0) {
            lines.push(`  Resources (${resources.length}):`);
            for (const r of resources) {
                const m = r.match(/resource\s+"(\w+)"\s+"(\w+)"/);
                if (m)
                    lines.push(`    • ${m[1]}.${m[2]}`);
            }
        }
        const outputs = content.match(/output\s+"(\w+)"/g) || [];
        if (outputs.length > 0) {
            lines.push(`  Outputs:`);
            for (const o of outputs) {
                const m = o.match(/output\s+"(\w+)"/);
                if (m)
                    lines.push(`    • ${m[1]}`);
            }
        }
        return lines;
    }
    catch {
        return ["No terraform/main.tf found."];
    }
}
async function listInfraResources() {
    const tfDir = path_1.default.join(paths_1.paths.rootDir, "terraform");
    try {
        const entries = await fs_1.promises.readdir(tfDir);
        const tfFiles = entries.filter((e) => e.endsWith(".tf"));
        const resources = [];
        for (const file of tfFiles) {
            const content = await fs_1.promises.readFile(path_1.default.join(tfDir, file), "utf8");
            const matches = content.match(/resource\s+"(\w+)"\s+"(\w+)"/g) || [];
            for (const m of matches) {
                const parts = m.match(/resource\s+"(\w+)"\s+"(\w+)"/);
                if (parts)
                    resources.push(`${parts[1]}.${parts[2]} (${file})`);
            }
        }
        if (resources.length === 0)
            return ["No Terraform resources defined."];
        return [
            `Infrastructure Resources (${resources.length}):`,
            ...resources.map((r) => `  • ${r}`),
        ];
    }
    catch {
        return ["No terraform directory found."];
    }
}
// ---------------------------------------------------------------------------
// E — Environment & Configuration
// ---------------------------------------------------------------------------
async function showEnvironmentConfig() {
    try {
        const config = (0, config_manager_1.getConfig)();
        return (0, config_manager_1.getConfigSummary)(config);
    }
    catch {
        return [
            "Configuration not yet loaded. Ensure loadConfig() was called during startup.",
        ];
    }
}
async function compareEnvironments() {
    const envDir = path_1.default.join(paths_1.paths.rootDir, "config", "environments");
    const lines = ["Environment Config Comparison:"];
    const envNames = ["dev", "staging", "prod"];
    for (const envName of envNames) {
        try {
            const content = await fs_1.promises.readFile(path_1.default.join(envDir, `${envName}.json`), "utf8");
            const config = JSON.parse(content);
            const keys = Object.keys(config);
            lines.push(`  ${envName}.json: ${keys.length} keys — ${keys.join(", ")}`);
        }
        catch {
            lines.push(`  ${envName}.json: not found`);
        }
    }
    return lines;
}
async function validateEnvironmentFiles() {
    const envDir = path_1.default.join(paths_1.paths.rootDir, "config", "environments");
    const checks = ["Environment File Validation:"];
    // Check base.json
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, "config", "base.json"));
        checks.push("  ✓ config/base.json exists");
    }
    catch {
        checks.push("  ✗ config/base.json missing");
    }
    for (const envName of ["dev", "staging", "prod"]) {
        try {
            const content = await fs_1.promises.readFile(path_1.default.join(envDir, `${envName}.json`), "utf8");
            JSON.parse(content);
            checks.push(`  ✓ ${envName}.json — valid JSON`);
        }
        catch (error) {
            const msg = error instanceof SyntaxError ? "invalid JSON" : "file not found";
            checks.push(`  ✗ ${envName}.json — ${msg}`);
        }
    }
    // Check .env and .env.example
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".env"));
        checks.push("  ✓ .env file exists");
    }
    catch {
        checks.push("  ⚠ .env file missing (copy from .env.example)");
    }
    try {
        await fs_1.promises.access(path_1.default.join(paths_1.paths.rootDir, ".env.example"));
        checks.push("  ✓ .env.example exists");
    }
    catch {
        checks.push("  ⚠ .env.example missing");
    }
    return checks;
}
// ---------------------------------------------------------------------------
// F — Dependencies & Audit
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
async function auditDependencies() {
    const result = await runShell("npm audit --json 2>&1", paths_1.paths.rootDir);
    try {
        const data = JSON.parse(result.stdout);
        const vulns = data.metadata?.vulnerabilities ?? {};
        const total = data.metadata?.totalDependencies ?? 0;
        const lines = [
            `Dependency Audit (${total} packages):`,
            `  Critical: ${vulns.critical ?? 0}`,
            `  High:     ${vulns.high ?? 0}`,
            `  Moderate: ${vulns.moderate ?? 0}`,
            `  Low:      ${vulns.low ?? 0}`,
        ];
        const sum = (vulns.critical ?? 0) + (vulns.high ?? 0);
        lines.push(sum === 0
            ? "  ✓ No critical or high vulnerabilities."
            : `  ⚠ ${sum} critical/high vulnerability(ies) — run 'npm audit fix'.`);
        return lines;
    }
    catch {
        // Fallback: non-JSON output
        const lines = result.stdout.split(/\r?\n/).slice(0, 15);
        return ["Dependency Audit:", ...lines.map((l) => `  ${l}`)];
    }
}
async function checkOutdatedDeps() {
    const result = await runShell("npm outdated --json 2>&1", paths_1.paths.rootDir);
    try {
        const data = JSON.parse(result.stdout || "{}");
        const keys = Object.keys(data);
        if (keys.length === 0)
            return ["✓ All dependencies are up to date."];
        const lines = [`Outdated Packages (${keys.length}):`];
        for (const pkg of keys.slice(0, 20)) {
            const info = data[pkg];
            lines.push(`  ${pkg}: ${info.current ?? "?"} → ${info.wanted ?? "?"} (latest: ${info.latest ?? "?"})`);
        }
        if (keys.length > 20)
            lines.push(`  ... and ${keys.length - 20} more`);
        return lines;
    }
    catch {
        return ["Could not parse npm outdated output."];
    }
}
async function checkLicenses() {
    const pkgPath = path_1.default.join(paths_1.paths.rootDir, "package.json");
    try {
        const content = await fs_1.promises.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(content);
        const lines = [`Project license: ${pkg.license ?? "not specified"}`];
        const deps = Object.keys(pkg.dependencies ?? {});
        lines.push(`Dependencies (${deps.length}):`);
        for (const dep of deps) {
            try {
                const depPkg = await fs_1.promises.readFile(path_1.default.join(paths_1.paths.rootDir, "node_modules", dep, "package.json"), "utf8");
                const depData = JSON.parse(depPkg);
                lines.push(`  ${dep}: ${depData.license ?? "unknown"}`);
            }
            catch {
                lines.push(`  ${dep}: license not readable`);
            }
        }
        return lines;
    }
    catch {
        return ["Could not read package.json."];
    }
}
// ---------------------------------------------------------------------------
// G — Deployment Lifecycle
// ---------------------------------------------------------------------------
async function getDeploymentStatus() {
    const branch = await (0, git_1.getCurrentBranch)();
    const changed = await (0, git_1.getChangedFiles)();
    try {
        const config = (0, config_manager_1.getConfig)();
        return [
            "Deployment Status:",
            `  Environment: ${config.appEnv}`,
            `  Current branch: ${branch}`,
            `  Changed files: ${changed.length}`,
            `  Mock mode: ${config.features.useMock ? "yes" : "no"}`,
            `  CI/CD integration: ${config.features.enableCicdIntegration ? "enabled" : "disabled"}`,
        ];
    }
    catch {
        return [
            "Deployment Status:",
            `  Current branch: ${branch}`,
            `  Changed files: ${changed.length}`,
        ];
    }
}
async function preDeployCheck(targetEnv) {
    const lines = [`Pre-Deploy Checklist for '${targetEnv}':`];
    // Branch check
    const branch = await (0, git_1.getCurrentBranch)();
    const isSafe = targetEnv === "prod"
        ? branch === "main"
        : ["develop", "main"].includes(branch) ||
            branch.startsWith("release/");
    lines.push(isSafe
        ? `  ✓ Branch '${branch}' is appropriate for ${targetEnv}`
        : `  ⚠ Branch '${branch}' — consider deploying from ${targetEnv === "prod" ? "main" : "develop/release"}`);
    // Changed files
    const changed = await (0, git_1.getChangedFiles)();
    lines.push(changed.length === 0
        ? "  ✓ No uncommitted changes"
        : `  ⚠ ${changed.length} uncommitted file(s) — commit before deploy`);
    // Security scan
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    lines.push(errors.length === 0
        ? "  ✓ No security errors"
        : `  ✗ ${errors.length} security ERROR(s) — fix before deploy`);
    // Config check
    try {
        const config = (0, config_manager_1.getConfig)();
        lines.push(`  ✓ Config loaded for ${config.appEnv}`);
    }
    catch {
        lines.push("  ⚠ Config not loaded");
    }
    // Jenkins check
    const jenkinsIssues = await (0, cicd_1.validateJenkinsfile)(paths_1.paths.rootDir);
    const hasIssues = !jenkinsIssues.some((i) => i.startsWith("✓"));
    lines.push(hasIssues
        ? `  ⚠ Jenkinsfile has issues: ${jenkinsIssues[0]}`
        : "  ✓ Jenkinsfile passes structural checks");
    return lines;
}
// ---------------------------------------------------------------------------
// H — Summary & Health
// ---------------------------------------------------------------------------
async function getSystemHealth() {
    const lines = ["System Health Dashboard:"];
    // AI health
    const ai = await (0, llm_1.checkAiHealth)();
    lines.push("");
    lines.push("AI Service:");
    lines.push(`  Mode: ${ai.mode}`);
    lines.push(`  Configured: ${ai.configured ? "yes" : "no"}`);
    lines.push(`  Reachable: ${ai.reachable ? "yes" : "no"}`);
    // Git health
    const branch = await (0, git_1.getCurrentBranch)();
    const changed = await (0, git_1.getChangedFiles)();
    lines.push("");
    lines.push("Git:");
    lines.push(`  Branch: ${branch}`);
    lines.push(`  Changed files: ${changed.length}`);
    // Config
    try {
        const config = (0, config_manager_1.getConfig)();
        lines.push("");
        lines.push("Configuration:");
        lines.push(`  Environment: ${config.appEnv}`);
        lines.push(`  Mock mode: ${config.features.useMock ? "on" : "off"}`);
        lines.push(`  Code scanning: ${config.features.enableCodeScanning ? "on" : "off"}`);
    }
    catch {
        lines.push("");
        lines.push("Configuration: not loaded");
    }
    // Pipeline
    const info = await (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    lines.push("");
    lines.push("Pipeline:");
    lines.push(`  Type: ${info.pipelineType}`);
    lines.push(`  Jenkinsfile: ${info.hasJenkinsfile ? "✓" : "✗"}`);
    lines.push(`  Stages: ${info.stages.length}`);
    return lines;
}
async function getFullDevOpsSummary() {
    const ai = await (0, llm_1.checkAiHealth)();
    const branch = await (0, git_1.getCurrentBranch)();
    const changed = await (0, git_1.getChangedFiles)();
    const info = await (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    return [
        "DevOps Summary:",
        `  AI: ${ai.mode} (${ai.configured ? "configured" : "not configured"})`,
        `  Branch: ${branch}`,
        `  Changed files: ${changed.length}`,
        `  Pipeline: ${info.pipelineType} (${info.hasJenkinsfile ? "Jenkinsfile ✓" : "Jenkinsfile ✗"})`,
        `  Stages: ${info.stages.length}`,
        "",
        "Available: cicd, scan, docker, terraform, env, deps, deploy, health, pr check",
    ];
}
async function runPrReadinessCheck() {
    const lines = ["PR Readiness Check:"];
    // Branch name
    const branch = await (0, git_1.getCurrentBranch)();
    const branchViolations = (0, git_policy_1.validateBranchName)(branch);
    lines.push(branchViolations.length === 0
        ? `  ✓ Branch '${branch}' follows naming convention`
        : `  ✗ Branch '${branch}': ${branchViolations[0].message}`);
    // Recent commit message
    const commits = await (0, git_1.listRecentCommits)(1);
    if (commits.length > 0 && !commits[0].startsWith("Unable")) {
        const msg = commits[0].split(" | ").pop() ?? "";
        const msgViolations = (0, git_policy_1.validateCommitMessage)(msg);
        const msgErrors = msgViolations.filter((v) => v.severity === "error");
        lines.push(msgErrors.length === 0
            ? `  ✓ Latest commit message follows convention`
            : `  ✗ Commit: ${msgErrors[0].message}`);
    }
    // Changed files
    const changed = await (0, git_1.getChangedFiles)();
    lines.push(changed.length === 0
        ? "  ✓ No uncommitted changes"
        : `  ⚠ ${changed.length} uncommitted file(s)`);
    // Security scan
    const report = await (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    lines.push(errors.length === 0
        ? "  ✓ No security errors"
        : `  ✗ ${errors.length} security ERROR(s)`);
    // Overall
    const allGood = branchViolations.length === 0 && errors.length === 0 && changed.length === 0;
    lines.push("");
    lines.push(allGood
        ? "✓ PR is ready for review."
        : "⚠ Address the issues above before creating a PR.");
    return lines;
}
