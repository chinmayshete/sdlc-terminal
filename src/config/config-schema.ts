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

export interface AppConfig {
  /** Current environment: dev, staging, or prod */
  appEnv: "dev" | "staging" | "prod";

  /** Azure OpenAI configuration */
  azure: {
    endpoint: string;
    apiKey: string; // sensitive — vault in prod
    deployment: string;
    apiVersion: string;
  };

  /** Feature flags */
  features: {
    useMock: boolean;
    enableCodeScanning: boolean;
    enableCicdIntegration: boolean;
  };

  /** Logging configuration */
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "text";
  };

  /** Database configuration (parameterized, not hardcoded) */
  database: {
    host: string;
    port: number;
    name: string;
    username: string; // sensitive — vault in prod
    password: string; // sensitive — vault in prod
    ssl: boolean;
  };

  /** External service endpoints */
  services: {
    jenkinsUrl: string;
    vaultAddr: string;
    sonarQubeUrl: string;
  };
}

/** Fields that must come from vault in production environments */
export const SENSITIVE_FIELDS: string[] = [
  "azure.apiKey",
  "database.username",
  "database.password",
];

/** Required fields that must be present for the app to start */
export const REQUIRED_FIELDS: string[] = [
  "appEnv",
  "azure.endpoint",
  "azure.deployment",
  "azure.apiVersion",
];

export interface ConfigValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Validates a configuration object against the schema rules.
 * Returns an array of validation errors (empty = valid).
 */
export function validateConfig(
  config: Partial<AppConfig>,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
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
    for (const field of SENSITIVE_FIELDS) {
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
  if (
    config.logging?.level &&
    !["debug", "info", "warn", "error"].includes(config.logging.level)
  ) {
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
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key: string) => {
    if (
      current &&
      typeof current === "object" &&
      key in (current as Record<string, unknown>)
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

/**
 * Returns the default configuration for a given environment.
 */
export function getDefaultConfig(
  appEnv: "dev" | "staging" | "prod" = "dev",
): AppConfig {
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
      jenkinsUrl:
        appEnv === "prod"
          ? "https://jenkins.freddiemac.internal"
          : "http://localhost:8080",
      vaultAddr: "http://127.0.0.1:8200",
      sonarQubeUrl:
        appEnv === "prod"
          ? "https://sonar.freddiemac.internal"
          : "http://localhost:9000",
    },
  };
}
