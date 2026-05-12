"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeChanges = writeChanges;
exports.applyChangesWithSnapshots = applyChangesWithSnapshots;
exports.restoreSnapshots = restoreSnapshots;
exports.readWorkspaceFile = readWorkspaceFile;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../config/paths");
async function writeChanges(changes) {
    for (const change of normalizeRepoChanges(changes)) {
        const fullPath = path_1.default.join(paths_1.paths.rootDir, change.path);
        await fs_1.promises.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await fs_1.promises.writeFile(fullPath, change.content, "utf8");
    }
}
async function applyChangesWithSnapshots(changes) {
    const snapshots = [];
    for (const change of normalizeRepoChanges(changes)) {
        const fullPath = path_1.default.join(paths_1.paths.rootDir, change.path);
        const previousContent = await readFileIfExists(fullPath);
        await fs_1.promises.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await fs_1.promises.writeFile(fullPath, change.content, "utf8");
        snapshots.push({
            path: change.path,
            previousContent,
            nextContent: change.content,
        });
    }
    return snapshots;
}
async function restoreSnapshots(snapshots) {
    for (const snapshot of snapshots) {
        const fullPath = path_1.default.join(paths_1.paths.rootDir, snapshot.path);
        if (snapshot.previousContent === null) {
            await fs_1.promises.rm(fullPath, { force: true });
            continue;
        }
        await fs_1.promises.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await fs_1.promises.writeFile(fullPath, snapshot.previousContent, "utf8");
    }
}
async function readWorkspaceFile(relativePath) {
    const safePath = normalizeRepoPath(relativePath);
    const fullPath = path_1.default.join(paths_1.paths.rootDir, safePath);
    return fs_1.promises.readFile(fullPath, "utf8");
}
async function readFileIfExists(fullPath) {
    try {
        return await fs_1.promises.readFile(fullPath, "utf8");
    }
    catch {
        return null;
    }
}
function normalizeRepoChanges(changes) {
    return changes.map((change) => ({
        ...change,
        path: normalizeRepoPath(change.path),
    }));
}
function normalizeRepoPath(inputPath) {
    const unixPath = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const withoutRepoPrefix = unixPath
        .replace(/^repo\/app\//, "")
        .replace(/^repo\//, "")
        .replace(/^app\//, "");
    const candidate = path_1.default.posix.normalize(`repo/app/${withoutRepoPrefix}`);
    if (!candidate.startsWith("repo/app/")) {
        throw new Error(`Refusing to write outside repo/app: ${inputPath}`);
    }
    return candidate;
}
