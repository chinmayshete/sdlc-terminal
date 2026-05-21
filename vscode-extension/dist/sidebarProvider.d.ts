/**
 * Sidebar Provider — Webview provider for the Nexus chat sidebar panel.
 * Renders a rich chat interface with mode switching, command output, and file changes.
 */
import * as vscode from 'vscode';
import { NexusClient, CommandResponse } from './nexusClient';
import { ServerManager } from './serverManager';
export declare class SidebarProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    private readonly client;
    private readonly serverManager;
    static readonly viewType = "nexus.chatView";
    private _view?;
    private currentMode;
    constructor(extensionUri: vscode.Uri, client: NexusClient, serverManager: ServerManager);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    /** Switch mode from external command. */
    switchMode(mode: string): void;
    /** Send a command result to the webview (called from commands.ts). */
    sendCommandResult(result: CommandResponse): void;
    /** Post a message to the webview. */
    private _postMessage;
    /** Handle a chat message from the webview. */
    private _handleChat;
    /** Handle a structured command from the webview. */
    private _handleCommand;
    /** Generate the webview HTML content. */
    private _getHtmlContent;
}
//# sourceMappingURL=sidebarProvider.d.ts.map