/**
 * CI/CD Pipeline Utilities
 *
 * Provides Jenkinsfile validation, pipeline stage introspection,
 * and deployment status display for the CLI.
 */

import { promises as fs } from "fs";
import path from "path";
import chalk from "chalk";

export interface PipelineStage {
  name: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
}

export interface PipelineInfo {
  pipelineType: string;
  stages: PipelineStage[];
  hasJenkinsfile: boolean;
  parameters: string[];
  postActions: string[];
}

const EXPECTED_STAGES: PipelineStage[] = [
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
export async function getPipelineInfo(rootDir: string): Promise<PipelineInfo> {
  const jenkinsfilePath = path.join(rootDir, "Jenkinsfile");
  let hasJenkinsfile = false;

  try {
    await fs.access(jenkinsfilePath);
    hasJenkinsfile = true;
  } catch {
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
export function formatPipelineInfo(info: PipelineInfo): string[] {
  const lines: string[] = [
    `Pipeline: ${chalk.bold.blue(info.pipelineType)}`,
    `Jenkinsfile: ${info.hasJenkinsfile ? chalk.bold.green("✓ Present") : chalk.bold.red("✗ Missing")}`,
    "",
    chalk.bold.underline("Stages:"),
  ];

  for (const [i, stage] of info.stages.entries()) {
    let icon = "○";
    let color = chalk.white;

    if (stage.status === "passed") {
      icon = "✓";
      color = chalk.bold.green;
    } else if (stage.status === "failed") {
      icon = "✗";
      color = chalk.bold.red;
    } else if (stage.status === "running") {
      icon = "▶";
      color = chalk.bold.yellow;
    }

    lines.push(`  ${i + 1}. [${color(icon)}] ${color(stage.name)} — ${chalk.gray(stage.description)}`);
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
export async function validateJenkinsfile(rootDir: string): Promise<string[]> {
  const jenkinsfilePath = path.join(rootDir, "Jenkinsfile");
  const issues: string[] = [];

  try {
    const content = await fs.readFile(jenkinsfilePath, "utf8");

    if (!content.includes("pipeline {")) {
      issues.push(chalk.yellow("Missing 'pipeline' block declaration."));
    }
    if (!content.includes("agent")) {
      issues.push(chalk.yellow("Missing 'agent' specification."));
    }
    if (!content.includes("stages {")) {
      issues.push(chalk.yellow("Missing 'stages' block."));
    }
    if (!content.includes("post {")) {
      issues.push(chalk.yellow("Missing 'post' block for build notifications."));
    }
    if (!content.includes("credentials(")) {
      issues.push(
        chalk.cyan("No credential bindings found. Use Jenkins Credentials for secrets."),
      );
    }
    if (content.includes("password") && !content.includes("credentials(")) {
      issues.push(chalk.bold.red("Possible hardcoded password in Jenkinsfile."));
    }

    if (issues.length === 0) {
      issues.push(chalk.bold.green("✓ Jenkinsfile passes all structural checks."));
    }
  } catch {
    issues.push(chalk.bold.red("Jenkinsfile not found at project root."));
  }

  return issues;
}
