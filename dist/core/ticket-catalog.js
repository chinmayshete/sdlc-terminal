"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTicket = formatTicket;
function formatTicket(ticket) {
    return `${ticket.id} | ${ticket.priority} | ${ticket.title}`;
}
