import { promises as fs } from "fs";
import path from "path";
import { paths } from "../config/paths";
import { CodeChange, FileSnapshot } from "../core/types";

export async function writeChanges(changes: CodeChange[]): Promise<void> {
  for (const change of normalizeRepoChanges(changes)) {
    const fullPath = path.join(paths.rootDir, change.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, change.content, "utf8");
  }
}

export async function applyChangesWithSnapshots(
  changes: CodeChange[],
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];

  for (const change of normalizeRepoChanges(changes)) {
    const fullPath = path.join(paths.rootDir, change.path);
    const previousContent = await readFileIfExists(fullPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, change.content, "utf8");

    snapshots.push({
      path: change.path,
      previousContent,
      nextContent: change.content,
    });
  }

  return snapshots;
}

export async function restoreSnapshots(
  snapshots: FileSnapshot[],
): Promise<void> {
  for (const snapshot of snapshots) {
    const fullPath = path.join(paths.rootDir, snapshot.path);

    if (snapshot.previousContent === null) {
      await fs.rm(fullPath, { force: true });
      continue;
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, snapshot.previousContent, "utf8");
  }
}

export async function readWorkspaceFile(relativePath: string): Promise<string> {
  const safePath = normalizeRepoPath(relativePath);
  const fullPath = path.join(paths.rootDir, safePath);
  return fs.readFile(fullPath, "utf8");
}

async function readFileIfExists(fullPath: string): Promise<string | null> {
  try {
    return await fs.readFile(fullPath, "utf8");
  } catch {
    return null;
  }
}

function normalizeRepoChanges(changes: CodeChange[]): CodeChange[] {
  return changes.map((change) => ({
    ...change,
    path: normalizeRepoPath(change.path),
  }));
}

function normalizeRepoPath(inputPath: string): string {
  const unixPath = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const withoutRepoPrefix = unixPath
    .replace(/^repo\/app\//, "")
    .replace(/^repo\//, "")
    .replace(/^app\//, "");
  const candidate = path.posix.normalize(`repo/app/${withoutRepoPrefix}`);

  if (!candidate.startsWith("repo/app/")) {
    throw new Error(`Refusing to write outside repo/app: ${inputPath}`);
  }

  return candidate;
}
