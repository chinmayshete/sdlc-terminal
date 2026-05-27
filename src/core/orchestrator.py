"""Core Orchestrator — replaces orchestrator.ts. Central hub coordinating all agents, services, operations."""
from __future__ import annotations
from ..agents.planner_agent import PlannerAgent
from ..agents.code_agent import CodeAgent
from ..agents.test_agent import TestAgent
from ..config.env import env, has_llm_config, has_azure_openai_config
from ..config.paths import paths
from ..utils.llm import check_ai_health, generate_free_nlp_chat, explain_file_with_chat
from ..utils.git import push_ticket, get_changed_files
from ..utils.code_scanner import run_code_scan, format_scan_report, run_incremental_scan
from ..utils.cicd import get_pipeline_info, format_pipeline_info
from ..utils import git_operations as gitops
from ..utils import devops_operations as devops
from ..utils import security_operations as secops
from ..config.config_manager import load_config, get_config_summary
from .context_builder import ContextBuilder
from .jira_service import JiraService
from .state_service import StateService
from .ticket_service import TicketService
from .types import AiHealth, CodeChange, ExecuteResult, FileSnapshot, NlpChatResult, NlpChatTurn, PlanResult, RepoStatus, Ticket

class Orchestrator:
    def __init__(self):
        self.ticket_service = TicketService(); self.state_service = StateService()
        self.context_builder = ContextBuilder()
        self.planner = PlannerAgent(); self.coder = CodeAgent(); self.tester = TestAgent()

    # ── Ticket Ops ───────────────────────────────────────────
    async def list_tickets(self) -> list[Ticket]: return await self.ticket_service.list_tickets()

    async def plan(self, ticket_id: str, mode: str = "basic") -> PlanResult:
        ticket = await self.ticket_service.read_ticket(ticket_id)
        ctx = await self.context_builder.build(ticket)
        result = await self.planner.run(ticket, ctx, mode=mode)
        await self.state_service.set_ticket_status(ticket.id, "PLANNED")
        
        # Save plan to tickets/
        plan_dir = paths["root_dir"] / "tickets"
        plan_dir.mkdir(parents=True, exist_ok=True)
        plan_path = plan_dir / f"{ticket.id}_plan.md"
        content = f"# Plan: {ticket.title} ({ticket.id})\n\n"
        for i, step in enumerate(result.steps, 1):
            content += f"{i}. {step}\n"
        plan_path.write_text(content, "utf-8")
        
        return result

    async def execute(self, ticket_id: str) -> ExecuteResult:
        ticket = await self.ticket_service.read_ticket(ticket_id)
        ctx = await self.context_builder.build(ticket)
        await self.planner.run(ticket, ctx, mode="basic")
        code_changes = await self.coder.run(ticket, ctx)
        self._write_changes(code_changes)
        test_changes = await self.tester.run(ticket, code_changes)
        self._write_changes(test_changes)
        await self.state_service.set_ticket_status(ticket.id, "IN_DEVELOPMENT", "Code and tests generated.")
        
        # Transition remote Jira issue to "In Progress" or equivalent
        if not env.use_mock:
            try:
                jira = JiraService()
                if jira._configured():
                    transitions = await jira.fetch_transitions(ticket.id)
                    target = None
                    # Search priority:
                    # 1. Exact match on target status name (case-insensitive) for "in progress" or "in development"
                    # 2. Substring match on target status name or transition name containing "progress" or "development"
                    for t in transitions:
                        to_status = t.get("to", {}).get("name", "").lower()
                        if to_status in ("in progress", "in development"):
                            target = t
                            break
                    if not target:
                        for t in transitions:
                            to_status = t.get("to", {}).get("name", "").lower()
                            trans_name = t.get("name", "").lower()
                            if "progress" in to_status or "development" in to_status or "progress" in trans_name or "development" in trans_name:
                                target = t
                                break
                    
                    if target:
                        await jira.execute_transition(ticket.id, target["id"])
            except Exception as e:
                # Log transition error but do not fail the core execute command
                print(f"[Orchestrator] Error transitioning Jira ticket {ticket.id}: {e}")

        return ExecuteResult([c.path for c in code_changes], [c.path for c in test_changes], "IN_DEVELOPMENT")

    async def status(self, mode: str = "command") -> RepoStatus:
        tickets = await self.ticket_service.list_tickets()
        statuses = await self.state_service.get_ticket_statuses(tickets)
        ai_mode = "mock" if env.use_mock else ("azure" if has_azure_openai_config() else "custom_llm")
        return RepoStatus(statuses, mode, has_llm_config(), ai_mode)

    async def ai_health(self) -> AiHealth: return await check_ai_health()

    async def push(self, ticket_id: str) -> str:
        ticket = await self.ticket_service.read_ticket(ticket_id)
        return await push_ticket(ticket)

    async def reset_ticket_status(self, ticket_id: str):
        if not await self.ticket_service.ticket_exists(ticket_id): raise ValueError(f"Unknown ticket: {ticket_id}")
        await self.state_service.reset_ticket_status(ticket_id)

    async def reset_all_ticket_statuses(self): await self.state_service.reset_all_ticket_statuses()

    async def changed_files(self) -> list[str]: return await get_changed_files()

    # ── NLP Ops ──────────────────────────────────────────────
    async def run_free_nlp_chat(self, history: list[NlpChatTurn], prompt: str) -> NlpChatResult:
        ctx = await self.context_builder.read_all()
        status_obj = await self.status("nlp")
        ticket_info = [f"• {t.ticket_id}: {t.status} ({t.note or 'No notes'})" for t in status_obj.tickets]
        return await generate_free_nlp_chat(ctx, history, prompt, ticket_info)

    async def explain_file(self, file_path: str, history: list[NlpChatTurn] | None = None) -> str:
        full = paths["root_dir"] / file_path
        try: content = full.read_text(encoding="utf-8")
        except FileNotFoundError: return f"File not found: {file_path}"
        return await explain_file_with_chat(file_path, content, history or [])

    async def apply_nlp_changes(self, changes: list[CodeChange]) -> list[FileSnapshot]:
        snaps = []
        for c in changes:
            p = paths["root_dir"] / c.path
            prev = None
            if p.exists() and p.is_file():
                try: prev = p.read_text("utf-8", errors="ignore")
                except: pass
            
            action = getattr(c, "action", "update")
            if action == "delete":
                self._force_delete(p)
            elif c.path.endswith("/") or c.path.endswith("\\"):
                if p.exists() and p.is_file():
                    try: p.unlink()
                    except: pass
                p.mkdir(parents=True, exist_ok=True)
            else:
                if p.exists() and p.is_dir():
                    self._force_delete(p)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(c.content, "utf-8")
            snaps.append(FileSnapshot(c.path, prev, c.content))
        return snaps

    async def undo_nlp_changes(self, snapshots: list[FileSnapshot]):
        for s in snapshots:
            p = paths["root_dir"] / s.path
            if s.previous_content is not None:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(s.previous_content, "utf-8")
            else:
                self._force_delete(p)

    @staticmethod
    def _force_delete(p: Path):
        import os, stat
        if not p.exists():
            return
        if p.is_file():
            try: os.chmod(p, stat.S_IWRITE)
            except: pass
            try: p.unlink()
            except: pass
            return
        for root, dirs, files in os.walk(p, topdown=False):
            for name in files:
                fp = os.path.join(root, name)
                try: os.chmod(fp, stat.S_IWRITE)
                except: pass
                try: os.unlink(fp)
                except: pass
            for name in dirs:
                dp = os.path.join(root, name)
                try: os.chmod(dp, stat.S_IWRITE)
                except: pass
                try: os.rmdir(dp)
                except: pass
        try: os.chmod(p, stat.S_IWRITE)
        except: pass
        try: os.rmdir(p)
        except: pass

    # ── Security Ops ─────────────────────────────────────────
    async def run_code_scan(self): 
        report, _, _ = await run_incremental_scan(paths["app_repo_dir"])
        return report
    async def get_security_scan(self) -> list[str]: return await secops.run_full_scan()
    async def get_security_secrets(self) -> list[str]: return await secops.check_for_secrets()
    async def get_security_compliance(self) -> list[str]: return await secops.run_compliance_check()
    async def get_security_dashboard(self) -> list[str]: return await secops.get_security_dashboard()

    # ── DevOps Ops ───────────────────────────────────────────
    async def get_cicd_pipeline(self): info = await get_pipeline_info(paths["root_dir"]); return format_pipeline_info(info)
    async def get_environment_config(self) -> list[str]:
        try: return get_config_summary(get_config_summary) # Will call load_config if needed
        except: return await devops.show_environment_config()
    async def get_git_status(self) -> list[str]: return await gitops.git_status()
    async def get_git_log(self, n: int = 10) -> list[str]: return await gitops.git_log(n)
    async def get_git_branches(self) -> list[str]: return await gitops.git_list_branches()
    async def get_devops_cicd(self) -> list[str]: return await devops.get_cicd_overview()
    async def get_devops_docker_info(self) -> list[str]: return await devops.get_dockerfile_info()
    async def get_devops_infra_resources(self) -> list[str]: return await devops.list_infra_resources()
    async def get_devops_health(self) -> list[str]: return await devops.get_system_health()
    async def get_devops_pr_check(self) -> list[str]: return await devops.run_pr_readiness_check()

    # ── PM Ops ───────────────────────────────────────────────
    async def pm_jira_auth(self) -> bool:
        jira = JiraService()
        return await jira.check_auth()

    async def pm_project_list(self) -> list[dict]:
        jira = JiraService()
        return await jira.fetch_projects()

    async def pm_epic_list(self) -> list[dict]:
        jira = JiraService()
        return await jira.fetch_epics()

    async def pm_story_create(self, summary: str, description: str = "") -> str | None:
        jira = JiraService()
        return await jira.create_story(summary, description)

    async def pm_fetch_transitions(self, ticket_id: str) -> list[dict]:
        jira = JiraService()
        return await jira.fetch_transitions(ticket_id)

    async def pm_execute_transition(self, ticket_id: str, transition_id: str) -> bool:
        jira = JiraService()
        return await jira.execute_transition(ticket_id, transition_id)

    # ── Private ──────────────────────────────────────────────
    @staticmethod
    def _write_changes(changes: list[CodeChange]):
        for c in changes:
            p = paths["root_dir"] / c.path; p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(c.content, "utf-8")
