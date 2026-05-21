/**
 * Server Manager — manages the Python API server lifecycle (start/stop/restart).
 * Auto-detects running servers and starts them as child processes when needed.
 */
import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import { NexusClient } from './nexusClient';

export class ServerManager {
  private process: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private client: NexusClient;
  private _isRunning = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private _onStatusChanged = new vscode.EventEmitter<boolean>();
  public readonly onStatusChanged = this._onStatusChanged.event;

  constructor(client: NexusClient) {
    this.client = client;
    this.outputChannel = vscode.window.createOutputChannel('Nexus Server');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Check if a server is already running at the configured URL. */
  async detectRunning(): Promise<boolean> {
    const running = await this.client.ping();
    this._isRunning = running;
    this._onStatusChanged.fire(running);
    return running;
  }

  /** Start the Python API server as a child process. */
  async start(): Promise<boolean> {
    // Check if already running
    if (await this.detectRunning()) {
      this.outputChannel.appendLine('[Nexus] Server already running.');
      return true;
    }

    const config = vscode.workspace.getConfiguration('nexus');
    const pythonPath = config.get<string>('pythonPath', 'python');
    const port = config.get<number>('serverPort', 9500);

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Nexus: No workspace folder open.');
      return false;
    }

    this.outputChannel.appendLine(`[Nexus] Starting server on port ${port}...`);
    this.outputChannel.show(true);

    try {
      this.process = spawn(pythonPath, ['-m', 'src.cli.program', 'serve', '--port', port.toString()], {
        cwd: workspaceFolder,
        env: { ...process.env },
        shell: true,
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.outputChannel.appendLine(data.toString().trim());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        this.outputChannel.appendLine(text);
        // Uvicorn logs to stderr — check for startup success
        if (text.includes('Uvicorn running') || text.includes('Application startup complete')) {
          this._isRunning = true;
          this._onStatusChanged.fire(true);
          this.startHealthCheck();
        }
      });

      this.process.on('close', (code) => {
        this.outputChannel.appendLine(`[Nexus] Server process exited (code: ${code})`);
        this._isRunning = false;
        this._onStatusChanged.fire(false);
        this.process = null;
        this.stopHealthCheck();
      });

      this.process.on('error', (err) => {
        this.outputChannel.appendLine(`[Nexus] Server error: ${err.message}`);
        this._isRunning = false;
        this._onStatusChanged.fire(false);
        vscode.window.showErrorMessage(`Nexus server failed to start: ${err.message}`);
      });

      // Wait for startup (poll for up to 15 seconds)
      const started = await this.waitForStartup(15000);
      if (started) {
        vscode.window.showInformationMessage('Nexus API server started successfully.');
        this.startHealthCheck();
      } else {
        vscode.window.showWarningMessage('Nexus server started but health check not responding yet. It may still be initializing.');
      }
      return started;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[Nexus] Failed to start: ${msg}`);
      vscode.window.showErrorMessage(`Failed to start Nexus server: ${msg}`);
      return false;
    }
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (this.process && this.process.pid) {
      this.outputChannel.appendLine('[Nexus] Stopping server...');
      
      if (process.platform === 'win32') {
        // On Windows, child processes spawned with shell:true need taskkill to kill the tree
        spawn('taskkill', ['/pid', this.process.pid.toString(), '/f', '/t']);
      } else {
        this.process.kill('SIGTERM');
        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 5000);
      }
      
      this.outputChannel.appendLine('[Nexus] Server stopped.');
    } else if (this._isRunning) {
      // We don't own the process, but ping says it's running. Send shutdown via API.
      this.outputChannel.appendLine('[Nexus] Sending shutdown signal to external server...');
      await this.client.shutdown();
      this.outputChannel.appendLine('[Nexus] External server stopped.');
    }
    
    this._isRunning = false;
    this._onStatusChanged.fire(false);
    this.process = null;
  }

  /** Restart the server. */
  async restart(): Promise<boolean> {
    await this.stop();
    // Small delay between stop and start
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return this.start();
  }

  /** Wait for the server to respond to health checks. */
  private async waitForStartup(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const running = await this.client.ping();
        if (running) {
          this._isRunning = true;
          this._onStatusChanged.fire(true);
          return true;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  /** Periodic health check. */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(async () => {
      const running = await this.client.ping();
      if (running !== this._isRunning) {
        this._isRunning = running;
        this._onStatusChanged.fire(running);
      }
    }, 30000); // Every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /** Clean up resources. */
  dispose(): void {
    this.stopHealthCheck();
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this._onStatusChanged.dispose();
    this.outputChannel.dispose();
  }
}
