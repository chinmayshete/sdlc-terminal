import { Ticket } from "./types";

export function formatTicket(ticket: Ticket): string {
  return `${ticket.id} | ${ticket.priority} | ${ticket.title}`;
}
