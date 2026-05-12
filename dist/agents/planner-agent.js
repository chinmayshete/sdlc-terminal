"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAgent = void 0;
const llm_1 = require("../utils/llm");
class PlannerAgent {
    async run(ticket, files) {
        const steps = await (0, llm_1.generatePlan)(ticket, files);
        return { steps };
    }
}
exports.PlannerAgent = PlannerAgent;
