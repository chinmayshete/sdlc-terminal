import { Command } from "commander";
import { createOrchestrator } from "../core/orchestrator";
import { formatTicket } from "../core/ticket-catalog";
import { runTerminal } from "./terminal";
import { formatScanReport } from "../utils/code-scanner";
import { formatPipelineInfo } from "../utils/cicd";

export function buildCli(): Command {
  const program = new Command();
  const orchestrator = createOrchestrator();

  program
    .name("sdlc")
    .description("Minimal SDLC assistant CLI")
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
        console.log(formatTicket(ticket));
      }
    });

  program
    .command("plan")
    .description("Generate an execution plan for a ticket")
    .argument("<ticketId>", "Ticket ID")
    .action(async (ticketId: string) => {
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
    .action(async (ticketId: string) => {
      const result = await orchestrator.execute(ticketId);

      console.log(`Execution finished for ${ticketId}.`);
      console.log(`Updated files: ${result.updatedFiles.join(", ") || "none"}`);
      console.log(
        `Generated tests: ${result.generatedTests.join(", ") || "none"}`,
      );
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
    .action(async (ticketId: string) => {
      const result = await orchestrator.push(ticketId);
      console.log(result);
    });

  program
    .command("reset-ticket")
    .description("Reset a ticket workflow status back to TODO")
    .argument("<ticketId>", "Ticket ID")
    .action(async (ticketId: string) => {
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
      const formatted = formatScanReport(report);
      console.log(formatted.join("\n"));
    });

  program
    .command("cicd")
    .description("Show Jenkins CI/CD pipeline status")
    .action(async () => {
      const info = await orchestrator.getCicdPipeline();
      const formatted = formatPipelineInfo(info);
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
    .command("terminal")
    .description("Start an interactive SDLC assistant terminal")
    .action(async () => {
      await runTerminal(orchestrator);
    });

  return program;
}
