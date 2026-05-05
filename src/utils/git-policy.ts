/**
 * Git Policy — Freddie Mac Version Control Standards
 *
 * Encapsulates enterprise Git governance rules:
 * - Branch naming conventions (GitFlow)
 * - Commit message format enforcement
 * - Pre-push validation checklist
 */

/** Valid branch prefixes per GitFlow convention */
const BRANCH_PREFIXES = ["feature/", "release/", "hotfix/", "bugfix/"] as const;
const PROTECTED_BRANCHES = ["main", "master", "develop"] as const;

/** Conventional commit prefixes */
const COMMIT_PREFIXES = [
  "feat:",
  "fix:",
  "hotfix:",
  "chore:",
  "docs:",
  "refactor:",
  "test:",
  "ci:",
  "perf:",
] as const;

export interface PolicyViolation {
  rule: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Validates a branch name against Freddie Mac GitFlow standards.
 *
 * Valid patterns:
 *   feature/auth-101
 *   release/1.2.0
 *   hotfix/sec-fix-001
 *   bugfix/login-error
 *   main, develop (protected)
 */
export function validateBranchName(branchName: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const normalized = branchName.trim().toLowerCase();

  // Protected branches are always valid
  if (
    PROTECTED_BRANCHES.includes(
      normalized as (typeof PROTECTED_BRANCHES)[number],
    )
  ) {
    return violations;
  }

  // Must start with a valid prefix
  const hasValidPrefix = BRANCH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
  if (!hasValidPrefix) {
    violations.push({
      rule: "GIT-001",
      message: `Branch name '${branchName}' does not follow GitFlow convention. Must start with: ${BRANCH_PREFIXES.join(", ")}`,
      severity: "error",
    });
  }

  // No uppercase allowed
  if (branchName !== branchName.toLowerCase()) {
    violations.push({
      rule: "GIT-002",
      message: `Branch name '${branchName}' contains uppercase characters. Use lowercase with hyphens.`,
      severity: "error",
    });
  }

  // No spaces or special characters
  if (/[^a-z0-9\-\/._]/.test(normalized)) {
    violations.push({
      rule: "GIT-003",
      message: `Branch name '${branchName}' contains invalid characters. Use only alphanumeric, hyphens, dots, and forward slashes.`,
      severity: "error",
    });
  }

  // Must have a descriptor after the prefix
  const afterPrefix = BRANCH_PREFIXES.reduce((result, prefix) => {
    return normalized.startsWith(prefix)
      ? normalized.slice(prefix.length)
      : result;
  }, normalized);

  if (hasValidPrefix && afterPrefix.length === 0) {
    violations.push({
      rule: "GIT-004",
      message: `Branch name '${branchName}' is missing a descriptor after the prefix (e.g., feature/auth-101).`,
      severity: "error",
    });
  }

  return violations;
}

/**
 * Validates a commit message against conventional commit format.
 *
 * Valid patterns:
 *   feat: Add login endpoint
 *   fix: Resolve null pointer in auth
 *   hotfix: Patch critical vulnerability
 *   chore: Update dependencies
 */
export function validateCommitMessage(message: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    violations.push({
      rule: "GIT-010",
      message: "Commit message cannot be empty.",
      severity: "error",
    });
    return violations;
  }

  // Must start with a conventional prefix
  const hasValidPrefix = COMMIT_PREFIXES.some((prefix) =>
    trimmed.toLowerCase().startsWith(prefix),
  );
  if (!hasValidPrefix) {
    violations.push({
      rule: "GIT-011",
      message: `Commit message does not follow conventional format. Must start with: ${COMMIT_PREFIXES.join(", ")}`,
      severity: "error",
    });
  }

  // Subject line should not exceed 72 characters
  const firstLine = trimmed.split("\n")[0];
  if (firstLine.length > 72) {
    violations.push({
      rule: "GIT-012",
      message: `Commit subject line exceeds 72 characters (${firstLine.length}). Keep it concise.`,
      severity: "warning",
    });
  }

  // Subject should not end with a period
  if (firstLine.endsWith(".")) {
    violations.push({
      rule: "GIT-013",
      message: "Commit subject line should not end with a period.",
      severity: "warning",
    });
  }

  return violations;
}

/**
 * Returns the GitFlow branching strategy documentation.
 */
export function getGitFlowGuide(): string[] {
  return [
    "Freddie Mac GitFlow Branching Strategy:",
    "",
    "  main          Production-ready code. Protected, no direct commits.",
    "  develop       Integration branch. Features merge here first.",
    "  feature/*     New features branched from develop.",
    "  release/*     Release preparation branched from develop.",
    "  hotfix/*      Emergency patches branched from main.",
    "  bugfix/*      Bug fixes branched from develop.",
    "",
    "Workflow:",
    "  1. Create feature branch:  feature/<ticket-id>",
    "  2. Develop and commit with conventional messages",
    "  3. Merge to develop with --no-ff (preserve history)",
    "  4. Cut release branch: release/<version>",
    "  5. Test and stabilize on release branch",
    "  6. Merge release to main AND develop",
    "  7. Tag the release on main",
    "",
    "Rollback Strategy:",
    "  - Use 'git revert' (non-destructive, preserves audit trail)",
    "  - Never use 'git reset --hard' on shared branches",
    "  - All reversals create a new commit for traceability",
  ];
}

/**
 * Generates the conventional commit message for a ticket.
 */
export function buildCommitMessage(
  ticketId: string,
  title: string,
  type: "feat" | "fix" | "hotfix" | "chore" = "feat",
): string {
  return `${type}: [${ticketId.toUpperCase()}] ${title}`;
}

/**
 * Returns the expected branch name for a given ticket and type.
 */
export function buildBranchName(
  ticketId: string,
  type: "feature" | "hotfix" | "bugfix" = "feature",
): string {
  return `${type}/${ticketId.toLowerCase()}`;
}
