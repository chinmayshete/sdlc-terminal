"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.getConfig = getConfig;
exports.resetConfig = resetConfig;
exports.getRedactedConfig = getRedactedConfig;
exports.getConfigSummary = getConfigSummary;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const config_schema_1 = require("./config-schema");
const vault_1 = require("./vault");
const CONFIG_DIR = path_1.default.resolve(__dirname, "..", "..", "config");
let cachedConfig = null;
/**
 * Load and merge configuration from all sources.
 * Results are cached after first load.
 */
async function loadConfig(secretProvider) {
    if (cachedConfig) {
        return cachedConfig;
    }
    const appEnv = resolveAppEnv();
    const defaults = (0, config_schema_1.getDefaultConfig)(appEnv);
    // Layer 1: Load base config
    const baseConfig = await loadJsonConfig(path_1.default.join(CONFIG_DIR, "base.json"));
    // Layer 2: Load environment-specific config
    const envConfig = await loadJsonConfig(path_1.default.join(CONFIG_DIR, "environments", `${appEnv}.json`));
    // Layer 3: Merge in order — defaults < base < env-specific
    const merged = deepMerge(deepMerge(defaults, baseConfig), envConfig);
    // Layer 4: Override with environment variables (highest priority for non-sensitive)
    applyEnvOverrides(merged);
    // Layer 5: Load sensitive values from vault
    const provider = secretProvider ?? (0, vault_1.createSecretProvider)();
    await applySensitiveValues(merged, provider);
    // Validate final config
    const errors = (0, config_schema_1.validateConfig)(merged);
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
function getConfig() {
    if (!cachedConfig) {
        throw new Error("Configuration not yet loaded. Call loadConfig() first.");
    }
    return cachedConfig;
}
/**
 * Reset the cached config (for testing or re-initialization).
 */
function resetConfig() {
    cachedConfig = null;
}
/**
 * Returns a display-safe version of the config with sensitive values redacted.
 */
function getRedactedConfig(config) {
    const redacted = JSON.parse(JSON.stringify(config));
    for (const fieldPath of config_schema_1.SENSITIVE_FIELDS) {
        setNestedValue(redacted, fieldPath, "********");
    }
    return redacted;
}
/**
 * Returns a summary of the current config for display.
 */
function getConfigSummary(config) {
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
        `Sensitive fields: ${config_schema_1.SENSITIVE_FIELDS.join(", ")}`,
    ];
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function resolveAppEnv() {
    const raw = process.env.APP_ENV?.trim().toLowerCase();
    if (raw === "staging" || raw === "prod") {
        return raw;
    }
    return "dev";
}
async function loadJsonConfig(filePath) {
    try {
        const raw = await fs_1.promises.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function applyEnvOverrides(config) {
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
async function applySensitiveValues(config, provider) {
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
function readEnvClean(name) {
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
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sourceVal = source[key];
        const targetVal = result[key];
        if (sourceVal &&
            typeof sourceVal === "object" &&
            !Array.isArray(sourceVal) &&
            targetVal &&
            typeof targetVal === "object" &&
            !Array.isArray(targetVal)) {
            result[key] = deepMerge(targetVal, sourceVal);
        }
        else {
            result[key] = sourceVal;
        }
    }
    return result;
}
function setNestedValue(obj, path, value) {
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== "object") {
            return;
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart in current) {
        current[lastPart] = value;
    }
}
