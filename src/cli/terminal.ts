import readline from "readline";
import { Orchestrator } from "../core/orchestrator";
import { formatTicket } from "../core/ticket-catalog";
import { FileSnapshot, NlpChatTurn, TicketStatusEntry } from "../core/types";
import { accent, danger, panel, renderBanner, warning } from "../utils/theme";
import { formatScanReport } from "../utils/code-scanner";
import { formatPipelineInfo } from "../utils/cicd";

type TerminalMode = "command" | "nlp" | "devops";

interface NlpSessionState {
  history: NlpChatTurn[];
  appliedSnapshots: FileSnapshot[][];
  lastDiff: string[];
}

export async function runTerminal(orchestrator: Orchestrator): Promise<void> {
  console.log(renderBanner());
  console.log(
    panel("Quick Start", [
      "Commands: tickets | plan <id> | execute <id> | status | ai | security | nlp | devops | push <id> | help | exit",
      "NLP mode is free chat with repo awareness and editing tools.",
      "Execute updates ticket state only. Push is explicit and asks for permission in-terminal.",
    ]),
  );

  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: accent("sdlc > "),
  });

  let mode: TerminalMode = "command";
  let nlpState: NlpSessionState = createNlpSessionState();
  let isClosed = false;

  reader.on("close", () => {
    isClosed = true;
  });

  updatePrompt(reader, mode);
  reader.prompt();

  reader.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      if (!isClosed) {
        reader.prompt();
      }
      return;
    }

    let shouldClose = false;

    try {
      if (mode === "nlp") {
        const next = await handleNlpInput(orchestrator, input, nlpState);
        nlpState = next.state;
        if (next.exitMode) {
          mode = "command";
          nlpState = createNlpSessionState();
        }
      } else if (mode === "devops") {
        const next = await handleDevopsInput(orchestrator, reader, input);
        if (next.exitMode) {
          mode = "command";
        }
      } else {
        const next = await handleCommandInput(orchestrator, reader, input);
        mode = next.mode;
        if (mode === "nlp") {
          nlpState = createNlpSessionState();
        }
        shouldClose = next.closeTerminal;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(danger(message));
    }

    if (shouldClose) {
      console.log(accent("Session closed."));
      reader.close();
      return;
    }

    if (!isClosed) {
      updatePrompt(reader, mode);
      reader.prompt();
    }
  });

  await new Promise<void>((resolve) => {
    reader.on("close", () => resolve());
  });
}

async function handleCommandInput(
  orchestrator: Orchestrator,
  reader: readline.Interface,
  input: string,
): Promise<{ mode: TerminalMode; closeTerminal: boolean }> {
  const [command, ...args] = input.split(/\s+/);

  switch (command) {
    case "tickets": {
      const tickets = await orchestrator.listTickets();
      console.log(
        panel(
          "Tickets",
          tickets.length > 0
            ? tickets.map((ticket) => formatTicket(ticket))
            : ["No tickets found."],
        ),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "plan": {
      const ticketId = args[0];
      if (!ticketId) {
        console.log(warning("Usage: plan <ticketId>"));
        return { mode: "command", closeTerminal: false };
      }

      const plan = await orchestrator.plan(ticketId);
      console.log(
        panel(
          `Plan ${ticketId}`,
          plan.steps.map((step, index) => `${index + 1}. ${step}`),
        ),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "execute": {
      const ticketId = args[0];
      if (!ticketId) {
        console.log(warning("Usage: execute <ticketId>"));
        return { mode: "command", closeTerminal: false };
      }

      const result = await orchestrator.execute(ticketId);
      console.log(
        panel(`Execution ${ticketId}`, [
          `Updated files: ${result.updatedFiles.join(", ") || "none"}`,
          `Generated tests: ${result.generatedTests.join(", ") || "none"}`,
          `Ticket status: ${result.ticketStatus}`,
          "No git commit or push was performed.",
        ]),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "status": {
      const status = await orchestrator.status("command");
      console.log(
        panel("Ticket Status", [
          `Current mode: ${status.currentMode}`,
          `AI mode: ${status.ai.mode}`,
          `AI configured: ${status.ai.configured ? "yes" : "no"}`,
          ...renderTicketStatuses(status.tickets),
        ]),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "ai": {
      const health = await orchestrator.aiHealth();
      console.log(
        panel("AI Health", [
          `Mode: ${health.mode}`,
          `Configured: ${health.configured ? "yes" : "no"}`,
          `Reachable: ${health.reachable ? "yes" : "no"}`,
          `Message: ${health.message}`,
        ]),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "security": {
      const scan = await runSecurityScan(orchestrator);
      console.log(panel("Security Scan", scan));
      return { mode: "command", closeTerminal: false };
    }
    case "nlp": {
      console.log(
        panel("NLP Mode", [
          "Free chat mode with access to the local repo.",
          'Chat naturally: "hi", "summarize the auth flow", "how does routes.ts work?"',
          'Edit directly: "edit repo/src/routes.ts: add versioned api routes"',
          "Tools: explain <file>, show diff, undo last nlp change, exit",
        ]),
      );
      return { mode: "nlp", closeTerminal: false };
    }
    case "devops": {
      console.log(
        panel("DevOps Mode", [
          "Analyze codebase and run ops-focused commands.",
          'Use "summary", "scan", "cicd", "merge <ticketId>", "rollback", "changed", "push <ticketId>", or "exit".',
        ]),
      );
      return { mode: "devops", closeTerminal: false };
    }
    case "push": {
      const ticketId = args[0];
      if (!ticketId) {
        console.log(warning("Usage: push <ticketId>"));
        return { mode: "command", closeTerminal: false };
      }

      const allowed = await askYesNo(
        reader,
        `Push ${ticketId} to git remote now? (yes/no) `,
      );
      if (!allowed) {
        console.log(warning("Push cancelled."));
        return { mode: "command", closeTerminal: false };
      }

      const result = await orchestrator.push(ticketId);
      console.log(panel("Push Result", [result]));
      return { mode: "command", closeTerminal: false };
    }
    case "help": {
      console.log(
        panel("Help", [
          "tickets            List local tickets",
          "plan AUTH-101      Build a plan for a ticket",
          "execute AUTH-101   Generate code and tests locally",
          "status             Show ticket statuses",
          "ai                 Verify Azure or mock AI mode",
          "security           Show vulnerability scan workflow",
          "nlp                Enter free-form repo chat mode",
          "devops             Enter DevOps assistant mode",
          "push AUTH-101      Push only after in-terminal approval",
          "reset AUTH-101     Reset one ticket status back to TODO",
          "reset-all          Reset every tracked ticket status",
          "exit               Close the terminal",
        ]),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "reset": {
      const ticketId = args[0];
      if (ticketId?.toLowerCase() === "all") {
        await orchestrator.resetAllTicketStatuses();
        console.log(
          panel("Reset", ["All ticket statuses were reset to TODO."]),
        );
        return { mode: "command", closeTerminal: false };
      }

      if (!ticketId) {
        console.log(warning("Usage: reset <ticketId>"));
        return { mode: "command", closeTerminal: false };
      }

      await orchestrator.resetTicketStatus(ticketId);
      console.log(
        panel("Reset", [`Ticket ${ticketId} status was reset to TODO.`]),
      );
      return { mode: "command", closeTerminal: false };
    }
    case "reset-all": {
      await orchestrator.resetAllTicketStatuses();
      console.log(panel("Reset", ["All ticket statuses were reset to TODO."]));
      return { mode: "command", closeTerminal: false };
    }
    case "exit":
    case "quit":
      return { mode: "command", closeTerminal: true };
    default:
      console.log(danger(`Unknown command: ${command}`));
      return { mode: "command", closeTerminal: false };
  }
}

async function handleNlpInput(
  orchestrator: Orchestrator,
  input: string,
  state: NlpSessionState,
): Promise<{ exitMode: boolean; state: NlpSessionState }> {
  const normalized = input.toLowerCase();

  if (normalized === "exit" || normalized === "quit") {
    console.log(accent("Leaving NLP mode."));
    return { exitMode: true, state };
  }

  if (normalized === "help") {
    console.log(
      panel("NLP Help", [
        'Chat normally: "hi", "summarize the repo", "what does auth.controller do?"',
        'Target a file: "edit repo/src/routes.ts: add versioned api routes"',
        'Explain a file: "explain repo/src/routes.ts"',
        'General explanation: "explain the auth flow" or "explain me the code base"',
        'Inspect changes: "show diff"',
        'Rollback: "undo last nlp change"',
      ]),
    );
    return { exitMode: false, state };
  }

  if (normalized === "show diff") {
    console.log(
      panel(
        "Last Diff",
        state.lastDiff.length > 0
          ? state.lastDiff
          : ["No NLP changes to diff yet."],
      ),
    );
    return { exitMode: false, state };
  }

  if (normalized === "undo last nlp change") {
    const lastSnapshots =
      state.appliedSnapshots[state.appliedSnapshots.length - 1];
    if (!lastSnapshots) {
      console.log(panel("Undo", ["No NLP change is available to undo."]));
      return { exitMode: false, state };
    }

    await orchestrator.undoNlpChanges(lastSnapshots);
    const nextState: NlpSessionState = {
      ...state,
      appliedSnapshots: state.appliedSnapshots.slice(0, -1),
      lastDiff: [],
      history: [
        ...state.history,
        { role: "user", content: input },
        { role: "assistant", content: "I reverted the last NLP change set." },
      ],
    };
    console.log(panel("Undo", ["Reverted the last NLP change set."]));
    return { exitMode: false, state: nextState };
  }

  if (normalized.startsWith("explain ")) {
    const target = input.slice("explain ".length).trim();
    if (looksLikeFilePath(target)) {
      const explanation = await orchestrator.explainFile(target, state.history);
      const nextState: NlpSessionState = {
        ...state,
        history: [
          ...state.history,
          { role: "user", content: input },
          { role: "assistant", content: explanation },
        ],
      };
      console.log(panel(`Explain ${target}`, [explanation]));
      return { exitMode: false, state: nextState };
    }
  }

  const result = await orchestrator.runFreeNlpChat(state.history, input);
  const nextHistory = [
    ...state.history,
    { role: "user", content: input },
    { role: "assistant", content: result.message },
  ] satisfies NlpChatTurn[];

  if (result.changes.length === 0) {
    console.log(panel("NLP", [result.message, "No files changed."]));
    return {
      exitMode: false,
      state: {
        ...state,
        history: nextHistory,
      },
    };
  }

  const snapshots = await orchestrator.applyNlpChanges(result.changes);
  const diffLines = buildDiffLines(snapshots);
  console.log(
    panel("NLP", [
      result.message,
      `Updated files: ${result.changes.map((change) => change.path).join(", ")}`,
      'Use "show diff" to inspect or "undo last nlp change" to revert.',
    ]),
  );

  return {
    exitMode: false,
    state: {
      history: nextHistory,
      appliedSnapshots: [...state.appliedSnapshots, snapshots],
      lastDiff: diffLines,
    },
  };
}

async function handleDevopsInput(
  orchestrator: Orchestrator,
  reader: readline.Interface,
  input: string,
): Promise<{ exitMode: boolean }> {
  const [command, ...args] = input.split(/\s+/);

  switch (command) {
    case "summary": {
      console.log(panel("DevOps Summary", await orchestrator.devopsSummary()));
      return { exitMode: false };
    }
    case "security":
    case "scan": {
      console.log(panel("Security Scan", await runSecurityScan(orchestrator)));
      return { exitMode: false };
    }
    case "cicd": {
      const info = await orchestrator.getCicdPipeline();
      console.log(panel("Jenkins Pipeline", formatPipelineInfo(info)));
      return { exitMode: false };
    }
    case "changed": {
      const changedFiles = await orchestrator.changedFiles();
      console.log(
        panel(
          "Changed Files",
          changedFiles.length > 0 ? changedFiles : ["No changed files."],
        ),
      );
      return { exitMode: false };
    }
    case "merge": {
      const ticketId = args[0];
      if (!ticketId) {
        console.log(warning("Usage: merge <ticketId>"));
        return { exitMode: false };
      }
      const result = await orchestrator.mergeFeature(ticketId);
      console.log(panel("Merge Result", [result]));
      return { exitMode: false };
    }
    case "rollback": {
      const target = args[0];
      const result = await orchestrator.rollback(target);
      console.log(panel("Rollback Result", [result]));
      return { exitMode: false };
    }
    case "push": {
      const ticketId = args[0];
      if (!ticketId) {
        console.log(warning("Usage: push <ticketId>"));
        return { exitMode: false };
      }

      const allowed = await askYesNo(
        reader,
        `Push ${ticketId} to git remote now? (yes/no) `,
      );
      if (!allowed) {
        console.log(warning("Push cancelled."));
        return { exitMode: false };
      }

      const result = await orchestrator.push(ticketId);
      console.log(panel("Push Result", [result]));
      return { exitMode: false };
    }
    case "help": {
      console.log(
        panel("DevOps Help", [
          "summary            View AI health and changed files",
          "scan               Run the NFR code security scanner",
          "cicd               View the Jenkins pipeline stages",
          "changed            View locally modified files",
          "merge <ticketId>   Merge a feature branch using GitFlow standards",
          "rollback           Revert the last commit safely",
          "push <ticketId>    Push a branch to remote",
          "exit               Leave DevOps mode",
        ]),
      );
      return { exitMode: false };
    }
    case "exit":
    case "quit":
      console.log(accent("Leaving DevOps mode."));
      return { exitMode: true };
    default:
      console.log(danger(`Unknown DevOps command: ${command}`));
      return { exitMode: false };
  }
}

async function runSecurityScan(orchestrator: Orchestrator): Promise<string[]> {
  const report = await orchestrator.runCodeScan();
  return formatScanReport(report);
}

function buildDiffLines(snapshots: FileSnapshot[]): string[] {
  const lines: string[] = [];

  for (const snapshot of snapshots) {
    lines.push(`File: ${snapshot.path}`);
    const beforeLines = (snapshot.previousContent ?? "").split(/\r?\n/);
    const afterLines = snapshot.nextContent.split(/\r?\n/);
    const maxLines = Math.max(beforeLines.length, afterLines.length);

    for (let index = 0; index < maxLines; index += 1) {
      const before = beforeLines[index];
      const after = afterLines[index];

      if (before === after) {
        continue;
      }

      if (before !== undefined) {
        lines.push(`- ${before}`);
      }

      if (after !== undefined) {
        lines.push(`+ ${after}`);
      }
    }
  }

  return lines.length > 0 ? lines : ["No diff available."];
}

function createNlpSessionState(): NlpSessionState {
  return {
    history: [],
    appliedSnapshots: [],
    lastDiff: [],
  };
}

function renderTicketStatuses(entries: TicketStatusEntry[]): string[] {
  return entries.map(
    (entry) =>
      `${entry.ticketId}: ${entry.status}${entry.note ? ` | ${entry.note}` : ""}`,
  );
}

function updatePrompt(reader: readline.Interface, mode: TerminalMode): void {
  if (mode === "nlp") {
    reader.setPrompt(accent("nlp > "));
    return;
  }

  if (mode === "devops") {
    reader.setPrompt(accent("devops > "));
    return;
  }

  reader.setPrompt(accent("sdlc > "));
}

function askYesNo(
  reader: readline.Interface,
  question: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    reader.question(accent(question), (answer) => {
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

function looksLikeFilePath(value: string): boolean {
  return (
    value.includes("/") || value.includes("\\") || /\.[a-z0-9]+$/i.test(value)
  );
}
