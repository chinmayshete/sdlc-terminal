import { generatePlan } from "../utils/llm";
import { PlanResult, RepoFile, Ticket } from "../core/types";

export class PlannerAgent {
  async run(ticket: Ticket, files: RepoFile[], isDetailed = false): Promise<PlanResult> {
    const steps = await generatePlan(ticket, files, isDetailed);
    return { steps };
  }
}
