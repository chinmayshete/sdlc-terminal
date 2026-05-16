"use strict";
/**
 * Environment Configuration
 *
 * Provides backward-compatible access to environment variables
 * while integrating with the new config-manager and vault systems.
 *
 * The static `env` export is preserved for existing code paths.
 * New code should prefer loadConfig() from config-manager.ts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.hasAzureOpenAiConfig = hasAzureOpenAiConfig;
exports.getRedactedEnv = getRedactedEnv;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (process.env.SDLC_SKIP_SSL_VERIFY === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
function readEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        return undefined;
    }
    const withoutQuotes = value.replace(/^["']|["']$/g, "");
    return withoutQuotes || undefined;
}
exports.env = {
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
    // Jira Integration
    jiraHost: readEnv("JIRA_HOST"),
    jiraEmail: readEnv("JIRA_EMAIL"),
    jiraApiToken: readEnv("JIRA_API_TOKEN"),
    jiraProjectKey: readEnv("JIRA_PROJECT_KEY") ?? "SDLC",
    skipSslVerify: readEnv("SDLC_SKIP_SSL_VERIFY") === "true",
};
function hasAzureOpenAiConfig() {
    return Boolean(exports.env.azureEndpoint && exports.env.azureApiKey && exports.env.azureDeployment);
}
/**
 * Returns a display-safe version of env config with secrets redacted.
 */
function getRedactedEnv() {
    return {
        AZURE_OPENAI_ENDPOINT: exports.env.azureEndpoint ?? "(not set)",
        AZURE_OPENAI_API_KEY: exports.env.azureApiKey ? "********" : "(not set)",
        AZURE_OPENAI_DEPLOYMENT: exports.env.azureDeployment,
        AZURE_OPENAI_API_VERSION: exports.env.azureApiVersion,
        SDLC_USE_MOCK: String(exports.env.useMock),
        APP_ENV: exports.env.appEnv,
        VAULT_ENABLED: String(exports.env.vaultEnabled),
        VAULT_ADDR: exports.env.vaultAddr,
        VAULT_TOKEN: exports.env.vaultToken ? "********" : "(not set)",
        VAULT_SECRET_PATH: exports.env.vaultSecretPath,
    };
}
