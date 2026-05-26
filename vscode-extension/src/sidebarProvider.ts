/**
 * Sidebar Provider — Webview provider for the Nexus chat sidebar panel.
 * Renders a rich chat interface with mode switching, command output, and file changes.
 */
import * as vscode from 'vscode';
import { NexusClient, CommandResponse } from './nexusClient';
import { ServerManager } from './serverManager';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'nexus.chatView';
  private _view?: vscode.WebviewView;
  private currentMode = 'command';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: NexusClient,
    private readonly serverManager: ServerManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'chat': {
          await this._handleChat(data.message);
          break;
        }
        case 'command': {
          await this._handleCommand(data.input, data.mode);
          break;
        }
        case 'switchMode': {
          this.currentMode = data.mode;
          break;
        }
        case 'ready': {
          // Webview loaded — send initial state
          this._postMessage({
            type: 'init',
            mode: this.currentMode,
            serverRunning: this.serverManager.isRunning,
            serverUrl: this.client.getBaseUrl(),
          });
          break;
        }
      }
    });

    // Listen for server status changes
    this.serverManager.onStatusChanged((running) => {
      this._postMessage({ type: 'serverStatus', running });
    });
  }

  /** Switch mode from external command. */
  public switchMode(mode: string): void {
    this.currentMode = mode;
    this._postMessage({ type: 'modeChanged', mode });
  }

  /** Send a command result to the webview (called from commands.ts). */
  public sendCommandResult(result: CommandResponse): void {
    this._postMessage({
      type: 'commandResult',
      title: result.title,
      output: result.output,
    });
    // Focus the sidebar
    if (this._view) {
      this._view.show?.(true);
    }
  }

  /** Post a message to the webview. */
  private _postMessage(message: unknown): void {
    this._view?.webview.postMessage(message);
  }

  /** Handle a chat message from the webview. */
  private async _handleChat(message: string): Promise<void> {
    if (!this.serverManager.isRunning) {
      this._postMessage({
        type: 'chatResponse',
        message: '⚠ Nexus server is not running. Click the status bar to start it, or run "Nexus: Start API Server" from the command palette.',
        isError: true,
      });
      return;
    }

    this._postMessage({ type: 'thinking' });

    try {
      const result = await this.client.chat(message, this.currentMode);
      if (result.mode) {
        this.currentMode = result.mode;
        this._postMessage({ type: 'modeChanged', mode: result.mode });
      }
      this._postMessage({
        type: 'chatResponse',
        message: result.message,
        changes: result.changes,
        commands: result.commands,
      });
    } catch (err) {
      this._postMessage({
        type: 'chatResponse',
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      });
    }
  }

  /** Handle a structured command from the webview. */
  private async _handleCommand(input: string, mode?: string): Promise<void> {
    if (!this.serverManager.isRunning) {
      this._postMessage({
        type: 'commandResult',
        title: 'Error',
        output: ['Nexus server is not running.'],
      });
      return;
    }

    this._postMessage({ type: 'thinking' });

    try {
      const result = await this.client.executeCommand(input, mode || this.currentMode);
      if (result.mode) {
        this.currentMode = result.mode;
        this._postMessage({ type: 'modeChanged', mode: result.mode });
      }
      this._postMessage({
        type: 'commandResult',
        title: result.title,
        output: result.output,
      });
    } catch (err) {
      this._postMessage({
        type: 'commandResult',
        title: 'Error',
        output: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  /** Generate the webview HTML content. */
  private _getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'styles.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'main.js')
    );
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com; connect-src ${webview.cspSource} ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:* http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; ">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${styleUri}">
  <title>Nexus SDLC</title>
</head>
<body>
  <!-- Header -->
  <div class="nexus-header">
    <div class="nexus-logo">
      <span class="nexus-logo-icon">⚡</span>
      <span class="nexus-logo-text">NEXUS</span>
    </div>
    <div class="nexus-mode-bar">
      <button class="mode-btn active" data-mode="command" title="Main Hub">
        <span class="mode-dot command"></span>Nexus
      </button>
      <button class="mode-btn" data-mode="git" title="Git Mode">
        <span class="mode-dot git"></span>Git
      </button>
      <button class="mode-btn" data-mode="security" title="Security Mode">
        <span class="mode-dot security"></span>Security
      </button>
      <button class="mode-btn" data-mode="devops" title="DevOps Mode">
        <span class="mode-dot devops"></span>DevOps
      </button>
      <button class="mode-btn" data-mode="agile" title="Agile Mode">
        <span class="mode-dot agile"></span>Agile
      </button>
    </div>
    <div id="server-status" class="server-status offline">
      <span class="status-dot"></span>
      <span class="status-text">Offline</span>
    </div>
  </div>


  <!-- Chat Messages -->
  <div class="chat-container" id="chat-container">
    <div class="welcome-message">
      <div class="welcome-icon">⚡</div>
      <h3>Welcome to Nexus</h3>
      <p>AI-powered SDLC assistant. Type any question, instruction, or command below.</p>
      <div class="welcome-hints">
        <span class="hint" data-hint="What does this project do?">"What does this project do?"</span>
        <span class="hint" data-hint="Run a security scan">"Run a security scan"</span>
        <span class="hint" data-hint="Show git status">"Show git status"</span>
      </div>
    </div>
  </div>

  <!-- Input Area -->
  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        id="chat-input"
        placeholder="Ask Nexus anything..."
        rows="1"
        autofocus
      ></textarea>
      <button id="send-btn" class="send-btn" title="Send (Enter)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 1.5L15 8L1 14.5V9.5L10 8L1 6.5V1.5Z"/>
        </svg>
      </button>
    </div>
    <div class="input-footer">
      <span class="mode-indicator" id="mode-indicator">nexus</span>
      <span class="input-hint">Enter to send · Shift+Enter for new line</span>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
