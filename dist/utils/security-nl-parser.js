"use strict";
/**
 * Security Natural Language Parser
 *
 * Maps plain English sentences to structured security intents.
 * Rule-based pattern matching with optional LLM fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSecurityIntent = parseSecurityIntent;
exports.parseSecurityIntentWithLlm = parseSecurityIntentWithLlm;
exports.getSecurityCommandHelp = getSecurityCommandHelp;
const env_1 = require("../config/env");
const RULES = [
    // Code scanning
    {
        patterns: [
            /^scan$/i,
            /^(?:run\s+)?(?:a\s+)?(?:full\s+)?(?:security\s+)?scan$/i,
            /^(?:scan|check)\s+(?:the\s+)?(?:code|repo|project|codebase)$/i,
        ],
        extract: (_m, raw) => ({ command: "scan", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^scan\s+errors$/i,
            /^(?:show|list)\s+(?:only\s+)?(?:scan\s+)?errors$/i,
            /^(?:show|only)\s+(?:show\s+)?(?:me\s+)?errors$/i,
            /^(?:what\s+are\s+)?(?:the\s+)?(?:critical\s+)?errors\??$/i,
        ],
        extract: (_m, raw) => ({ command: "scan-errors", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^scan\s+warnings$/i,
            /^(?:show|list)\s+(?:only\s+)?warnings$/i,
        ],
        extract: (_m, raw) => ({ command: "scan-warnings", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^scan\s+summary$/i,
            /^(?:show|give)\s+(?:me\s+)?(?:a\s+)?(?:scan\s+)?summary$/i,
            /^(?:how\s+(?:does|did)\s+(?:the\s+)?scan\s+(?:look|go))\??$/i,
        ],
        extract: (_m, raw) => ({ command: "scan-summary", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^scan\s+file\s+(\S+)$/i,
            /^(?:scan|check)\s+(?:the\s+)?file\s+(\S+)$/i,
        ],
        extract: (m, raw) => ({ command: "scan-file", args: [m[1]], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:scan\s+)?rules$/i,
            /^(?:show|list|what\s+are)\s+(?:the\s+)?(?:scan\s+)?rules\??$/i,
        ],
        extract: (_m, raw) => ({ command: "rules", args: [], raw, source: "rule" }),
    },
    // Secrets
    {
        patterns: [
            /^secrets$/i,
            /^(?:check|scan)\s+(?:for\s+)?secrets?$/i,
            /^(?:find|detect)\s+(?:hardcoded\s+)?secrets?$/i,
            /^(?:are\s+there\s+)?(?:any\s+)?(?:hardcoded\s+)?secrets?\??$/i,
        ],
        extract: (_m, raw) => ({ command: "secrets", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:audit\s+)?\.?env(?:\s+(?:file|audit|check))?$/i,
            /^(?:check|audit)\s+(?:the\s+)?\.?env\s+file$/i,
            /^(?:is\s+)?(?:the\s+)?\.?env\s+(?:file\s+)?(?:safe|secure)\??$/i,
        ],
        extract: (_m, raw) => ({ command: "env-audit", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^sensitive\s+fields$/i,
            /^(?:show|list|what\s+are)\s+(?:the\s+)?sensitive\s+(?:fields|config)?\??$/i,
        ],
        extract: (_m, raw) => ({ command: "sensitive-fields", args: [], raw, source: "rule" }),
    },
    // Dependencies
    {
        patterns: [
            /^(?:deps?\s+)?audit$/i,
            /^(?:npm\s+)?audit$/i,
            /^(?:check|scan)\s+(?:for\s+)?vulnerabilit(?:ies|y)$/i,
            /^(?:are\s+)?(?:my\s+)?(?:dep(?:endencie)?s|packages?)\s+(?:safe|secure|vulnerable)\??$/i,
        ],
        extract: (_m, raw) => ({ command: "deps-audit", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:license|licence)s?\s*(?:check|compliance)?$/i,
            /^(?:check|verify)\s+(?:dep(?:endency)?\s+)?licen[cs]es?$/i,
            /^(?:are\s+)?(?:the\s+)?licen[cs]es?\s+(?:ok|compliant|safe)\??$/i,
        ],
        extract: (_m, raw) => ({ command: "licenses", args: [], raw, source: "rule" }),
    },
    // Vault & Config
    {
        patterns: [
            /^vault(?:\s+status)?$/i,
            /^(?:check|show)\s+(?:the\s+)?vault(?:\s+status)?$/i,
            /^(?:is\s+)?vault\s+(?:enabled|active|working|connected)\??$/i,
        ],
        extract: (_m, raw) => ({ command: "vault", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:config|configuration)\s+(?:security|validation|validate)$/i,
            /^(?:validate|check)\s+(?:the\s+)?(?:config|configuration)\s+security$/i,
            /^(?:is\s+(?:the\s+)?)?config(?:uration)?\s+secure\??$/i,
        ],
        extract: (_m, raw) => ({ command: "config-security", args: [], raw, source: "rule" }),
    },
    // Compliance & Policy
    {
        patterns: [
            /^compliance$/i,
            /^(?:run\s+)?(?:a\s+)?compliance\s+check$/i,
            /^(?:check|verify)\s+compliance$/i,
            /^(?:are\s+we|am\s+I)\s+compliant\??$/i,
        ],
        extract: (_m, raw) => ({ command: "compliance", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^(?:git\s*flow|branch)\s+(?:policy|guide|rules?)$/i,
            /^(?:show|explain)\s+(?:the\s+)?(?:git\s*flow|branching)\s+(?:policy|strategy|guide)$/i,
        ],
        extract: (_m, raw) => ({ command: "gitflow", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^codeowners$/i,
            /^(?:show|list|who\s+owns)\s+(?:the\s+)?codeowners$/i,
            /^(?:who\s+(?:reviews|owns)\s+(?:the\s+)?code)\??$/i,
        ],
        extract: (_m, raw) => ({ command: "codeowners", args: [], raw, source: "rule" }),
    },
    // Infrastructure Security
    {
        patterns: [
            /^docker\s+security$/i,
            /^(?:check|assess|review)\s+(?:the\s+)?docker(?:file)?\s+security$/i,
            /^(?:is\s+(?:the\s+)?)?docker(?:file)?\s+secure\??$/i,
        ],
        extract: (_m, raw) => ({ command: "docker-security", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^terraform\s+security$/i,
            /^(?:check|assess|review)\s+(?:the\s+)?(?:terraform|infra(?:structure)?)\s+security$/i,
            /^(?:is\s+(?:the\s+)?)?(?:terraform|infra(?:structure)?)\s+secure\??$/i,
        ],
        extract: (_m, raw) => ({ command: "terraform-security", args: [], raw, source: "rule" }),
    },
    // Dashboard & Summary
    {
        patterns: [
            /^dashboard$/i,
            /^(?:security\s+)?dashboard$/i,
            /^(?:show|view)\s+(?:the\s+)?(?:security\s+)?dashboard$/i,
        ],
        extract: (_m, raw) => ({ command: "dashboard", args: [], raw, source: "rule" }),
    },
    {
        patterns: [
            /^posture$/i,
            /^(?:security\s+)?posture$/i,
            /^(?:show|what\s+is)\s+(?:the\s+)?(?:security\s+)?posture\??$/i,
            /^(?:how\s+secure\s+(?:are\s+we|is\s+(?:this|the\s+app)))\??$/i,
        ],
        extract: (_m, raw) => ({ command: "posture", args: [], raw, source: "rule" }),
    },
];
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function parseSecurityIntent(input) {
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
async function parseSecurityIntentWithLlm(input) {
    const ruleResult = parseSecurityIntent(input);
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
                        content: `You are a security command parser. Given a natural language sentence, return JSON: {"command": string, "args": string[]}.
Valid commands: scan, scan-errors, scan-warnings, scan-summary, scan-file, rules, secrets, env-audit, sensitive-fields, deps-audit, licenses, vault, config-security, compliance, gitflow, codeowners, docker-security, terraform-security, dashboard, posture.
For scan-file, args=["filepath"]. All others have args=[].
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
function getSecurityCommandHelp() {
    return [
        "── Code Scanning ──",
        "  scan                 Full security scan (SAST)",
        "  scan errors          Show only ERROR findings",
        "  scan warnings        Show only WARNING findings",
        "  scan summary         Quick scan statistics",
        "  scan file <path>     Scan a specific file",
        "",
        "── Secret Detection ──",
        "  secrets              Check for hardcoded secrets (Gitleaks)",
        "",
        "── Dependency Security ──",
        "  audit / deps audit   Run npm vulnerability audit (FOSS)",
        "",
        "── Compliance & Policy ──",
        "  compliance           Full compliance check",
        "",
        "── Infrastructure ──",
        "  docker security      Docker security assessment (Trivy)",
        "  terraform security   Terraform security assessment (Checkov)",
        "",
        "Or type naturally:",
        '  "check for secrets"',
        '  "is the Dockerfile secure"',
        '  "are we compliant"',
        '  "how secure are we"',
        '  "check for vulnerabilities"',
        "",
        "  exit / quit          Leave Security mode",
    ];
}
