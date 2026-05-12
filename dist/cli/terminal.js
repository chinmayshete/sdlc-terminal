"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTerminal = runTerminal;
const readline_1 = __importDefault(require("readline"));
const ticket_catalog_1 = require("../core/ticket-catalog");
const theme_1 = require("../utils/theme");
const code_scanner_1 = require("../utils/code-scanner");
async function runTerminal(orchestrator) {
    console.log((0, theme_1.renderBanner)());
    console.log((0, theme_1.panel)("Quick Start", [
        "Commands: tickets | plan <id> | execute <id> | status | ai",
        "Modes: nlp | devops | git | security",
        "Push: push <id> | help | exit",
    ]));
    const reader = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: (0, theme_1.accent)("sdlc > "),
    });
    let mode = "command";
    let nlpState = createNlpSessionState();
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
            }
            else if (mode === "devops") {
                const next = await handleDevopsInput(orchestrator, reader, input);
                if (next.exitMode) {
                    mode = "command";
                }
            }
            else if (mode === "git") {
                const next = await handleGitInput(orchestrator, reader, input);
                if (next.exitMode) {
                    mode = "command";
                }
            }
            else if (mode === "security") {
                const next = await handleSecurityInput(orchestrator, reader, input);
                if (next.exitMode) {
                    mode = "command";
                }
            }
            else {
                const next = await handleCommandInput(orchestrator, reader, input);
                mode = next.mode;
                if (mode === "nlp") {
                    nlpState = createNlpSessionState();
                }
                shouldClose = next.closeTerminal;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            console.log((0, theme_1.danger)(message));
        }
        if (shouldClose) {
            console.log((0, theme_1.accent)("Session closed."));
            reader.close();
            return;
        }
        if (!isClosed) {
            updatePrompt(reader, mode);
            reader.prompt();
        }
    });
    await new Promise((resolve) => {
        reader.on("close", () => resolve());
    });
}
async function handleCommandInput(orchestrator, reader, input) {
    const [command, ...args] = input.split(/\s+/);
    switch (command) {
        case "tickets": {
            const tickets = await orchestrator.listTickets();
            console.log((0, theme_1.panel)("Tickets", tickets.length > 0
                ? tickets.map((ticket) => (0, ticket_catalog_1.formatTicket)(ticket))
                : ["No tickets found."]));
            return { mode: "command", closeTerminal: false };
        }
        case "plan": {
            const ticketId = args[0];
            if (!ticketId) {
                console.log((0, theme_1.warning)("Usage: plan <ticketId>"));
                return { mode: "command", closeTerminal: false };
            }
            const plan = await orchestrator.plan(ticketId);
            console.log((0, theme_1.panel)(`Plan ${ticketId}`, plan.steps.map((step, index) => `${index + 1}. ${step}`)));
            return { mode: "command", closeTerminal: false };
        }
        case "execute": {
            const ticketId = args[0];
            if (!ticketId) {
                console.log((0, theme_1.warning)("Usage: execute <ticketId>"));
                return { mode: "command", closeTerminal: false };
            }
            const result = await orchestrator.execute(ticketId);
            console.log((0, theme_1.panel)(`Execution ${ticketId}`, [
                `Updated files: ${result.updatedFiles.join(", ") || "none"}`,
                `Generated tests: ${result.generatedTests.join(", ") || "none"}`,
                `Ticket status: ${result.ticketStatus}`,
                "No git commit or push was performed.",
            ]));
            return { mode: "command", closeTerminal: false };
        }
        case "status": {
            const status = await orchestrator.status("command");
            console.log((0, theme_1.panel)("Ticket Status", [
                `Current mode: ${status.currentMode}`,
                `AI mode: ${status.ai.mode}`,
                `AI configured: ${status.ai.configured ? "yes" : "no"}`,
                ...renderTicketStatuses(status.tickets),
            ]));
            return { mode: "command", closeTerminal: false };
        }
        case "ai": {
            const health = await orchestrator.aiHealth();
            console.log((0, theme_1.panel)("AI Health", [
                `Mode: ${health.mode}`,
                `Configured: ${health.configured ? "yes" : "no"}`,
                `Reachable: ${health.reachable ? "yes" : "no"}`,
                `Message: ${health.message}`,
            ]));
            return { mode: "command", closeTerminal: false };
        }
        case "security": {
            console.log((0, theme_1.panel)("Security Mode", [
                "Code scanning, secrets, vault, compliance & infrastructure.",
                "Commands: scan | secrets | vault | compliance | docker",
                "  terraform | audit | licenses | dashboard | posture",
                'Or type naturally: "check for secrets",',
                '  "is the Dockerfile secure", "how secure are we"',
                'Type "help" for full reference, "exit" to leave.',
            ]));
            return { mode: "security", closeTerminal: false };
        }
        case "nlp": {
            console.log((0, theme_1.panel)("NLP Mode", [
                "Free chat mode with access to the local repo.",
                'Chat naturally: "hi", "summarize the auth flow", "how does routes.ts work?"',
                'Edit directly: "edit repo/src/routes.ts: add versioned api routes"',
                "Tools: explain <file>, show diff, undo last nlp change, exit",
            ]));
            return { mode: "nlp", closeTerminal: false };
        }
        case "devops": {
            console.log((0, theme_1.panel)("DevOps Mode", [
                "CI/CD, Security, Docker, Terraform, Env & Deployment.",
                "Commands: cicd | scan | docker | terraform | env | deps",
                "  deploy | health | pr check | summary | changed",
                'Or type naturally: "validate the Jenkinsfile",',
                '  "check for vulnerabilities", "is everything healthy"',
                'Type "help" for full reference, "exit" to leave.',
            ]));
            return { mode: "devops", closeTerminal: false };
        }
        case "git": {
            console.log((0, theme_1.panel)("Git Mode", [
                "Full Git operations with natural language support.",
                "Commands: status | log | diff | add | commit | branch,",
                "  checkout | pull | push | stash | tag | remote | blame,",
                "  cherry-pick | reset | merge | fetch | show",
                'Or type naturally: "show me what changed",',
                '  "commit everything with message fix auth bug"',
                'Type "help" for full reference, "exit" to leave.',
            ]));
            return { mode: "git", closeTerminal: false };
        }
        case "push": {
            const ticketId = args[0];
            if (!ticketId) {
                console.log((0, theme_1.warning)("Usage: push <ticketId>"));
                return { mode: "command", closeTerminal: false };
            }
            const allowed = await askYesNo(reader, `Push ${ticketId} to git remote now? (yes/no) `);
            if (!allowed) {
                console.log((0, theme_1.warning)("Push cancelled."));
                return { mode: "command", closeTerminal: false };
            }
            const result = await orchestrator.push(ticketId);
            console.log((0, theme_1.panel)("Push Result", [result]));
            return { mode: "command", closeTerminal: false };
        }
        case "help": {
            console.log((0, theme_1.panel)("Help", [
                "tickets            List local tickets",
                "plan AUTH-101      Build a plan for a ticket",
                "execute AUTH-101   Generate code and tests locally",
                "status             Show ticket statuses",
                "ai                 Verify Azure or mock AI mode",
                "security           Enter Security assistant mode",
                "nlp                Enter free-form repo chat mode",
                "devops             Enter DevOps assistant mode",
                "git                Enter Git operations mode",
                "push AUTH-101      Push only after in-terminal approval",
                "reset AUTH-101     Reset one ticket status back to TODO",
                "reset-all          Reset every tracked ticket status",
                "exit               Close the terminal",
            ]));
            return { mode: "command", closeTerminal: false };
        }
        case "reset": {
            const ticketId = args[0];
            if (ticketId?.toLowerCase() === "all") {
                await orchestrator.resetAllTicketStatuses();
                console.log((0, theme_1.panel)("Reset", ["All ticket statuses were reset to TODO."]));
                return { mode: "command", closeTerminal: false };
            }
            if (!ticketId) {
                console.log((0, theme_1.warning)("Usage: reset <ticketId>"));
                return { mode: "command", closeTerminal: false };
            }
            await orchestrator.resetTicketStatus(ticketId);
            console.log((0, theme_1.panel)("Reset", [`Ticket ${ticketId} status was reset to TODO.`]));
            return { mode: "command", closeTerminal: false };
        }
        case "reset-all": {
            await orchestrator.resetAllTicketStatuses();
            console.log((0, theme_1.panel)("Reset", ["All ticket statuses were reset to TODO."]));
            return { mode: "command", closeTerminal: false };
        }
        case "exit":
        case "quit":
            return { mode: "command", closeTerminal: true };
        default:
            console.log((0, theme_1.danger)(`Unknown command: ${command}`));
            return { mode: "command", closeTerminal: false };
    }
}
async function handleNlpInput(orchestrator, input, state) {
    const normalized = input.toLowerCase();
    if (normalized === "exit" || normalized === "quit") {
        console.log((0, theme_1.accent)("Leaving NLP mode."));
        return { exitMode: true, state };
    }
    if (normalized === "help") {
        console.log((0, theme_1.panel)("NLP Help", [
            'Chat normally: "hi", "summarize the repo", "what does auth.controller do?"',
            'Target a file: "edit repo/src/routes.ts: add versioned api routes"',
            'Explain a file: "explain repo/src/routes.ts"',
            'General explanation: "explain the auth flow" or "explain me the code base"',
            'Inspect changes: "show diff"',
            'Rollback: "undo last nlp change"',
        ]));
        return { exitMode: false, state };
    }
    if (normalized === "show diff") {
        console.log((0, theme_1.panel)("Last Diff", state.lastDiff.length > 0
            ? state.lastDiff
            : ["No NLP changes to diff yet."]));
        return { exitMode: false, state };
    }
    if (normalized === "undo last nlp change") {
        const lastSnapshots = state.appliedSnapshots[state.appliedSnapshots.length - 1];
        if (!lastSnapshots) {
            console.log((0, theme_1.panel)("Undo", ["No NLP change is available to undo."]));
            return { exitMode: false, state };
        }
        await orchestrator.undoNlpChanges(lastSnapshots);
        const nextState = {
            ...state,
            appliedSnapshots: state.appliedSnapshots.slice(0, -1),
            lastDiff: [],
            history: [
                ...state.history,
                { role: "user", content: input },
                { role: "assistant", content: "I reverted the last NLP change set." },
            ],
        };
        console.log((0, theme_1.panel)("Undo", ["Reverted the last NLP change set."]));
        return { exitMode: false, state: nextState };
    }
    if (normalized.startsWith("explain ")) {
        const target = input.slice("explain ".length).trim();
        if (looksLikeFilePath(target)) {
            const explanation = await orchestrator.explainFile(target, state.history);
            const nextState = {
                ...state,
                history: [
                    ...state.history,
                    { role: "user", content: input },
                    { role: "assistant", content: explanation },
                ],
            };
            console.log((0, theme_1.panel)(`Explain ${target}`, [explanation]));
            return { exitMode: false, state: nextState };
        }
    }
    const result = await orchestrator.runFreeNlpChat(state.history, input);
    const nextHistory = [
        ...state.history,
        { role: "user", content: input },
        { role: "assistant", content: result.message },
    ];
    if (result.changes.length === 0) {
        console.log((0, theme_1.panel)("NLP", [result.message, "No files changed."]));
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
    console.log((0, theme_1.panel)("NLP", [
        result.message,
        `Updated files: ${result.changes.map((change) => change.path).join(", ")}`,
        'Use "show diff" to inspect or "undo last nlp change" to revert.',
    ]));
    return {
        exitMode: false,
        state: {
            history: nextHistory,
            appliedSnapshots: [...state.appliedSnapshots, snapshots],
            lastDiff: diffLines,
        },
    };
}
async function handleDevopsInput(orchestrator, reader, input) {
    const normalized = input.toLowerCase().trim();
    if (normalized === "exit" || normalized === "quit") {
        console.log((0, theme_1.accent)("Leaving DevOps mode."));
        return { exitMode: true };
    }
    if (normalized === "help") {
        console.log((0, theme_1.panel)("DevOps Help", orchestrator.getDevOpsHelp()));
        return { exitMode: false };
    }
    // Parse intent — tries rule-based first, then LLM fallback
    const intent = await orchestrator.parseDevOpsNaturalLanguage(input);
    if (intent.command === "unknown") {
        console.log((0, theme_1.danger)(`Could not parse DevOps command. Type "help" for available commands.`));
        return { exitMode: false };
    }
    const result = await executeDevOpsIntent(orchestrator, reader, intent);
    if (typeof result === "string") {
        console.log((0, theme_1.panel)("DevOps", [result]));
    }
    else {
        console.log((0, theme_1.panel)("DevOps", result));
    }
    return { exitMode: false };
}
async function executeDevOpsIntent(orchestrator, reader, intent) {
    switch (intent.command) {
        // CI/CD
        case "cicd": return orchestrator.getDevOpsCicd();
        case "jenkins-validate": return orchestrator.getDevOpsJenkinsValidate();
        case "jenkins-stages": return orchestrator.getDevOpsJenkinsStages();
        case "jenkins-params": return orchestrator.getDevOpsJenkinsParams();
        case "actions": return orchestrator.getDevOpsActions();
        case "actions-validate": return orchestrator.getDevOpsActionsValidate();
        case "pipeline-health": return orchestrator.getDevOpsPipelineHealth();
        // Security
        case "scan": return orchestrator.getDevOpsScan();
        case "scan-errors": return orchestrator.getDevOpsScanErrors();
        case "secrets-check": return orchestrator.getDevOpsSecretsCheck();
        // Docker
        case "docker-info": return orchestrator.getDevOpsDockerInfo();
        case "docker-stages": return orchestrator.getDevOpsDockerStages();
        case "docker-validate": return orchestrator.getDevOpsDockerValidate();
        // Terraform
        case "terraform-info": return orchestrator.getDevOpsTerraformInfo();
        case "infra-resources": return orchestrator.getDevOpsInfraResources();
        // Environment
        case "env-show": return orchestrator.getDevOpsEnvShow();
        case "env-compare": return orchestrator.getDevOpsEnvCompare();
        case "env-validate": return orchestrator.getDevOpsEnvValidate();
        // Dependencies
        case "deps-audit": return orchestrator.getDevOpsDepsAudit();
        case "deps-check": return orchestrator.getDevOpsDepsCheck();
        case "deps-licenses": return orchestrator.getDevOpsDepsLicenses();
        // Deployment
        case "deploy-status": return orchestrator.getDevOpsDeployStatus();
        case "deploy-check": {
            const env = intent.args[0];
            if (!env)
                return "Usage: deploy check <env> (dev/staging/prod)";
            return orchestrator.getDevOpsDeployCheck(env);
        }
        case "release": {
            const ver = intent.args[0];
            if (!ver)
                return "Usage: release <version>";
            const proceed = await askYesNo(reader, `Create release branch for ${ver}? (yes/no) `);
            if (!proceed)
                return "Release cancelled.";
            return orchestrator.runDevOpsRelease(ver);
        }
        case "hotfix": {
            const id = intent.args[0];
            if (!id)
                return "Usage: hotfix <ticketId>";
            const proceed = await askYesNo(reader, `Create hotfix branch for ${id}? (yes/no) `);
            if (!proceed)
                return "Hotfix cancelled.";
            return orchestrator.runDevOpsHotfix(id);
        }
        case "merge": {
            const ticketId = intent.args[0];
            if (!ticketId)
                return "Usage: merge <ticketId>";
            const proceed = await askYesNo(reader, `Merge feature/${ticketId} to develop? (yes/no) `);
            if (!proceed)
                return "Merge cancelled.";
            return orchestrator.mergeFeature(ticketId);
        }
        case "rollback": {
            const target = intent.args[0];
            const label = target ? `commit ${target.slice(0, 8)}` : "last commit";
            const proceed = await askYesNo(reader, `Rollback ${label}? (yes/no) `);
            if (!proceed)
                return "Rollback cancelled.";
            return orchestrator.rollback(target);
        }
        case "push": {
            const ticketId = intent.args[0];
            if (!ticketId)
                return "Usage: push <ticketId>";
            const proceed = await askYesNo(reader, `Push ${ticketId} to remote? (yes/no) `);
            if (!proceed)
                return "Push cancelled.";
            return orchestrator.push(ticketId);
        }
        // Health & Summary
        case "summary": return orchestrator.getDevOpsFullSummary();
        case "health": return orchestrator.getDevOpsHealth();
        case "changed": {
            const files = await orchestrator.changedFiles();
            return files.length > 0 ? files : ["No changed files."];
        }
        case "pr-check": return orchestrator.getDevOpsPrCheck();
        default:
            return `Unknown DevOps command: ${intent.command}`;
    }
}
async function runSecurityScan(orchestrator) {
    const report = await orchestrator.runCodeScan();
    return (0, code_scanner_1.formatScanReport)(report);
}
function buildDiffLines(snapshots) {
    const lines = [];
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
function createNlpSessionState() {
    return {
        history: [],
        appliedSnapshots: [],
        lastDiff: [],
    };
}
function renderTicketStatuses(entries) {
    return entries.map((entry) => `${entry.ticketId}: ${entry.status}${entry.note ? ` | ${entry.note}` : ""}`);
}
function updatePrompt(reader, mode) {
    if (mode === "nlp") {
        reader.setPrompt((0, theme_1.accent)("nlp > "));
        return;
    }
    if (mode === "devops") {
        reader.setPrompt((0, theme_1.accent)("devops > "));
        return;
    }
    if (mode === "git") {
        reader.setPrompt((0, theme_1.accent)("git > "));
        return;
    }
    if (mode === "security") {
        reader.setPrompt((0, theme_1.accent)("security > "));
        return;
    }
    reader.setPrompt((0, theme_1.accent)("nexus > "));
}
function askYesNo(reader, question) {
    return new Promise((resolve) => {
        reader.question((0, theme_1.accent)(question), (answer) => {
            resolve(answer.trim().toLowerCase() === "yes");
        });
    });
}
function looksLikeFilePath(value) {
    return (value.includes("/") || value.includes("\\") || /\.[a-z0-9]+$/i.test(value));
}
// ---------------------------------------------------------------------------
// Git Mode Handler
// ---------------------------------------------------------------------------
async function handleGitInput(orchestrator, reader, input) {
    const normalized = input.toLowerCase().trim();
    if (normalized === "exit" || normalized === "quit") {
        console.log((0, theme_1.accent)("Leaving Git mode."));
        return { exitMode: true };
    }
    if (normalized === "help") {
        console.log((0, theme_1.panel)("Git Help", orchestrator.getGitHelp()));
        return { exitMode: false };
    }
    // Parse intent — tries rule-based first, then LLM fallback
    const intent = await orchestrator.parseGitNaturalLanguage(input);
    if (intent.command === "unknown") {
        console.log((0, theme_1.danger)(`Could not parse git command. Type "help" for available commands.`));
        return { exitMode: false };
    }
    // Route the resolved intent to the appropriate operation
    const result = await executeGitIntent(orchestrator, reader, intent);
    if (typeof result === "string") {
        console.log((0, theme_1.panel)("Git", [result]));
    }
    else {
        console.log((0, theme_1.panel)("Git", result));
    }
    return { exitMode: false };
}
async function executeGitIntent(orchestrator, reader, intent) {
    switch (intent.command) {
        case "status":
            return orchestrator.getGitStatus();
        case "log": {
            const count = intent.args[0] ? parseInt(intent.args[0], 10) : undefined;
            return orchestrator.getGitLog(count);
        }
        case "diff": {
            const file = intent.args[0];
            return orchestrator.getGitDiff(file);
        }
        case "diff-staged":
            return orchestrator.getGitDiffStaged();
        case "add": {
            const file = intent.args[0];
            if (!file)
                return "Usage: add <file>";
            return orchestrator.runGitAdd(file);
        }
        case "add-all":
            return orchestrator.runGitAddAll();
        case "commit": {
            const msg = intent.args[0];
            if (!msg)
                return "Usage: commit <message>";
            const proceed = await askYesNo(reader, `Commit with message "${msg}"? (yes/no) `);
            if (!proceed)
                return "Commit cancelled.";
            return orchestrator.runGitCommit(msg);
        }
        case "commit-all": {
            const msg = intent.args[0];
            if (!msg)
                return "Usage: commit -a <message>";
            const proceed = await askYesNo(reader, `Stage all & commit with message "${msg}"? (yes/no) `);
            if (!proceed)
                return "Commit cancelled.";
            return orchestrator.runGitCommitAll(msg);
        }
        case "branch-list":
            return orchestrator.getGitBranches();
        case "branch-create": {
            const name = intent.args[0];
            if (!name)
                return "Usage: branch <name>";
            return orchestrator.runGitCreateBranch(name);
        }
        case "branch-delete": {
            const name = intent.args[0];
            if (!name)
                return "Usage: delete branch <name>";
            const proceed = await askYesNo(reader, `Delete branch '${name}'? (yes/no) `);
            if (!proceed)
                return "Branch delete cancelled.";
            return orchestrator.runGitDeleteBranch(name);
        }
        case "checkout": {
            const name = intent.args[0];
            if (!name)
                return "Usage: checkout <branch>";
            return orchestrator.runGitCheckout(name);
        }
        case "pull":
            return orchestrator.runGitPull();
        case "push": {
            const branch = intent.args[0];
            const label = branch ? `'${branch}'` : "current branch";
            const proceed = await askYesNo(reader, `Push ${label} to remote? (yes/no) `);
            if (!proceed)
                return "Push cancelled.";
            return orchestrator.runGitPush(branch);
        }
        case "fetch":
            return orchestrator.runGitFetch();
        case "stash":
            return orchestrator.runGitStash();
        case "stash-pop":
            return orchestrator.runGitStashPop();
        case "stash-list":
            return orchestrator.getGitStashList();
        case "tag": {
            const name = intent.args[0];
            if (!name)
                return "Usage: tag <name>";
            return orchestrator.runGitTag(name);
        }
        case "tag-list":
            return orchestrator.getGitTags();
        case "remote":
            return orchestrator.getGitRemotes();
        case "unstage": {
            const file = intent.args[0];
            if (!file)
                return "Usage: reset <file>";
            return orchestrator.runGitUnstage(file);
        }
        case "cherry-pick": {
            const sha = intent.args[0];
            if (!sha)
                return "Usage: cherry-pick <sha>";
            const proceed = await askYesNo(reader, `Cherry-pick commit ${sha.slice(0, 8)}? (yes/no) `);
            if (!proceed)
                return "Cherry-pick cancelled.";
            return orchestrator.runGitCherryPick(sha);
        }
        case "blame": {
            const file = intent.args[0];
            if (!file)
                return "Usage: blame <file>";
            return orchestrator.getGitBlame(file);
        }
        case "show": {
            const sha = intent.args[0];
            if (!sha)
                return "Usage: show <sha>";
            return orchestrator.getGitShowCommit(sha);
        }
        case "merge": {
            const branch = intent.args[0];
            if (!branch)
                return "Usage: merge <branch>";
            const proceed = await askYesNo(reader, `Merge '${branch}' into current branch? (yes/no) `);
            if (!proceed)
                return "Merge cancelled.";
            return orchestrator.runGitMerge(branch);
        }
        default:
            return `Unknown git command: ${intent.command}`;
    }
}
// ---------------------------------------------------------------------------
// Security Mode Handler
// ---------------------------------------------------------------------------
async function handleSecurityInput(orchestrator, reader, input) {
    const normalized = input.toLowerCase().trim();
    if (normalized === "exit" || normalized === "quit") {
        console.log((0, theme_1.accent)("Leaving Security mode."));
        return { exitMode: true };
    }
    if (normalized === "help") {
        console.log((0, theme_1.panel)("Security Help", orchestrator.getSecurityHelp()));
        return { exitMode: false };
    }
    const intent = await orchestrator.parseSecurityNaturalLanguage(input);
    if (intent.command === "unknown") {
        console.log((0, theme_1.danger)(`Could not parse security command. Type "help" for available commands.`));
        return { exitMode: false };
    }
    const result = await executeSecurityIntent(orchestrator, reader, intent);
    if (typeof result === "string") {
        console.log((0, theme_1.panel)("Security", [result]));
    }
    else {
        console.log((0, theme_1.panel)("Security", result));
    }
    return { exitMode: false };
}
async function executeSecurityIntent(orchestrator, _reader, intent) {
    switch (intent.command) {
        // Code Scanning
        case "scan": return orchestrator.getSecurityScan();
        case "scan-errors": return orchestrator.getSecurityScanErrors();
        case "scan-warnings": return orchestrator.getSecurityScanWarnings();
        case "scan-summary": return orchestrator.getSecurityScanSummary();
        case "scan-file": {
            const filePath = intent.args[0];
            if (!filePath)
                return "Usage: scan file <path>";
            return orchestrator.getSecurityScanFile(filePath);
        }
        case "rules": return orchestrator.getSecurityScanRules();
        // Secret Detection
        case "secrets": return orchestrator.getSecuritySecrets();
        case "env-audit": return orchestrator.getSecurityEnvAudit();
        case "sensitive-fields": return orchestrator.getSecuritySensitiveFields();
        // Dependency Security
        case "deps-audit": return orchestrator.getSecurityDepsAudit();
        case "licenses": return orchestrator.getSecurityLicenses();
        // Vault & Config
        case "vault": return orchestrator.getSecurityVaultStatus();
        case "config-security": return orchestrator.getSecurityConfigValidation();
        // Compliance & Policy
        case "compliance": return orchestrator.getSecurityCompliance();
        case "gitflow": return orchestrator.getSecurityGitFlowPolicy();
        case "codeowners": return orchestrator.getSecurityCodeOwners();
        // Infrastructure Security
        case "docker-security": return orchestrator.getSecurityDocker();
        case "terraform-security": return orchestrator.getSecurityTerraform();
        // Dashboard
        case "dashboard": return orchestrator.getSecurityDashboard();
        case "posture": return orchestrator.getSecurityPosture();
        default:
            return `Unknown security command: ${intent.command}`;
    }
}
