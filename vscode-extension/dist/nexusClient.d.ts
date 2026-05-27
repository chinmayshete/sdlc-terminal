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
export declare class NexusClient {
    private baseUrl;
    constructor();
    /** Update the base URL from settings. */
    refreshConfig(): void;
    /** Get the current base URL. */
    getBaseUrl(): string;
    /**
     * FIX: Dynamically gets the most relevant workspace root folder.
     * Prioritizes the workspace containing the active open file, falls back to the first workspace root.
     */
    private _getCurrentCwd;
    /** Check if the server is reachable. */
    ping(): Promise<boolean>;
    /** Update workspace runtime directory on the server. */
    updateCwd(cwd: string): Promise<any>;
    /** Get workspace status (tickets, AI config). */
    getStatus(): Promise<StatusResponse>;
    /** Check AI health. */
    healthCheck(): Promise<HealthResponse>;
    /** Shutdown the external server gracefully. */
    shutdown(): Promise<void>;
    /** Get available modes. */
    getModes(): Promise<ModesResponse>;
    /** Send a free NLP chat message. */
    chat(message: string, mode?: string, history?: {
        role: string;
        content: string;
    }[]): Promise<ChatResponse>;
    /** Execute a command in a specific mode. */
    executeCommand(input: string, mode?: string): Promise<CommandResponse>;
    /** Parse natural language to intent. */
    parseIntent(input: string, mode?: string): Promise<IntentResponse>;
    /** List all tickets. */
    listTickets(): Promise<Ticket[]>;
    /** Generate a plan for a ticket. */
    planTicket(ticketId: string, mode?: string): Promise<PlanResponse>;
    /** Execute a ticket's implementation. */
    executeTicket(ticketId: string): Promise<ExecuteResponse>;
    /** Run a full security scan. */
    runSecurityScan(): Promise<CommandResponse>;
    /** Scan a specific file. */
    scanFile(filePath: string): Promise<CommandResponse>;
    /** Get security dashboard. */
    getSecurityDashboard(): Promise<CommandResponse>;
    /** Get security posture. */
    getSecurityPosture(): Promise<CommandResponse>;
    /** Get git status. */
    gitStatus(): Promise<CommandResponse>;
    /** Get git log. */
    gitLog(count?: number): Promise<CommandResponse>;
    /** Get git branches. */
    gitBranches(): Promise<CommandResponse>;
    /** Get git diff. */
    gitDiff(file?: string): Promise<CommandResponse>;
    /** System health. */
    systemHealth(): Promise<CommandResponse>;
    /** System doctor. */
    systemDoctor(): Promise<CommandResponse>;
    private _get;
    private _post;
}
//# sourceMappingURL=nexusClient.d.ts.map