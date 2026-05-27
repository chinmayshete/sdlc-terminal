/**
 * Nexus SDLC — HTTP client for communicating with the Python API bridge server.
 * All VS Code extension features route through this client.
 */
import * as vscode from 'vscode';
import * as path from 'path';
// ── Types ───────────────────────────────────────────────────

export interface ChatResponse {
  message: string;
  changes: FileChange[];
  commands: string[];
  mode?: string;
}

export interface FileChange {
  path: string;
  content: string;
  action: string;
}

export interface IntentResponse {
  command: string;
  args: string[];
}

export interface StatusResponse {
  ai_mode: string;
  ai_configured: boolean;
  tickets: TicketStatus[];
}

export interface TicketStatus {
  ticket_id: string;
  status: string;
  note?: string;
}

export interface HealthResponse {
  configured: boolean;
  mode: string;
  reachable: boolean;
  message: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: string;
}

export interface PlanResponse {
  ticket_id: string;
  steps: string[];
}

export interface ExecuteResponse {
  ticket_id: string;
  updated_files: string[];
  generated_tests: string[];
  ticket_status: string;
}

export interface CommandResponse {
  title: string;
  output: string[];
  mode?: string;
}

export interface ModeInfo {
  id: string;
  label: string;
  color: string;
  description: string;
}

export interface ModesResponse {
  modes: ModeInfo[];
  current: string;
}

export interface ServerInfo {
  name: string;
  version: string;
  status: string;
}

// ── Client ──────────────────────────────────────────────────

export class NexusClient {
  private baseUrl: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('nexus');
    this.baseUrl = config.get<string>('serverUrl', 'http://127.0.0.1:9500');
  }

  /** Update the base URL from settings. */
  refreshConfig(): void {
    const config = vscode.workspace.getConfiguration('nexus');
    this.baseUrl = config.get<string>('serverUrl', 'http://127.0.0.1:9500');
  }

  /** Get the current base URL. */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * FIX: Dynamically gets the most relevant workspace root folder.
   * Prioritizes the workspace containing the active open file, falls back to the first workspace root.
   */
  private _getCurrentCwd(): string {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.scheme === 'file') {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (workspaceFolder) {
        return workspaceFolder.uri.fsPath;
      }
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.fsPath;
    }
    return '';
  }

  // ── Health & Status ─────────────────────────────────────

  /** Check if the server is reachable. */
  async ping(): Promise<boolean> {
    try {
      const res = await this._get<ServerInfo>('/');
      return res.status === 'running';
    } catch {
      return false;
    }
  }

  /** Update workspace runtime directory on the server. */
  async updateCwd(cwd: string): Promise<any> {
    return this._post('/api/cwd', { cwd });
  }

  /** Get workspace status (tickets, AI config). */
  async getStatus(): Promise<StatusResponse> {
    return this._get<StatusResponse>('/api/status');
  }

  /** Check AI health. */
  async healthCheck(): Promise<HealthResponse> {
    return this._get<HealthResponse>('/api/health');
  }

  /** Shutdown the external server gracefully. */
  async shutdown(): Promise<void> {
    try {
      await this._post('/api/shutdown', {});
    } catch {
      // Ignored: Server kills itself so the response might fail
    }
  }

  /** Get available modes. */
  async getModes(): Promise<ModesResponse> {
    return this._get<ModesResponse>('/api/modes');
  }

  // ── Chat ────────────────────────────────────────────────

  /** Send a free NLP chat message. */
  async chat(
    message: string,
    mode: string = 'command',
    history: { role: string; content: string }[] = []
  ): Promise<ChatResponse> {
    const cwd = this._getCurrentCwd();
    if (cwd) {
      try {
        await this.updateCwd(cwd);
      } catch (err) {
        console.warn(`[NexusClient] Failed to auto-sync CWD before chat: ${err}`);
      }
    }
    return this._post<ChatResponse>('/api/chat', { message, mode, history });
  }

  // ── Commands ────────────────────────────────────────────

  /** Execute a command in a specific mode. */
  async executeCommand(input: string, mode: string = 'command'): Promise<CommandResponse> {
    const cwd = this._getCurrentCwd();
    if (cwd) {
      try {
        await this.updateCwd(cwd);
      } catch (err) {
        console.warn(`[NexusClient] Failed to auto-sync CWD before command: ${err}`);
      }
    }
    return this._post<CommandResponse>('/api/command', { input, mode });
  }

  /** Parse natural language to intent. */
  async parseIntent(input: string, mode: string = 'command'): Promise<IntentResponse> {
    return this._post<IntentResponse>('/api/intent', { input, mode });
  }

  // ── Tickets ─────────────────────────────────────────────

  /** List all tickets. */
  async listTickets(): Promise<Ticket[]> {
    return this._get<Ticket[]>('/api/tickets');
  }

  /** Generate a plan for a ticket. */
  async planTicket(ticketId: string, mode: string = 'basic'): Promise<PlanResponse> {
    return this._post<PlanResponse>(`/api/tickets/${ticketId}/plan`, { mode });
  }

  /** Execute a ticket's implementation. */
  async executeTicket(ticketId: string): Promise<ExecuteResponse> {
    return this._post<ExecuteResponse>(`/api/tickets/${ticketId}/execute`, {});
  }

  // ── Security ────────────────────────────────────────────

  /** Run a full security scan. */
  async runSecurityScan(): Promise<CommandResponse> {
    return this._post<CommandResponse>('/api/security/scan', {});
  }

  /** Scan a specific file. */
  async scanFile(filePath: string): Promise<CommandResponse> {
    return this._post<CommandResponse>('/api/security/scan-file', { file_path: filePath });
  }

  /** Get security dashboard. */
  async getSecurityDashboard(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/security/dashboard');
  }

  /** Get security posture. */
  async getSecurityPosture(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/security/posture');
  }

  // ── Git ─────────────────────────────────────────────────

  /** Get git status. */
  async gitStatus(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/git/status');
  }

  /** Get git log. */
  async gitLog(count: number = 10): Promise<CommandResponse> {
    return this._get<CommandResponse>(`/api/git/log?count=${count}`);
  }

  /** Get git branches. */
  async gitBranches(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/git/branches');
  }

  /** Get git diff. */
  async gitDiff(file?: string): Promise<CommandResponse> {
    const url = file ? `/api/git/diff?file=${encodeURIComponent(file)}` : '/api/git/diff';
    return this._get<CommandResponse>(url);
  }

  // ── System ──────────────────────────────────────────────

  /** System health. */
  async systemHealth(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/system/health');
  }

  /** System doctor. */
  async systemDoctor(): Promise<CommandResponse> {
    return this._get<CommandResponse>('/api/system/doctor');
  }

  // ── Private HTTP helpers ────────────────────────────────

  private async _get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
