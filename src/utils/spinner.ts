import { accent } from "./theme";

export class Spinner {
  private static readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private timer: NodeJS.Timeout | null = null;
  private currentFrame = 0;

  constructor(private message: string) {}

  start() {
    process.stdout.write("\x1B[?25l"); // Hide cursor
    this.timer = setInterval(() => {
      const frame = Spinner.frames[this.currentFrame];
      process.stdout.write(`\r${accent(frame)} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % Spinner.frames.length;
    }, 80);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write("\r\x1B[K"); // Clear line
    process.stdout.write("\x1B[?25h"); // Show cursor
  }
}

export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = new Spinner(message);
  spinner.start();
  try {
    return await fn();
  } finally {
    spinner.stop();
  }
}
