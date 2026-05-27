"""Confluence Service — connects to Atlassian Confluence REST API for requirements gathering."""
from __future__ import annotations
import base64
import httpx
from ..config.env import env

class ConfluenceService:
    def _configured(self) -> bool:
        return bool(env.jira_host and env.jira_email and env.jira_api_token)

    async def get_project_plan(self, query: str) -> str | None:
        """Search Confluence for documentation matching the ticket ID or keyword."""
        if not self._configured():
            return None
        try:
            # Atlassian Confluence Cloud REST API v1/v2
            cql = f'space="{env.confluence_space_key}" and (text ~ "{query}" or title ~ "{query}")'
            creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
            url = f"{env.jira_host}/wiki/rest/api/content/search"
            
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as client:
                r = await client.get(
                    url,
                    params={"cql": cql, "expand": "body.storage,body.view", "limit": 1},
                    headers={"Authorization": f"Basic {creds}", "Accept": "application/json"}
                )
                if r.status_code != 200:
                    return None
                data = r.json()
                results = data.get("results", [])
                if not results:
                    return None
                
                page = results[0]
                body = page.get("body", {})
                content_html = body.get("view", {}).get("value") or body.get("storage", {}).get("value") or ""
                
                # Basic HTML tag stripping for clean LLM context
                import re
                clean_text = re.sub(r"<[^>]+>", " ", content_html)
                clean_text = re.sub(r"\s+", " ", clean_text).strip()
                clean_text = clean_text.encode("ascii", "ignore").decode("ascii")
                
                title = page.get("title", "Project Requirement")
                link = f"{env.jira_host}/wiki/spaces/{env.confluence_space_key}/pages/{page.get('id', '')}"
                
                return f"=== Confluence Document: {title} ===\nURL: {link}\n\n{clean_text}"
        except Exception as e:
            print(f"[Confluence] Error fetching project plan for {query}: {e}")
            return None

    async def search_docs(self, query: str) -> list[dict] | None:
        """Search Confluence and return a list of matching titles and URLs."""
        if not self._configured():
            return None
        try:
            if query.strip():
                cql = f'space="{env.confluence_space_key}" and (text ~ "{query}" or title ~ "{query}")'
            else:
                cql = f'space="{env.confluence_space_key}" order by lastModified desc'
            creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
            url = f"{env.jira_host}/wiki/rest/api/content/search"
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as client:
                r = await client.get(
                    url,
                    params={"cql": cql, "limit": 10},
                    headers={"Authorization": f"Basic {creds}", "Accept": "application/json"}
                )
                if r.status_code != 200:
                    return None
                data = r.json()
                results = []
                for p in data.get("results", []):
                    title = p.get("title", "Untitled")
                    link = f"{env.jira_host}/wiki/spaces/{env.confluence_space_key}/pages/{p.get('id', '')}"
                    results.append({"title": title, "url": link})
                return results
        except Exception as e:
            print(f"[Confluence] Error searching docs for {query}: {e}")
            return None
