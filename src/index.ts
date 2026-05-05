#!/usr/bin/env node
import { buildCli } from "./cli/program";
import { loadConfig } from "./config/config-manager";

async function main(): Promise<void> {
  await loadConfig();
  await buildCli().parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error: ${message}`);
  process.exit(1);
});
