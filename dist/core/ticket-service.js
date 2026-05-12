"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketService = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const paths_1 = require("../config/paths");
class TicketService {
    async listTickets() {
        const files = await fs_1.promises.readdir(paths_1.paths.ticketsDir);
        const tickets = [];
        for (const file of files.filter((entry) => entry.endsWith(".json"))) {
            const ticket = await this.readTicket(path_1.default.basename(file, ".json"));
            tickets.push(ticket);
        }
        return tickets;
    }
    async readTicket(ticketId) {
        const filePath = path_1.default.join(paths_1.paths.ticketsDir, `${ticketId}.json`);
        const raw = await fs_1.promises.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    async ticketExists(ticketId) {
        try {
            await fs_1.promises.access(path_1.default.join(paths_1.paths.ticketsDir, `${ticketId}.json`));
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.TicketService = TicketService;
