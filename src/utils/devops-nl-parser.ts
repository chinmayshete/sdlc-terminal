/**
 * DevOps Natural Language Parser
 *
 * Maps plain English sentences to structured DevOps intents.
 * Rule-based pattern matching with optional LLM fallback.
 */

import { env, hasAzureOpenAiConfig } from "../config/env";

export interface DevOpsIntent {
  command: string;
  args: string[];
  raw: string;
  source: "rule" | "llm" | "unknown";
}

interface PatternRule {
  patterns: RegExp[];
  extract: (match: RegExpMatchArray, raw: string) => DevOpsIntent;
}

const RULES: PatternRule[] = [
  // CI/CD
  {
    patterns: [
      /^cicd$/i,
      /^(?:show|view|check|display)?\s*(?:the\s+)?(?:ci\/?cd|pipeline)(?:\s+(?:info|overview|status))?$/i,
      /^(?:check|show)\s+(?:the\s+)?pipeline$/i,
    ],
    extract: (_m, raw) => ({ command: "cicd", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^jenkins\s+validate$/i,
      /^validate\s+(?:the\s+)?jenkins(?:file)?$/i,
      /^(?:check|verify)\s+(?:the\s+)?jenkins(?:file)?$/i,
    ],
    extract: (_m, raw) => ({ command: "jenkins-validate", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^jenkins\s+stages$/i,
      /^(?:show|list|view)\s+(?:the\s+)?(?:jenkins\s+)?(?:pipeline\s+)?stages$/i,
    ],
    extract: (_m, raw) => ({ command: "jenkins-stages", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^jenkins\s+params$/i,
      /^(?:show|list|view)\s+(?:the\s+)?(?:jenkins\s+)?(?:pipeline\s+)?param(?:eter)?s$/i,
    ],
    extract: (_m, raw) => ({ command: "jenkins-params", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^actions$/i,
      /^(?:github\s+)?actions(?:\s+(?:info|status))?$/i,
      /^(?:show|view|list)\s+(?:the\s+)?(?:github\s+)?(?:actions|workflows)$/i,
    ],
    extract: (_m, raw) => ({ command: "actions", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^actions\s+validate$/i,
      /^validate\s+(?:the\s+)?(?:github\s+)?(?:actions|workflows)$/i,
    ],
    extract: (_m, raw) => ({ command: "actions-validate", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^pipeline\s+health$/i,
      /^(?:check|show)\s+(?:the\s+)?pipeline\s+health$/i,
    ],
    extract: (_m, raw) => ({ command: "pipeline-health", args: [], raw, source: "rule" }),
  },

  // Security
  {
    patterns: [
      /^scan$/i,
      /^security$/i,
      /^(?:run\s+)?(?:a\s+)?(?:security\s+)?scan$/i,
      /^(?:run\s+)?(?:the\s+)?(?:code\s+)?security\s+scan(?:ner)?$/i,
      /^scan\s+(?:the\s+)?(?:code|repo|project)$/i,
    ],
    extract: (_m, raw) => ({ command: "scan", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^scan\s+errors$/i,
      /^(?:show|list)\s+(?:only\s+)?(?:scan\s+)?errors$/i,
      /^(?:show|only)\s+(?:show\s+)?(?:me\s+)?(?:scan\s+)?errors$/i,
    ],
    extract: (_m, raw) => ({ command: "scan-errors", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^(?:secrets?\s+check|check\s+(?:for\s+)?secrets?)$/i,
      /^(?:scan|check)\s+(?:for\s+)?(?:hardcoded\s+)?secrets?$/i,
      /^(?:are\s+there|any)\s+(?:hardcoded\s+)?secrets?\??$/i,
    ],
    extract: (_m, raw) => ({ command: "secrets-check", args: [], raw, source: "rule" }),
  },

  // Docker
  {
    patterns: [
      /^docker\s+info$/i,
      /^(?:show|view|check|display)\s+(?:the\s+)?docker(?:file)?(?:\s+(?:info|details))?$/i,
      /^what\s+does\s+the\s+docker(?:file)?\s+look\s+like\??$/i,
    ],
    extract: (_m, raw) => ({ command: "docker-info", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^docker\s+stages$/i,
      /^(?:show|list)\s+(?:the\s+)?docker\s+(?:build\s+)?stages$/i,
    ],
    extract: (_m, raw) => ({ command: "docker-stages", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^docker\s+validate$/i,
      /^validate\s+(?:the\s+)?docker(?:file)?$/i,
      /^(?:check|verify)\s+(?:the\s+)?docker(?:file)?(?:\s+(?:best\s+)?practices)?$/i,
    ],
    extract: (_m, raw) => ({ command: "docker-validate", args: [], raw, source: "rule" }),
  },

  // Terraform
  {
    patterns: [
      /^terraform\s+info$/i,
      /^(?:show|view)\s+(?:the\s+)?terraform(?:\s+(?:config|info|details))?$/i,
      /^(?:show|view)\s+(?:the\s+)?(?:infra(?:structure)?|iac)(?:\s+(?:config|info))?$/i,
    ],
    extract: (_m, raw) => ({ command: "terraform-info", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^infra\s+resources$/i,
      /^(?:list|show|what)\s+(?:the\s+)?(?:terraform|infra(?:structure)?)\s+resources/i,
      /^what\s+(?:terraform|infra(?:structure)?)\s+resources\s+(?:do\s+)?(?:we|I)\s+have\??$/i,
    ],
    extract: (_m, raw) => ({ command: "infra-resources", args: [], raw, source: "rule" }),
  },

  // Environment
  {
    patterns: [
      /^env\s+show$/i,
      /^(?:show|view|display)\s+(?:the\s+)?(?:env(?:ironment)?|config)$/i,
      /^what\s+(?:env(?:ironment)?|config)\s+(?:am\s+I\s+in|is\s+(?:this|active))\??$/i,
      /^config$/i,
    ],
    extract: (_m, raw) => ({ command: "env-show", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^env\s+compare$/i,
      /^compare\s+(?:the\s+)?env(?:ironment)?s?$/i,
      /^(?:diff|compare)\s+(?:dev|staging|prod)\s+(?:vs?|and)\s+(?:dev|staging|prod)/i,
    ],
    extract: (_m, raw) => ({ command: "env-compare", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^env\s+validate$/i,
      /^validate\s+(?:the\s+)?(?:env(?:ironment)?|config)\s*(?:files)?$/i,
      /^(?:check|verify)\s+(?:the\s+)?(?:env|config)\s*(?:files)?$/i,
    ],
    extract: (_m, raw) => ({ command: "env-validate", args: [], raw, source: "rule" }),
  },

  // Dependencies
  {
    patterns: [
      /^deps?\s+audit$/i,
      /^(?:run\s+)?(?:npm\s+)?audit$/i,
      /^(?:check|scan)\s+(?:for\s+)?vulnerabilit(?:ies|y)$/i,
      /^audit\s+(?:for\s+)?(?:the\s+)?(?:dep(?:endencie)?s|vulnerabilit(?:ies|y))$/i,
    ],
    extract: (_m, raw) => ({ command: "deps-audit", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^deps?\s+check$/i,
      /^(?:check|show)\s+(?:for\s+)?outdated\s+(?:dep(?:endencie)?s|packages?)$/i,
      /^(?:are\s+)?(?:any|my)\s+(?:dep(?:endencie)?s|packages?)\s+outdated\??$/i,
    ],
    extract: (_m, raw) => ({ command: "deps-check", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^deps?\s+licenses?$/i,
      /^(?:show|check|list)\s+(?:the\s+)?(?:dep(?:endency)?|package)\s+licenses?$/i,
    ],
    extract: (_m, raw) => ({ command: "deps-licenses", args: [], raw, source: "rule" }),
  },

  // Deployment
  {
    patterns: [
      /^deploy\s+status$/i,
      /^(?:show|view)\s+(?:the\s+)?deploy(?:ment)?\s+status$/i,
    ],
    extract: (_m, raw) => ({ command: "deploy-status", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^deploy\s+check\s+(\w+)$/i,
      /^(?:pre[- ]?deploy|readiness)\s+check\s+(?:for\s+)?(\w+)$/i,
      /^(?:is\s+(?:the\s+)?app\s+)?ready\s+to\s+deploy\s+(?:to\s+)?(\w+)\??$/i,
      /^(?:can\s+(?:we|I)\s+)?deploy\s+to\s+(\w+)\??$/i,
    ],
    extract: (m, raw) => ({
      command: "deploy-check",
      args: [m[1]],
      raw,
      source: "rule",
    }),
  },
  {
    patterns: [
      /^release\s+(\S+)$/i,
      /^(?:create|start)\s+(?:a\s+)?release\s+(?:for\s+)?(?:version\s+)?(\S+)$/i,
      /^(?:cut|make)\s+(?:a\s+)?release\s+(\S+)$/i,
    ],
    extract: (m, raw) => ({
      command: "release",
      args: [m[1]],
      raw,
      source: "rule",
    }),
  },
  {
    patterns: [
      /^hotfix\s+(\S+)$/i,
      /^(?:create|start)\s+(?:a\s+)?hotfix\s+(?:for\s+)?(\S+)$/i,
    ],
    extract: (m, raw) => ({
      command: "hotfix",
      args: [m[1]],
      raw,
      source: "rule",
    }),
  },

  // Existing DevOps commands
  {
    patterns: [
      /^summary$/i,
      /^(?:show|view)\s+(?:the\s+)?(?:devops\s+)?summary$/i,
      /^(?:give\s+me\s+)?(?:a\s+)?(?:devops\s+)?(?:overview|summary)$/i,
    ],
    extract: (_m, raw) => ({ command: "summary", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^changed$/i,
      /^(?:show|list|view)\s+(?:me\s+)?(?:the\s+)?changed\s+files?$/i,
      /^what(?:'s|\s+has)\s+changed\??$/i,
      /^(?:show|list)\s+(?:me\s+)?(?:the\s+)?(?:modified|dirty)\s+files?$/i,
    ],
    extract: (_m, raw) => ({ command: "changed", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^health$/i,
      /^(?:system\s+)?health(?:\s+check)?$/i,
      /^(?:is\s+)?everything\s+(?:healthy|ok|working)\??$/i,
      /^(?:check|show)\s+(?:the\s+)?(?:system\s+)?health$/i,
    ],
    extract: (_m, raw) => ({ command: "health", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^pr\s+check$/i,
      /^(?:run\s+)?(?:a\s+)?pr\s+(?:readiness\s+)?check$/i,
      /^(?:is\s+(?:this|the)\s+)?(?:pr|pull\s+request)\s+ready\??$/i,
      /^(?:am\s+I\s+)?ready\s+(?:for\s+)?(?:a\s+)?(?:pr|pull\s+request)\??$/i,
    ],
    extract: (_m, raw) => ({ command: "pr-check", args: [], raw, source: "rule" }),
  },
  {
    patterns: [
      /^merge\s+(\S+)$/i,
      /^merge\s+(?:ticket\s+)?(\S+)\s+(?:to|into)\s+develop$/i,
    ],
    extract: (m, raw) => ({
      command: "merge",
      args: [m[1]],
      raw,
      source: "rule",
    }),
  },
  {
    patterns: [
      /^rollback$/i,
      /^rollback\s+([a-f0-9]+)$/i,
      /^(?:revert|undo)\s+(?:the\s+)?last\s+commit$/i,
    ],
    extract: (m, raw) => ({
      command: "rollback",
      args: m[1] ? [m[1]] : [],
      raw,
      source: "rule",
    }),
  },
  {
    patterns: [
      /^push\s+(\S+)$/i,
      /^push\s+(?:ticket\s+)?(\S+)\s+(?:to\s+)?(?:remote|origin)$/i,
    ],
    extract: (m, raw) => ({
      command: "push",
      args: [m[1]],
      raw,
      source: "rule",
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseDevOpsIntent(input: string): DevOpsIntent {
  const trimmed = input.trim();
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) return rule.extract(match, trimmed);
    }
  }
  return { command: "unknown", args: [], raw: trimmed, source: "unknown" };
}

export async function parseDevOpsIntentWithLlm(
  input: string,
): Promise<DevOpsIntent> {
  const ruleResult = parseDevOpsIntent(input);
  if (ruleResult.command !== "unknown") return ruleResult;
  if (env.useMock || !hasAzureOpenAiConfig()) return ruleResult;

  try {
    const endpoint = `${env.azureEndpoint}/openai/deployments/${env.azureDeployment}/chat/completions?api-version=${env.azureApiVersion}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.azureApiKey ?? "",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are a DevOps command intent parser. Given a natural language sentence, return JSON with shape {"command": string, "args": string[]}.
Valid commands: cicd, jenkins-validate, jenkins-stages, jenkins-params, actions, actions-validate, pipeline-health, scan, scan-errors, secrets-check, docker-info, docker-stages, docker-validate, terraform-info, infra-resources, env-show, env-compare, env-validate, deps-audit, deps-check, deps-licenses, deploy-status, deploy-check, release, hotfix, summary, changed, health, pr-check, merge, rollback, push.
For deploy-check args=[env], release args=[version], hotfix args=[ticketId], merge args=[ticketId], rollback args=[sha] or [], push args=[ticketId].
If you cannot determine the intent, return {"command": "unknown", "args": []}.`,
          },
          { role: "user", content: input },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return ruleResult;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return ruleResult;
    const parsed = JSON.parse(content) as { command?: string; args?: string[] };
    if (parsed.command && parsed.command !== "unknown") {
      return {
        command: parsed.command,
        args: parsed.args ?? [],
        raw: input,
        source: "llm",
      };
    }
    return ruleResult;
  } catch {
    return ruleResult;
  }
}

export function getDevOpsCommandHelp(): string[] {
  return [
    "── CI/CD Pipeline ──",
    "  cicd                 Pipeline overview",
    "  jenkins validate     Validate Jenkinsfile structure",
    "  jenkins stages       List pipeline stages",
    "  jenkins params       Show pipeline parameters",
    "  actions              Show GitHub Actions workflows",
    "  actions validate     Validate workflow files",
    "  pipeline health      Combined pipeline health",
    "",
    "── Security ──",
    "  scan                 Run full security scan",
    "  scan errors          Show only ERROR findings",
    "  secrets check        Check for hardcoded secrets",
    "",
    "── Docker ──",
    "  docker info          Dockerfile analysis",
    "  docker stages        List build stages",
    "  docker validate      Best-practice checks",
    "",
    "── Terraform / IaC ──",
    "  terraform info       Show Terraform config",
    "  infra resources      List infrastructure resources",
    "",
    "── Environment ──",
    "  env show / config    Show current config",
    "  env compare          Compare environment configs",
    "  env validate         Validate config files",
    "",
    "── Dependencies ──",
    "  deps audit           Run npm audit",
    "  deps check           Check outdated packages",
    "  deps licenses        Show dependency licenses",
    "",
    "── Deployment ──",
    "  deploy status        Current deployment info",
    "  deploy check <env>   Pre-deploy checklist",
    "  release <version>    Create release branch",
    "  hotfix <ticketId>    Create hotfix branch",
    "  merge <ticketId>     Merge feature to develop",
    "  rollback [sha]       Revert last/specific commit",
    "  push <ticketId>      Push ticket branch",
    "",
    "── Reporting ──",
    "  summary              DevOps summary dashboard",
    "  health               Full system health check",
    "  changed              List modified files",
    "  pr check             PR readiness check",
    "",
    "Or type naturally:",
    "  \"validate the Jenkinsfile\"",
    "  \"check for vulnerabilities\"",
    "  \"what terraform resources do we have\"",
    "  \"is the app ready to deploy to staging\"",
    "  \"is everything healthy\"",
    "",
    "  exit / quit          Leave DevOps mode",
  ];
}
