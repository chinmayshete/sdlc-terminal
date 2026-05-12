"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paths = void 0;
const path_1 = __importDefault(require("path"));
const rootDir = path_1.default.resolve(__dirname, "..", "..");
exports.paths = {
    rootDir,
    ticketsDir: path_1.default.join(rootDir, "tickets"),
    repoDir: path_1.default.join(rootDir, "repo"),
    appRepoDir: path_1.default.join(rootDir, "repo", "app"),
    stateDir: path_1.default.join(rootDir, ".sdlc"),
    stateFile: path_1.default.join(rootDir, ".sdlc", "state.json"),
};
