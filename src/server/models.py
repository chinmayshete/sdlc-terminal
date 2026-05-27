"""Pydantic request/response models for the Nexus API Bridge Server."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ── Request Models ───────────────────────────────────────────

class ChatRequest(BaseModel):
    """Free NLP chat request — same as typing at the nexus > prompt."""
    message: str
    mode: str = "command"
    history: list[ChatTurnModel] = Field(default_factory=list)

class ChatTurnModel(BaseModel):
    role: str  # "user" | "assistant"
    content: str

# Fix forward reference
ChatRequest.model_rebuild()

class CommandRequest(BaseModel):
    """Execute a command in a specific mode."""
    input: str
    mode: str = "command"  # command | git | security | devops | agile

class IntentRequest(BaseModel):
    """Parse natural language to an intent."""
    input: str
    mode: str = "command"

class TicketPlanRequest(BaseModel):
    """Plan options for a ticket."""
    mode: str = "basic"  # basic | detailed | comprehensive

class ScanFileRequest(BaseModel):
    """Request to scan a specific file."""
    file_path: str

class GitCommandRequest(BaseModel):
    """Git command with optional arguments."""
    args: list[str] = Field(default_factory=list)

class CwdRequest(BaseModel):
    """Update server workspace context."""
    cwd: str

class DevOpsCommandRequest(BaseModel):
    """DevOps command with optional arguments."""
    args: list[str] = Field(default_factory=list)

class AgileCommandRequest(BaseModel):
    """Agile/PM command with optional arguments."""
    args: list[str] = Field(default_factory=list)


# ── Response Models ──────────────────────────────────────────

class ChatResponse(BaseModel):
    """Chat response with optional file changes and commands."""
    message: str
    changes: list[FileChangeModel] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    mode: Optional[str] = None

class FileChangeModel(BaseModel):
    path: str
    content: str = ""
    action: str = "update"  # create | update | delete

class IntentResponse(BaseModel):
    """Parsed intent from NL input."""
    command: str
    args: list[str] = Field(default_factory=list)

class StatusResponse(BaseModel):
    """Workspace status response."""
    ai_mode: str
    ai_configured: bool
    tickets: list[TicketStatusModel] = Field(default_factory=list)

class TicketStatusModel(BaseModel):
    ticket_id: str
    status: str
    note: Optional[str] = None

class HealthResponse(BaseModel):
    """AI health response."""
    configured: bool
    mode: str
    reachable: bool
    message: str

class TicketModel(BaseModel):
    """Ticket info."""
    id: str
    title: str
    description: str
    priority: str

class PlanResponse(BaseModel):
    """Plan steps for a ticket."""
    ticket_id: str
    steps: list[str] = Field(default_factory=list)

class ExecuteResponse(BaseModel):
    """Execution result for a ticket."""
    ticket_id: str
    updated_files: list[str] = Field(default_factory=list)
    generated_tests: list[str] = Field(default_factory=list)
    ticket_status: str

class CommandResponse(BaseModel):
    """Generic command output response."""
    title: str
    output: list[str] = Field(default_factory=list)
    mode: Optional[str] = None  # New mode if mode switch happened

class ModeInfo(BaseModel):
    """Mode metadata."""
    id: str
    label: str
    color: str
    description: str

class ModesResponse(BaseModel):
    """Available modes."""
    modes: list[ModeInfo]
    current: str = "command"

class ServerInfo(BaseModel):
    """Server metadata returned on root endpoint."""
    name: str = "Nexus SDLC API"
    version: str = "0.1.0"
    status: str = "running"
