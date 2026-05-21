"""Code Agent — the developer sub-agent."""
from __future__ import annotations
from ..core.types import CodeChange, RepoFile, Ticket
from ..utils.llm import generate_code

class CodeAgent:
    async def run(self, ticket: Ticket, files: list[RepoFile]) -> list[CodeChange]:
        return await generate_code(ticket, files)
