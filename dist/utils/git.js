"use strict";
/**
 * Git Utilities — Enhanced with GitFlow Standards
 *
 * Provides GitFlow branching, merge policy enforcement,
 * and safe rollback capabilities for Freddie Mac standards.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushTicket = pushTicket;
exports.getChangedFiles = getChangedFiles;
exports.createFeatureBranch = createFeatureBranch;
exports.createReleaseBranch = createReleaseBranch;
exports.createHotfixBranch = createHotfixBranch;
exports.mergeFeatureToDevelop = mergeFeatureToDevelop;
exports.mergeReleaseBranch = mergeReleaseBranch;
exports.rollbackLastCommit = rollbackLastCommit;
exports.rollbackToCommit = rollbackToCommit;
exports.listRecentCommits = listRecentCommits;
exports.getCurrentBranch = getCurrentBranch;
const simple_git_1 = __importDefault(require("simple-git"));
const paths_1 = require("../config/paths");
const git_policy_1 = require("./git-policy");
const git = (0, simple_git_1.default)(paths_1.paths.rootDir);
// ---------------------------------------------------------------------------
// Original functionality (preserved)
// ---------------------------------------------------------------------------
async function pushTicket(ticket) {
    try {
        const branchName = (0, git_policy_1.buildBranchName)(ticket.id, "feature");
        const commitMsg = (0, git_policy_1.buildCommitMessage)(ticket.id, ticket.title, "feat");
        // Validate branch name against policy
        const branchViolations = (0, git_policy_1.validateBranchName)(branchName);
        if (branchViolations.length > 0) {
            return `Policy violation: ${branchViolations.map((v) => v.message).join("; ")}`;
        }
        // Validate commit message against policy
        const commitViolations = (0, git_policy_1.validateCommitMessage)(commitMsg);
        if (commitViolations.some((v) => v.severity === "error")) {
            return `Commit policy violation: ${commitViolations.map((v) => v.message).join("; ")}`;
        }
        const branches = await git.branchLocal();
        if (!branches.all.includes(branchName)) {
            await git.checkoutLocalBranch(branchName);
        }
        else {
            await git.checkout(branchName);
        }
        await git.add(".");
        await git.commit(commitMsg);
        await git.push("origin", branchName, ["-u"]);
        return `Pushed changes to origin/${branchName}.`;
    }
    catch (error) {
        return `Skipped push: ${formatGitError(error)}`;
    }
}
async function getChangedFiles() {
    try {
        const status = await git.status();
        return [
            ...status.created,
            ...status.modified,
            ...status.deleted,
            ...status.not_added,
            ...status.renamed.map((entry) => `${entry.from} -> ${entry.to}`),
        ];
    }
    catch (error) {
        return [`Git unavailable: ${formatGitError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// GitFlow — Branching
// ---------------------------------------------------------------------------
/**
 * Create a feature branch from develop (or current branch).
 */
async function createFeatureBranch(ticketId) {
    try {
        const branchName = (0, git_policy_1.buildBranchName)(ticketId, "feature");
        const violations = (0, git_policy_1.validateBranchName)(branchName);
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
    }
    catch (error) {
        return `Failed to create branch: ${formatGitError(error)}`;
    }
}
/**
 * Create a release branch from develop.
 */
async function createReleaseBranch(version) {
    try {
        const branchName = `release/${version}`;
        const violations = (0, git_policy_1.validateBranchName)(branchName);
        if (violations.length > 0) {
            return `Policy violation: ${violations.map((v) => v.message).join("; ")}`;
        }
        const branches = await git.branchLocal();
        if (branches.all.includes("develop")) {
            await git.checkout("develop");
        }
        await git.checkoutLocalBranch(branchName);
        return `Created release branch '${branchName}' from develop.`;
    }
    catch (error) {
        return `Failed to create release branch: ${formatGitError(error)}`;
    }
}
/**
 * Create a hotfix branch from main.
 */
async function createHotfixBranch(ticketId) {
    try {
        const branchName = (0, git_policy_1.buildBranchName)(ticketId, "hotfix");
        const branches = await git.branchLocal();
        if (branches.all.includes("main")) {
            await git.checkout("main");
        }
        await git.checkoutLocalBranch(branchName);
        return `Created hotfix branch '${branchName}' from main.`;
    }
    catch (error) {
        return `Failed to create hotfix branch: ${formatGitError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// GitFlow — Merging (with --no-ff to preserve history)
// ---------------------------------------------------------------------------
/**
 * Merge a feature branch into develop using --no-ff.
 */
async function mergeFeatureToDevelop(ticketId) {
    try {
        const branchName = (0, git_policy_1.buildBranchName)(ticketId, "feature");
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
    }
    catch (error) {
        return `Merge failed: ${formatGitError(error)}`;
    }
}
/**
 * Merge a release branch into both main and develop.
 */
async function mergeReleaseBranch(version) {
    try {
        const branchName = `release/${version}`;
        const branches = await git.branchLocal();
        const results = [];
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
    }
    catch (error) {
        return `Release merge failed: ${formatGitError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// Rollback (non-destructive, preserves audit trail)
// ---------------------------------------------------------------------------
/**
 * Revert the last commit (safe, creates a new reversal commit).
 */
async function rollbackLastCommit() {
    try {
        await git.revert("HEAD", ["--no-edit"]);
        return "Reverted the last commit. A new reversal commit was created (audit trail preserved).";
    }
    catch (error) {
        return `Rollback failed: ${formatGitError(error)}`;
    }
}
/**
 * Revert to a specific commit by SHA.
 */
async function rollbackToCommit(sha) {
    try {
        await git.revert(sha, ["--no-edit"]);
        return `Reverted commit ${sha.slice(0, 8)}. A new reversal commit was created.`;
    }
    catch (error) {
        return `Rollback failed: ${formatGitError(error)}`;
    }
}
/**
 * List recent commits for rollback selection.
 */
async function listRecentCommits(count = 10) {
    try {
        const log = await git.log({ maxCount: count });
        return log.all.map((entry) => {
            const short = entry.hash.slice(0, 8);
            const date = entry.date.split("T")[0];
            return `${short} | ${date} | ${entry.message}`;
        });
    }
    catch (error) {
        return [`Unable to read git log: ${formatGitError(error)}`];
    }
}
/**
 * Get current branch name.
 */
async function getCurrentBranch() {
    try {
        const branches = await git.branchLocal();
        return branches.current;
    }
    catch {
        return "unknown";
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatGitError(error) {
    if (error instanceof Error) {
        if (error.message.includes("spawn git ENOENT")) {
            return "git is not installed or not available on PATH";
        }
        return error.message;
    }
    return "git is not available";
}
