"""Context Builder — builds LLM context from skills KB, Confluence requirements, and repo files."""
from __future__ import annotations
import re
from pathlib import Path
from ..config.paths import paths
from ..core.types import RepoFile, Ticket
from .skills_loader import SkillsLoader

_SKIP_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__", ".venv", "venv", ".sdlc", "skills"}
_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".rb", ".json", ".yaml", ".yml", ".md", ".tf", ".sh"}
_MAX_FILE_SIZE = 50_000


class ContextBuilder:
    def __init__(self):
        self.skills = SkillsLoader()

    async def build(self, ticket: Ticket) -> list[RepoFile]:
        """
        Build the full agent context for a ticket in priority order:
          1. Relevant skill docs from skills/ KB (standards, patterns)
          2. Confluence project requirement (live from Atlassian)
          3. Relevant repo source files (matched by keyword)
        """
        keywords = self._extract_keywords(ticket)

        # 1. Load relevant skill docs from skills/ KB
        skill_docs = self.skills.load_relevant(keywords)

        # 2. Inject Confluence requirement (always attempt live fetch)
        from .confluence_service import ConfluenceService
        cs = ConfluenceService()
        req = await cs.get_project_plan(ticket.id)
        if not req and ticket.title:
            req = await cs.get_project_plan(ticket.title)
        if not req:
            req = await cs.get_project_plan("Project Plan")
        confluence_docs = [RepoFile("[Confluence Requirement]", req)] if req else []

        # Inject existing plan if available
        plan_path = paths["root_dir"] / "tickets" / f"{ticket.id}_plan.md"
        plan_docs = []
        if plan_path.exists():
            try:
                plan_content = plan_path.read_text("utf-8", errors="ignore")
                plan_docs = [RepoFile("[Ticket Plan]", plan_content)]
            except:
                pass

        # 3. Load relevant repo source files
        repo_files = self._collect_files(keywords)

        return skill_docs + plan_docs + confluence_docs + repo_files

    async def read_all(self) -> list[RepoFile]:
        """
        Read everything for freeform NLP chat context:
          - ALL skill docs (agent is always fully skills-aware in chat)
          - All repo source files
        """
        all_skills = self.skills.load_all()
        repo_files = self._collect_files([])
        return all_skills + repo_files

    def _extract_keywords(self, ticket: Ticket) -> list[str]:
        text = f"{ticket.title} {ticket.description}".lower()
        words = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{2,}", text)
        stops = {
            "the", "and", "for", "this", "that", "with", "from", "should", "must",
            "will", "can", "add", "new", "create", "update", "delete", "fix", "bug",
            "feature", "implement", "test", "when", "then"
        }
        return list(set(w for w in words if w not in stops))[:20]

    def _collect_files(self, keywords: list[str]) -> list[RepoFile]:
        files: list[RepoFile] = []
        root = paths["root_dir"]
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in _EXTENSIONS:
                continue
            if any(d in p.parts for d in _SKIP_DIRS):
                continue
            if p.stat().st_size > _MAX_FILE_SIZE:
                continue
            rel = str(p.relative_to(root))
            if keywords:
                name_lower = p.name.lower()
                if not any(kw in name_lower for kw in keywords):
                    continue
            try:
                content = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            files.append(RepoFile(rel, content))
            if len(files) >= 30:
                break
        return files
