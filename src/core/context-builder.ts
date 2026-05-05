import { promises as fs } from "fs";
import path from "path";
import { paths } from "../config/paths";
import { RepoFile, Ticket } from "./types";

export class ContextBuilder {
  async build(ticket: Ticket): Promise<RepoFile[]> {
    const repoFiles = await this.readAll();
    const keywords = this.extractKeywords(ticket);

    const matched = repoFiles.filter((file) => {
      const haystack = `${file.path} ${file.content}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    });

    return matched.length > 0 ? matched : repoFiles;
  }

  async readAll(): Promise<RepoFile[]> {
    try {
      return await this.readRepoFiles(paths.appRepoDir);
    } catch {
      return [];
    }
  }

  private extractKeywords(ticket: Ticket): string[] {
    return `${ticket.title} ${ticket.description}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2);
  }

  private async readRepoFiles(dir: string): Promise<RepoFile[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: RepoFile[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.readRepoFiles(fullPath)));
        continue;
      }

      const content = await fs.readFile(fullPath, "utf8");
      files.push({
        path: path.relative(paths.rootDir, fullPath).replace(/\\/g, "/"),
        content,
      });
    }

    return files;
  }
}
