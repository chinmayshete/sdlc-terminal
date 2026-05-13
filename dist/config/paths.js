"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paths = void 0;
const path_1 = __importDefault(require("path"));
// In a generic installable tool, rootDir is the workspace where the tool is executed
const rootDir = process.cwd();
exports.paths = {
    rootDir,
    // Tickets are expected in a 'tickets' folder in the current workspace
    ticketsDir: path_1.default.join(rootDir, "tickets"),
    // The codebase to scan/manage is the current workspace itself
    repoDir: rootDir,
    appRepoDir: rootDir,
    // Local state and configuration for the workspace
    stateDir: path_1.default.join(rootDir, ".sdlc"),
    stateFile: path_1.default.join(rootDir, ".sdlc", "state.json"),
};
