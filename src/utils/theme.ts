import chalk from "chalk";

const MIN_WIDTH = 54;
const MAX_WIDTH = 94;

export function renderBanner(): string {
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
  const border = chalk.hex("#0f172a")("=".repeat(width));
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
      return chalk.hex(colors[index % colors.length])(line);
    })
    .join("\n");

  const subtitle = chalk.hex("#facc15")(
    "NEXUS: AI-powered SDLC terminal assistant",
  );
  return `${border}\n${art}\n${subtitle}\n${border}`;
}

export function panel(title: string, body: string[]): string {
  const width = terminalWidth();
  const innerWidth = width - 2;
  const top = chalk.hex("#334155")("+" + "-".repeat(innerWidth) + "+");
  const bottom = chalk.hex("#334155")("+" + "-".repeat(innerWidth) + "+");
  const header = formatLine(chalk.bold.hex("#38bdf8")(title), innerWidth);
  const rows = body
    .flatMap((line) => wrapLine(line, innerWidth))
    .map((line) => formatLine(chalk.hex("#e2e8f0")(line), innerWidth));
  return [top, header, ...rows, bottom].join("\n");
}

export function accent(text: string): string {
  return chalk.bold.hex("#22c55e")(text);
}

export function warning(text: string): string {
  return chalk.bold.hex("#f59e0b")(text);
}

export function danger(text: string): string {
  return chalk.bold.hex("#ef4444")(text);
}

function terminalWidth(): number {
  const cols =
    typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols - 2));
}

function formatLine(text: string, innerWidth: number): string {
  const raw = stripAnsi(text);
  const width = Math.max(0, innerWidth - raw.length);
  return (
    chalk.hex("#334155")("|") +
    text +
    " ".repeat(width) +
    chalk.hex("#334155")("|")
  );
}

function wrapLine(text: string, innerWidth: number): string[] {
  const clean = text.replace(/\r/g, "");
  const segments = clean.split("\n");
  const wrapped: string[] = [];

  for (const segment of segments) {
    if (segment.length <= innerWidth) {
      wrapped.push(segment);
      continue;
    }

    let remaining = segment;
    while (remaining.length > innerWidth) {
      const slice = remaining.slice(0, innerWidth);
      const splitAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\t"));
      const cut =
        splitAt > Math.floor(innerWidth * 0.45) ? splitAt : innerWidth;
      wrapped.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }

    if (remaining.length > 0) {
      wrapped.push(remaining);
    }
  }

  return wrapped.length > 0 ? wrapped : [""];
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
