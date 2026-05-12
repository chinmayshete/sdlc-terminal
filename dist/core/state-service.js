"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateService = void 0;
const fs_1 = require("fs");
const paths_1 = require("../config/paths");
const defaultState = {
    tickets: {},
};
class StateService {
    async getTicketStatuses(tickets) {
        const state = await this.readState();
        return tickets.map((ticket) => {
            const canonicalId = ticket.id.toUpperCase();
            return (state.tickets[canonicalId] ?? {
                ticketId: ticket.id,
                status: "TODO",
                updatedAt: new Date(0).toISOString(),
            });
        });
    }
    async setTicketStatus(ticketId, status, note) {
        const state = await this.readState();
        const canonicalId = ticketId.toUpperCase();
        const entry = {
            ticketId: canonicalId,
            status,
            updatedAt: new Date().toISOString(),
            note,
        };
        state.tickets[canonicalId] = entry;
        await this.writeState(state);
        return entry;
    }
    async resetTicketStatus(ticketId) {
        const state = await this.readState();
        delete state.tickets[ticketId.toUpperCase()];
        await this.writeState(state);
    }
    async resetAllTicketStatuses() {
        await this.writeState(defaultState);
    }
    async readState() {
        try {
            const raw = await fs_1.promises.readFile(paths_1.paths.stateFile, "utf8");
            return JSON.parse(raw);
        }
        catch {
            await this.writeState(defaultState);
            return defaultState;
        }
    }
    async writeState(state) {
        await fs_1.promises.mkdir(paths_1.paths.stateDir, { recursive: true });
        await fs_1.promises.writeFile(paths_1.paths.stateFile, JSON.stringify(state, null, 2), "utf8");
    }
}
exports.StateService = StateService;
