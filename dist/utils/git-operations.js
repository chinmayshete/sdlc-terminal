"use strict";
/**
 * Git Operations — Comprehensive Git Command Wrappers
 *
 * Provides formatted, terminal-friendly wrappers around simple-git
 * for every common Git operation. All functions return string or
 * string[] for direct display in themed panels.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitStatus = gitStatus;
exports.gitLog = gitLog;
exports.gitDiff = gitDiff;
exports.gitDiffStaged = gitDiffStaged;
exports.gitAdd = gitAdd;
exports.gitAddAll = gitAddAll;
exports.gitUnstage = gitUnstage;
exports.gitCommit = gitCommit;
exports.gitCommitAll = gitCommitAll;
exports.gitListBranches = gitListBranches;
exports.gitCreateBranch = gitCreateBranch;
exports.gitCheckout = gitCheckout;
exports.gitDeleteBranch = gitDeleteBranch;
exports.gitPull = gitPull;
exports.gitPush = gitPush;
exports.gitFetch = gitFetch;
exports.gitListRemotes = gitListRemotes;
exports.gitStash = gitStash;
exports.gitStashPop = gitStashPop;
exports.gitStashList = gitStashList;
exports.gitTag = gitTag;
exports.gitListTags = gitListTags;
exports.gitCherryPick = gitCherryPick;
exports.gitBlame = gitBlame;
exports.gitShowCommit = gitShowCommit;
exports.gitMerge = gitMerge;
const simple_git_1 = __importDefault(require("simple-git"));
const chalk_1 = __importDefault(require("chalk"));
const paths_1 = require("../config/paths");
const git_policy_1 = require("./git-policy");
const git = (0, simple_git_1.default)(paths_1.paths.rootDir);
// ---------------------------------------------------------------------------
// Status & Info
// ---------------------------------------------------------------------------
async function gitStatus() {
    try {
        const status = await git.status();
        const lines = [];
        lines.push(`Branch: ${chalk_1.default.bold.cyan(status.current ?? "unknown")}`);
        if (status.tracking) {
            lines.push(`Tracking: ${chalk_1.default.gray(status.tracking)}`);
            if (status.ahead > 0)
                lines.push(chalk_1.default.green(`  Ahead by ${status.ahead} commit(s)`));
            if (status.behind > 0)
                lines.push(chalk_1.default.red(`  Behind by ${status.behind} commit(s)`));
        }
        if (status.staged.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.green("Staged:"));
            for (const file of status.staged)
                lines.push(chalk_1.default.green(`  + ${file}`));
        }
        if (status.modified.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.yellow("Modified:"));
            for (const file of status.modified)
                lines.push(chalk_1.default.yellow(`  ~ ${file}`));
        }
        if (status.not_added.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.red("Untracked:"));
            for (const file of status.not_added)
                lines.push(chalk_1.default.red(`  ? ${file}`));
        }
        if (status.deleted.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.red("Deleted:"));
            for (const file of status.deleted)
                lines.push(chalk_1.default.red(`  - ${file}`));
        }
        if (status.renamed.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.blue("Renamed:"));
            for (const entry of status.renamed)
                lines.push(chalk_1.default.blue(`  ${entry.from} -> ${entry.to}`));
        }
        if (status.conflicted.length > 0) {
            lines.push("");
            lines.push(chalk_1.default.bold.bgRed.white("Conflicts:"));
            for (const file of status.conflicted)
                lines.push(chalk_1.default.bold.red(`  ! ${file}`));
        }
        const totalChanges = status.staged.length +
            status.modified.length +
            status.not_added.length +
            status.deleted.length +
            status.renamed.length;
        if (totalChanges === 0) {
            lines.push("");
            lines.push(chalk_1.default.italic.green("Working tree is clean."));
        }
        return lines;
    }
    catch (error) {
        return [`Git status failed: ${formatError(error)}`];
    }
}
async function gitLog(count = 10) {
    try {
        const log = await git.log({ maxCount: count });
        if (log.all.length === 0) {
            return ["No commits yet."];
        }
        const lines = [chalk_1.default.bold.underline(`Last ${log.all.length} commit(s):`)];
        for (const entry of log.all) {
            const short = chalk_1.default.yellow(entry.hash.slice(0, 8));
            const date = chalk_1.default.gray(entry.date.split("T")[0]);
            const author = chalk_1.default.cyan(entry.author_name);
            lines.push(`  ${short} | ${date} | ${author} | ${entry.message}`);
        }
        return lines;
    }
    catch (error) {
        return [`Git log failed: ${formatError(error)}`];
    }
}
async function gitDiff(file) {
    try {
        const diff = file ? await git.diff([file]) : await git.diff();
        if (!diff || diff.trim().length === 0) {
            return [file ? `No diff for ${file}.` : "No unstaged changes to diff."];
        }
        return diff.split(/\r?\n/).slice(0, 100);
    }
    catch (error) {
        return [`Git diff failed: ${formatError(error)}`];
    }
}
async function gitDiffStaged() {
    try {
        const diff = await git.diff(["--staged"]);
        if (!diff || diff.trim().length === 0) {
            return ["No staged changes to diff."];
        }
        return diff.split(/\r?\n/).slice(0, 100);
    }
    catch (error) {
        return [`Git diff --staged failed: ${formatError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------
async function gitAdd(filePath) {
    try {
        await git.add(filePath);
        return `Staged: ${filePath}`;
    }
    catch (error) {
        return `Failed to stage ${filePath}: ${formatError(error)}`;
    }
}
async function gitAddAll() {
    try {
        await git.add(".");
        return "Staged all changes.";
    }
    catch (error) {
        return `Failed to stage all: ${formatError(error)}`;
    }
}
async function gitUnstage(filePath) {
    try {
        await git.reset(["HEAD", filePath]);
        return `Unstaged: ${filePath}`;
    }
    catch (error) {
        return `Failed to unstage ${filePath}: ${formatError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------
async function gitCommit(message) {
    try {
        const violations = (0, git_policy_1.validateCommitMessage)(message);
        const errors = violations.filter((v) => v.severity === "error");
        if (errors.length > 0) {
            return `Commit policy violation: ${errors.map((v) => v.message).join("; ")}`;
        }
        const warnings = violations.filter((v) => v.severity === "warning");
        const result = await git.commit(message);
        const summary = result.summary;
        let msg = `${chalk_1.default.bold.green("Committed:")} ${chalk_1.default.cyan(summary.changes)} change(s), ${chalk_1.default.green(summary.insertions + "+")}, ${chalk_1.default.red(summary.deletions + "-")}`;
        if (warnings.length > 0) {
            msg += ` | ${chalk_1.default.bold.yellow("Warnings:")} ${chalk_1.default.yellow(warnings.map((v) => v.message).join("; "))}`;
        }
        return msg;
    }
    catch (error) {
        return `Commit failed: ${formatError(error)}`;
    }
}
async function gitCommitAll(message) {
    try {
        const violations = (0, git_policy_1.validateCommitMessage)(message);
        const errors = violations.filter((v) => v.severity === "error");
        if (errors.length > 0) {
            return `Commit policy violation: ${errors.map((v) => v.message).join("; ")}`;
        }
        await git.add(".");
        const result = await git.commit(message);
        const summary = result.summary;
        return `Staged all & committed: ${summary.changes} change(s), ${summary.insertions} insertion(s), ${summary.deletions} deletion(s)`;
    }
    catch (error) {
        return `Commit failed: ${formatError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
async function gitListBranches() {
    try {
        const branches = await git.branchLocal();
        const lines = ["Local branches:"];
        for (const name of branches.all) {
            const marker = name === branches.current ? " * " : "   ";
            lines.push(`${marker}${name}`);
        }
        return lines;
    }
    catch (error) {
        return [`Failed to list branches: ${formatError(error)}`];
    }
}
async function gitCreateBranch(name) {
    try {
        const violations = (0, git_policy_1.validateBranchName)(name);
        if (violations.length > 0) {
            const policyMsg = violations.map((v) => v.message).join("; ");
            // Still create — warn, don't block
            const result = `Policy warning: ${policyMsg}. `;
            await git.checkoutLocalBranch(name);
            return `${result}Created and switched to '${name}'.`;
        }
        await git.checkoutLocalBranch(name);
        return `Created and switched to branch '${name}'.`;
    }
    catch (error) {
        return `Failed to create branch '${name}': ${formatError(error)}`;
    }
}
async function gitCheckout(name) {
    try {
        await git.checkout(name);
        return `Switched to branch '${name}'.`;
    }
    catch (error) {
        return `Failed to checkout '${name}': ${formatError(error)}`;
    }
}
async function gitDeleteBranch(name) {
    try {
        await git.deleteLocalBranch(name);
        return `Deleted branch '${name}'.`;
    }
    catch (error) {
        return `Failed to delete branch '${name}': ${formatError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// Remote
// ---------------------------------------------------------------------------
async function gitPull() {
    try {
        const result = await git.pull();
        if (result.summary.changes === 0) {
            return "Already up to date.";
        }
        return `Pulled: ${result.summary.changes} change(s), ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s)`;
    }
    catch (error) {
        return `Pull failed: ${formatError(error)}`;
    }
}
async function gitPush(branch) {
    try {
        if (branch) {
            await git.push("origin", branch, ["-u"]);
            return `Pushed '${branch}' to origin.`;
        }
        const current = (await git.branchLocal()).current;
        await git.push("origin", current, ["-u"]);
        return `Pushed '${current}' to origin.`;
    }
    catch (error) {
        return `Push failed: ${formatError(error)}`;
    }
}
async function gitFetch() {
    try {
        await git.fetch();
        return "Fetched latest from all remotes.";
    }
    catch (error) {
        return `Fetch failed: ${formatError(error)}`;
    }
}
async function gitListRemotes() {
    try {
        const remotes = await git.getRemotes(true);
        if (remotes.length === 0) {
            return ["No remotes configured."];
        }
        const lines = ["Remotes:"];
        for (const remote of remotes) {
            lines.push(`  ${remote.name}  ${remote.refs.fetch ?? "(no URL)"}`);
        }
        return lines;
    }
    catch (error) {
        return [`Failed to list remotes: ${formatError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------
async function gitStash() {
    try {
        const result = await git.stash();
        return result.trim() || "Stashed working changes.";
    }
    catch (error) {
        return `Stash failed: ${formatError(error)}`;
    }
}
async function gitStashPop() {
    try {
        const result = await git.stash(["pop"]);
        return result.trim() || "Applied and dropped latest stash.";
    }
    catch (error) {
        return `Stash pop failed: ${formatError(error)}`;
    }
}
async function gitStashList() {
    try {
        const result = await git.stash(["list"]);
        const trimmed = result.trim();
        if (!trimmed) {
            return ["No stash entries."];
        }
        return ["Stash entries:", ...trimmed.split(/\r?\n/).map((l) => `  ${l}`)];
    }
    catch (error) {
        return [`Failed to list stash: ${formatError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
async function gitTag(name) {
    try {
        await git.addTag(name);
        return `Created tag '${name}'.`;
    }
    catch (error) {
        return `Failed to create tag '${name}': ${formatError(error)}`;
    }
}
async function gitListTags() {
    try {
        const tags = await git.tags();
        if (tags.all.length === 0) {
            return ["No tags."];
        }
        return ["Tags:", ...tags.all.map((t) => `  ${t}`)];
    }
    catch (error) {
        return [`Failed to list tags: ${formatError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// Advanced
// ---------------------------------------------------------------------------
async function gitCherryPick(sha) {
    try {
        await git.raw(["cherry-pick", sha]);
        return `Cherry-picked commit ${sha.slice(0, 8)}.`;
    }
    catch (error) {
        return `Cherry-pick failed: ${formatError(error)}`;
    }
}
async function gitBlame(filePath) {
    try {
        const result = await git.raw(["blame", "--porcelain", filePath]);
        const lines = result.split(/\r?\n/);
        const output = [`Blame for ${filePath}:`];
        let currentAuthor = "";
        let lineNum = 0;
        for (const line of lines) {
            if (line.startsWith("author ")) {
                currentAuthor = line.slice("author ".length);
            }
            else if (line.startsWith("\t")) {
                lineNum += 1;
                const code = line.slice(1);
                const padded = String(lineNum).padStart(4, " ");
                output.push(`  ${padded} | ${currentAuthor.padEnd(16)} | ${code}`);
            }
        }
        // Cap output length for terminal readability
        if (output.length > 60) {
            return [
                ...output.slice(0, 60),
                `  ... (${output.length - 60} more lines, showing first 60)`,
            ];
        }
        return output;
    }
    catch (error) {
        return [`Blame failed: ${formatError(error)}`];
    }
}
async function gitShowCommit(sha) {
    try {
        const result = await git.show([sha, "--stat"]);
        return result.split(/\r?\n/).slice(0, 40);
    }
    catch (error) {
        return [`Failed to show commit: ${formatError(error)}`];
    }
}
// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------
async function gitMerge(branch) {
    try {
        await git.merge([branch, "--no-ff"]);
        return `Merged '${branch}' into current branch with --no-ff.`;
    }
    catch (error) {
        return `Merge failed: ${formatError(error)}`;
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatError(error) {
    if (error instanceof Error) {
        if (error.message.includes("spawn git ENOENT")) {
            return chalk_1.default.bold.red("git is not installed or not available on PATH");
        }
        return chalk_1.default.red(error.message);
    }
    return chalk_1.default.red("git is not available");
}
