"""SkillsLoader — loads SDLC knowledge base documents from the skills/ folder into agent context."""
from __future__ import annotations
from pathlib import Path
from ..config.paths import paths
from .types import RepoFile

_SKILLS_EXTENSIONS = {".md", ".txt", ".yaml", ".yml", ".json"}
_MAX_SKILL_SIZE = 30_000  # 30 KB per skill doc


class SkillsLoader:
    """
    Scans the project-root skills/ folder and loads all knowledge base documents
    as RepoFile objects. These are injected into the LLM context before repo files
    so the agent always reasons in line with team standards.
    """

    def __init__(self):
        self.skills_dir: Path = paths["skills_dir"]

    def load_all(self) -> list[RepoFile]:
        """Load ALL skill documents. Used for freeform chat so agent is always fully skills-aware."""
        return self._scan(keywords=[])

    def load_relevant(self, keywords: list[str]) -> list[RepoFile]:
        """
        Load skill docs relevant to the given keywords.
        Relevance is determined by matching keywords against the file name and parent folder name.
        If no keywords provided, returns all skill docs (same as load_all).
        """
        if not keywords:
            return self.load_all()
        return self._scan(keywords=keywords)

    def _scan(self, keywords: list[str]) -> list[RepoFile]:
        if not self.skills_dir.exists():
            return []

        results: list[RepoFile] = []

        for path in sorted(self.skills_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() not in _SKILLS_EXTENSIONS:
                continue
            if path.stat().st_size > _MAX_SKILL_SIZE:
                continue
            if path.name == "README.md" and path.parent == self.skills_dir:
                # Skip the top-level README — not a skill doc
                continue

            # Relevance filter: match keyword against filename + parent folder name
            if keywords:
                search_target = (path.stem + " " + path.parent.name).lower()
                if not any(kw.lower() in search_target for kw in keywords):
                    continue

            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            rel = str(path.relative_to(self.skills_dir.parent))
            results.append(RepoFile(f"[Skill: {rel}]", content))

        return results
