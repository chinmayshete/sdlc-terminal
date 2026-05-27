"""State Service — replaces state-service.ts. Persists ticket status in .sdlc/state.json."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from ..config.paths import paths
from ..core.types import Ticket, TicketStatusEntry, TicketStatusValue

class StateService:
    @property
    def _path(self):
        return paths["state_file"]

    def _load(self) -> dict: 
        try: return json.loads(self._path.read_text("utf-8"))
        except Exception: return {}

    def _save(self, data: dict):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(data, indent=2), "utf-8")

    async def get_ticket_status(self, ticket_id: str) -> TicketStatusValue:
        return self._load().get(ticket_id, {}).get("status", "TODO")

    async def set_ticket_status(self, ticket_id: str, status: TicketStatusValue, note: str | None = None):
        d = self._load()
        d[ticket_id] = {"status": status, "updatedAt": datetime.now(timezone.utc).isoformat(), "note": note}
        self._save(d)

    async def reset_ticket_status(self, ticket_id: str):
        d = self._load(); d.pop(ticket_id, None); self._save(d)

    async def reset_all_ticket_statuses(self):
        self._save({})

    async def get_ticket_statuses(self, tickets: list[Ticket]) -> list[TicketStatusEntry]:
        d = self._load()
        result = []
        for t in tickets:
            entry = d.get(t.id, {})
            result.append(TicketStatusEntry(t.id, entry.get("status", "TODO"), entry.get("updatedAt", ""), entry.get("note")))
        return result
