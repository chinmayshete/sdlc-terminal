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
}

export function deactivate(): void {
  console.log('Nexus SDLC extension deactivating...');
  serverManager?.dispose();
}
