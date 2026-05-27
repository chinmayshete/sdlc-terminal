/**
 * Nexus SDLC — VS Code Extension Entry Point.
 * Initializes the sidebar, server manager, status bar, and all commands.
 */
import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ServerManager } from './serverManager';
import { StatusBar } from './statusBar';
import { SidebarProvider } from './sidebarProvider';
import { registerCommands } from './commands';

let serverManager: ServerManager;
let statusBar: StatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Nexus SDLC extension activating...');

  // Initialize core services
  const client = new NexusClient();
  serverManager = new ServerManager(client);
  statusBar = new StatusBar(serverManager);

  // Initialize sidebar
  const sidebarProvider = new SidebarProvider(context.extensionUri, client, serverManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register all commands
  registerCommands(context, client, serverManager, statusBar, sidebarProvider);

  // Disposables
  context.subscriptions.push(statusBar);
  context.subscriptions.push({ dispose: () => serverManager.dispose() });

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('nexus')) {
        client.refreshConfig();
      }
    })
  );

  // Auto-start server if configured
  const config = vscode.workspace.getConfiguration('nexus');
  if (config.get<boolean>('autoStartServer', true)) {
    // Check if server is already running first
    const alreadyRunning = await serverManager.detectRunning();
    if (!alreadyRunning) {
      // Small delay to let VS Code finish loading
      setTimeout(async () => {
        await serverManager.start();
      }, 2000);
    }
  } else {
    // Still detect if server is running
    await serverManager.detectRunning();
  }

  console.log('Nexus SDLC extension activated.');

  // Listen for interactive terminal updates (Shell Integration)
  context.subscriptions.push(
    vscode.window.onDidChangeTerminalShellIntegration(async (e) => {
      if (e.terminal.shellIntegration && e.terminal.shellIntegration.cwd) {
        const activeCwd = e.terminal.shellIntegration.cwd.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeCwd));
        const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (cwd) {
          await serverManager.updateRuntimeCwd(cwd);
        }
      }
    })
  );

  // Listen for active text editor switches to track user focus
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && editor.document.uri.scheme === 'file') {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (cwd) {
          await serverManager.updateRuntimeCwd(cwd);
        }
      }
    })
  );

  // Sync initial CWD on activation
  const initialFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (initialFolder) {
    const activeEditor = vscode.window.activeTextEditor;
    const activeFolder = activeEditor && activeEditor.document.uri.scheme === 'file'
      ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath
      : null;
    const startCwd = activeFolder || initialFolder;
    setTimeout(async () => {
      try {
        await serverManager.updateRuntimeCwd(startCwd);
        console.log(`[Nexus] Initialized active workspace CWD: ${startCwd}`);
      } catch (err) {
        console.error(`[Nexus] Failed to sync startup CWD: ${err}`);
      }
    }, 3000);
  }

}

export function deactivate(): void {
  console.log('Nexus SDLC extension deactivating...');
  serverManager?.dispose();
}

