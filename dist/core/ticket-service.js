"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketService = void 0;
const jira_service_1 = require("./jira-service");
class TicketService {
    constructor() {
        this.jira = new jira_service_1.JiraService();
    }
    async listTickets() {
        return this.jira.fetchTickets();
    }
    async readTicket(ticketId) {
        const ticket = await this.jira.fetchTicket(ticketId);
        if (!ticket) {
            throw new Error(`Ticket not found in Jira: ${ticketId}`);
        }
        return ticket;
    }
    async ticketExists(ticketId) {
        const ticket = await this.jira.fetchTicket(ticketId);
        return Boolean(ticket);
    }
}
exports.TicketService = TicketService;
