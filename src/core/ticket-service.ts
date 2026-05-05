import { promises as fs } from "fs";
import path from "path";
import { paths } from "../config/paths";
import { Ticket } from "./types";

export class TicketService {
  async listTickets(): Promise<Ticket[]> {
    const files = await fs.readdir(paths.ticketsDir);
    const tickets: Ticket[] = [];

    for (const file of files.filter((entry) => entry.endsWith(".json"))) {
      const ticket = await this.readTicket(path.basename(file, ".json"));
      tickets.push(ticket);
    }

    return tickets;
  }

  async readTicket(ticketId: string): Promise<Ticket> {
    const filePath = path.join(paths.ticketsDir, `${ticketId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Ticket;
  }

  async ticketExists(ticketId: string): Promise<boolean> {
    try {
      await fs.access(path.join(paths.ticketsDir, `${ticketId}.json`));
      return true;
    } catch {
      return false;
    }
  }
}
