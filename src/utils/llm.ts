import { env, hasAzureOpenAiConfig } from "../config/env";
import {
  AiHealth,
  CodeChange,
  NlpChatResult,
  NlpChatTurn,
  RepoFile,
  Ticket,
} from "../core/types";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function generatePlan(
  ticket: Ticket,
  files: RepoFile[],
): Promise<string[]> {
  const fallback = buildFallbackPlan(ticket, files);

  if (!shouldUseAzure()) {
    return fallback;
  }

  try {
    const response = await callAzureJson<{ steps?: string[] }>([
      {
        role: "system",
        content:
          'You are an SDLC planning assistant. Return JSON only with shape {"steps": string[]}. Keep the plan concise and implementation-focused.',
      },
      {
        role: "user",
        content: JSON.stringify({
          ticket,
          relevantFiles: files.map((file) => file.path),
        }),
      },
    ]);

    return response.steps && response.steps.length > 0
      ? response.steps
      : fallback;
  } catch {
    return fallback;
  }
}

export async function generateCode(
  ticket: Ticket,
  files: RepoFile[],
): Promise<CodeChange[]> {
  const fallback = buildFallbackCode(ticket, files);

  if (!shouldUseAzure()) {
    return fallback;
  }

  try {
    const response = await callAzureJson<{ files?: CodeChange[] }>([
      {
        role: "system",
        content:
          'You are a TypeScript code generation assistant for a local Express repo. Return JSON only with shape {"files": [{"path": string, "content": string}]}. Always return complete file contents. Every file path must stay inside repo/app/. Never return src/, tests/, or any path outside repo/app/.',
      },
      {
        role: "user",
        content: JSON.stringify({
          ticket,
          files,
          constraints: [
            "Keep code small and readable.",
            "Use complete file content only.",
            "Preserve existing file paths.",
          ],
        }),
      },
    ]);

    return normalizeCodeResponse(response.files, fallback);
  } catch {
    return fallback;
  }
}

export async function generateTests(
  ticket: Ticket,
  codeChanges: CodeChange[],
): Promise<CodeChange[]> {
  const fallback = buildFallbackTests(ticket);

  if (!shouldUseAzure()) {
    return fallback;
  }

  try {
    const response = await callAzureJson<{ files?: CodeChange[] }>([
      {
        role: "system",
        content:
          'You write Jest tests for a small TypeScript Express repo. Return JSON only with shape {"files": [{"path": string, "content": string}]}. Always return complete file contents. Every file path must stay inside repo/app/.',
      },
      {
        role: "user",
        content: JSON.stringify({
          ticket,
          codeChanges,
        }),
      },
    ]);

    return normalizeCodeResponse(response.files, fallback);
  } catch {
    return fallback;
  }
}

export async function generateFreeNlpChat(
  files: RepoFile[],
  history: NlpChatTurn[],
  prompt: string,
): Promise<NlpChatResult> {
  const fallback = buildFallbackNlpChat(files, prompt);

  if (!shouldUseAzure()) {
    return fallback;
  }

  try {
    const response = await callAzureJson<{
      message?: string;
      files?: CodeChange[];
    }>([
      {
        role: "system",
        content:
          'You are a terminal coding assistant with access to a local TypeScript codebase. Return JSON only with shape {"message": string, "files": [{"path": string, "content": string}]}. Behave like a natural chat assistant: answer questions, summarize code, explain architecture, and help a developer reason. Only include files when the user clearly asks for code changes or new files. Always return complete file contents for any changed files. If a specific file path is named, prefer scoped edits to that file. Every returned file path must stay inside repo/app/.',
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          history,
          repoFiles: files,
        }),
      },
    ]);

    return {
      message: response.message?.trim() || fallback.message,
      changes: normalizeCodeResponse(response.files, []),
    };
  } catch {
    return fallback;
  }
}

export async function explainFileWithChat(
  filePath: string,
  content: string,
  history: NlpChatTurn[],
): Promise<string> {
  const fallback = `File ${filePath} has ${content.split(/\r?\n/).length} lines. Ask a more specific follow-up if you want a deeper walkthrough of its logic or structure.`;

  if (!shouldUseAzure()) {
    return fallback;
  }

  try {
    const response = await callAzureJson<{ message?: string }>([
      {
        role: "system",
        content:
          'You explain code clearly for a developer in a terminal. Return JSON only with shape {"message": string}. Be practical, concise, and specific to the provided file.',
      },
      {
        role: "user",
        content: JSON.stringify({
          filePath,
          content,
          history,
        }),
      },
    ]);

    return response.message?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function checkAiHealth(): Promise<AiHealth> {
  const configured = hasAzureOpenAiConfig();
  const mode = env.useMock ? "mock" : "azure";

  if (!configured || env.useMock) {
    return {
      configured,
      mode,
      reachable: true,
      message: configured
        ? "Mock mode is enabled by configuration."
        : "Azure config missing, using mock mode.",
    };
  }

  try {
    await callAzureJson<{ ok?: boolean }>([
      {
        role: "system",
        content: 'Return JSON only with shape {"ok": true}.',
      },
      {
        role: "user",
        content: "Health check",
      },
    ]);

    return {
      configured: true,
      mode: "azure",
      reachable: true,
      message: "Azure OpenAI responded successfully.",
    };
  } catch (error) {
    return {
      configured: true,
      mode: "azure",
      reachable: false,
      message: formatAiError(error),
    };
  }
}

function shouldUseAzure(): boolean {
  return !env.useMock && hasAzureOpenAiConfig();
}

async function callAzureJson<T>(messages: ChatMessage[]): Promise<T> {
  const endpoint = `${env.azureEndpoint}/openai/deployments/${env.azureDeployment}/chat/completions?api-version=${env.azureApiVersion}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.azureApiKey ?? "",
    },
    body: JSON.stringify({
      messages,
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Azure OpenAI request failed (${response.status}): ${details}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Azure OpenAI response did not contain content.");
  }

  return JSON.parse(content) as T;
}

function formatAiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Azure OpenAI health check failed.";
  }

  const causeValue = (error as Error & { cause?: unknown }).cause;
  const cause = causeValue instanceof Error ? causeValue.message : "";
  const combined = `${error.message} ${cause}`.toLowerCase();

  if (combined.includes("fetch failed")) {
    return "Network request to Azure OpenAI failed. Check internet access, Azure endpoint URL, firewall/proxy settings, and whether the resource is reachable from this machine.";
  }

  if (combined.includes("enotfound") || combined.includes("getaddrinfo")) {
    return "Azure endpoint host could not be resolved. Verify AZURE_OPENAI_ENDPOINT exactly matches your Azure resource URL.";
  }

  if (combined.includes("401") || combined.includes("unauthorized")) {
    return "Azure rejected the API key. Verify AZURE_OPENAI_API_KEY and deployment access.";
  }

  if (combined.includes("404")) {
    return "Azure deployment or endpoint was not found. Verify AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT.";
  }

  return error.message;
}

function normalizeCodeResponse(
  files: CodeChange[] | undefined,
  fallback: CodeChange[],
): CodeChange[] {
  if (!files || files.length === 0) {
    return fallback;
  }

  return files.filter(
    (file) => typeof file.path === "string" && typeof file.content === "string",
  );
}

function buildFallbackNlpChat(
  files: RepoFile[],
  prompt: string,
): NlpChatResult {
  const lowerPrompt = prompt.toLowerCase();
  const targetedEdit = parseTargetedEdit(prompt);

  if (isGreeting(lowerPrompt)) {
    return {
      message:
        "Hey. I'm in NLP mode with access to the local repo, so you can chat normally, ask questions, or tell me to modify files.",
      changes: [],
    };
  }

  if (targetedEdit) {
    const targetFile = files.find(
      (file) => normalizePath(file.path) === normalizePath(targetedEdit.path),
    );
    if (!targetFile) {
      return {
        message: `I couldn't find ${targetedEdit.path} in the repo. Ask me to list files or point me at a different path.`,
        changes: [],
      };
    }

    return {
      message: `I applied a targeted edit to ${targetedEdit.path} based on your instruction.`,
      changes: [
        {
          path: targetFile.path,
          content: applyBasicTargetedEdit(
            targetFile.content,
            targetedEdit.instruction,
          ),
        },
      ],
    };
  }

  if (
    lowerPrompt.includes("what files") ||
    lowerPrompt.includes("show files") ||
    lowerPrompt.includes("repo")
  ) {
    return {
      message: `I can currently see ${files.length} repo files. Some key ones are: ${files
        .slice(0, 8)
        .map((file) => file.path)
        .join(", ")}.`,
      changes: [],
    };
  }

  if (
    lowerPrompt.startsWith("summarize ") ||
    lowerPrompt.includes("explain the code")
  ) {
    return {
      message: `This repo looks like a small Express-based sample app with auth and user flows. Key files include ${files
        .slice(0, 5)
        .map((file) => file.path)
        .join(", ")}.`,
      changes: [],
    };
  }

  if (looksLikeCodeChangeRequest(lowerPrompt)) {
    const syntheticTicket: Ticket = {
      id: "NLP-SESSION",
      title: "Interactive NLP code update",
      description: prompt,
      priority: "MEDIUM",
    };

    return {
      message:
        "I applied a code-oriented interpretation of your request to the local repo.",
      changes: buildFallbackCode(syntheticTicket, files),
    };
  }

  return {
    message:
      "I'm ready. Ask me about the codebase, request a refactor, create a file, explain a module, summarize the app, or describe a feature you want changed.",
    changes: [],
  };
}

function isGreeting(prompt: string): boolean {
  return ["hi", "hello", "hey", "yo"].some(
    (word) => prompt === word || prompt.startsWith(`${word} `),
  );
}

function looksLikeCodeChangeRequest(prompt: string): boolean {
  const verbs = [
    "add",
    "update",
    "modify",
    "change",
    "create",
    "implement",
    "refactor",
    "fix",
    "write",
    "edit",
  ];
  return verbs.some((verb) => prompt.includes(verb));
}

function parseTargetedEdit(
  prompt: string,
): { path: string; instruction: string } | null {
  const match = prompt.match(/^edit\s+(.+?):\s+(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    path: match[1].trim(),
    instruction: match[2].trim(),
  };
}

function applyBasicTargetedEdit(content: string, instruction: string): string {
  return `${content.trimEnd()}\n\n// NLP note: ${instruction}\n`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function buildFallbackPlan(ticket: Ticket, files: RepoFile[]): string[] {
  const names = files
    .map((file) => file.path.split("/").pop())
    .filter(Boolean)
    .join(", ");

  return [
    `Read ticket ${ticket.id} and confirm the expected behavior for ${ticket.title.toLowerCase()}.`,
    `Review the most relevant repo files and update controllers, models, and routes as needed.`,
    `Generate or refresh Jest coverage for the new behavior.`,
    `Prepare the repository for a feature commit named after the ticket.`,
    `Relevant files considered: ${names || "repo files"}.`,
  ];
}

function buildFallbackCode(ticket: Ticket, files: RepoFile[]): CodeChange[] {
  const lowerText = `${ticket.title} ${ticket.description}`.toLowerCase();

  if (lowerText.includes("login")) {
    return buildLoginChanges(files);
  }

  if (lowerText.includes("register") || lowerText.includes("signup")) {
    return buildRegisterChanges(files);
  }

  if (lowerText.includes("profile") || lowerText.includes("current user")) {
    return buildProfileChanges(files);
  }

  return files.map((file) => ({
    path: file.path,
    content: file.content,
  }));
}

function buildFallbackTests(ticket: Ticket): CodeChange[] {
  const lowerText = `${ticket.title} ${ticket.description}`.toLowerCase();

  if (lowerText.includes("register") || lowerText.includes("signup")) {
    return [
      {
        path: "repo/app/tests/auth.register.test.ts",
        content: `import { register } from "../src/auth.controller";

describe("register", () => {
  it("creates a new user", async () => {
    const result = await register({
      email: "new@example.com",
      name: "New User",
      password: "password123",
    });

    expect(result.user.email).toBe("new@example.com");
    expect(result.token).toBeTruthy();
  });

  it("rejects duplicate email", async () => {
    await expect(
      register({
        email: "demo@example.com",
        name: "Duplicate User",
        password: "password123",
      }),
    ).rejects.toThrow("User already exists");
  });
});
`,
      },
    ];
  }

  if (lowerText.includes("profile") || lowerText.includes("current user")) {
    return [
      {
        path: "repo/app/tests/user.profile.test.ts",
        content: `import { getCurrentUserProfile } from "../src/user.controller";

describe("getCurrentUserProfile", () => {
  it("returns the current user profile", async () => {
    const profile = await getCurrentUserProfile("demo@example.com");

    expect(profile.email).toBe("demo@example.com");
    expect(profile.name).toBe("Demo User");
  });

  it("throws when the user is missing", async () => {
    await expect(getCurrentUserProfile("missing@example.com")).rejects.toThrow("User not found");
  });
});
`,
      },
    ];
  }

  return [
    {
      path: "repo/app/tests/auth.controller.test.ts",
      content: `import { login } from "../src/auth.controller";

describe("login", () => {
  it("returns a token for a valid user", async () => {
    const result = await login({ email: "demo@example.com", password: "password123" });

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe("demo@example.com");
  });

  it("rejects invalid credentials", async () => {
    await expect(
      login({ email: "demo@example.com", password: "wrong-password" }),
    ).rejects.toThrow("Invalid credentials");
  });
});
`,
    },
  ];
}

function buildLoginChanges(files: RepoFile[]): CodeChange[] {
  return buildBaseAuthRepo(files, {
    includeLoginRoute: true,
    includeRegisterRoute: false,
    includeProfileRoute: false,
  });
}

function buildRegisterChanges(files: RepoFile[]): CodeChange[] {
  return buildBaseAuthRepo(files, {
    includeLoginRoute: true,
    includeRegisterRoute: true,
    includeProfileRoute: false,
  });
}

function buildProfileChanges(files: RepoFile[]): CodeChange[] {
  return buildBaseAuthRepo(files, {
    includeLoginRoute: true,
    includeRegisterRoute: true,
    includeProfileRoute: true,
  });
}

function buildBaseAuthRepo(
  files: RepoFile[],
  options: {
    includeLoginRoute: boolean;
    includeRegisterRoute: boolean;
    includeProfileRoute: boolean;
  },
): CodeChange[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));

  const authController = `import {
  createUser,
  findUserByEmail,
  sanitizeUser,
  type CreateUserInput,
} from "./user.model";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = findUserByEmail(input.email);

  if (!user || user.password !== input.password) {
    throw new Error("Invalid credentials");
  }

  return {
    token: buildToken(user.email),
    user: sanitizeUser(user),
  };
}

export async function register(input: CreateUserInput): Promise<AuthResult> {
  const existing = findUserByEmail(input.email);

  if (existing) {
    throw new Error("User already exists");
  }

  const user = createUser(input);

  return {
    token: buildToken(user.email),
    user: sanitizeUser(user),
  };
}

function buildToken(email: string): string {
  return Buffer.from(email).toString("base64url");
}
`;

  const userModel = `export interface UserRecord {
  id: string;
  email: string;
  name: string;
  password: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

const users: UserRecord[] = [
  {
    id: "user-1",
    email: "demo@example.com",
    name: "Demo User",
    password: "password123",
  },
];

export function getUsers(): Omit<UserRecord, "password">[] {
  return users.map((user) => sanitizeUser(user));
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function createUser(input: CreateUserInput): UserRecord {
  const user: UserRecord = {
    id: \`user-\${users.length + 1}\`,
    email: input.email,
    name: input.name,
    password: input.password,
  };

  users.push(user);
  return user;
}

export function sanitizeUser(user: UserRecord): Omit<UserRecord, "password"> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
`;

  const userController = `import { findUserByEmail, getUsers, sanitizeUser } from "./user.model";

export async function listUsers() {
  return getUsers();
}

export async function getCurrentUserProfile(email: string) {
  const user = findUserByEmail(email);

  if (!user) {
    throw new Error("User not found");
  }

  return sanitizeUser(user);
}
`;

  const routeLines = [
    'import express from "express";',
    'import { login, register } from "./auth.controller";',
    'import { getCurrentUserProfile, listUsers } from "./user.controller";',
    "",
    "const router = express.Router();",
    "",
    'router.get("/health", (_request, response) => {',
    "  response.json({ ok: true });",
    "});",
    "",
  ];

  if (options.includeLoginRoute) {
    routeLines.push(
      'router.post("/login", async (request, response) => {',
      "  try {",
      "    const result = await login(request.body);",
      "    response.status(200).json(result);",
      "  } catch (error) {",
      '    const message = error instanceof Error ? error.message : "Unknown error";',
      "    response.status(401).json({ error: message });",
      "  }",
      "});",
      "",
    );
  }

  if (options.includeRegisterRoute) {
    routeLines.push(
      'router.post("/register", async (request, response) => {',
      "  try {",
      "    const result = await register(request.body);",
      "    response.status(201).json(result);",
      "  } catch (error) {",
      '    const message = error instanceof Error ? error.message : "Unknown error";',
      "    response.status(400).json({ error: message });",
      "  }",
      "});",
      "",
    );
  }

  routeLines.push(
    'router.get("/users", async (_request, response) => {',
    "  const users = await listUsers();",
    "  response.status(200).json(users);",
    "});",
    "",
  );

  if (options.includeProfileRoute) {
    routeLines.push(
      'router.get("/me", async (request, response) => {',
      '  const email = String(request.query.email ?? "demo@example.com");',
      "",
      "  try {",
      "    const profile = await getCurrentUserProfile(email);",
      "    response.status(200).json(profile);",
      "  } catch (error) {",
      '    const message = error instanceof Error ? error.message : "Unknown error";',
      "    response.status(404).json({ error: message });",
      "  }",
      "});",
      "",
    );
  }

  routeLines.push("export default router;", "");

  return [
    {
      path: "repo/app/src/auth.controller.ts",
      content: authController,
    },
    {
      path: "repo/app/src/user.model.ts",
      content: userModel,
    },
    {
      path: "repo/app/src/user.controller.ts",
      content: userController,
    },
    {
      path: "repo/app/src/routes.ts",
      content: routeLines.join("\n"),
    },
    {
      path: "repo/app/src/server.ts",
      content:
        byPath.get("repo/app/src/server.ts") ??
        `import express from "express";
import routes from "./routes";

const app = express();

app.use(express.json());
app.use(routes);

export default app;
`,
    },
  ];
}
