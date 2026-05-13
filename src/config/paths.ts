import path from "path";

// In a generic installable tool, rootDir is the workspace where the tool is executed
const rootDir = process.cwd();

export const paths = {
  rootDir,
  // Tickets are expected in a 'tickets' folder in the current workspace
  ticketsDir: path.join(rootDir, "tickets"),
  // The codebase to scan/manage is the current workspace itself
  repoDir: rootDir,
  appRepoDir: rootDir,
  // Local state and configuration for the workspace
  stateDir: path.join(rootDir, ".sdlc"),
  stateFile: path.join(rootDir, ".sdlc", "state.json"),
};
