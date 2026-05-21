"""Planner Agent — the architect sub-agent."""
from __future__ import annotations
from ..core.types import PlanResult, RepoFile, Ticket
from ..utils.llm import generate_plan

class PlannerAgent:
    async def run(self, ticket: Ticket, files: list[RepoFile], mode: str = "basic") -> PlanResult:
        return PlanResult(steps=await generate_plan(ticket, files, mode))
