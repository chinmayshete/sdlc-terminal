/**
 * Git Operations — Comprehensive Git Command Wrappers
 *
 * Provides formatted, terminal-friendly wrappers around simple-git
 * for every common Git operation. All functions return string or
 * string[] for direct display in themed panels.
 */

import simpleGit from "simple-git";
import chalk from "chalk";
import { paths } from "../config/paths";
import { validateBranchName, validateCommitMessage } from "./git-policy";

const git = simpleGit(paths.rootDir);

// ---------------------------------------------------------------------------
// Status & Info
// ---------------------------------------------------------------------------

export async function gitStatus(): Promise<string[]> {
  try {
    const status = await git.status();
    const lines: string[] = [];

    lines.push(`Branch: ${chalk.bold.cyan(status.current ?? "unknown")}`);

    if (status.tracking) {
      lines.push(`Tracking: ${chalk.gray(status.tracking)}`);
      if (status.ahead > 0) lines.push(chalk.green(`  Ahead by ${status.ahead} commit(s)`));
      if (status.behind > 0)
        lines.push(chalk.red(`  Behind by ${status.behind} commit(s)`));
    }

    if (status.staged.length > 0) {
      lines.push("");
      lines.push(chalk.bold.green("Staged:"));
      for (const file of status.staged) lines.push(chalk.green(`  + ${file}`));
    }

    if (status.modified.length > 0) {
      lines.push("");
      lines.push(chalk.bold.yellow("Modified:"));
      for (const file of status.modified) lines.push(chalk.yellow(`  ~ ${file}`));
    }

    if (status.not_added.length > 0) {
      lines.push("");
      lines.push(chalk.bold.red("Untracked:"));
      for (const file of status.not_added) lines.push(chalk.red(`  ? ${file}`));
    }

    if (status.deleted.length > 0) {
      lines.push("");
      lines.push(chalk.bold.red("Deleted:"));
      for (const file of status.deleted) lines.push(chalk.red(`  - ${file}`));
    }

    if (status.renamed.length > 0) {
      lines.push("");
      lines.push(chalk.bold.blue("Renamed:"));
      for (const entry of status.renamed)
        lines.push(chalk.blue(`  ${entry.from} -> ${entry.to}`));
    }

    if (status.conflicted.length > 0) {
      lines.push("");
      lines.push(chalk.bold.bgRed.white("Conflicts:"));
      for (const file of status.conflicted) lines.push(chalk.bold.red(`  ! ${file}`));
    }

    const totalChanges =
      status.staged.length +
      status.modified.length +
      status.not_added.length +
      status.deleted.length +
      status.renamed.length;

    if (totalChanges === 0) {
      lines.push("");
      lines.push(chalk.italic.green("Working tree is clean."));
    }

    return lines;
  } catch (error) {
    return [`Git status failed: ${formatError(error)}`];
  }
}

export async function gitLog(count: number = 10): Promise<string[]> {
  try {
    const log = await git.log({ maxCount: count });

    if (log.all.length === 0) {
      return ["No commits yet."];
    }

    const lines: string[] = [chalk.bold.underline(`Last ${log.all.length} commit(s):`)];

    for (const entry of log.all) {
      const short = chalk.yellow(entry.hash.slice(0, 8));
      const date = chalk.gray(entry.date.split("T")[0]);
      const author = chalk.cyan(entry.author_name);
      lines.push(`  ${short} | ${date} | ${author} | ${entry.message}`);
    }

    return lines;
  } catch (error) {
    return [`Git log failed: ${formatError(error)}`];
  }
}

export async function gitDiff(file?: string): Promise<string[]> {
  try {
    const diff = file ? await git.diff([file]) : await git.diff();

    if (!diff || diff.trim().length === 0) {
      return [file ? `No diff for ${file}.` : "No unstaged changes to diff."];
    }

    return diff.split(/\r?\n/).slice(0, 100);
  } catch (error) {
    return [`Git diff failed: ${formatError(error)}`];
  }
}

export async function gitDiffStaged(): Promise<string[]> {
  try {
    const diff = await git.diff(["--staged"]);

    if (!diff || diff.trim().length === 0) {
      return ["No staged changes to diff."];
    }

    return diff.split(/\r?\n/).slice(0, 100);
  } catch (error) {
    return [`Git diff --staged failed: ${formatError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export async function gitAdd(filePath: string): Promise<string> {
  try {
    await git.add(filePath);
    return `Staged: ${filePath}`;
  } catch (error) {
    return `Failed to stage ${filePath}: ${formatError(error)}`;
  }
}

export async function gitAddAll(): Promise<string> {
  try {
    await git.add(".");
    return "Staged all changes.";
  } catch (error) {
    return `Failed to stage all: ${formatError(error)}`;
  }
}

export async function gitUnstage(filePath: string): Promise<string> {
  try {
    await git.reset(["HEAD", filePath]);
    return `Unstaged: ${filePath}`;
  } catch (error) {
    return `Failed to unstage ${filePath}: ${formatError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

export async function gitCommit(message: string): Promise<string> {
  try {
    const violations = validateCommitMessage(message);
    const errors = violations.filter((v) => v.severity === "error");

    if (errors.length > 0) {
      return `Commit policy violation: ${errors.map((v) => v.message).join("; ")}`;
    }

    const warnings = violations.filter((v) => v.severity === "warning");
    const result = await git.commit(message);
    const summary = result.summary;
    let msg = `${chalk.bold.green("Committed:")} ${chalk.cyan(summary.changes)} change(s), ${chalk.green(summary.insertions + "+")}, ${chalk.red(summary.deletions + "-")}`;

    if (warnings.length > 0) {
      msg += ` | ${chalk.bold.yellow("Warnings:")} ${chalk.yellow(warnings.map((v) => v.message).join("; "))}`;
    }

    return msg;
  } catch (error) {
    return `Commit failed: ${formatError(error)}`;
  }
}

export async function gitCommitAll(message: string): Promise<string> {
  try {
    const violations = validateCommitMessage(message);
    const errors = violations.filter((v) => v.severity === "error");

    if (errors.length > 0) {
      return `Commit policy violation: ${errors.map((v) => v.message).join("; ")}`;
    }

    await git.add(".");
    const result = await git.commit(message);
    const summary = result.summary;
    return `Staged all & committed: ${summary.changes} change(s), ${summary.insertions} insertion(s), ${summary.deletions} deletion(s)`;
  } catch (error) {
    return `Commit failed: ${formatError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function gitListBranches(): Promise<string[]> {
  try {
    const branches = await git.branchLocal();
    const lines: string[] = ["Local branches:"];

    for (const name of branches.all) {
      const marker = name === branches.current ? " * " : "   ";
      lines.push(`${marker}${name}`);
    }

    return lines;
  } catch (error) {
    return [`Failed to list branches: ${formatError(error)}`];
  }
}

export async function gitCreateBranch(name: string): Promise<string> {
  try {
    const violations = validateBranchName(name);

    if (violations.length > 0) {
      const policyMsg = violations.map((v) => v.message).join("; ");
      // Still create — warn, don't block
      const result = `Policy warning: ${policyMsg}. `;
      await git.checkoutLocalBranch(name);
      return `${result}Created and switched to '${name}'.`;
    }

    await git.checkoutLocalBranch(name);
    return `Created and switched to branch '${name}'.`;
  } catch (error) {
    return `Failed to create branch '${name}': ${formatError(error)}`;
  }
}

export async function gitCheckout(name: string): Promise<string> {
  try {
    await git.checkout(name);
    return `Switched to branch '${name}'.`;
  } catch (error) {
    return `Failed to checkout '${name}': ${formatError(error)}`;
  }
}

export async function gitDeleteBranch(name: string): Promise<string> {
  try {
    await git.deleteLocalBranch(name);
    return `Deleted branch '${name}'.`;
  } catch (error) {
    return `Failed to delete branch '${name}': ${formatError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Remote
// ---------------------------------------------------------------------------

export async function gitPull(): Promise<string> {
  try {
    const result = await git.pull();

    if (result.summary.changes === 0) {
      return "Already up to date.";
    }

    return `Pulled: ${result.summary.changes} change(s), ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s)`;
  } catch (error) {
    return `Pull failed: ${formatError(error)}`;
  }
}

export async function gitPush(branch?: string): Promise<string> {
  try {
    if (branch) {
      await git.push("origin", branch, ["-u"]);
      return `Pushed '${branch}' to origin.`;
    }

    const current = (await git.branchLocal()).current;
    await git.push("origin", current, ["-u"]);
    return `Pushed '${current}' to origin.`;
  } catch (error) {
    return `Push failed: ${formatError(error)}`;
  }
}

export async function gitFetch(): Promise<string> {
  try {
    await git.fetch();
    return "Fetched latest from all remotes.";
  } catch (error) {
    return `Fetch failed: ${formatError(error)}`;
  }
}

export async function gitListRemotes(): Promise<string[]> {
  try {
    const remotes = await git.getRemotes(true);

    if (remotes.length === 0) {
      return ["No remotes configured."];
    }

    const lines: string[] = ["Remotes:"];
    for (const remote of remotes) {
      lines.push(`  ${remote.name}  ${remote.refs.fetch ?? "(no URL)"}`);
    }

    return lines;
  } catch (error) {
    return [`Failed to list remotes: ${formatError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

export async function gitStash(): Promise<string> {
  try {
    const result = await git.stash();
    return result.trim() || "Stashed working changes.";
  } catch (error) {
    return `Stash failed: ${formatError(error)}`;
  }
}

export async function gitStashPop(): Promise<string> {
  try {
    const result = await git.stash(["pop"]);
    return result.trim() || "Applied and dropped latest stash.";
  } catch (error) {
    return `Stash pop failed: ${formatError(error)}`;
  }
}

export async function gitStashList(): Promise<string[]> {
  try {
    const result = await git.stash(["list"]);
    const trimmed = result.trim();

    if (!trimmed) {
      return ["No stash entries."];
    }

    return ["Stash entries:", ...trimmed.split(/\r?\n/).map((l) => `  ${l}`)];
  } catch (error) {
    return [`Failed to list stash: ${formatError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function gitTag(name: string): Promise<string> {
  try {
    await git.addTag(name);
    return `Created tag '${name}'.`;
  } catch (error) {
    return `Failed to create tag '${name}': ${formatError(error)}`;
  }
}

export async function gitListTags(): Promise<string[]> {
  try {
    const tags = await git.tags();

    if (tags.all.length === 0) {
      return ["No tags."];
    }

    return ["Tags:", ...tags.all.map((t) => `  ${t}`)];
  } catch (error) {
    return [`Failed to list tags: ${formatError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// Advanced
// ---------------------------------------------------------------------------

export async function gitCherryPick(sha: string): Promise<string> {
  try {
    await git.raw(["cherry-pick", sha]);
    return `Cherry-picked commit ${sha.slice(0, 8)}.`;
  } catch (error) {
    return `Cherry-pick failed: ${formatError(error)}`;
  }
}

export async function gitBlame(filePath: string): Promise<string[]> {
  try {
    const result = await git.raw(["blame", "--porcelain", filePath]);
    const lines = result.split(/\r?\n/);
    const output: string[] = [`Blame for ${filePath}:`];
    let currentAuthor = "";
    let lineNum = 0;

    for (const line of lines) {
      if (line.startsWith("author ")) {
        currentAuthor = line.slice("author ".length);
      } else if (line.startsWith("\t")) {
        lineNum += 1;
        const code = line.slice(1);
        const padded = String(lineNum).padStart(4, " ");
        output.push(
          `  ${padded} | ${currentAuthor.padEnd(16)} | ${code}`,
        );
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
  } catch (error) {
    return [`Blame failed: ${formatError(error)}`];
  }
}

export async function gitShowCommit(sha: string): Promise<string[]> {
  try {
    const result = await git.show([sha, "--stat"]);
    return result.split(/\r?\n/).slice(0, 40);
  } catch (error) {
    return [`Failed to show commit: ${formatError(error)}`];
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export async function gitMerge(branch: string): Promise<string> {
  try {
    await git.merge([branch, "--no-ff"]);
    return `Merged '${branch}' into current branch with --no-ff.`;
  } catch (error) {
    return `Merge failed: ${formatError(error)}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("spawn git ENOENT")) {
      return chalk.bold.red("git is not installed or not available on PATH");
    }

    return chalk.red(error.message);
  }

  return chalk.red("git is not available");
}
