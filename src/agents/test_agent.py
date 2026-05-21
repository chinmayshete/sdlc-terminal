"""Test Agent — the QA sub-agent."""
from __future__ import annotations
from ..core.types import CodeChange, Ticket
from ..utils.llm import generate_tests

class TestAgent:
    async def run(self, ticket: Ticket, code_changes: list[CodeChange]) -> list[CodeChange]:
        return await generate_tests(ticket, code_changes)
