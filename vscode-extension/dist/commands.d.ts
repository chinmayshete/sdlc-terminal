/**
 * Commands — registers all Nexus VS Code commands.
 */
import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ServerManager } from './serverManager';
import { StatusBar } from './statusBar';
import { SidebarProvider } from './sidebarProvider';
export declare function registerCommands(context: vscode.ExtensionContext, client: NexusClient, serverManager: ServerManager, statusBar: StatusBar, sidebarProvider: SidebarProvider): void;
//# sourceMappingURL=commands.d.ts.map