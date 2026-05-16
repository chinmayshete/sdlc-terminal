import { Ticket } from "./types";
import { JiraService } from "./jira-service";

export class TicketService {
  private readonly jira = new JiraService();

  async listTickets(): Promise<Ticket[]> {
    return this.jira.fetchTickets();
  }

  async readTicket(ticketId: string): Promise<Ticket> {
    const ticket = await this.jira.fetchTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found in Jira: ${ticketId}`);
    }
    return ticket;
  }

  async ticketExists(ticketId: string): Promise<boolean> {
    const ticket = await this.jira.fetchTicket(ticketId);
    return Boolean(ticket);
  }
}
