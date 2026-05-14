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
import {
  gitStatus,
  gitLog,
  gitDiff,
  gitDiffStaged,
  gitAdd,
  gitAddAll,
  gitCommit,
  gitCommitAll,
  gitListBranches,
  gitCreateBranch,
  gitCheckout,
  gitDeleteBranch,
  gitPull,
  gitPush,
  gitFetch,
  gitListRemotes,
  gitStash,
  gitStashPop,
  gitStashList,
  gitTag,
  gitListTags,
  gitUnstage,
  gitCherryPick,
  gitBlame,
  gitShowCommit,
  gitMerge,
} from "../utils/git-operations";
import {
  GitIntent,
  parseGitIntentWithLlm,
  getGitCommandHelp,
} from "../utils/git-nl-parser";
import {
  getCicdOverview,
  validateJenkins,
  getJenkinsStages,
  getJenkinsParams,
  getGitHubActionsInfo,
  validateGitHubActions,
  getPipelineHealth,
  runFullSecurityScan,
  runSecurityScanErrorsOnly,
  checkForSecrets,
  getDockerfileInfo,
  getDockerStages,
  validateDockerfile,
  getTerraformInfo,
  listInfraResources,
  showEnvironmentConfig,
  compareEnvironments,
  validateEnvironmentFiles,
  auditDependencies,
  checkOutdatedDeps,
  checkLicenses,
  getDeploymentStatus,
  preDeployCheck,
  getSystemHealth,
  getFullDevOpsSummary,
  runPrReadinessCheck,
  createReleaseBranch,
  createHotfixBranch,
} from "../utils/devops-operations";
import {
  DevOpsIntent,
  parseDevOpsIntentWithLlm,
  getDevOpsCommandHelp,
} from "../utils/devops-nl-parser";
import {
  runFullScan,
  runScanErrorsOnly,
  runScanWarningsOnly,
  runScanSummary,
  scanSingleFile,
  getScanRules,
  checkSecrets,
  auditEnvFile,
  getSensitiveFieldsReport,
  auditDeps,
  checkLicenseCompliance,
  getVaultStatus,
  validateConfigSecurity,
  runComplianceCheck,
  getGitFlowPolicy,
  getCodeOwnersReport,
  checkDockerSecurity,
  checkTerraformSecurity,
  getSecurityDashboard,
  getSecurityPosture,
  getSecurityScanStatus,
} from "../utils/security-operations";
import {
  SecurityIntent,
  parseSecurityIntentWithLlm,
  getSecurityCommandHelp,
} from "../utils/security-nl-parser";
import {
  NexusIntent,
  parseNexusIntentWithLlm,
} from "../utils/nexus-nl-parser";

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

  async plan(ticketId: string, mode: "basic" | "detailed" = "basic"): Promise<PlanResult> {
    logStep("Reading ticket...");
    const ticket = await this.ticketService.readTicket(ticketId);

    logStep("Analyzing repo...");
    const context = await this.contextBuilder.build(ticket);

    logStep("Generating plan...");
    const result = await this.plannerAgent.run(ticket, context, mode === "detailed");
    await this.stateService.setTicketStatus(ticket.id, "PLANNED");
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
      ticket.id,
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
    currentMode: "command" | "nlp" | "devops" | "git" = "command",
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
        ticket.id,
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

  // -------------------------------------------------------------------------
  // Git Operations — used by the interactive Git mode
  // -------------------------------------------------------------------------

  async getGitStatus(): Promise<string[]> {
    return gitStatus();
  }

  async getGitLog(count?: number): Promise<string[]> {
    return gitLog(count);
  }

  async getGitDiff(file?: string): Promise<string[]> {
    return gitDiff(file);
  }

  async getGitDiffStaged(): Promise<string[]> {
    return gitDiffStaged();
  }

  async runGitAdd(filePath: string): Promise<string> {
    return gitAdd(filePath);
  }

  async runGitAddAll(): Promise<string> {
    return gitAddAll();
  }

  async runGitCommit(message: string): Promise<string> {
    return gitCommit(message);
  }

  async runGitCommitAll(message: string): Promise<string> {
    return gitCommitAll(message);
  }

  async getGitBranches(): Promise<string[]> {
    return gitListBranches();
  }

  async runGitCreateBranch(name: string): Promise<string> {
    return gitCreateBranch(name);
  }

  async runGitCheckout(name: string): Promise<string> {
    return gitCheckout(name);
  }

  async runGitDeleteBranch(name: string): Promise<string> {
    return gitDeleteBranch(name);
  }

  async runGitPull(): Promise<string> {
    return gitPull();
  }

  async runGitPush(branch?: string): Promise<string> {
    return gitPush(branch);
  }

  async runGitFetch(): Promise<string> {
    return gitFetch();
  }

  async getGitRemotes(): Promise<string[]> {
    return gitListRemotes();
  }

  async runGitStash(): Promise<string> {
    return gitStash();
  }

  async runGitStashPop(): Promise<string> {
    return gitStashPop();
  }

  async getGitStashList(): Promise<string[]> {
    return gitStashList();
  }

  async runGitTag(name: string): Promise<string> {
    return gitTag(name);
  }

  async getGitTags(): Promise<string[]> {
    return gitListTags();
  }

  async runGitUnstage(filePath: string): Promise<string> {
    return gitUnstage(filePath);
  }

  async runGitCherryPick(sha: string): Promise<string> {
    return gitCherryPick(sha);
  }

  async getGitBlame(filePath: string): Promise<string[]> {
    return gitBlame(filePath);
  }

  async getGitShowCommit(sha: string): Promise<string[]> {
    return gitShowCommit(sha);
  }

  async runGitMerge(branch: string): Promise<string> {
    return gitMerge(branch);
  }

  async parseGitNaturalLanguage(input: string): Promise<GitIntent> {
    return parseGitIntentWithLlm(input);
  }

  getGitHelp(): string[] {
    return getGitCommandHelp();
  }

  // -------------------------------------------------------------------------
  // DevOps Operations — used by the interactive DevOps mode
  // -------------------------------------------------------------------------

  // CI/CD
  async getDevOpsCicd(): Promise<string[]> { return getCicdOverview(); }
  async getDevOpsJenkinsValidate(): Promise<string[]> { return validateJenkins(); }
  async getDevOpsJenkinsStages(): Promise<string[]> { return getJenkinsStages(); }
  async getDevOpsJenkinsParams(): Promise<string[]> { return getJenkinsParams(); }
  async getDevOpsActions(): Promise<string[]> { return getGitHubActionsInfo(); }
  async getDevOpsActionsValidate(): Promise<string[]> { return validateGitHubActions(); }
  async getDevOpsPipelineHealth(): Promise<string[]> { return getPipelineHealth(); }

  // Security
  async getDevOpsScan(): Promise<string[]> { return runFullSecurityScan(); }
  async getDevOpsScanErrors(): Promise<string[]> { return runSecurityScanErrorsOnly(); }
  async getDevOpsSecretsCheck(): Promise<string[]> { return checkForSecrets(); }

  // Docker
  async getDevOpsDockerInfo(): Promise<string[]> { return getDockerfileInfo(); }
  async getDevOpsDockerStages(): Promise<string[]> { return getDockerStages(); }
  async getDevOpsDockerValidate(): Promise<string[]> { return validateDockerfile(); }

  // Terraform
  async getDevOpsTerraformInfo(): Promise<string[]> { return getTerraformInfo(); }
  async getDevOpsInfraResources(): Promise<string[]> { return listInfraResources(); }

  // Environment
  async getDevOpsEnvShow(): Promise<string[]> { return showEnvironmentConfig(); }
  async getDevOpsEnvCompare(): Promise<string[]> { return compareEnvironments(); }
  async getDevOpsEnvValidate(): Promise<string[]> { return validateEnvironmentFiles(); }

  // Dependencies
  async getDevOpsDepsAudit(): Promise<string[]> { return auditDependencies(); }
  async getDevOpsDepsCheck(): Promise<string[]> { return checkOutdatedDeps(); }
  async getDevOpsDepsLicenses(): Promise<string[]> { return checkLicenses(); }

  // Deployment
  async getDevOpsDeployStatus(): Promise<string[]> { return getDeploymentStatus(); }
  async getDevOpsDeployCheck(env: string): Promise<string[]> { return preDeployCheck(env); }
  async runDevOpsRelease(version: string): Promise<string> { return createReleaseBranch(version); }
  async runDevOpsHotfix(ticketId: string): Promise<string> { return createHotfixBranch(ticketId); }

  // Health & Summary
  async getDevOpsHealth(): Promise<string[]> { return getSystemHealth(); }
  async getDevOpsFullSummary(): Promise<string[]> { return getFullDevOpsSummary(); }
  async getDevOpsPrCheck(): Promise<string[]> { return runPrReadinessCheck(); }

  // NL parsing
  async parseDevOpsNaturalLanguage(input: string): Promise<DevOpsIntent> {
    return parseDevOpsIntentWithLlm(input);
  }

  getDevOpsHelp(): string[] {
    return getDevOpsCommandHelp();
  }

  // -------------------------------------------------------------------------
  // Security Operations — used by the interactive Security mode
  // -------------------------------------------------------------------------

  // Code Scanning
  async getSecurityScan(): Promise<string[]> { return runFullScan(); }
  async getSecurityScanErrors(): Promise<string[]> { return runScanErrorsOnly(); }
  async getSecurityScanWarnings(): Promise<string[]> { return runScanWarningsOnly(); }
  async getSecurityScanSummary(): Promise<string[]> { return runScanSummary(); }
  async getSecurityScanFile(filePath: string): Promise<string[]> { return scanSingleFile(filePath); }
  async getSecurityScanRules(): Promise<string[]> { return getScanRules(); }

  // Secret Detection
  async getSecuritySecrets(): Promise<string[]> { return checkSecrets(); }
  async getSecurityEnvAudit(): Promise<string[]> { return auditEnvFile(); }
  async getSecuritySensitiveFields(): Promise<string[]> { return getSensitiveFieldsReport(); }

  // Dependency Security
  async getSecurityDepsAudit(): Promise<string[]> { return auditDeps(); }
  async getSecurityLicenses(): Promise<string[]> { return checkLicenseCompliance(); }

  // Vault & Config
  async getSecurityVaultStatus(): Promise<string[]> { return getVaultStatus(); }
  async getSecurityConfigValidation(): Promise<string[]> { return validateConfigSecurity(); }

  // Compliance & Policy
  async getSecurityCompliance(): Promise<string[]> { return runComplianceCheck(); }
  async getSecurityGitFlowPolicy(): Promise<string[]> { return getGitFlowPolicy(); }
  async getSecurityCodeOwners(): Promise<string[]> { return getCodeOwnersReport(); }

  // Infrastructure Security
  async getSecurityDocker(): Promise<string[]> { return checkDockerSecurity(); }
  async getSecurityTerraform(): Promise<string[]> { return checkTerraformSecurity(); }

  // Dashboard
  async getSecurityDashboard(): Promise<string[]> { return getSecurityDashboard(); }
  async getSecurityPosture(): Promise<string[]> { return getSecurityPosture(); }
  async getSecurityStatus(): Promise<string[]> { return getSecurityScanStatus(); }

  // NL parsing
  async parseSecurityNaturalLanguage(input: string): Promise<SecurityIntent> {
    return parseSecurityIntentWithLlm(input);
  }

  getSecurityHelp(): string[] {
    return getSecurityCommandHelp();
  }

  // -------------------------------------------------------------------------
  // Main Mode Operations
  // -------------------------------------------------------------------------

  async parseNexusNaturalLanguage(input: string): Promise<NexusIntent> {
    return parseNexusIntentWithLlm(input);
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
