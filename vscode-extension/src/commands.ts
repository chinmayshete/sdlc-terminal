/**
 * Commands — registers all Nexus VS Code commands.
 */
import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ServerManager } from './serverManager';
import { StatusBar } from './statusBar';
import { SidebarProvider } from './sidebarProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  client: NexusClient,
  serverManager: ServerManager,
  statusBar: StatusBar,
  sidebarProvider: SidebarProvider
): void {
  // ── Open Chat ─────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.openChat', () => {
      vscode.commands.executeCommand('nexus.chatView.focus');
    })
  );

  // ── Switch Mode ───────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.switchMode', async () => {
      const modes = [
        { label: '$(rocket) Nexus', description: 'Main command hub & freeform AI chat', id: 'command' },
        { label: '$(git-branch) Git', description: 'Conversational version control', id: 'git' },
        { label: '$(shield) Security', description: 'AI-driven SAST & governance', id: 'security' },
        { label: '$(gear) DevOps', description: 'CI/CD, Docker, Terraform & infra', id: 'devops' },
        { label: '$(tasklist) Agile', description: 'Jira, sprints & project management', id: 'agile' },
      ];

      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: 'Select Nexus mode',
        title: 'Switch Nexus Mode',
      });

      if (selected) {
        statusBar.updateMode(selected.id);
        sidebarProvider.switchMode(selected.id);
        vscode.window.showInformationMessage(`Nexus: Switched to ${selected.label.replace(/\$\([^)]+\)\s*/, '')} mode`);
      }
    })
  );

  // ── Security Scan ─────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.runScan', async () => {
      if (!serverManager.isRunning) {
        vscode.window.showWarningMessage('Nexus server is not running. Start it first.');
        return;
      }
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Nexus: Running security scan...' },
        async () => {
          try {
            const result = await client.runSecurityScan();
            sidebarProvider.sendCommandResult(result);
          } catch (err) {
            vscode.window.showErrorMessage(`Scan failed: ${err}`);
          }
        }
      );
    })
  );

  // ── Scan Current File ─────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.scanCurrentFile', async () => {
      if (!serverManager.isRunning) {
        vscode.window.showWarningMessage('Nexus server is not running.');
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Nexus: Scanning ${filePath}...` },
        async () => {
          try {
            const result = await client.scanFile(filePath);
            sidebarProvider.sendCommandResult(result);
          } catch (err) {
            vscode.window.showErrorMessage(`File scan failed: ${err}`);
          }
        }
      );
    })
  );

  // ── Show Tickets ──────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.showTickets', async () => {
      if (!serverManager.isRunning) {
        vscode.window.showWarningMessage('Nexus server is not running.');
        return;
      }
      try {
        const tickets = await client.listTickets();
        const items = tickets.map((t) => ({
          label: `${t.id} — ${t.title}`,
          description: t.priority,
          detail: t.description,
          id: t.id,
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a ticket to plan or execute',
          title: 'Nexus Tickets',
        });
        if (selected) {
          const action = await vscode.window.showQuickPick(
            [
              { label: '$(list-ordered) Plan', id: 'plan' },
              { label: '$(play) Execute', id: 'execute' },
            ],
            { placeHolder: `Action for ${selected.id}` }
          );
          if (action?.id === 'plan') {
            const result = await client.planTicket(selected.id);
            sidebarProvider.sendCommandResult({
              title: `Plan: ${selected.id}`,
              output: result.steps.map((s, i) => `${i + 1}. ${s}`),
            });
          } else if (action?.id === 'execute') {
            const result = await client.executeTicket(selected.id);
            sidebarProvider.sendCommandResult({
              title: `Execute: ${selected.id}`,
              output: [
                `Updated files: ${result.updated_files.join(', ') || 'none'}`,
                `Generated tests: ${result.generated_tests.join(', ') || 'none'}`,
                `Status: ${result.ticket_status}`,
              ],
            });
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to load tickets: ${err}`);
      }
    })
  );

  // ── Git Status ────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.gitStatus', async () => {
      if (!serverManager.isRunning) {
        vscode.window.showWarningMessage('Nexus server is not running.');
        return;
      }
      try {
        const result = await client.gitStatus();
        sidebarProvider.sendCommandResult(result);
      } catch (err) {
        vscode.window.showErrorMessage(`Git status failed: ${err}`);
      }
    })
  );

  // ── Health Check ──────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.healthCheck', async () => {
      if (!serverManager.isRunning) {
        vscode.window.showWarningMessage('Nexus server is not running.');
        return;
      }
      try {
        const health = await client.healthCheck();
        vscode.window.showInformationMessage(
          `Nexus AI: ${health.mode} | Configured: ${health.configured} | Reachable: ${health.reachable} | ${health.message}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Health check failed: ${err}`);
      }
    })
  );

  // ── Server Management ─────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.startServer', async () => {
      await serverManager.start();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.stopServer', async () => {
      await serverManager.stop();
      vscode.window.showInformationMessage('Nexus server stopped.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.restartServer', async () => {
      await serverManager.restart();
    })
  );
}
