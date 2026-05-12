"use strict";
/**
 * Vault Secret Provider Abstraction
 *
 * Demonstrates how production systems integrate with secret management
 * services (HashiCorp Vault, Azure Key Vault). Provides a pluggable
 * SecretProvider interface with environment-based fallback.
 *
 * In production at Freddie Mac, the VaultSecretProvider would make
 * authenticated HTTP calls to a Vault server. For this POC, it
 * simulates the behavior while showcasing the architecture.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvSecretProvider = exports.VaultSecretProvider = void 0;
exports.createSecretProvider = createSecretProvider;
/**
 * Vault-backed secret provider.
 *
 * In production, this would use the Vault HTTP API:
 *   GET {VAULT_ADDR}/v1/{secretPath}
 *   Headers: X-Vault-Token: {token}
 *
 * For the POC, it demonstrates the integration pattern with
 * caching and structured error handling.
 */
class VaultSecretProvider {
    constructor(options) {
        this.providerName = "HashiCorp Vault";
        this.cache = new Map();
        this.vaultAddr = options.vaultAddr.replace(/\/+$/, "");
        this.vaultToken = options.vaultToken;
        this.secretPath = options.secretPath;
    }
    async getSecret(key) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        try {
            const value = await this.fetchFromVault(key);
            if (value !== undefined) {
                this.cache.set(key, value);
            }
            return value;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown vault error";
            console.warn(`[Vault] Failed to retrieve secret '${key}': ${message}`);
            return undefined;
        }
    }
    /**
     * In production, this performs:
     *   GET {vaultAddr}/v1/{secretPath}
     *   X-Vault-Token: {token}
     *
     * Response shape: { data: { data: { [key]: "value" } } }
     *
     * For the POC, we simulate the call structure.
     */
    async fetchFromVault(key) {
        const endpoint = `${this.vaultAddr}/v1/${this.secretPath}`;
        try {
            const response = await fetch(endpoint, {
                method: "GET",
                headers: {
                    "X-Vault-Token": this.vaultToken,
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Vault responded with status ${response.status}`);
            }
            const body = (await response.json());
            return body?.data?.data?.[key];
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("fetch failed")) {
                // Vault server not reachable — expected in local dev
                return undefined;
            }
            throw error;
        }
    }
}
exports.VaultSecretProvider = VaultSecretProvider;
/**
 * Environment-variable-backed secret provider (fallback).
 *
 * Reads secrets directly from process.env. This is the default
 * provider when Vault is not enabled, suitable for local development.
 */
class EnvSecretProvider {
    constructor() {
        this.providerName = "Environment Variables";
    }
    async getSecret(key) {
        const value = process.env[key]?.trim();
        if (!value) {
            return undefined;
        }
        return value.replace(/^["']|["']$/g, "");
    }
}
exports.EnvSecretProvider = EnvSecretProvider;
/**
 * Factory: creates the appropriate SecretProvider based on configuration.
 *
 * When VAULT_ENABLED=true and vault connection details are present,
 * returns a VaultSecretProvider. Otherwise falls back to EnvSecretProvider.
 */
function createSecretProvider() {
    const vaultEnabled = process.env.VAULT_ENABLED?.trim().toLowerCase() === "true";
    const vaultAddr = process.env.VAULT_ADDR?.trim();
    const vaultToken = process.env.VAULT_TOKEN?.trim();
    const secretPath = process.env.VAULT_SECRET_PATH?.trim() ?? "secret/data/sdlc";
    if (vaultEnabled && vaultAddr && vaultToken) {
        return new VaultSecretProvider({
            vaultAddr,
            vaultToken,
            secretPath,
        });
    }
    return new EnvSecretProvider();
}
