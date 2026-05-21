"""Ticket Service — replaces ticket-service.ts."""
from __future__ import annotations
from .jira_service import JiraService
from .types import Ticket

class TicketService:
    def __init__(self): self._jira = JiraService()
    async def list_tickets(self) -> list[Ticket]: return await self._jira.fetch_tickets()
    async def read_ticket(self, ticket_id: str) -> Ticket:
        t = await self._jira.fetch_ticket(ticket_id)
        if not t: raise ValueError(f"Ticket not found: {ticket_id}")
        return t
    async def ticket_exists(self, ticket_id: str) -> bool: return (await self._jira.fetch_ticket(ticket_id)) is not None
