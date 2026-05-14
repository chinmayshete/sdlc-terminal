"use strict";
/**
 * Code Scanner — NFR Static Analysis
 *
 * Scans source files for hardcoded secrets, passwords, API keys,
 * connection strings, and other security violations.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCodeScan = runCodeScan;
exports.formatScanReport = formatScanReport;
exports.saveScanLog = saveScanLog;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const llm_1 = require("./llm");
/**
 * @deprecated These hardcoded regex rules are retained as a deterministic
 * baseline / fallback scanner. In a production environment, use actual
 * tools like Semgrep or Gitleaks for primary scanning, followed by AI analysis.
 */
const SCAN_RULES = [
    {
        id: "SEC-001",
        description: "Hardcoded password detected",
        severity: "ERROR",
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{3,}["']/gi,
        remediation: "Move password to Vault. Use: secretProvider.getSecret('DB_PASSWORD')",
    },
    {
        id: "SEC-002",
        description: "Hardcoded API key detected",
        severity: "ERROR",
        pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/gi,
        remediation: "Move API key to Vault or environment variable.",
    },
    {
        id: "SEC-003",
        description: "Hardcoded connection string detected",
        severity: "ERROR",
        pattern: /(?:mongodb|postgres|mysql|mssql|redis):\/\/[^\s"']+/gi,
        remediation: "Use parameterized config from config-manager.ts.",
    },
    {
        id: "SEC-004",
        description: "Hardcoded IP address (non-localhost)",
        severity: "WARNING",
        pattern: /\b(?!127\.0\.0\.1|0\.0\.0\.0)(?:\d{1,3}\.){3}\d{1,3}\b/g,
        remediation: "Move IP address to config/environments/*.json.",
    },
    {
        id: "SEC-005",
        description: "Inline process.env usage without config abstraction",
        severity: "INFO",
        pattern: /process\.env\.[A-Z_]{3,}/g,
        remediation: "Use loadConfig/getConfig instead of direct process.env access.",
    },
    {
        id: "SEC-006",
        description: "Hardcoded external URL",
        severity: "INFO",
        pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        remediation: "Move external URLs to config/environments/*.json.",
    },
    {
        id: "SEC-007",
        description: "Private key material detected",
        severity: "ERROR",
        pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+)?PRIVATE\s+KEY-----/gi,
        remediation: "NEVER store private keys in source code. Use Vault.",
    },
    {
        id: "SEC-008",
        description: "AWS credential pattern detected",
        severity: "ERROR",
        pattern: /AKIA[0-9A-Z]{16}/g,
        remediation: "Use IAM roles or Vault for AWS credentials.",
    },
    {
        id: "SEC-009",
        description: "Bearer token pattern detected",
        severity: "ERROR",
        pattern: /["']Bearer\s+[A-Za-z0-9\-._~+/]+=*["']/g,
        remediation: "Move bearer tokens to Vault or environment variables.",
    },
    {
        id: "SEC-010",
        description: "Base64-encoded secret pattern",
        severity: "WARNING",
        pattern: /(?:secret|token|credential)\s*[:=]\s*["'][A-Za-z0-9+/]{20,}={0,2}["']/gi,
        remediation: "Verify this is not a hardcoded secret. Move to Vault.",
    },
];
const SCANNABLE_EXT = [".ts", ".js", ".json", ".env", ".yaml", ".yml"];
const SKIP_DIRS = [
    "node_modules",
    ".git",
    "dist",
    ".sdlc",
    "coverage",
    "tests",
];
const SKIP_FILES_FOR_RULES = {
    "SEC-005": [
        "env.ts",
        "vault.ts",
        "config-manager.ts",
        "config-schema.ts",
        "server.ts",
    ],
    "SEC-006": [
        "base.json",
        "dev.json",
        "staging.json",
        "prod.json",
        "Jenkinsfile",
        "package.json",
        "package-lock.json",
    ],
};
async function runCodeScan(scanDir, filesToScan) {
    const files = filesToScan || (await collectFiles(scanDir));
    const findings = [];
    for (const filePath of files) {
        const content = await fs_1.promises.readFile(filePath, "utf8");
        // PERFORM AI VULNERABILITY SCAN (REPLACES REGEX RULES)
        const aiFindings = await (0, llm_1.performAiVulnerabilityScan)(filePath, content);
        const lines = content.split(/\r?\n/);
        for (const f of aiFindings) {
            let correctedLineNumber = f.lineNumber || 0;
            // AI often miscounts line numbers. We verify and auto-correct here.
            if (f.matchedContent && f.matchedContent !== "N/A") {
                const expectedLine = lines[correctedLineNumber - 1] || "";
                if (!expectedLine.includes(f.matchedContent)) {
                    // The reported line is wrong. Search for the actual content in the file.
                    const actualIndex = lines.findIndex((l) => l.includes(f.matchedContent));
                    if (actualIndex !== -1) {
                        correctedLineNumber = actualIndex + 1;
                    }
                }
            }
            findings.push({
                ruleId: f.ruleId || "AI-GENERIC",
                category: f.category || "General Security",
                description: f.description || "No description provided",
                severity: f.severity || "INFO",
                filePath: filePath.replace(/\\/g, "/"),
                lineNumber: correctedLineNumber,
                matchedContent: f.matchedContent || "N/A",
                remediation: f.remediation || "Review findings with a security expert.",
            });
        }
    }
    return {
        scannedFiles: files.length,
        totalFindings: findings.length,
        errors: findings.filter((f) => f.severity === "ERROR").length,
        warnings: findings.filter((f) => f.severity === "WARNING").length,
        infos: findings.filter((f) => f.severity === "INFO").length,
        findings,
        scannedAt: new Date().toISOString(),
    };
}
function formatScanReport(report) {
    const lines = [
        chalk_1.default.bold.underline("Code Security Scan Results"),
        `Scanned: ${chalk_1.default.cyan(report.scannedFiles)} files | ${chalk_1.default.gray(report.scannedAt)}`,
        `Findings: ${chalk_1.default.bold(report.totalFindings)} total — ` +
            `${chalk_1.default.bold.red(report.errors + " ERROR")}, ` +
            `${chalk_1.default.bold.yellow(report.warnings + " WARNING")}, ` +
            `${chalk_1.default.bold.cyan(report.infos + " INFO")}`,
        "",
    ];
    if (report.findings.length === 0) {
        lines.push(chalk_1.default.bold.green("✓ No security violations detected."));
        return lines;
    }
    // Get unique categories and sort them
    const categories = Array.from(new Set(report.findings.map((f) => f.category))).sort();
    for (const cat of categories) {
        const items = report.findings.filter((f) => f.category === cat);
        if (items.length === 0)
            continue;
        lines.push(chalk_1.default.bold.blue(`── ${cat.toUpperCase()} ${"─".repeat(Math.max(0, 44 - cat.length))}`));
        for (const f of items) {
            const shortPath = f.filePath.split("/").slice(-3).join("/");
            let severityIcon = "○";
            let severityColor = chalk_1.default.white;
            if (f.severity === "ERROR") {
                severityIcon = "✗";
                severityColor = chalk_1.default.bold.red;
            }
            else if (f.severity === "WARNING") {
                severityIcon = "⚠";
                severityColor = chalk_1.default.bold.yellow;
            }
            else if (f.severity === "INFO") {
                severityIcon = "ℹ";
                severityColor = chalk_1.default.bold.cyan;
            }
            lines.push(`  [${chalk_1.default.gray(f.ruleId)}] ${severityColor(severityIcon)} ${severityColor(f.description)}`);
            lines.push(`    File: ${chalk_1.default.cyan(shortPath)}:${chalk_1.default.yellow(f.lineNumber)}`);
            lines.push(`    Match: ${chalk_1.default.red(f.matchedContent)}`);
            lines.push(`    Fix: ${chalk_1.default.green(f.remediation)}`);
            lines.push("");
        }
    }
    lines.push(chalk_1.default.italic.gray("Remediation: Address findings based on severity and category risk."));
    return lines;
}
async function saveScanLog(report) {
    const logDir = path_1.default.join(process.cwd(), ".sdlc", "logs");
    try {
        await fs_1.promises.mkdir(logDir, { recursive: true });
        const now = new Date();
        const date = now.toISOString().split("T")[0].replace(/-/g, "");
        const time = now.toTimeString().split(" ")[0].replace(/:/g, "");
        const logFile = path_1.default.join(logDir, `nexus-security-report_${date}_${time}.json`);
        await fs_1.promises.writeFile(logFile, JSON.stringify(report, null, 2));
        return logFile;
    }
    catch (err) {
        console.error("Failed to save scan log:", err);
        return "";
    }
}
function redactMatch(content) {
    if (content.length <= 10)
        return content.slice(0, 3) + "***";
    return content.slice(0, 4) + "****" + content.slice(-2);
}
async function collectFiles(dir) {
    const files = [];
    try {
        const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.includes(entry.name))
                    files.push(...(await collectFiles(fullPath)));
                continue;
            }
            const ext = path_1.default.extname(entry.name).toLowerCase();
            if (SCANNABLE_EXT.includes(ext) ||
                entry.name === ".env" ||
                entry.name === ".env.example") {
                if (!entry.name.includes("package-lock.json")) {
                    files.push(fullPath);
                }
            }
        }
    }
    catch {
        /* skip unreadable dirs */
    }
    return files;
}
