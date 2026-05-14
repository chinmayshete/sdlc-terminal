import chalk from "chalk";
import { Ticket } from "./types";

export function formatTicket(ticket: Ticket): string {
  const id = chalk.bold.cyan(ticket.id);
  const title = ticket.title;
  
  let priority = ticket.priority;
  if (priority === "HIGH") priority = chalk.bold.red(priority);
  else if (priority === "MEDIUM") priority = chalk.bold.yellow(priority);
  else if (priority === "LOW") priority = chalk.bold.green(priority);

  return `${id} | ${priority} | ${title}`;
}
