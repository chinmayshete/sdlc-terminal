"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBanner = renderBanner;
exports.panel = panel;
exports.accent = accent;
exports.warning = warning;
exports.danger = danger;
exports.success = success;
exports.info = info;
exports.subtle = subtle;
exports.primary = primary;
exports.secondary = secondary;
const chalk_1 = __importDefault(require("chalk"));
const MIN_WIDTH = 54;
const MAX_WIDTH = 94;
function renderBanner() {
    const lines = [
        "  _   _ _______   __ _   _  ____  ",
        " | \\ | |  ____| \\ \\/ / | | |/ ___| ",
        " |  \\| | |__     \\  /  | | | \\___ \\ ",
        " | . ` |  __|    /  \\  | | |  ___ \\ ",
        " | |\\  | |____  / /\\ \\ | |_| |/____/ ",
        " |_| \\_|______|/_/  \\_\\ \\___/|____/  ",
        "",
    ];
    const width = Math.max(54, Math.min(terminalWidth(), 54));
    const border = chalk_1.default.hex("#0f172a")("=".repeat(width));
    const art = lines
        .map((line, index) => {
        const colors = [
            "#22c55e",
            "#14b8a6",
            "#06b6d4",
            "#3b82f6",
            "#6366f1",
            "#8b5cf6",
            "#d946ef",
        ];
        return chalk_1.default.hex(colors[index % colors.length])(line);
    })
        .join("\n");
    const subtitle = chalk_1.default.hex("#facc15")("NEXUS: AI-powered SDLC terminal assistant");
    return `${border}\n${art}\n${subtitle}\n${border}`;
}
function panel(title, body) {
    const width = terminalWidth();
    const innerWidth = width - 2;
    const top = chalk_1.default.hex("#334155")("+" + "-".repeat(innerWidth) + "+");
    const bottom = chalk_1.default.hex("#334155")("+" + "-".repeat(innerWidth) + "+");
    const header = formatLine(chalk_1.default.bold.hex("#38bdf8")(title), innerWidth);
    const rows = body
        .flatMap((line) => wrapLine(line, innerWidth))
        .map((line) => {
        const coloredLine = hasAnsi(line) ? line : chalk_1.default.hex("#e2e8f0")(line);
        return formatLine(coloredLine, innerWidth);
    });
    return [top, header, ...rows, bottom].join("\n");
}
function accent(text) {
    return chalk_1.default.bold.hex("#22c55e")(text);
}
function warning(text) {
    return chalk_1.default.bold.hex("#f59e0b")(text);
}
function danger(text) {
    return chalk_1.default.bold.hex("#ef4444")(text);
}
function success(text) {
    return chalk_1.default.bold.hex("#22c55e")(text);
}
function info(text) {
    return chalk_1.default.bold.hex("#06b6d4")(text);
}
function subtle(text) {
    return chalk_1.default.hex("#64748b")(text);
}
function primary(text) {
    return chalk_1.default.bold.hex("#38bdf8")(text);
}
function secondary(text) {
    return chalk_1.default.bold.hex("#818cf8")(text);
}
function terminalWidth() {
    const cols = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols - 2));
}
function formatLine(text, innerWidth) {
    const raw = stripAnsi(text);
    const width = Math.max(0, innerWidth - raw.length);
    return (chalk_1.default.hex("#334155")("|") +
        text +
        " ".repeat(width) +
        chalk_1.default.hex("#334155")("|"));
}
function wrapLine(text, innerWidth) {
    const clean = text.replace(/\r/g, "");
    const segments = clean.split("\n");
    const wrapped = [];
    for (const segment of segments) {
        if (segment.length <= innerWidth) {
            wrapped.push(segment);
            continue;
        }
        let remaining = segment;
        while (remaining.length > innerWidth) {
            const slice = remaining.slice(0, innerWidth);
            const splitAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\t"));
            const cut = splitAt > Math.floor(innerWidth * 0.45) ? splitAt : innerWidth;
            wrapped.push(remaining.slice(0, cut).trimEnd());
            remaining = remaining.slice(cut).trimStart();
        }
        if (remaining.length > 0) {
            wrapped.push(remaining);
        }
    }
    return wrapped.length > 0 ? wrapped : [""];
}
function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, "");
}
function hasAnsi(value) {
    return /\u001b\[[0-9;]*m/.test(value);
}
