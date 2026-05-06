/**
 * Code Scanner — NFR Static Analysis
 *
 * Scans source files for hardcoded secrets, passwords, API keys,
 * connection strings, and other security violations.
 */

import { promises as fs } from "fs";
import path from "path";

export interface ScanFinding {
  ruleId: string;
  description: string;
  severity: "ERROR" | "WARNING" | "INFO";
  filePath: string;
  lineNumber: number;
  matchedContent: string;
  remediation: string;
}

export interface ScanReport {
  scannedFiles: number;
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  findings: ScanFinding[];
  scannedAt: string;
}

interface ScanRule {
  id: string;
  description: string;
  severity: "ERROR" | "WARNING" | "INFO";
  pattern: RegExp;
  remediation: string;
}

const SCAN_RULES: ScanRule[] = [
  {
    id: "SEC-001",
    description: "Hardcoded password detected",
    severity: "ERROR",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{3,}["']/gi,
    remediation:
      "Move password to Vault. Use: secretProvider.getSecret('DB_PASSWORD')",
  },
  {
    id: "SEC-002",
    description: "Hardcoded API key detected",
    severity: "ERROR",
    pattern:
      /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/gi,
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
    remediation:
      "Use loadConfig/getConfig instead of direct process.env access.",
  },
  {
    id: "SEC-006",
    description: "Hardcoded external URL",
    severity: "INFO",
    pattern:
      /https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
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
    pattern:
      /(?:secret|token|credential)\s*[:=]\s*["'][A-Za-z0-9+/]{20,}={0,2}["']/gi,
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
const SKIP_FILES_FOR_RULES: Record<string, string[]> = {
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

export async function runCodeScan(scanDir: string): Promise<ScanReport> {
  const files = await collectFiles(scanDir);
  const findings: ScanFinding[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const fileName = path.basename(filePath);

    for (const rule of SCAN_RULES) {
      const skipFiles = SKIP_FILES_FOR_RULES[rule.id];
      if (skipFiles && skipFiles.includes(fileName)) continue;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

        const matches = line.matchAll(rule.pattern);
        for (const match of matches) {
          findings.push({
            ruleId: rule.id,
            description: rule.description,
            severity: rule.severity,
            filePath: filePath.replace(/\\/g, "/"),
            lineNumber: i + 1,
            matchedContent: redactMatch(match[0]),
            remediation: rule.remediation,
          });
        }
      }
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

export function formatScanReport(report: ScanReport): string[] {
  const lines: string[] = [
    "Code Security Scan Results",
    `Scanned: ${report.scannedFiles} files | ${report.scannedAt}`,
    `Findings: ${report.totalFindings} total — ${report.errors} ERROR, ${report.warnings} WARNING, ${report.infos} INFO`,
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("✓ No security violations detected.");
    return lines;
  }

  const groups: [string, ScanFinding[]][] = [
    ["ERRORS", report.findings.filter((f) => f.severity === "ERROR")],
    ["WARNINGS", report.findings.filter((f) => f.severity === "WARNING")],
    ["INFO", report.findings.filter((f) => f.severity === "INFO")],
  ];

  for (const [label, items] of groups) {
    if (items.length === 0) continue;
    lines.push(`── ${label} ${"─".repeat(44 - label.length)}`);
    for (const f of items) {
      const shortPath = f.filePath.split("/").slice(-3).join("/");
      lines.push(`  [${f.ruleId}] ${f.description}`);
      lines.push(`    File: ${shortPath}:${f.lineNumber}`);
      lines.push(`    Match: ${f.matchedContent}`);
      lines.push(`    Fix: ${f.remediation}`);
      lines.push("");
    }
  }

  lines.push("Remediation: address ERROR findings before merge.");
  return lines;
}

function redactMatch(content: string): string {
  if (content.length <= 10) return content.slice(0, 3) + "***";
  return content.slice(0, 4) + "****" + content.slice(-2);
}

async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.includes(entry.name))
          files.push(...(await collectFiles(fullPath)));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (
        SCANNABLE_EXT.includes(ext) ||
        entry.name === ".env" ||
        entry.name === ".env.example"
      ) {
        if (!entry.name.includes("package-lock.json")) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    /* skip unreadable dirs */
  }
  return files;
}
