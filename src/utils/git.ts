/**
 * Git Utilities — Enhanced with GitFlow Standards
 *
 * Provides GitFlow branching, merge policy enforcement,
 * and safe rollback capabilities for Freddie Mac standards.
 */

import simpleGit from "simple-git";
import { paths } from "../config/paths";
import { Ticket } from "../core/types";
import {
  buildBranchName,
  buildCommitMessage,
  validateBranchName,
  validateCommitMessage,
} from "./git-policy";

const git = simpleGit(paths.rootDir);

// ---------------------------------------------------------------------------
// Original functionality (preserved)
// ---------------------------------------------------------------------------

export async function pushTicket(ticket: Ticket): Promise<string> {
  try {
    const branchName = buildBranchName(ticket.id, "feature");
    const commitMsg = buildCommitMessage(ticket.id, ticket.title, "feat");

    // Validate branch name against policy
    const branchViolations = validateBranchName(branchName);
    if (branchViolations.length > 0) {
      return `Policy violation: ${branchViolations.map((v) => v.message).join("; ")}`;
    }

    // Validate commit message against policy
    const commitViolations = validateCommitMessage(commitMsg);
    if (commitViolations.some((v) => v.severity === "error")) {
      return `Commit policy violation: ${commitViolations.map((v) => v.message).join("; ")}`;
    }

    const branches = await git.branchLocal();

    if (!branches.all.includes(branchName)) {
      await git.checkoutLocalBranch(branchName);
    } else {
      await git.checkout(branchName);
    }

    await git.add(".");
    await git.commit(commitMsg);
    await git.push("origin", branchName, ["-u"]);
    return `Pushed changes to origin/${branchName}.`;
  } catch (error) {
    return `Skipped push: ${formatGitError(error)}`;
  }
}

export async function getChangedFiles(): Promise<string[]> {
  try {
    const status = await git.status();
    return [
      ...status.created,
      ...status.modified,
      ...status.deleted,
      ...status.not_added,
      ...status.renamed.map((entry) => `${entry.from} -> ${entry.to}`),
    ];
  } catch (error) {
    return [`Git unavailable: ${formatGitError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// GitFlow — Branching
// ---------------------------------------------------------------------------

/**
 * Create a feature branch from develop (or current branch).
 */
export async function createFeatureBranch(ticketId: string): Promise<string> {
  try {
    const branchName = buildBranchName(ticketId, "feature");
    const violations = validateBranchName(branchName);
    if (violations.length > 0) {
      return `Policy violation: ${violations.map((v) => v.message).join("; ")}`;
    }

    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) {
      await git.checkout(branchName);
      return `Switched to existing branch '${branchName}'.`;
    }

    // Try to branch from develop if it exists
    if (branches.all.includes("develop")) {
      await git.checkout("develop");
    }

    await git.checkoutLocalBranch(branchName);
    return `Created and switched to branch '${branchName}'.`;
  } catch (error) {
    return `Failed to create branch: ${formatGitError(error)}`;
  }
}

/**
 * Create a release branch from develop.
 */
export async function createReleaseBranch(version: string): Promise<string> {
  try {
    const branchName = `release/${version}`;
    const violations = validateBranchName(branchName);
    if (violations.length > 0) {
      return `Policy violation: ${violations.map((v) => v.message).join("; ")}`;
    }

    const branches = await git.branchLocal();
    if (branches.all.includes("develop")) {
      await git.checkout("develop");
    }

    await git.checkoutLocalBranch(branchName);
    return `Created release branch '${branchName}' from develop.`;
  } catch (error) {
    return `Failed to create release branch: ${formatGitError(error)}`;
  }
}

/**
 * Create a hotfix branch from main.
 */
export async function createHotfixBranch(ticketId: string): Promise<string> {
  try {
    const branchName = buildBranchName(ticketId, "hotfix");
    const branches = await git.branchLocal();

    if (branches.all.includes("main")) {
      await git.checkout("main");
    }

    await git.checkoutLocalBranch(branchName);
    return `Created hotfix branch '${branchName}' from main.`;
  } catch (error) {
    return `Failed to create hotfix branch: ${formatGitError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// GitFlow — Merging (with --no-ff to preserve history)
// ---------------------------------------------------------------------------

/**
 * Merge a feature branch into develop using --no-ff.
 */
export async function mergeFeatureToDevelop(ticketId: string): Promise<string> {
  try {
    const branchName = buildBranchName(ticketId, "feature");
    const branches = await git.branchLocal();

    if (!branches.all.includes(branchName)) {
      return `Branch '${branchName}' does not exist.`;
    }

    // Ensure develop exists
    const targetBranch = branches.all.includes("develop")
      ? "develop"
      : branches.current;
    await git.checkout(targetBranch);
    await git.merge([
      branchName,
      "--no-ff",
      "-m",
      `merge: ${branchName} into ${targetBranch}`,
    ]);

    return `Merged '${branchName}' into '${targetBranch}' with --no-ff (merge commit preserved).`;
  } catch (error) {
    return `Merge failed: ${formatGitError(error)}`;
  }
}

/**
 * Merge a release branch into both main and develop.
 */
export async function mergeReleaseBranch(version: string): Promise<string> {
  try {
    const branchName = `release/${version}`;
    const branches = await git.branchLocal();
    const results: string[] = [];

    if (!branches.all.includes(branchName)) {
      return `Release branch '${branchName}' does not exist.`;
    }

    // Merge into main
    if (branches.all.includes("main")) {
      await git.checkout("main");
      await git.merge([
        branchName,
        "--no-ff",
        "-m",
        `release: merge ${version} into main`,
      ]);
      results.push(`Merged '${branchName}' into main.`);
    }

    // Merge into develop
    if (branches.all.includes("develop")) {
      await git.checkout("develop");
      await git.merge([
        branchName,
        "--no-ff",
        "-m",
        `release: merge ${version} into develop`,
      ]);
      results.push(`Merged '${branchName}' into develop.`);
    }

    return results.join(" ");
  } catch (error) {
    return `Release merge failed: ${formatGitError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Rollback (non-destructive, preserves audit trail)
// ---------------------------------------------------------------------------

/**
 * Revert the last commit (safe, creates a new reversal commit).
 */
export async function rollbackLastCommit(): Promise<string> {
  try {
    await git.revert("HEAD", ["--no-edit"]);
    return "Reverted the last commit. A new reversal commit was created (audit trail preserved).";
  } catch (error) {
    return `Rollback failed: ${formatGitError(error)}`;
  }
}

/**
 * Revert to a specific commit by SHA.
 */
export async function rollbackToCommit(sha: string): Promise<string> {
  try {
    await git.revert(sha, ["--no-edit"]);
    return `Reverted commit ${sha.slice(0, 8)}. A new reversal commit was created.`;
  } catch (error) {
    return `Rollback failed: ${formatGitError(error)}`;
  }
}

/**
 * List recent commits for rollback selection.
 */
export async function listRecentCommits(count: number = 10): Promise<string[]> {
  try {
    const log = await git.log({ maxCount: count });
    return log.all.map((entry) => {
      const short = entry.hash.slice(0, 8);
      const date = entry.date.split("T")[0];
      return `${short} | ${date} | ${entry.message}`;
    });
  } catch (error) {
    return [`Unable to read git log: ${formatGitError(error)}`];
  }
}

/**
 * Get current branch name.
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const branches = await git.branchLocal();
    return branches.current;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("spawn git ENOENT")) {
      return "git is not installed or not available on PATH";
    }

    return error.message;
  }

  return "git is not available";
}
