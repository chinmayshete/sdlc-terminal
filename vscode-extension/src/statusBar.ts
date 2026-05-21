/**
 * Status Bar — Nexus mode indicator and server connection status in the VS Code status bar.
 */
import * as vscode from 'vscode';
import { ServerManager } from './serverManager';

interface ModeConfig {
  label: string;
  color: string;
  icon: string;
}

const MODE_CONFIG: Record<string, ModeConfig> = {
  command: { label: 'Nexus', color: '#00ff88', icon: '$(rocket)' },
  git: { label: 'Git', color: '#ff66ff', icon: '$(git-branch)' },
  security: { label: 'Security', color: '#ff4444', icon: '$(shield)' },
  devops: { label: 'DevOps', color: '#ffcc00', icon: '$(gear)' },
  agile: { label: 'Agile', color: '#4488ff', icon: '$(tasklist)' },
};

export class StatusBar {
  private modeItem: vscode.StatusBarItem;
  private serverItem: vscode.StatusBarItem;
  private currentMode = 'command';

  constructor(private serverManager: ServerManager) {
    // Server status (left of mode)
    this.serverItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.serverItem.command = 'nexus.startServer';
    this.updateServerStatus(false);
    this.serverItem.show();

    // Mode indicator
    this.modeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.modeItem.command = 'nexus.switchMode';
    this.updateMode('command');
    this.modeItem.show();

    // Listen for server status changes
    serverManager.onStatusChanged((running) => {
      this.updateServerStatus(running);
    });
  }

  /** Update the current mode display. */
  updateMode(mode: string): void {
    this.currentMode = mode;
    const config = MODE_CONFIG[mode] || MODE_CONFIG.command;
    this.modeItem.text = `${config.icon} ${config.label}`;
    this.modeItem.tooltip = `Nexus Mode: ${config.label} — Click to switch`;
    this.modeItem.color = config.color;
  }

  /** Get current mode. */
  getMode(): string {
    return this.currentMode;
  }

  /** Update server connection status. */
  updateServerStatus(running: boolean): void {
    if (running) {
      this.serverItem.text = '$(pulse) Nexus';
      this.serverItem.tooltip = 'Nexus server is running — Click to stop';
      this.serverItem.color = '#00ff88';
      this.serverItem.command = 'nexus.stopServer';
    } else {
      this.serverItem.text = '$(circle-slash) Nexus';
      this.serverItem.tooltip = 'Nexus server is offline — Click to start';
      this.serverItem.color = '#ff4444';
      this.serverItem.command = 'nexus.startServer';
    }
  }

  /** Clean up resources. */
  dispose(): void {
    this.modeItem.dispose();
    this.serverItem.dispose();
  }
}
