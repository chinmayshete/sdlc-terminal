"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBuilder = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../config/paths");
class ContextBuilder {
    async build(ticket) {
        const repoFiles = await this.readAll();
        const keywords = this.extractKeywords(ticket);
        const matched = repoFiles.filter((file) => {
            const haystack = `${file.path} ${file.content}`.toLowerCase();
            return keywords.some((keyword) => haystack.includes(keyword));
        });
        return matched.length > 0 ? matched : repoFiles;
    }
    async readAll() {
        try {
            return await this.readRepoFiles(paths_1.paths.appRepoDir);
        }
        catch {
            return [];
        }
    }
    extractKeywords(ticket) {
        return `${ticket.title} ${ticket.description}`
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length > 2);
    }
    async readRepoFiles(dir) {
        const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...(await this.readRepoFiles(fullPath)));
                continue;
            }
            const content = await fs_1.promises.readFile(fullPath, "utf8");
            files.push({
                path: path_1.default.relative(paths_1.paths.rootDir, fullPath).replace(/\\/g, "/"),
                content,
            });
        }
        return files;
    }
}
exports.ContextBuilder = ContextBuilder;
