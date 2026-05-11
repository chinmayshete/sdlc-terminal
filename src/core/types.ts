export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: string;
}

export type TicketStatusValue =
  | "TODO"
  | "PLANNED"
  | "IN_DEVELOPMENT"
  | "NLP_ACTIVE"
  | "READY_FOR_REVIEW"
  | "COMPLETED";

export interface TicketStatusEntry {
  ticketId: string;
  status: TicketStatusValue;
  updatedAt: string;
  note?: string;
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface PlanResult {
  steps: string[];
}

export interface CodeChange {
  path: string;
  content: string;
}

export interface ExecuteResult {
  updatedFiles: string[];
  generatedTests: string[];
  ticketStatus: TicketStatusValue;
}

export interface RepoStatus {
  tickets: TicketStatusEntry[];
  currentMode: "command" | "nlp" | "devops" | "git" | "security";
  ai: {
    configured: boolean;
    mode: "azure" | "mock";
  };
}

export interface LlmPlanResponse {
  steps: string[];
}

export interface LlmCodeResponse {
  files: CodeChange[];
}

export interface AppState {
  tickets: Record<string, TicketStatusEntry>;
}

export interface AiHealth {
  configured: boolean;
  mode: "azure" | "mock";
  reachable: boolean;
  message: string;
}

export interface NlpChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface NlpChatResult {
  message: string;
  changes: CodeChange[];
}

export interface FileSnapshot {
  path: string;
  previousContent: string | null;
  nextContent: string;
}
