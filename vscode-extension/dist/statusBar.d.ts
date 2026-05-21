import { ServerManager } from './serverManager';
export declare class StatusBar {
    private serverManager;
    private modeItem;
    private serverItem;
    private currentMode;
    constructor(serverManager: ServerManager);
    /** Update the current mode display. */
    updateMode(mode: string): void;
    /** Get current mode. */
    getMode(): string;
    /** Update server connection status. */
    updateServerStatus(running: boolean): void;
    /** Clean up resources. */
    dispose(): void;
}
//# sourceMappingURL=statusBar.d.ts.map