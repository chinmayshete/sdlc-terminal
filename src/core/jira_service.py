"""Jira Service — replaces jira-service.ts. Fetches tickets from Jira via REST API."""
from __future__ import annotations
import base64
import httpx
from ..config.env import env
from ..core.types import Ticket

class JiraService:
    async def fetch_tickets(self) -> list[Ticket]:
        if not self._configured(): return []
        try:
            jql = f"project={env.jira_project_key} ORDER BY priority DESC"
            data = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "description", "priority"], "maxResults": 20})
            return [self._parse_issue(i) for i in (data.get("issues", []) if data else [])]
        except Exception as e:
            print(f"[Jira] Error fetching tickets: {e}")
            return []

    async def fetch_ticket(self, ticket_id: str) -> Ticket | None:
        if not self._configured(): return None
        try:
            data = await self._request(f"/rest/api/3/issue/{ticket_id}")
            return self._parse_issue(data)
        except Exception as e:
            print(f"[Jira] Error fetching ticket {ticket_id}: {e}")
            return None

    def _configured(self) -> bool:
        return bool(env.jira_host and env.jira_email and env.jira_api_token)

    async def _request(self, path: str) -> dict:
        creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
        async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as c:
            r = await c.get(f"{env.jira_host}{path}", headers={"Authorization": f"Basic {creds}", "Accept": "application/json"})
        r.raise_for_status(); return r.json()

    def _parse_issue(self, data: dict) -> Ticket:
        fields = data.get("fields", {})
        desc = fields.get("description") or ""
        if isinstance(desc, dict): desc = self._adf_to_text(desc)
        return Ticket(id=data.get("key", ""), title=fields.get("summary", ""), description=desc,
            priority=fields.get("priority", {}).get("name", "Medium") if isinstance(fields.get("priority"), dict) else "Medium")

    def _adf_to_text(self, node: dict) -> str:
        if node.get("type") == "text": return node.get("text", "")
        return " ".join(self._adf_to_text(c) for c in node.get("content", []) if isinstance(c, dict))

    # PM Ops Additions
    async def check_auth(self) -> bool:
        if not self._configured(): return False
        try:
            await self._request("/rest/api/3/myself")
            return True
        except Exception:
            return False

    async def fetch_projects(self) -> list[dict]:
        if not self._configured(): return []
        try:
            data = await self._request("/rest/api/3/project")
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[Jira] Error fetching projects: {e}")
            return []

    async def fetch_epics(self) -> list[dict]:
        if not self._configured(): return []
        try:
            jql = f"project={env.jira_project_key} AND issuetype=Epic ORDER BY created DESC"
            data = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "status"], "maxResults": 20})
            return data.get("issues", []) if data else []
        except Exception as e:
            print(f"[Jira] Error fetching epics: {e}")
            return []

    async def fetch_raw_issue(self, ticket_id: str) -> dict | None:
        if not self._configured(): return None
        try:
            return await self._request(f"/rest/api/3/issue/{ticket_id}")
        except Exception as e:
            print(f"[Jira] Error fetching issue {ticket_id}: {e}")
            return None

    async def fetch_child_issues(self, parent_id: str) -> list[dict]:
        if not self._configured(): return []
        try:
            jql = f"parent={parent_id} ORDER BY created ASC"
            data = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "status", "issuetype", "priority", "customfield_10014"], "maxResults": 50})
            return data.get("issues", []) if data else []
        except Exception as e:
            print(f"[Jira] Error fetching children for {parent_id}: {e}")
            return []

    async def fetch_issues_by_type(self, issuetype: str) -> list[dict]:
        if not self._configured(): return []
        try:
            from urllib.parse import quote
            jql = f'project="{env.jira_project_key}" AND issuetype="{issuetype}" ORDER BY created DESC'
            data = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "status", "issuetype", "priority"], "maxResults": 50})
            if not data: return []
            # Client-side guard: ensure only the requested issuetype is returned
            return [
                i for i in data.get("issues", [])
                if i.get("fields", {}).get("issuetype", {}).get("name", "").lower() == issuetype.lower()
            ]
        except Exception as e:
            print(f"[Jira] Error fetching {issuetype}s: {e}")
            return []

    async def fetch_board_issues(self) -> list[dict]:
        if not self._configured(): return []
        try:
            jql = f"project={env.jira_project_key} ORDER BY status DESC, priority DESC"
            data = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "status", "issuetype", "priority"], "maxResults": 50})
            return data.get("issues", []) if data else []
        except Exception as e:
            print(f"[Jira] Error fetching board issues: {e}")
            return []

    async def create_story(self, summary: str, description: str = "") -> str | None:
        if not self._configured(): return None
        try:
            payload = {
                "fields": {
                    "project": {"key": env.jira_project_key},
                    "summary": summary,
                    "description": {
                        "type": "doc",
                        "version": 1,
                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": description}]}]
                    },
                    "issuetype": {"name": "Story"}
                }
            }
            creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as c:
                r = await c.post(f"{env.jira_host}/rest/api/3/issue", headers={"Authorization": f"Basic {creds}", "Accept": "application/json", "Content-Type": "application/json"}, json=payload)
            r.raise_for_status()
            return r.json().get("key")
        except Exception as e:
            print(f"[Jira] Error creating story: {e}")
            return None

    async def fetch_transitions(self, ticket_id: str) -> list[dict]:
        if not self._configured(): return []
        try:
            data = await self._request(f"/rest/api/3/issue/{ticket_id}/transitions")
            return data.get("transitions", [])
        except Exception as e:
            print(f"[Jira] Error fetching transitions for {ticket_id}: {e}")
            return []

    async def execute_transition(self, ticket_id: str, transition_id: str) -> bool:
        if not self._configured(): return False
        try:
            payload = {"transition": {"id": transition_id}}
            creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as c:
                r = await c.post(f"{env.jira_host}/rest/api/3/issue/{ticket_id}/transitions", headers={"Authorization": f"Basic {creds}", "Accept": "application/json", "Content-Type": "application/json"}, json=payload)
            r.raise_for_status()
            return True
        except Exception as e:
            print(f"[Jira] Error transitioning {ticket_id}: {e}")
            return False

    async def _http(self, method: str, path: str, json_data: dict | None = None) -> dict | None:
        if not self._configured(): return None
        creds = base64.b64encode(f"{env.jira_email}:{env.jira_api_token}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Accept": "application/json"}
        if json_data is not None: headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=15) as c:
                r = await c.request(method, f"{env.jira_host}{path}", headers=headers, json=json_data)
            if r.status_code == 204: return {}
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"[Jira] HTTP {method} {path} failed: {e}")
            return None

    async def update_issue(self, ticket_id: str, fields: dict) -> bool:
        res = await self._http("PUT", f"/rest/api/3/issue/{ticket_id}", {"fields": fields})
        return res is not None

    async def assign_issue(self, ticket_id: str, account_id: str) -> bool:
        res = await self._http("PUT", f"/rest/api/3/issue/{ticket_id}/assignee", {"accountId": account_id})
        return res is not None

    async def delete_issue(self, ticket_id: str) -> bool:
        res = await self._http("DELETE", f"/rest/api/3/issue/{ticket_id}")
        return res is not None

    async def add_comment(self, ticket_id: str, comment: str) -> bool:
        payload = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": comment}]}]
            }
        }
        res = await self._http("POST", f"/rest/api/3/issue/{ticket_id}/comment", payload)
        return res is not None

    async def create_issue_generic(self, summary: str, issuetype: str, description: str = "", parent_id: str = "") -> dict | None:
        fields = {
            "project": {"key": env.jira_project_key},
            "summary": summary,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": description}]}]
            },
            "issuetype": {"name": issuetype}
        }
        if parent_id:
            fields["parent"] = {"key": parent_id}
        res = await self._http("POST", "/rest/api/3/issue", {"fields": fields})
        return res

    async def search_issues(self, jql: str, max_results: int = 50) -> list[dict]:
        res = await self._http("POST", "/rest/api/3/search/jql", {"jql": jql, "fields": ["summary", "description", "status", "issuetype", "priority", "assignee", "customfield_10014", "parent", "comment"], "maxResults": max_results})
        return res.get("issues", []) if res and isinstance(res, dict) else []

    async def fetch_users(self) -> list[dict]:
        res = await self._http("GET", "/rest/api/3/user/search?query=")
        if isinstance(res, list):
            return [u for u in res if u.get("accountType") == "atlassian"]
        return []

    async def fetch_myself(self) -> dict | None:
        res = await self._http("GET", "/rest/api/3/myself")
        return res if isinstance(res, dict) else None
