"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spinner = void 0;
exports.withSpinner = withSpinner;
const theme_1 = require("./theme");
class Spinner {
    constructor(message) {
        this.message = message;
        this.timer = null;
        this.currentFrame = 0;
    }
    start() {
        process.stdout.write("\x1B[?25l"); // Hide cursor
        this.timer = setInterval(() => {
            const frame = Spinner.frames[this.currentFrame];
            process.stdout.write(`\r${(0, theme_1.accent)(frame)} ${this.message}`);
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
exports.Spinner = Spinner;
Spinner.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
async function withSpinner(message, fn) {
    const spinner = new Spinner(message);
    spinner.start();
    try {
        return await fn();
    }
    finally {
        spinner.stop();
    }
}
