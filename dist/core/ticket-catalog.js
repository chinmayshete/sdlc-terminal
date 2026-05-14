"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTicket = formatTicket;
const chalk_1 = __importDefault(require("chalk"));
function formatTicket(ticket) {
    const id = chalk_1.default.bold.cyan(ticket.id);
    const title = ticket.title;
    let priority = ticket.priority;
    if (priority === "HIGH")
        priority = chalk_1.default.bold.red(priority);
    else if (priority === "MEDIUM")
        priority = chalk_1.default.bold.yellow(priority);
    else if (priority === "LOW")
        priority = chalk_1.default.bold.green(priority);
    return `${id} | ${priority} | ${title}`;
}
