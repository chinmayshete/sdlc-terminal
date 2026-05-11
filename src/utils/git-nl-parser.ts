/**
 * Git Natural Language Parser
 *
 * Maps plain English sentences to structured Git intents.
 * Uses rule-based pattern matching first, with optional LLM
 * fallback for ambiguous inputs when Azure OpenAI is configured.
 */

import { env, hasAzureOpenAiConfig } from "../config/env";

export interface GitIntent {
  command: string;
  args: string[];
  raw: string;
  source: "rule" | "llm" | "unknown";
}

interface PatternRule {
  patterns: RegExp[];
  extract: (match: RegExpMatchArray, raw: string) => GitIntent;
}

// ---------------------------------------------------------------------------
// Rule-based intent extraction
// ---------------------------------------------------------------------------

const RULES: PatternRule[] = [
  // Status
  {
    patterns: [
      /^(?:show|what(?:'s| is)?|check|view|display|get)?\s*(?:the\s+)?(?:git\s+)?status$/i,
      /^what(?:'s| is| has)?\s+changed\??$/i,
      /^show\s+(?:me\s+)?what(?:'s| is| has)?\s+changed\??$/i,
      /^(?:any|are there(?: any)?)\s+changes\??$/i,
      /^(?:show|check|view)\s+(?:me\s+)?(?:the\s+)?(?:working\s+)?(?:tree|directory)\s*(?:status)?$/i,
      /^what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?state\s+(?:of\s+)?(?:the\s+)?(?:repo|repository)\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "status",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Log
  {
    patterns: [
      /^(?:show|view|display|get|list)?\s*(?:the\s+)?(?:git\s+)?log(?:\s+(\d+))?$/i,
      /^(?:show|view|list)\s+(?:me\s+)?(?:the\s+)?(?:last\s+)?(\d+)\s+commits?$/i,
      /^(?:show|view|list)\s+(?:me\s+)?(?:the\s+)?(?:recent|latest)\s+commits?$/i,
      /^(?:show|view|list)\s+(?:me\s+)?(?:the\s+)?commit\s+history$/i,
      /^history$/i,
    ],
    extract: (match, raw) => {
      const count = match[1] ? parseInt(match[1], 10) : undefined;
      return {
        command: "log",
        args: count ? [String(count)] : [],
        raw,
        source: "rule",
      };
    },
  },

  // Diff
  {
    patterns: [
      /^(?:show|view|display|get)?\s*(?:the\s+)?(?:git\s+)?diff(?:\s+(.+))?$/i,
      /^what(?:'s| is)\s+(?:the\s+)?diff(?:erence)?\s+(?:in|on|for)\s+(.+)$/i,
      /^(?:show|view)\s+(?:me\s+)?(?:the\s+)?(?:changes|differences?)\s+(?:in|on|for)\s+(.+)$/i,
      /^what(?:'s| is)\s+different\s+(?:in|on)\s+(.+)$/i,
    ],
    extract: (match, raw) => {
      const file = match[1]?.trim();
      return {
        command: "diff",
        args: file ? [file] : [],
        raw,
        source: "rule",
      };
    },
  },

  // Diff staged
  {
    patterns: [
      /^diff\s+--staged$/i,
      /^(?:show|view)\s+(?:me\s+)?(?:the\s+)?staged\s+(?:changes|diff)$/i,
      /^what(?:'s| is)\s+staged\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "diff-staged",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Add specific file
  {
    patterns: [
      /^(?:git\s+)?add\s+(.+)$/i,
      /^stage\s+(.+)$/i,
      /^(?:add|stage)\s+(?:the\s+)?file\s+(.+)$/i,
    ],
    extract: (match, raw) => {
      const file = match[1]?.trim();
      if (file === "." || file === "all" || /^(?:all|everything)$/i.test(file)) {
        return { command: "add-all", args: [], raw, source: "rule" };
      }
      return { command: "add", args: [file], raw, source: "rule" };
    },
  },

  // Add all
  {
    patterns: [
      /^stage\s+(?:all|everything)$/i,
      /^(?:add|stage)\s+all\s+(?:files|changes)$/i,
      /^stage\s+(?:all\s+)?(?:the\s+)?(?:files|changes)$/i,
    ],
    extract: (_match, raw) => ({
      command: "add-all",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Commit with message
  {
    patterns: [
      /^(?:git\s+)?commit\s+(?:-a\s+)?(?:-m\s+)?["']?(.+?)["']?$/i,
      /^commit\s+(?:all\s+)?(?:changes?\s+)?(?:with\s+)?(?:the\s+)?(?:message\s+)?["'](.+?)["']$/i,
      /^commit\s+(?:all\s+)?(?:changes?\s+)?with\s+(?:the\s+)?message\s+(.+)$/i,
      /^commit\s+everything\s+(?:with\s+)?(?:the\s+)?(?:message\s+)?["']?(.+?)["']?$/i,
    ],
    extract: (match, raw) => {
      const msg = match[1]?.trim();
      // Detect -a flag for commit-all
      const isAll =
        /^(?:git\s+)?commit\s+-a\s/i.test(raw) ||
        /commit\s+(?:all|everything)/i.test(raw);
      return {
        command: isAll ? "commit-all" : "commit",
        args: msg ? [msg] : [],
        raw,
        source: "rule",
      };
    },
  },

  // Branch list
  {
    patterns: [
      /^(?:git\s+)?branch(?:es)?$/i,
      /^(?:list|show|view)\s+(?:all\s+)?(?:the\s+)?branches$/i,
      /^what\s+branches?\s+(?:do\s+(?:we|I)\s+have|exist|are\s+there)\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "branch-list",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Branch create
  {
    patterns: [
      /^(?:git\s+)?branch\s+(.+)$/i,
      /^(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?branch\s+(?:called\s+|named\s+)?(.+)$/i,
      /^(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?branch\s+(?:for\s+)?(?:the\s+)?(.+?)(?:\s+feature|\s+fix|\s+task)?$/i,
    ],
    extract: (match, raw) => {
      const name = (match[1] || match[2])?.trim();
      return { command: "branch-create", args: [name], raw, source: "rule" };
    },
  },

  // Checkout / switch
  {
    patterns: [
      /^(?:git\s+)?checkout\s+(.+)$/i,
      /^(?:git\s+)?switch\s+(?:to\s+)?(.+)$/i,
      /^switch\s+to\s+(?:the\s+)?(?:branch\s+)?(.+)$/i,
      /^(?:go|move)\s+to\s+(?:the\s+)?(?:branch\s+)?(.+)$/i,
      /^use\s+(?:the\s+)?(?:branch\s+)?(.+)$/i,
    ],
    extract: (match, raw) => {
      const name = match[1]?.trim();
      return { command: "checkout", args: [name], raw, source: "rule" };
    },
  },

  // Pull
  {
    patterns: [
      /^(?:git\s+)?pull$/i,
      /^pull\s+(?:from\s+)?(?:remote|origin|upstream)$/i,
      /^(?:get|fetch|sync)\s+(?:the\s+)?(?:latest|updates?)(?:\s+from\s+remote)?$/i,
      /^update\s+(?:from|my)\s+(?:remote|branch)$/i,
    ],
    extract: (_match, raw) => ({
      command: "pull",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Push
  {
    patterns: [
      /^(?:git\s+)?push(?:\s+(.+))?$/i,
      /^push\s+(?:to\s+)?(?:remote|origin)(?:\s+(.+))?$/i,
      /^push\s+(?:my\s+)?changes?(?:\s+to\s+(.+))?$/i,
      /^(?:send|upload)\s+(?:my\s+)?(?:changes?|code|commits?)(?:\s+to\s+(?:remote|origin))?$/i,
    ],
    extract: (match, raw) => {
      const branch = match[1]?.trim();
      return {
        command: "push",
        args: branch ? [branch] : [],
        raw,
        source: "rule",
      };
    },
  },

  // Fetch
  {
    patterns: [
      /^(?:git\s+)?fetch$/i,
      /^fetch\s+(?:from\s+)?(?:all\s+)?(?:remotes?|origin)$/i,
    ],
    extract: (_match, raw) => ({
      command: "fetch",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Stash
  {
    patterns: [
      /^(?:git\s+)?stash$/i,
      /^stash\s+(?:my\s+)?(?:changes|work)$/i,
      /^save\s+(?:my\s+)?(?:work|changes)\s+(?:for\s+)?later$/i,
      /^(?:put|set)\s+(?:my\s+)?(?:changes|work)\s+aside$/i,
    ],
    extract: (_match, raw) => ({
      command: "stash",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Stash pop
  {
    patterns: [
      /^(?:git\s+)?stash\s+pop$/i,
      /^(?:pop|apply|restore)\s+(?:the\s+)?(?:latest\s+)?stash$/i,
      /^(?:get|bring)\s+(?:my\s+)?(?:stashed\s+)?(?:changes|work)\s+back$/i,
      /^restore\s+(?:my\s+)?(?:saved\s+)?(?:work|changes)$/i,
    ],
    extract: (_match, raw) => ({
      command: "stash-pop",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Stash list
  {
    patterns: [
      /^(?:git\s+)?stash\s+list$/i,
      /^(?:list|show|view)\s+(?:all\s+)?(?:the\s+)?stash(?:es)?$/i,
      /^what(?:'s| is)\s+(?:in\s+)?(?:the\s+)?stash\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "stash-list",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Tag create
  {
    patterns: [
      /^(?:git\s+)?tag\s+(.+)$/i,
      /^(?:create|make|add)\s+(?:a\s+)?tag\s+(?:called\s+|named\s+)?(.+)$/i,
      /^tag\s+(?:this|it)\s+(?:as\s+)?(.+)$/i,
    ],
    extract: (match, raw) => {
      const name = (match[1] || match[2])?.trim();
      // If it looks like a list request, redirect
      if (name === "-l" || name === "--list" || /^list$/i.test(name)) {
        return { command: "tag-list", args: [], raw, source: "rule" };
      }
      return { command: "tag", args: [name], raw, source: "rule" };
    },
  },

  // Tag list
  {
    patterns: [
      /^(?:git\s+)?tag\s+(?:-l|--list)$/i,
      /^(?:list|show|view)\s+(?:all\s+)?(?:the\s+)?tags?$/i,
      /^what\s+tags?\s+(?:do\s+(?:we|I)\s+have|exist|are\s+there)\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "tag-list",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Remote
  {
    patterns: [
      /^(?:git\s+)?remote(?:\s+-v)?$/i,
      /^(?:list|show|view)\s+(?:the\s+)?remotes?$/i,
      /^what\s+remotes?\s+(?:do\s+(?:we|I)\s+have|are\s+(?:configured|set\s+up))\??$/i,
    ],
    extract: (_match, raw) => ({
      command: "remote",
      args: [],
      raw,
      source: "rule",
    }),
  },

  // Reset / unstage
  {
    patterns: [
      /^(?:git\s+)?reset\s+(.+)$/i,
      /^unstage\s+(.+)$/i,
      /^(?:remove|take)\s+(.+)\s+(?:from|out\s+of)\s+(?:staging|stage|index)$/i,
    ],
    extract: (match, raw) => {
      const file = match[1]?.trim();
      return { command: "unstage", args: [file], raw, source: "rule" };
    },
  },

  // Cherry-pick
  {
    patterns: [
      /^(?:git\s+)?cherry-?pick\s+(.+)$/i,
      /^(?:pick|apply)\s+commit\s+(.+)$/i,
    ],
    extract: (match, raw) => {
      const sha = match[1]?.trim();
      return { command: "cherry-pick", args: [sha], raw, source: "rule" };
    },
  },

  // Blame
  {
    patterns: [
      /^(?:git\s+)?blame\s+(.+)$/i,
      /^who\s+(?:last\s+)?(?:edited|changed|modified|wrote|touched)\s+(.+)$/i,
      /^(?:show|view)\s+(?:me\s+)?(?:the\s+)?blame\s+(?:for|of|on)\s+(.+)$/i,
    ],
    extract: (match, raw) => {
      const file = (match[1] || match[2])?.trim();
      return { command: "blame", args: [file], raw, source: "rule" };
    },
  },

  // Show commit
  {
    patterns: [
      /^(?:git\s+)?show\s+([a-f0-9]{6,40})$/i,
      /^(?:show|view|display)\s+(?:me\s+)?commit\s+([a-f0-9]{6,40})$/i,
    ],
    extract: (match, raw) => {
      const sha = match[1]?.trim();
      return { command: "show", args: [sha], raw, source: "rule" };
    },
  },

  // Merge
  {
    patterns: [
      /^(?:git\s+)?merge\s+(.+)$/i,
      /^merge\s+(?:the\s+)?(?:branch\s+)?(.+)\s+(?:into|in)\s+(?:this|current|here)$/i,
      /^merge\s+(.+)\s+(?:here|in)$/i,
    ],
    extract: (match, raw) => {
      const branch = match[1]?.trim();
      return { command: "merge", args: [branch], raw, source: "rule" };
    },
  },

  // Delete branch
  {
    patterns: [
      /^(?:delete|remove)\s+(?:the\s+)?branch\s+(.+)$/i,
      /^(?:git\s+)?branch\s+-[dD]\s+(.+)$/i,
    ],
    extract: (match, raw) => {
      const name = match[1]?.trim();
      return { command: "branch-delete", args: [name], raw, source: "rule" };
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseGitIntent(input: string): GitIntent {
  const trimmed = input.trim();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return rule.extract(match, trimmed);
      }
    }
  }

  return {
    command: "unknown",
    args: [],
    raw: trimmed,
    source: "unknown",
  };
}

/**
 * Attempt LLM-based intent parsing when the rule engine fails.
 * Returns a resolved intent or an "unknown" intent.
 */
export async function parseGitIntentWithLlm(
  input: string,
): Promise<GitIntent> {
  // First try rules
  const ruleResult = parseGitIntent(input);
  if (ruleResult.command !== "unknown") {
    return ruleResult;
  }

  // If Azure is not available, return unknown
  if (env.useMock || !hasAzureOpenAiConfig()) {
    return ruleResult;
  }

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
            content: `You are a Git command intent parser. Given a natural language sentence about a Git operation, return JSON with shape {"command": string, "args": string[]}.
Valid commands: status, log, diff, diff-staged, add, add-all, commit, commit-all, branch-list, branch-create, branch-delete, checkout, pull, push, fetch, stash, stash-pop, stash-list, tag, tag-list, remote, unstage, cherry-pick, blame, show, merge.
For "log", args can be [count].
For "commit"/"commit-all", args should be [message].
For "add"/"checkout"/"blame"/"unstage"/"diff", args should be [file/branch].
For "push", args can be [branch] or empty.
For "branch-create"/"branch-delete", args should be [name].
For "tag", args should be [name].
For "cherry-pick"/"show", args should be [sha].
For "merge", args should be [branch].
If you cannot determine the intent, return {"command": "unknown", "args": []}.`,
          },
          {
            role: "user",
            content: input,
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return ruleResult;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return ruleResult;
    }

    const parsed = JSON.parse(content) as {
      command?: string;
      args?: string[];
    };

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

/**
 * Returns all supported git commands for help display.
 */
export function getGitCommandHelp(): string[] {
  return [
    "Structured commands:",
    "  status                Show working tree status",
    "  log [n]               Show last n commits (default 10)",
    "  diff [file]           Show diff of working tree or file",
    "  diff --staged         Show diff of staged changes",
    "  add <file>            Stage a specific file",
    "  add .                 Stage all changes",
    "  commit <msg>          Commit staged changes",
    "  commit -a <msg>       Stage all and commit",
    "  branch                List local branches",
    "  branch <name>         Create and switch to new branch",
    "  checkout <name>       Switch to a branch",
    "  pull                  Pull from remote",
    "  push [branch]         Push to remote",
    "  fetch                 Fetch from all remotes",
    "  stash                 Stash working changes",
    "  stash pop             Apply latest stash",
    "  stash list            List stash entries",
    "  tag <name>            Create a tag",
    "  tag -l                List all tags",
    "  remote                List remotes",
    "  reset <file>          Unstage a file",
    "  cherry-pick <sha>     Cherry-pick a commit",
    "  blame <file>          Show file blame",
    "  show <sha>            Show commit details",
    "  merge <branch>        Merge a branch (--no-ff)",
    "  delete branch <name>  Delete a local branch",
    "",
    "Or type naturally:",
    "  \"show me what changed\"",
    "  \"commit everything with message fix auth bug\"",
    "  \"create a branch called feature/payments\"",
    "  \"switch to main\"",
    "  \"show last 5 commits\"",
    "  \"who edited routes.ts\"",
    "  \"push my changes\"",
    "  \"stash my work\"",
    "  \"tag this as v1.2.0\"",
    "",
    "  exit / quit           Leave Git mode",
  ];
}
