import path from "path";

const rootDir = path.resolve(__dirname, "..", "..");

export const paths = {
  rootDir,
  ticketsDir: path.join(rootDir, "tickets"),
  repoDir: path.join(rootDir, "repo"),
  appRepoDir: path.join(rootDir, "repo", "app"),
  stateDir: path.join(rootDir, ".sdlc"),
  stateFile: path.join(rootDir, ".sdlc", "state.json"),
};
