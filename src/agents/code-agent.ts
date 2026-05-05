import { generateCode } from "../utils/llm";
import { CodeChange, RepoFile, Ticket } from "../core/types";

export class CodeAgent {
  async run(ticket: Ticket, files: RepoFile[]): Promise<CodeChange[]> {
    return generateCode(ticket, files);
  }
}
