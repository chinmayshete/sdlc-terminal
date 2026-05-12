#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const program_1 = require("./cli/program");
const config_manager_1 = require("./config/config-manager");
async function main() {
    await (0, config_manager_1.loadConfig)();
    await (0, program_1.buildCli)().parseAsync(process.argv);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${message}`);
    process.exit(1);
});
