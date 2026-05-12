"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestAgent = void 0;
const llm_1 = require("../utils/llm");
class TestAgent {
    async run(ticket, codeChanges) {
        return (0, llm_1.generateTests)(ticket, codeChanges);
    }
}
exports.TestAgent = TestAgent;
