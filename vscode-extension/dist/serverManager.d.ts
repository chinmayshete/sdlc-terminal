/**
 * Server Manager — manages the Python API server lifecycle (start/stop/restart).
 * Auto-detects running servers and starts them as child processes when needed.
 */
import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
export declare class ServerManager {
    private process;
    private outputChannel;
    private client;
    private _isRunning;
    private healthCheckInterval;
    private _onStatusChanged;
    readonly onStatusChanged: vscode.Event<boolean>;
    constructor(client: NexusClient);
    get isRunning(): boolean;
    /** Check if a server is already running at the configured URL. */
    detectRunning(): Promise<boolean>;
    /** Start the Python API server as a child process. */
    start(): Promise<boolean>;
    /** Stop the server. */
    stop(): Promise<void>;
    /** Restart the server. */
    restart(): Promise<boolean>;
    /** Wait for the server to respond to health checks. */
    private waitForStartup;
    /** Periodic health check. */
    private startHealthCheck;
    private stopHealthCheck;
    /** Clean up resources. */
    dispose(): void;
}
//# sourceMappingURL=serverManager.d.ts.map