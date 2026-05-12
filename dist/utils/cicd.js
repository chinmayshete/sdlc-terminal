"use strict";
/**
 * CI/CD Pipeline Utilities
 *
 * Provides Jenkinsfile validation, pipeline stage introspection,
 * and deployment status display for the CLI.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPipelineInfo = getPipelineInfo;
exports.formatPipelineInfo = formatPipelineInfo;
exports.validateJenkinsfile = validateJenkinsfile;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const EXPECTED_STAGES = [
    {
        name: "Checkout",
        description: "SCM checkout with credentials",
        status: "pending",
    },
    {
        name: "Install Dependencies",
        description: "npm ci with locked deps",
        status: "pending",
    },
    {
        name: "Lint & Standards",
        description: "Code standards and format check",
        status: "pending",
    },
    {
        name: "Security Scan",
        description: "Hardcoded secret/config scanner",
        status: "pending",
    },
    {
        name: "Unit Test",
        description: "Jest test suite with JUnit report",
        status: "pending",
    },
    { name: "Build", description: "TypeScript compilation", status: "pending" },
    {
        name: "Deploy to Staging",
        description: "Parameterized staging deploy",
        status: "pending",
    },
    {
        name: "Deploy to Production",
        description: "Manual approval gate + prod deploy",
        status: "pending",
    },
];
/**
 * Read and parse the Jenkinsfile to extract pipeline information.
 */
async function getPipelineInfo(rootDir) {
    const jenkinsfilePath = path_1.default.join(rootDir, "Jenkinsfile");
    let hasJenkinsfile = false;
    try {
        await fs_1.promises.access(jenkinsfilePath);
        hasJenkinsfile = true;
    }
    catch {
        // Jenkinsfile not found
    }
    return {
        pipelineType: "Declarative Jenkins Pipeline",
        stages: EXPECTED_STAGES,
        hasJenkinsfile,
        parameters: [
            "DEPLOY_ENV (choice: dev/staging/prod)",
            "VERSION_TAG (string: release version)",
            "RUN_SECURITY_SCAN (boolean: default true)",
            "SKIP_TESTS (boolean: default false)",
        ],
        postActions: [
            "always: Archive test results, cleanup workspace",
            "success: Send success notification",
            "failure: Send failure alert to team",
        ],
    };
}
/**
 * Format pipeline info for terminal display.
 */
function formatPipelineInfo(info) {
    const lines = [
        `Pipeline: ${info.pipelineType}`,
        `Jenkinsfile: ${info.hasJenkinsfile ? "✓ Present" : "✗ Missing"}`,
        "",
        "Stages:",
    ];
    for (const [i, stage] of info.stages.entries()) {
        const icon = stage.status === "passed" ? "✓" : stage.status === "failed" ? "✗" : "○";
        lines.push(`  ${i + 1}. [${icon}] ${stage.name} — ${stage.description}`);
    }
    lines.push("");
    lines.push("Parameters:");
    for (const param of info.parameters) {
        lines.push(`  • ${param}`);
    }
    lines.push("");
    lines.push("Post-Build Actions:");
    for (const action of info.postActions) {
        lines.push(`  • ${action}`);
    }
    return lines;
}
/**
 * Validate Jenkinsfile structure (basic checks).
 */
async function validateJenkinsfile(rootDir) {
    const jenkinsfilePath = path_1.default.join(rootDir, "Jenkinsfile");
    const issues = [];
    try {
        const content = await fs_1.promises.readFile(jenkinsfilePath, "utf8");
        if (!content.includes("pipeline {")) {
            issues.push("Missing 'pipeline' block declaration.");
        }
        if (!content.includes("agent")) {
            issues.push("Missing 'agent' specification.");
        }
        if (!content.includes("stages {")) {
            issues.push("Missing 'stages' block.");
        }
        if (!content.includes("post {")) {
            issues.push("Missing 'post' block for build notifications.");
        }
        if (!content.includes("credentials(")) {
            issues.push("No credential bindings found. Use Jenkins Credentials for secrets.");
        }
        if (content.includes("password") && !content.includes("credentials(")) {
            issues.push("Possible hardcoded password in Jenkinsfile.");
        }
        if (issues.length === 0) {
            issues.push("✓ Jenkinsfile passes all structural checks.");
        }
    }
    catch {
        issues.push("Jenkinsfile not found at project root.");
    }
    return issues;
}
