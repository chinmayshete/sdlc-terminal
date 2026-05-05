/**
 * Environment Configuration
 *
 * Provides backward-compatible access to environment variables
 * while integrating with the new config-manager and vault systems.
 *
 * The static `env` export is preserved for existing code paths.
 * New code should prefer loadConfig() from config-manager.ts.
 */

import dotenv from "dotenv";

dotenv.config();

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }

  const withoutQuotes = value.replace(/^["']|["']$/g, "");
  return withoutQuotes || undefined;
}

export const env = {
  azureEndpoint: readEnv("AZURE_OPENAI_ENDPOINT")?.replace(/\/+$/, ""),
  azureApiKey: readEnv("AZURE_OPENAI_API_KEY"),
  azureDeployment: readEnv("AZURE_OPENAI_DEPLOYMENT") ?? "gpt-4.1",
  azureApiVersion: readEnv("AZURE_OPENAI_API_VERSION") ?? "2024-12-01-preview",
  useMock: readEnv("SDLC_USE_MOCK") === "true",

  // New: environment and vault config
  appEnv: readEnv("APP_ENV") ?? "dev",
  vaultEnabled: readEnv("VAULT_ENABLED") === "true",
  vaultAddr: readEnv("VAULT_ADDR") ?? "http://127.0.0.1:8200",
  vaultToken: readEnv("VAULT_TOKEN"),
  vaultSecretPath: readEnv("VAULT_SECRET_PATH") ?? "secret/data/sdlc",
};

export function hasAzureOpenAiConfig(): boolean {
  return Boolean(env.azureEndpoint && env.azureApiKey && env.azureDeployment);
}

/**
 * Returns a display-safe version of env config with secrets redacted.
 */
export function getRedactedEnv(): Record<string, string> {
  return {
    AZURE_OPENAI_ENDPOINT: env.azureEndpoint ?? "(not set)",
    AZURE_OPENAI_API_KEY: env.azureApiKey ? "********" : "(not set)",
    AZURE_OPENAI_DEPLOYMENT: env.azureDeployment,
    AZURE_OPENAI_API_VERSION: env.azureApiVersion,
    SDLC_USE_MOCK: String(env.useMock),
    APP_ENV: env.appEnv,
    VAULT_ENABLED: String(env.vaultEnabled),
    VAULT_ADDR: env.vaultAddr,
    VAULT_TOKEN: env.vaultToken ? "********" : "(not set)",
    VAULT_SECRET_PATH: env.vaultSecretPath,
  };
}
