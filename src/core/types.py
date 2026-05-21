"""Core type definitions — replaces types.ts with Python dataclasses."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

TicketStatusValue = Literal["TODO","PLANNED","IN_DEVELOPMENT","NLP_ACTIVE","READY_FOR_REVIEW","COMPLETED"]

@dataclass
class Ticket:
    id: str; title: str; description: str; priority: str

@dataclass
class TicketStatusEntry:
    ticket_id: str; status: TicketStatusValue; updated_at: str; note: str | None = None

@dataclass
class RepoFile:
    path: str; content: str

@dataclass
class CodeChange:
    path: str; content: str; action: str = "update"

@dataclass
class FileSnapshot:
    path: str; previous_content: str | None; next_content: str

@dataclass
class PlanResult:
    steps: list[str] = field(default_factory=list)

@dataclass
class ExecuteResult:
    updated_files: list[str] = field(default_factory=list)
    generated_tests: list[str] = field(default_factory=list)
    ticket_status: TicketStatusValue = "IN_DEVELOPMENT"

@dataclass
class RepoStatus:
    tickets: list[TicketStatusEntry] = field(default_factory=list)
    current_mode: str = "command"; ai_configured: bool = False; ai_mode: str = "mock"

@dataclass
class AiHealth:
    configured: bool; mode: str; reachable: bool; message: str

@dataclass
class NlpChatTurn:
    role: Literal["user", "assistant"]; content: str

@dataclass
class NlpChatResult:
    message: str; changes: list[CodeChange] = field(default_factory=list); commands: list[str] = field(default_factory=list)

@dataclass
class PolicyViolation:
    rule: str; message: str; severity: Literal["error", "warning"]

@dataclass
class ScanFinding:
    rule_id: str; category: str; description: str; severity: str
    file_path: str; line_number: int; matched_content: str; remediation: str

@dataclass
class ScanReport:
    scanned_files: int; total_findings: int; findings: list[ScanFinding] = field(default_factory=list)
    errors: int = 0; warnings: int = 0; info: int = 0
