"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCli = buildCli;
const commander_1 = require("commander");
const orchestrator_1 = require("../core/orchestrator");
const ticket_catalog_1 = require("../core/ticket-catalog");
const terminal_1 = require("./terminal");
const code_scanner_1 = require("../utils/code-scanner");
const cicd_1 = require("../utils/cicd");
function buildCli() {
    const program = new commander_1.Command();
    const orchestrator = (0, orchestrator_1.createOrchestrator)();
    program
        .name("nexus")
        .description("Nexus: AI-powered SDLC terminal assistant")
        .version("0.1.0");
    program
        .command("tickets")
        .description("List all tickets from the tickets folder")
        .action(async () => {
        const tickets = await orchestrator.listTickets();
        if (tickets.length === 0) {
            console.log("No tickets found.");
            return;
        }
        for (const ticket of tickets) {
            console.log((0, ticket_catalog_1.formatTicket)(ticket));
        }
    });
    program
        .command("plan")
        .description("Generate an execution plan for a ticket")
        .argument("<ticketId>", "Ticket ID")
        .action(async (ticketId) => {
        const plan = await orchestrator.plan(ticketId);
        console.log(`Plan for ${ticketId}:`);
        for (const [index, step] of plan.steps.entries()) {
            console.log(`${index + 1}. ${step}`);
        }
    });
    program
        .command("execute")
        .description("Run the basic ticket execution flow")
        .argument("<ticketId>", "Ticket ID")
        .action(async (ticketId) => {
        const result = await orchestrator.execute(ticketId);
        console.log(`Execution finished for ${ticketId}.`);
        console.log(`Updated files: ${result.updatedFiles.join(", ") || "none"}`);
        console.log(`Generated tests: ${result.generatedTests.join(", ") || "none"}`);
        console.log(`Ticket status: ${result.ticketStatus}`);
        console.log("No git commit or push was performed.");
    });
    program
        .command("status")
        .description("Show ticket workflow status")
        .action(async () => {
        const status = await orchestrator.status();
        console.log(`Current mode: ${status.currentMode}`);
        console.log(`AI mode: ${status.ai.mode}`);
        console.log(`AI configured: ${status.ai.configured ? "yes" : "no"}`);
        for (const ticket of status.tickets) {
            console.log(`${ticket.ticketId} | ${ticket.status}`);
        }
    });
    program
        .command("ai")
        .description("Check whether Azure or mock AI is active")
        .action(async () => {
        const health = await orchestrator.aiHealth();
        console.log(`Mode: ${health.mode}`);
        console.log(`Configured: ${health.configured ? "yes" : "no"}`);
        console.log(`Reachable: ${health.reachable ? "yes" : "no"}`);
        console.log(`Message: ${health.message}`);
    });
    program
        .command("security")
        .description("Show vulnerability scan commands")
        .action(async () => {
        const changedFiles = await orchestrator.changedFiles();
        console.log("Run these commands after installing dependencies:");
        console.log("npm audit");
        console.log("cd repo && npm audit");
        console.log(`Changed files: ${changedFiles.join(", ") || "none"}`);
    });
    program
        .command("push")
        .description("Push a ticket branch explicitly")
        .argument("<ticketId>", "Ticket ID")
        .action(async (ticketId) => {
        const result = await orchestrator.push(ticketId);
        console.log(result);
    });
    program
        .command("reset-ticket")
        .description("Reset a ticket workflow status back to TODO")
        .argument("<ticketId>", "Ticket ID")
        .action(async (ticketId) => {
        await orchestrator.resetTicketStatus(ticketId);
        console.log(`Reset ticket status for ${ticketId}.`);
    });
    program
        .command("reset-all-tickets")
        .description("Reset all ticket workflow statuses")
        .action(async () => {
        await orchestrator.resetAllTicketStatuses();
        console.log("Reset all ticket statuses.");
    });
    program
        .command("scan")
        .description("Run NFR code security scan")
        .action(async () => {
        const report = await orchestrator.runCodeScan();
        const formatted = (0, code_scanner_1.formatScanReport)(report);
        console.log(formatted.join("\n"));
    });
    program
        .command("cicd")
        .description("Show Jenkins CI/CD pipeline status")
        .action(async () => {
        const info = await orchestrator.getCicdPipeline();
        const formatted = (0, cicd_1.formatPipelineInfo)(info);
        console.log(formatted.join("\n"));
    });
    program
        .command("config")
        .description("Show current environment configuration")
        .action(async () => {
        const summary = await orchestrator.getEnvironmentConfig();
        console.log(summary.join("\n"));
    });
    program
        .command("git-status")
        .description("Show git working tree status")
        .action(async () => {
        const status = await orchestrator.getGitStatus();
        console.log(status.join("\n"));
    });
    program
        .command("git-log")
        .description("Show recent git commits")
        .argument("[count]", "Number of commits to show", "10")
        .action(async (count) => {
        const log = await orchestrator.getGitLog(parseInt(count, 10));
        console.log(log.join("\n"));
    });
    program
        .command("git-branches")
        .description("List local git branches")
        .action(async () => {
        const branches = await orchestrator.getGitBranches();
        console.log(branches.join("\n"));
    });
    program
        .command("pipeline")
        .description("Show Jenkins CI/CD pipeline overview")
        .action(async () => {
        const info = await orchestrator.getDevOpsCicd();
        console.log(info.join("\n"));
    });
    program
        .command("docker-info")
        .description("Analyze and display Dockerfile metadata")
        .action(async () => {
        const info = await orchestrator.getDevOpsDockerInfo();
        console.log(info.join("\n"));
    });
    program
        .command("infra")
        .description("Show Terraform infrastructure resources")
        .action(async () => {
        const resources = await orchestrator.getDevOpsInfraResources();
        console.log(resources.join("\n"));
    });
    program
        .command("health")
        .description("Full system health check (AI, Git, Config, Pipeline)")
        .action(async () => {
        const health = await orchestrator.getDevOpsHealth();
        console.log(health.join("\n"));
    });
    program
        .command("pr-check")
        .description("Run PR readiness check (branch, commit, scan)")
        .action(async () => {
        const check = await orchestrator.getDevOpsPrCheck();
        console.log(check.join("\n"));
    });
    program
        .command("security-scan")
        .description("Run full NFR security scan on the codebase")
        .action(async () => {
        const scan = await orchestrator.getSecurityScan();
        console.log(scan.join("\n"));
    });
    program
        .command("secrets")
        .description("Check for hardcoded secrets in source code")
        .action(async () => {
        const result = await orchestrator.getSecuritySecrets();
        console.log(result.join("\n"));
    });
    program
        .command("compliance")
        .description("Run enterprise compliance check")
        .action(async () => {
        const result = await orchestrator.getSecurityCompliance();
        console.log(result.join("\n"));
    });
    program
        .command("security-dashboard")
        .description("Show full security dashboard")
        .action(async () => {
        const result = await orchestrator.getSecurityDashboard();
        console.log(result.join("\n"));
    });
    program
        .command("terminal")
        .description("Start an interactive SDLC assistant terminal")
        .action(async () => {
        await (0, terminal_1.runTerminal)(orchestrator);
    });
    return program;
}
