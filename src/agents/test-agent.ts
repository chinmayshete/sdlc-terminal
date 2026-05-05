import { generateTests } from "../utils/llm";
import { CodeChange, Ticket } from "../core/types";

export class TestAgent {
  async run(ticket: Ticket, codeChanges: CodeChange[]): Promise<CodeChange[]> {
    return generateTests(ticket, codeChanges);
  }
}
