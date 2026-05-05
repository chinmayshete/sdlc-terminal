import { CodeAgent } from "../agents/code-agent";
import { PlannerAgent } from "../agents/planner-agent";
import { TestAgent } from "../agents/test-agent";
import { env, hasAzureOpenAiConfig } from "../config/env";
import { StateService } from "./state-service";
import { getChangedFiles, pushTicket } from "../utils/git";
import {
  applyChangesWithSnapshots,
  readWorkspaceFile,
  restoreSnapshots,
  writeChanges,
} from "../utils/file";
import {
  checkAiHealth,
  explainFileWithChat,
  generateFreeNlpChat,
} from "../utils/llm";
import { logStep } from "../utils/logger";
import { ContextBuilder } from "./context-builder";
import { TicketService } from "./ticket-service";
import {
  AiHealth,
  ExecuteResult,
  FileSnapshot,
  NlpChatResult,
  NlpChatTurn,
  PlanResult,
  RepoStatus,
  TicketStatusValue,
} from "./types";
import {
  runCodeScan,
  ScanReport,
  formatScanReport,
} from "../utils/code-scanner";
import { getPipelineInfo, PipelineInfo } from "../utils/cicd";
import {
  getConfig,
  getConfigSummary,
  getRedactedConfig,
} from "../config/config-manager";
import {
  mergeFeatureToDevelop,
  rollbackLastCommit,
  rollbackToCommit,
} from "../utils/git";
import { paths } from "../config/paths";

export class Orchestrator {
  constructor(
    private readonly ticketService: TicketService,
    private readonly stateService: StateService,
    private readonly contextBuilder: ContextBuilder,
    private readonly plannerAgent: PlannerAgent,
    private readonly codeAgent: CodeAgent,
    private readonly testAgent: TestAgent,
  ) {}

  async listTickets() {
    return this.ticketService.listTickets();
  }

  async plan(ticketId: string): Promise<PlanResult> {
    logStep("Reading ticket...");
    const ticket = await this.ticketService.readTicket(ticketId);

    logStep("Analyzing repo...");
    const context = await this.contextBuilder.build(ticket);

    logStep("Generating plan...");
    const result = await this.plannerAgent.run(ticket, context);
    await this.stateService.setTicketStatus(ticketId, "PLANNED");
    return result;
  }

  async execute(ticketId: string): Promise<ExecuteResult> {
    logStep("Reading ticket...");
    const ticket = await this.ticketService.readTicket(ticketId);

    logStep("Analyzing repo...");
    const context = await this.contextBuilder.build(ticket);

    logStep("Generating plan...");
    const plan = await this.plannerAgent.run(ticket, context);
    for (const [index, step] of plan.steps.entries()) {
      console.log(`${index + 1}. ${step}`);
    }

    logStep("Updating files...");
    const codeChanges = await this.codeAgent.run(ticket, context);
    await writeChanges(codeChanges);

    logStep("Generating tests...");
    const testChanges = await this.testAgent.run(ticket, codeChanges);
    await writeChanges(testChanges);

    await this.stateService.setTicketStatus(
      ticketId,
      "IN_DEVELOPMENT",
      "Code and tests generated locally.",
    );

    return {
      updatedFiles: codeChanges.map((change) => change.path),
      generatedTests: testChanges.map((change) => change.path),
      ticketStatus: "IN_DEVELOPMENT",
    };
  }

  async status(
    currentMode: "command" | "nlp" | "devops" = "command",
  ): Promise<RepoStatus> {
    const tickets = await this.ticketService.listTickets();
    const statuses = await this.stateService.getTicketStatuses(tickets);

    return {
      tickets: statuses,
      currentMode,
      ai: {
        configured: hasAzureOpenAiConfig(),
        mode: env.useMock ? "mock" : "azure",
      },
    };
  }

  async setTicketStatus(
    ticketId: string,
    status: TicketStatusValue,
    note?: string,
  ) {
    if (!(await this.ticketService.ticketExists(ticketId))) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }

    return this.stateService.setTicketStatus(ticketId, status, note);
  }

  async resetTicketStatus(ticketId: string): Promise<void> {
    if (!(await this.ticketService.ticketExists(ticketId))) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }

    await this.stateService.resetTicketStatus(ticketId);
  }

  async resetAllTicketStatuses(): Promise<void> {
    await this.stateService.resetAllTicketStatuses();
  }

  async push(ticketId: string): Promise<string> {
    const ticket = await this.ticketService.readTicket(ticketId);
    const message = await pushTicket(ticket);

    if (message.startsWith("Pushed changes")) {
      await this.stateService.setTicketStatus(
        ticketId,
        "COMPLETED",
        "Changes pushed by explicit user approval.",
      );
    }

    return message;
  }

  async aiHealth(): Promise<AiHealth> {
    return checkAiHealth();
  }

  async changedFiles(): Promise<string[]> {
    try {
      return await getChangedFiles();
    } catch (error) {
      return [
        error instanceof Error
          ? error.message
          : "Unable to read changed files.",
      ];
    }
  }

  async runFreeNlpChat(
    history: NlpChatTurn[],
    prompt: string,
  ): Promise<NlpChatResult> {
    const context = await this.contextBuilder.readAll();
    const result = await generateFreeNlpChat(context, history, prompt);

    return result;
  }

  async applyNlpChanges(
    changes: { path: string; content: string }[],
  ): Promise<FileSnapshot[]> {
    return applyChangesWithSnapshots(changes);
  }

  async undoNlpChanges(snapshots: FileSnapshot[]): Promise<void> {
    await restoreSnapshots(snapshots);
  }

  async explainFile(
    filePath: string,
    history: NlpChatTurn[] = [],
  ): Promise<string> {
    const content = await readWorkspaceFile(filePath);
    return explainFileWithChat(filePath, content, history);
  }

  async devopsSummary(): Promise<string[]> {
    const changedFiles = await this.changedFiles();
    const health = await this.aiHealth();

    return [
      `AI mode: ${health.mode}`,
      `AI configured: ${health.configured ? "yes" : "no"}`,
      `AI reachable: ${health.reachable ? "yes" : "no"}`,
      `Changed files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "none"}`,
      "Available actions: security scan, review changed files, push a ticket when approved.",
    ];
  }

  async runCodeScan(): Promise<ScanReport> {
    return runCodeScan(paths.appRepoDir);
  }

  async getCicdPipeline(): Promise<PipelineInfo> {
    return getPipelineInfo(paths.rootDir);
  }

  async getEnvironmentConfig(): Promise<string[]> {
    try {
      const config = getConfig();
      return getConfigSummary(config);
    } catch {
      return [
        "Configuration not yet loaded. Ensure loadConfig() was called during startup.",
      ];
    }
  }

  async mergeFeature(ticketId: string): Promise<string> {
    return mergeFeatureToDevelop(ticketId);
  }

  async rollback(target?: string): Promise<string> {
    if (target) {
      return rollbackToCommit(target);
    }
    return rollbackLastCommit();
  }
}

export function createOrchestrator(): Orchestrator {
  return new Orchestrator(
    new TicketService(),
    new StateService(),
    new ContextBuilder(),
    new PlannerAgent(),
    new CodeAgent(),
    new TestAgent(),
  );
}
