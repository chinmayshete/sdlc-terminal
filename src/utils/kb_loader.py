"""Knowledge Base Loader — reads Skills/ markdown files and optional Confluence/local docs.

Used to inject contextual knowledge into LLM prompts for:
  - Code generation (Skills KB → coding standards, patterns)
  - Agile planning/execution (Confluence / local doc → project context)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# ── Token budget ─────────────────────────────────────────────
_MAX_KB_CHARS = 10_000  # ~2500 tokens, safe budget per injection


# ── Skills KB ────────────────────────────────────────────────

def load_skills_kb(skills_dir: Path, max_chars: int = _MAX_KB_CHARS) -> str:
    """Read all .md files from the Skills directory recursively.

    Returns a concatenated string of all KB content, truncated to max_chars.
    Returns empty string if the directory doesn't exist or has no markdown files.
    """
    if not skills_dir or not skills_dir.exists() or not skills_dir.is_dir():
        return ""

    chunks: list[str] = []
    total = 0

    # Walk directory, sorted for determinism
    for md_file in sorted(skills_dir.rglob("*.md")):
        try:
            text = md_file.read_text(encoding="utf-8", errors="ignore").strip()
            if not text:
                continue
            # Use relative path as section header
            rel = md_file.relative_to(skills_dir)
            header = f"\n\n### KB: {rel}\n"
            section = header + text
            if total + len(section) > max_chars:
                # Add partial content up to budget
                remaining = max_chars - total - len(header)
                if remaining > 100:
                    chunks.append(header + text[:remaining] + "\n...[truncated]")
                break
            chunks.append(section)
            total += len(section)
        except Exception:
            continue

    return "".join(chunks).strip()


# ── Confluence / Local Doc KB ─────────────────────────────────

def load_confluence_kb(
    page_url: Optional[str] = None,
    page_id: Optional[str] = None,
    api_token: Optional[str] = None,
    local_path: Optional[str] = None,
    max_chars: int = _MAX_KB_CHARS,
) -> str:
    """Load KB from a Confluence page or a local file.

    Priority: local_path → Confluence API.
    Returns plain text content truncated to max_chars.
    """
    # 1. Try local file first
    if local_path:
        p = Path(local_path)
        if p.exists() and p.is_file():
            try:
                text = p.read_text(encoding="utf-8", errors="ignore").strip()
                return text[:max_chars]
            except Exception:
                pass

    # 2. Try Confluence REST API
    if page_id and api_token and page_url:
        try:
            import httpx
            base = page_url.rstrip("/")
            url = f"{base}/rest/api/content/{page_id}?expand=body.storage"
            headers = {
                "Authorization": f"Bearer {api_token}",
                "Accept": "application/json",
            }
            with httpx.Client(timeout=10.0, verify=False) as client:
                r = client.get(url, headers=headers)
            if r.status_code == 200:
                data = r.json()
                html = data.get("body", {}).get("storage", {}).get("value", "")
                if html:
                    # Strip HTML tags to plain text
                    import re
                    text = re.sub(r"<[^>]+>", " ", html)
                    text = re.sub(r"\s+", " ", text).strip()
                    return text[:max_chars]
        except Exception:
            pass

    return ""


# ── Mode-aware KB selector ─────────────────────────────────────

def get_kb_for_mode(mode: str, paths: dict, env_vars: Optional[dict] = None) -> str:
    """Return the appropriate KB context string for a given mode.

    - All modes: inject Skills KB
    - Agile mode: additionally inject Confluence/local doc KB
    """
    ev = env_vars or {}

    skills_dir: Path = paths.get("skills_dir", Path("Skills"))
    # Also try the root-level Skills folder (capital S)
    if not skills_dir.exists():
        root = paths.get("root_dir", Path("."))
        for candidate in ("Skills", "skills", "knowledge_base", "kb"):
            candidate_dir = root / candidate
            if candidate_dir.exists() and candidate_dir.is_dir():
                skills_dir = candidate_dir
                break

    skills_kb = load_skills_kb(skills_dir)

    agile_kb = ""
    if mode == "agile":
        agile_kb = load_confluence_kb(
            page_url=ev.get("CONFLUENCE_URL") or os.environ.get("CONFLUENCE_URL", ""),
            page_id=ev.get("CONFLUENCE_PAGE_ID") or os.environ.get("CONFLUENCE_PAGE_ID", ""),
            api_token=ev.get("CONFLUENCE_TOKEN") or os.environ.get("CONFLUENCE_TOKEN", ""),
            local_path=ev.get("AGILE_KB_PATH") or os.environ.get("AGILE_KB_PATH", ""),
        )

    parts = []
    if skills_kb:
        parts.append(f"## Skills Knowledge Base\n{skills_kb}")
    if agile_kb:
        parts.append(f"## Project / Confluence Knowledge Base\n{agile_kb}")

    return "\n\n".join(parts)
