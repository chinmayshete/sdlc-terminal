"use strict";
/**
 * Typed Configuration Schema
 *
 * Defines the shape of all application configuration, distinguishing
 * between sensitive values (must come from vault in prod) and
 * non-sensitive values (can live in config files / env vars).
 *
 * Provides runtime validation to catch missing config at startup
 * rather than at first use.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_FIELDS = exports.SENSITIVE_FIELDS = void 0;
exports.validateConfig = validateConfig;
exports.getDefaultConfig = getDefaultConfig;
/** Fields that must come from vault in production environments */
exports.SENSITIVE_FIELDS = [
    "azure.apiKey",
    "database.username",
    "database.password",
];
/** Required fields that must be present for the app to start */
exports.REQUIRED_FIELDS = [
    "appEnv",
    "azure.endpoint",
    "azure.deployment",
    "azure.apiVersion",
];
/**
 * Validates a configuration object against the schema rules.
 * Returns an array of validation errors (empty = valid).
 */
function validateConfig(config) {
    const errors = [];
    // Check required fields
    for (const field of exports.REQUIRED_FIELDS) {
        const value = getNestedValue(config, field);
        if (value === undefined || value === null || value === "") {
            errors.push({
                field,
                message: `Required configuration field '${field}' is missing or empty.`,
                severity: "error",
            });
        }
    }
    // In production, sensitive fields should NOT come from env vars directly
    if (config.appEnv === "prod") {
        for (const field of exports.SENSITIVE_FIELDS) {
            const value = getNestedValue(config, field);
            if (value && typeof value === "string" && value.length > 0) {
                // This is a warning — the value exists but ideally should come from vault
                errors.push({
                    field,
                    message: `Sensitive field '${field}' should be sourced from Vault in production, not from config files.`,
                    severity: "warning",
                });
            }
        }
    }
    // Validate appEnv
    if (config.appEnv && !["dev", "staging", "prod"].includes(config.appEnv)) {
        errors.push({
            field: "appEnv",
            message: `Invalid appEnv value '${config.appEnv}'. Must be one of: dev, staging, prod.`,
            severity: "error",
        });
    }
    // Validate logging level
    if (config.logging?.level &&
        !["debug", "info", "warn", "error"].includes(config.logging.level)) {
        errors.push({
            field: "logging.level",
            message: `Invalid logging level '${config.logging.level}'. Must be one of: debug, info, warn, error.`,
            severity: "error",
        });
    }
    // Validate database port
    if (config.database?.port !== undefined) {
        if (config.database.port < 1 || config.database.port > 65535) {
            errors.push({
                field: "database.port",
                message: `Invalid database port ${config.database.port}. Must be between 1 and 65535.`,
                severity: "error",
            });
        }
    }
    return errors;
}
/**
 * Safely access a nested property by dot-notation path.
 */
function getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => {
        if (current &&
            typeof current === "object" &&
            key in current) {
            return current[key];
        }
        return undefined;
    }, obj);
}
/**
 * Returns the default configuration for a given environment.
 */
function getDefaultConfig(appEnv = "dev") {
    return {
        appEnv,
        azure: {
            endpoint: "",
            apiKey: "",
            deployment: "gpt-4.1",
            apiVersion: "2024-12-01-preview",
        },
        features: {
            useMock: appEnv === "dev",
            enableCodeScanning: true,
            enableCicdIntegration: appEnv !== "dev",
        },
        logging: {
            level: appEnv === "prod" ? "warn" : "debug",
            format: appEnv === "prod" ? "json" : "text",
        },
        database: {
            host: "localhost",
            port: 5432,
            name: `sdlc_${appEnv}`,
            username: "",
            password: "",
            ssl: appEnv === "prod",
        },
        services: {
            jenkinsUrl: appEnv === "prod"
                ? "https://jenkins.freddiemac.internal"
                : "http://localhost:8080",
            vaultAddr: "http://127.0.0.1:8200",
            sonarQubeUrl: appEnv === "prod"
                ? "https://sonar.freddiemac.internal"
                : "http://localhost:9000",
        },
    };
}
