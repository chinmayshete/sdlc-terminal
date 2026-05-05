/**
 * Configuration Manager
 *
 * Manages multi-environment configuration by deep-merging base config
 * with environment-specific overrides. Integrates with the vault
 * SecretProvider for sensitive values.
 *
 * Config loading order:
 *   1. base.json (shared defaults)
 *   2. environments/{APP_ENV}.json (env-specific overrides)
 *   3. Environment variables (highest priority)
 *   4. Vault secrets (for sensitive fields in staging/prod)
 */

import { promises as fs } from "fs";
import path from "path";
import {
  AppConfig,
  getDefaultConfig,
  SENSITIVE_FIELDS,
  validateConfig,
} from "./config-schema";
import { createSecretProvider, SecretProvider } from "./vault";

const CONFIG_DIR = path.resolve(__dirname, "..", "..", "config");

let cachedConfig: AppConfig | null = null;

/**
 * Load and merge configuration from all sources.
 * Results are cached after first load.
 */
export async function loadConfig(
  secretProvider?: SecretProvider,
): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const appEnv = resolveAppEnv();
  const defaults = getDefaultConfig(appEnv);

  // Layer 1: Load base config
  const baseConfig = await loadJsonConfig(path.join(CONFIG_DIR, "base.json"));

  // Layer 2: Load environment-specific config
  const envConfig = await loadJsonConfig(
    path.join(CONFIG_DIR, "environments", `${appEnv}.json`),
  );

  // Layer 3: Merge in order — defaults < base < env-specific
  const merged = deepMerge(
    deepMerge(defaults as unknown as Record<string, unknown>, baseConfig),
    envConfig,
  ) as unknown as AppConfig;

  // Layer 4: Override with environment variables (highest priority for non-sensitive)
  applyEnvOverrides(merged);

  // Layer 5: Load sensitive values from vault
  const provider = secretProvider ?? createSecretProvider();
  await applySensitiveValues(merged, provider);

  // Validate final config
  const errors = validateConfig(merged);
  const criticalErrors = errors.filter((e) => e.severity === "error");

  if (criticalErrors.length > 0) {
    console.warn(`[Config] ${criticalErrors.length} validation error(s):`);
    for (const error of criticalErrors) {
      console.warn(`  - ${error.field}: ${error.message}`);
    }
  }

  cachedConfig = merged;
  return merged;
}

/**
 * Get the currently loaded config. Throws if not yet loaded.
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error("Configuration not yet loaded. Call loadConfig() first.");
  }
  return cachedConfig;
}

/**
 * Reset the cached config (for testing or re-initialization).
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Returns a display-safe version of the config with sensitive values redacted.
 */
export function getRedactedConfig(config: AppConfig): Record<string, unknown> {
  const redacted = JSON.parse(JSON.stringify(config)) as Record<
    string,
    unknown
  >;

  for (const fieldPath of SENSITIVE_FIELDS) {
    setNestedValue(redacted, fieldPath, "********");
  }

  return redacted;
}

/**
 * Returns a summary of the current config for display.
 */
export function getConfigSummary(config: AppConfig): string[] {
  const redacted = getRedactedConfig(config);
  return [
    `Environment: ${config.appEnv}`,
    `Azure Endpoint: ${config.azure.endpoint || "(not set)"}`,
    `Azure Deployment: ${config.azure.deployment}`,
    `Azure API Key: ********`,
    `Mock Mode: ${config.features.useMock ? "enabled" : "disabled"}`,
    `Code Scanning: ${config.features.enableCodeScanning ? "enabled" : "disabled"}`,
    `CI/CD Integration: ${config.features.enableCicdIntegration ? "enabled" : "disabled"}`,
    `Logging Level: ${config.logging.level}`,
    `Logging Format: ${config.logging.format}`,
    `Database: ${config.database.host}:${config.database.port}/${config.database.name}`,
    `Database SSL: ${config.database.ssl ? "enabled" : "disabled"}`,
    `Jenkins: ${config.services.jenkinsUrl}`,
    `SonarQube: ${config.services.sonarQubeUrl}`,
    `Vault: ${config.services.vaultAddr}`,
    "",
    `Config Sources: base.json → ${config.appEnv}.json → ENV → Vault`,
    `Sensitive fields: ${SENSITIVE_FIELDS.join(", ")}`,
  ];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveAppEnv(): "dev" | "staging" | "prod" {
  const raw = process.env.APP_ENV?.trim().toLowerCase();
  if (raw === "staging" || raw === "prod") {
    return raw;
  }
  return "dev";
}

async function loadJsonConfig(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function applyEnvOverrides(config: AppConfig): void {
  const endpoint = readEnvClean("AZURE_OPENAI_ENDPOINT");
  if (endpoint) {
    config.azure.endpoint = endpoint.replace(/\/+$/, "");
  }

  const deployment = readEnvClean("AZURE_OPENAI_DEPLOYMENT");
  if (deployment) {
    config.azure.deployment = deployment;
  }

  const apiVersion = readEnvClean("AZURE_OPENAI_API_VERSION");
  if (apiVersion) {
    config.azure.apiVersion = apiVersion;
  }

  const useMock = readEnvClean("SDLC_USE_MOCK");
  if (useMock !== undefined) {
    config.features.useMock = useMock === "true";
  }
}

async function applySensitiveValues(
  config: AppConfig,
  provider: SecretProvider,
): Promise<void> {
  // Azure API Key
  const apiKey = await provider.getSecret("AZURE_OPENAI_API_KEY");
  if (apiKey) {
    config.azure.apiKey = apiKey;
  }

  // Database credentials (if configured in vault)
  const dbUser = await provider.getSecret("DB_USERNAME");
  if (dbUser) {
    config.database.username = dbUser;
  }

  const dbPass = await provider.getSecret("DB_PASSWORD");
  if (dbPass) {
    config.database.password = dbPass;
  }
}

function readEnvClean(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }
  return value.replace(/^["']|["']$/g, "");
}

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not concatenated.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      return;
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart in current) {
    current[lastPart] = value;
  }
}
