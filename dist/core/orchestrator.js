"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
exports.createOrchestrator = createOrchestrator;
const code_agent_1 = require("../agents/code-agent");
const planner_agent_1 = require("../agents/planner-agent");
const test_agent_1 = require("../agents/test-agent");
const env_1 = require("../config/env");
const state_service_1 = require("./state-service");
const git_1 = require("../utils/git");
const file_1 = require("../utils/file");
const llm_1 = require("../utils/llm");
const logger_1 = require("../utils/logger");
const context_builder_1 = require("./context-builder");
const ticket_service_1 = require("./ticket-service");
const code_scanner_1 = require("../utils/code-scanner");
const cicd_1 = require("../utils/cicd");
const config_manager_1 = require("../config/config-manager");
const git_2 = require("../utils/git");
const paths_1 = require("../config/paths");
const git_operations_1 = require("../utils/git-operations");
const git_nl_parser_1 = require("../utils/git-nl-parser");
const devops_operations_1 = require("../utils/devops-operations");
const devops_nl_parser_1 = require("../utils/devops-nl-parser");
const security_operations_1 = require("../utils/security-operations");
const security_nl_parser_1 = require("../utils/security-nl-parser");
const nexus_nl_parser_1 = require("../utils/nexus-nl-parser");
class Orchestrator {
    constructor(ticketService, stateService, contextBuilder, plannerAgent, codeAgent, testAgent) {
        this.ticketService = ticketService;
        this.stateService = stateService;
        this.contextBuilder = contextBuilder;
        this.plannerAgent = plannerAgent;
        this.codeAgent = codeAgent;
        this.testAgent = testAgent;
    }
    async listTickets() {
        return this.ticketService.listTickets();
    }
    async plan(ticketId, mode = "basic") {
        (0, logger_1.logStep)("Reading ticket...");
        const ticket = await this.ticketService.readTicket(ticketId);
        (0, logger_1.logStep)("Analyzing repo...");
        const context = await this.contextBuilder.build(ticket);
        (0, logger_1.logStep)("Generating plan...");
        const result = await this.plannerAgent.run(ticket, context, mode === "detailed");
        await this.stateService.setTicketStatus(ticket.id, "PLANNED");
        return result;
    }
    async execute(ticketId) {
        (0, logger_1.logStep)("Reading ticket...");
        const ticket = await this.ticketService.readTicket(ticketId);
        (0, logger_1.logStep)("Analyzing repo...");
        const context = await this.contextBuilder.build(ticket);
        (0, logger_1.logStep)("Generating plan...");
        const plan = await this.plannerAgent.run(ticket, context);
        for (const [index, step] of plan.steps.entries()) {
            console.log(`${index + 1}. ${step}`);
        }
        (0, logger_1.logStep)("Updating files...");
        const codeChanges = await this.codeAgent.run(ticket, context);
        await (0, file_1.writeChanges)(codeChanges);
        (0, logger_1.logStep)("Generating tests...");
        const testChanges = await this.testAgent.run(ticket, codeChanges);
        await (0, file_1.writeChanges)(testChanges);
        await this.stateService.setTicketStatus(ticket.id, "IN_DEVELOPMENT", "Code and tests generated locally.");
        return {
            updatedFiles: codeChanges.map((change) => change.path),
            generatedTests: testChanges.map((change) => change.path),
            ticketStatus: "IN_DEVELOPMENT",
        };
    }
    async status(currentMode = "command") {
        const tickets = await this.ticketService.listTickets();
        const statuses = await this.stateService.getTicketStatuses(tickets);
        return {
            tickets: statuses,
            currentMode,
            ai: {
                configured: (0, env_1.hasAzureOpenAiConfig)(),
                mode: env_1.env.useMock ? "mock" : "azure",
            },
        };
    }
    async setTicketStatus(ticketId, status, note) {
        if (!(await this.ticketService.ticketExists(ticketId))) {
            throw new Error(`Unknown ticket: ${ticketId}`);
        }
        return this.stateService.setTicketStatus(ticketId, status, note);
    }
    async resetTicketStatus(ticketId) {
        if (!(await this.ticketService.ticketExists(ticketId))) {
            throw new Error(`Unknown ticket: ${ticketId}`);
        }
        await this.stateService.resetTicketStatus(ticketId);
    }
    async resetAllTicketStatuses() {
        await this.stateService.resetAllTicketStatuses();
    }
    async push(ticketId) {
        const ticket = await this.ticketService.readTicket(ticketId);
        const message = await (0, git_1.pushTicket)(ticket);
        if (message.startsWith("Pushed changes")) {
            await this.stateService.setTicketStatus(ticket.id, "COMPLETED", "Changes pushed by explicit user approval.");
        }
        return message;
    }
    async aiHealth() {
        return (0, llm_1.checkAiHealth)();
    }
    async changedFiles() {
        try {
            return await (0, git_1.getChangedFiles)();
        }
        catch (error) {
            return [
                error instanceof Error
                    ? error.message
                    : "Unable to read changed files.",
            ];
        }
    }
    async runFreeNlpChat(history, prompt) {
        const context = await this.contextBuilder.readAll();
        const result = await (0, llm_1.generateFreeNlpChat)(context, history, prompt);
        return result;
    }
    async applyNlpChanges(changes) {
        return (0, file_1.applyChangesWithSnapshots)(changes);
    }
    async undoNlpChanges(snapshots) {
        await (0, file_1.restoreSnapshots)(snapshots);
    }
    async explainFile(filePath, history = []) {
        const content = await (0, file_1.readWorkspaceFile)(filePath);
        return (0, llm_1.explainFileWithChat)(filePath, content, history);
    }
    async devopsSummary() {
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
    async runCodeScan() {
        return (0, code_scanner_1.runCodeScan)(paths_1.paths.appRepoDir);
    }
    async getCicdPipeline() {
        return (0, cicd_1.getPipelineInfo)(paths_1.paths.rootDir);
    }
    async getEnvironmentConfig() {
        try {
            const config = (0, config_manager_1.getConfig)();
            return (0, config_manager_1.getConfigSummary)(config);
        }
        catch {
            return [
                "Configuration not yet loaded. Ensure loadConfig() was called during startup.",
            ];
        }
    }
    async mergeFeature(ticketId) {
        return (0, git_2.mergeFeatureToDevelop)(ticketId);
    }
    async rollback(target) {
        if (target) {
            return (0, git_2.rollbackToCommit)(target);
        }
        return (0, git_2.rollbackLastCommit)();
    }
    // -------------------------------------------------------------------------
    // Git Operations — used by the interactive Git mode
    // -------------------------------------------------------------------------
    async getGitStatus() {
        return (0, git_operations_1.gitStatus)();
    }
    async getGitLog(count) {
        return (0, git_operations_1.gitLog)(count);
    }
    async getGitDiff(file) {
        return (0, git_operations_1.gitDiff)(file);
    }
    async getGitDiffStaged() {
        return (0, git_operations_1.gitDiffStaged)();
    }
    async runGitAdd(filePath) {
        return (0, git_operations_1.gitAdd)(filePath);
    }
    async runGitAddAll() {
        return (0, git_operations_1.gitAddAll)();
    }
    async runGitCommit(message) {
        return (0, git_operations_1.gitCommit)(message);
    }
    async runGitCommitAll(message) {
        return (0, git_operations_1.gitCommitAll)(message);
    }
    async getGitBranches() {
        return (0, git_operations_1.gitListBranches)();
    }
    async runGitCreateBranch(name) {
        return (0, git_operations_1.gitCreateBranch)(name);
    }
    async runGitCheckout(name) {
        return (0, git_operations_1.gitCheckout)(name);
    }
    async runGitDeleteBranch(name) {
        return (0, git_operations_1.gitDeleteBranch)(name);
    }
    async runGitPull() {
        return (0, git_operations_1.gitPull)();
    }
    async runGitPush(branch) {
        return (0, git_operations_1.gitPush)(branch);
    }
    async runGitFetch() {
        return (0, git_operations_1.gitFetch)();
    }
    async getGitRemotes() {
        return (0, git_operations_1.gitListRemotes)();
    }
    async runGitStash() {
        return (0, git_operations_1.gitStash)();
    }
    async runGitStashPop() {
        return (0, git_operations_1.gitStashPop)();
    }
    async getGitStashList() {
        return (0, git_operations_1.gitStashList)();
    }
    async runGitTag(name) {
        return (0, git_operations_1.gitTag)(name);
    }
    async getGitTags() {
        return (0, git_operations_1.gitListTags)();
    }
    async runGitUnstage(filePath) {
        return (0, git_operations_1.gitUnstage)(filePath);
    }
    async runGitCherryPick(sha) {
        return (0, git_operations_1.gitCherryPick)(sha);
    }
    async getGitBlame(filePath) {
        return (0, git_operations_1.gitBlame)(filePath);
    }
    async getGitShowCommit(sha) {
        return (0, git_operations_1.gitShowCommit)(sha);
    }
    async runGitMerge(branch) {
        return (0, git_operations_1.gitMerge)(branch);
    }
    async parseGitNaturalLanguage(input) {
        return (0, git_nl_parser_1.parseGitIntentWithLlm)(input);
    }
    getGitHelp() {
        return (0, git_nl_parser_1.getGitCommandHelp)();
    }
    // -------------------------------------------------------------------------
    // DevOps Operations — used by the interactive DevOps mode
    // -------------------------------------------------------------------------
    // CI/CD
    async getDevOpsCicd() { return (0, devops_operations_1.getCicdOverview)(); }
    async getDevOpsJenkinsValidate() { return (0, devops_operations_1.validateJenkins)(); }
    async getDevOpsJenkinsStages() { return (0, devops_operations_1.getJenkinsStages)(); }
    async getDevOpsJenkinsParams() { return (0, devops_operations_1.getJenkinsParams)(); }
    async getDevOpsActions() { return (0, devops_operations_1.getGitHubActionsInfo)(); }
    async getDevOpsActionsValidate() { return (0, devops_operations_1.validateGitHubActions)(); }
    async getDevOpsPipelineHealth() { return (0, devops_operations_1.getPipelineHealth)(); }
    // Security
    async getDevOpsScan() { return (0, devops_operations_1.runFullSecurityScan)(); }
    async getDevOpsScanErrors() { return (0, devops_operations_1.runSecurityScanErrorsOnly)(); }
    async getDevOpsSecretsCheck() { return (0, devops_operations_1.checkForSecrets)(); }
    // Docker
    async getDevOpsDockerInfo() { return (0, devops_operations_1.getDockerfileInfo)(); }
    async getDevOpsDockerStages() { return (0, devops_operations_1.getDockerStages)(); }
    async getDevOpsDockerValidate() { return (0, devops_operations_1.validateDockerfile)(); }
    // Terraform
    async getDevOpsTerraformInfo() { return (0, devops_operations_1.getTerraformInfo)(); }
    async getDevOpsInfraResources() { return (0, devops_operations_1.listInfraResources)(); }
    // Environment
    async getDevOpsEnvShow() { return (0, devops_operations_1.showEnvironmentConfig)(); }
    async getDevOpsEnvCompare() { return (0, devops_operations_1.compareEnvironments)(); }
    async getDevOpsEnvValidate() { return (0, devops_operations_1.validateEnvironmentFiles)(); }
    // Dependencies
    async getDevOpsDepsAudit() { return (0, devops_operations_1.auditDependencies)(); }
    async getDevOpsDepsCheck() { return (0, devops_operations_1.checkOutdatedDeps)(); }
    async getDevOpsDepsLicenses() { return (0, devops_operations_1.checkLicenses)(); }
    // Deployment
    async getDevOpsDeployStatus() { return (0, devops_operations_1.getDeploymentStatus)(); }
    async getDevOpsDeployCheck(env) { return (0, devops_operations_1.preDeployCheck)(env); }
    async runDevOpsRelease(version) { return (0, devops_operations_1.createReleaseBranch)(version); }
    async runDevOpsHotfix(ticketId) { return (0, devops_operations_1.createHotfixBranch)(ticketId); }
    // Health & Summary
    async getDevOpsHealth() { return (0, devops_operations_1.getSystemHealth)(); }
    async getDevOpsFullSummary() { return (0, devops_operations_1.getFullDevOpsSummary)(); }
    async getDevOpsPrCheck() { return (0, devops_operations_1.runPrReadinessCheck)(); }
    // NL parsing
    async parseDevOpsNaturalLanguage(input) {
        return (0, devops_nl_parser_1.parseDevOpsIntentWithLlm)(input);
    }
    getDevOpsHelp() {
        return (0, devops_nl_parser_1.getDevOpsCommandHelp)();
    }
    // -------------------------------------------------------------------------
    // Security Operations — used by the interactive Security mode
    // -------------------------------------------------------------------------
    // Code Scanning
    async getSecurityScan() { return (0, security_operations_1.runFullScan)(); }
    async getSecurityScanErrors() { return (0, security_operations_1.runScanErrorsOnly)(); }
    async getSecurityScanWarnings() { return (0, security_operations_1.runScanWarningsOnly)(); }
    async getSecurityScanSummary() { return (0, security_operations_1.runScanSummary)(); }
    async getSecurityScanFile(filePath) { return (0, security_operations_1.scanSingleFile)(filePath); }
    async getSecurityScanRules() { return (0, security_operations_1.getScanRules)(); }
    // Secret Detection
    async getSecuritySecrets() { return (0, security_operations_1.checkSecrets)(); }
    async getSecurityEnvAudit() { return (0, security_operations_1.auditEnvFile)(); }
    async getSecuritySensitiveFields() { return (0, security_operations_1.getSensitiveFieldsReport)(); }
    // Dependency Security
    async getSecurityDepsAudit() { return (0, security_operations_1.auditDeps)(); }
    async getSecurityLicenses() { return (0, security_operations_1.checkLicenseCompliance)(); }
    // Vault & Config
    async getSecurityVaultStatus() { return (0, security_operations_1.getVaultStatus)(); }
    async getSecurityConfigValidation() { return (0, security_operations_1.validateConfigSecurity)(); }
    // Compliance & Policy
    async getSecurityCompliance() { return (0, security_operations_1.runComplianceCheck)(); }
    async getSecurityGitFlowPolicy() { return (0, security_operations_1.getGitFlowPolicy)(); }
    async getSecurityCodeOwners() { return (0, security_operations_1.getCodeOwnersReport)(); }
    // Infrastructure Security
    async getSecurityDocker() { return (0, security_operations_1.checkDockerSecurity)(); }
    async getSecurityTerraform() { return (0, security_operations_1.checkTerraformSecurity)(); }
    // Dashboard
    async getSecurityDashboard() { return (0, security_operations_1.getSecurityDashboard)(); }
    async getSecurityPosture() { return (0, security_operations_1.getSecurityPosture)(); }
    // NL parsing
    async parseSecurityNaturalLanguage(input) {
        return (0, security_nl_parser_1.parseSecurityIntentWithLlm)(input);
    }
    getSecurityHelp() {
        return (0, security_nl_parser_1.getSecurityCommandHelp)();
    }
    // -------------------------------------------------------------------------
    // Main Mode Operations
    // -------------------------------------------------------------------------
    async parseNexusNaturalLanguage(input) {
        return (0, nexus_nl_parser_1.parseNexusIntentWithLlm)(input);
    }
}
exports.Orchestrator = Orchestrator;
function createOrchestrator() {
    return new Orchestrator(new ticket_service_1.TicketService(), new state_service_1.StateService(), new context_builder_1.ContextBuilder(), new planner_agent_1.PlannerAgent(), new code_agent_1.CodeAgent(), new test_agent_1.TestAgent());
}
