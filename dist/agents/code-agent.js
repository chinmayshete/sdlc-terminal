"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeAgent = void 0;
const llm_1 = require("../utils/llm");
class CodeAgent {
    async run(ticket, files) {
        return (0, llm_1.generateCode)(ticket, files);
    }
}
exports.CodeAgent = CodeAgent;
