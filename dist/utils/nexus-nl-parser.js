"use strict";
/**
 * Nexus Main Mode Natural Language Parser
 *
 * Maps plain English sentences to structured Nexus SDLC intents.
 * Rule-based pattern matching with optional LLM fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNexusIntent = parseNexusIntent;
exports.parseNexusIntentWithLlm = parseNexusIntentWithLlm;
const env_1 = require("../config/env");
const RULES = [
    // Tickets
    {
        patterns: [
            /^tickets$/i,
            /^(?:list|show|get|what\s+are)\s+(?:the\s+)?tickets\??$/i,
        ],
        extract: (_m, raw) => ({ command: "tickets", args: [], raw, source: "rule" }),
    },
    // Plan
    {
        patterns: [
            /^(?:generate|create|make|build|get)\s+(?:a\s+)?(?:more\s+)?(?:comprehensive|detailed|detail)\s+plan\s+for\s+(\S+)$/i,
            /^plan\s+(\S+)$/i,
            /^(?:create|make|build|generate)\s+(?:a\s+)?plan\s+for\s+(\S+)$/i,
            /^what\s+is\s+the\s+plan\s+for\s+(\S+)\??$/i,
        ],
        extract: (m, raw) => {
            const ticketId = m[1];
            const isDetailed = raw.toLowerCase().includes("comprehensive") || raw.toLowerCase().includes("detailed") || raw.toLowerCase().includes("detail");
            return {
                command: "plan",
                args: [ticketId, isDetailed ? "detailed" : "basic"],
                raw,
                source: "rule",
            };
        },
    },
    // Execute
    {
        patterns: [
            /^execute\s+(\S+)$/i,
            /^(?:run|start|execute|process)\s+(\S+)$/i,
            /^(?:work\s+on|implement)\s+(\S+)$/i,
        ],
        extract: (m, raw) => ({ command: "execute", args: [m[1]], raw, source: "rule" }),
    },
    // Status
    {
        patterns: [
            /^status$/i,
            /^(?:show|what\s+is)\s+(?:the\s+)?(?:current\s+)?status\??$/i,
            /^how\s+are\s+we\s+doing\??$/i,
        ],
        extract: (_m, raw) => ({ command: "status", args: [], raw, source: "rule" }),
    },
    // AI Health
    {
        patterns: [
            /^ai$/i,
            /^ai\s+health$/i,
            /^(?:check|is|how\s+is)\s+(?:the\s+)?ai(?:\s+health)?\??$/i,
        ],
        extract: (_m, raw) => ({ command: "ai", args: [], raw, source: "rule" }),
    },
    // Mode Switches
    {
        patterns: [
            /^(?:go\s+to|switch\s+to|enter|open)\s+security(?:\s+mode)?$/i,
            /^security$/i,
        ],
        extract: (_m, raw) => ({ command: "security", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:go\s+to|switch\s+to|enter|open)\s+nlp(?:\s+mode|chat)?$/i,
            /^nlp$/i,
        ],
        extract: (_m, raw) => ({ command: "nlp", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:go\s+to|switch\s+to|enter|open)\s+devops(?:\s+mode)?$/i,
            /^devops$/i,
        ],
        extract: (_m, raw) => ({ command: "devops", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:go\s+to|switch\s+to|enter|open)\s+git(?:\s+mode)?$/i,
            /^git$/i,
        ],
        extract: (_m, raw) => ({ command: "git", args: [], raw, source: "rule" }),
    },
    // Push
    {
        patterns: [
            /^push\s+(\S+)$/i,
            /^(?:push|upload|sync)\s+(?:the\s+)?changes\s+for\s+(\S+)$/i,
        ],
        extract: (m, raw) => ({ command: "push", args: [m[1]], raw, source: "rule" }),
    },
    // Reset
    {
        patterns: [
            /^reset\s+(\S+)$/i,
            /^(?:reset|clear)\s+ticket\s+(\S+)$/i,
        ],
        extract: (m, raw) => ({ command: "reset", args: [m[1]], raw, source: "rule" }),
    },
    {
        patterns: [
            /^reset-all$/i,
            /^(?:reset|clear)\s+all\s+tickets$/i,
        ],
        extract: (_m, raw) => ({ command: "reset-all", args: [], raw, source: "rule" }),
    },
    // Help & Exit
    {
        patterns: [/^help$/i, /^(?:what\s+can\s+you\s+do|list\s+commands)$/i],
        extract: (_m, raw) => ({ command: "help", args: [], raw, source: "rule" }),
    },
    {
        patterns: [/^exit$/i, /^quit$/i, /^bye$/i],
        extract: (_m, raw) => ({ command: "exit", args: [], raw, source: "rule" }),
    },
];
function parseNexusIntent(input) {
    const trimmed = input.trim();
    for (const rule of RULES) {
        for (const pattern of rule.patterns) {
            const match = trimmed.match(pattern);
            if (match)
                return rule.extract(match, trimmed);
        }
    }
    return { command: "unknown", args: [], raw: trimmed, source: "unknown" };
}
async function parseNexusIntentWithLlm(input) {
    const ruleResult = parseNexusIntent(input);
    if (ruleResult.command !== "unknown")
        return ruleResult;
    if (env_1.env.useMock || !(0, env_1.hasAzureOpenAiConfig)())
        return ruleResult;
    try {
        const endpoint = `${env_1.env.azureEndpoint}/openai/deployments/${env_1.env.azureDeployment}/chat/completions?api-version=${env_1.env.azureApiVersion}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": env_1.env.azureApiKey ?? "",
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: `You are the primary command parser for the Nexus SDLC terminal. Given a natural language sentence, return JSON: {"command": string, "args": string[]}.
Valid commands: tickets, plan, execute, status, ai, security, nlp, devops, git, push, reset, reset-all, help, exit.
Arguments:
- plan: args=["ticketId", "mode"] where mode is "detailed" or "basic". If "comprehensive" or "detailed" is mentioned, use "detailed".
- execute: args=["ticketId"]
- push: args=["ticketId"]
- reset: args=["ticketId"]
All others have args=[].
If you cannot determine the intent, return {"command": "unknown", "args": []}.`,
                    },
                    { role: "user", content: input },
                ],
                temperature: 0,
                response_format: { type: "json_object" },
            }),
        });
        if (!response.ok)
            return ruleResult;
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content)
            return ruleResult;
        const parsed = JSON.parse(content);
        if (parsed.command && parsed.command !== "unknown") {
            return { command: parsed.command, args: parsed.args ?? [], raw: input, source: "llm" };
        }
        return ruleResult;
    }
    catch {
        return ruleResult;
    }
}
