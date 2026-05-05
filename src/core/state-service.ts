import { promises as fs } from "fs";
import { paths } from "../config/paths";
import {
  AppState,
  Ticket,
  TicketStatusEntry,
  TicketStatusValue,
} from "./types";

const defaultState: AppState = {
  tickets: {},
};

export class StateService {
  async getTicketStatuses(tickets: Ticket[]): Promise<TicketStatusEntry[]> {
    const state = await this.readState();

    return tickets.map((ticket) => {
      return (
        state.tickets[ticket.id] ?? {
          ticketId: ticket.id,
          status: "TODO",
          updatedAt: new Date(0).toISOString(),
        }
      );
    });
  }

  async setTicketStatus(
    ticketId: string,
    status: TicketStatusValue,
    note?: string,
  ): Promise<TicketStatusEntry> {
    const state = await this.readState();
    const entry: TicketStatusEntry = {
      ticketId,
      status,
      updatedAt: new Date().toISOString(),
      note,
    };

    state.tickets[ticketId] = entry;
    await this.writeState(state);
    return entry;
  }

  async resetTicketStatus(ticketId: string): Promise<void> {
    const state = await this.readState();
    delete state.tickets[ticketId];
    await this.writeState(state);
  }

  async resetAllTicketStatuses(): Promise<void> {
    await this.writeState(defaultState);
  }

  private async readState(): Promise<AppState> {
    try {
      const raw = await fs.readFile(paths.stateFile, "utf8");
      return JSON.parse(raw) as AppState;
    } catch {
      await this.writeState(defaultState);
      return defaultState;
    }
  }

  private async writeState(state: AppState): Promise<void> {
    await fs.mkdir(paths.stateDir, { recursive: true });
    await fs.writeFile(paths.stateFile, JSON.stringify(state, null, 2), "utf8");
  }
}
