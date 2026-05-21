"""Environment configuration — replaces env.ts. Loads .env and provides typed config."""
from __future__ import annotations
import os, ssl
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()
if os.getenv("SDLC_SKIP_SSL_VERIFY", "").strip().lower() == "true":
    ssl._create_default_https_context = ssl._create_unverified_context

def _read(name: str) -> str | None:
    v = os.getenv(name, "").strip()
    return v.strip("\"'") or None if v else None

class EnvConfig:
    def __init__(self):
        self.azure_endpoint = _read("AZURE_OPENAI_ENDPOINT")
        if self.azure_endpoint: self.azure_endpoint = self.azure_endpoint.rstrip("/")
        self.azure_api_key = _read("AZURE_OPENAI_API_KEY")
        self.azure_deployment = _read("AZURE_OPENAI_DEPLOYMENT") or "gpt-4.1"
        self.azure_api_version = _read("AZURE_OPENAI_API_VERSION") or "2024-12-01-preview"
        self.use_mock = _read("SDLC_USE_MOCK") == "true"
        self.app_env = _read("APP_ENV") or "dev"
        self.vault_enabled = _read("VAULT_ENABLED") == "true"
        self.vault_addr = _read("VAULT_ADDR") or "http://127.0.0.1:8200"
        self.vault_token = _read("VAULT_TOKEN")
        self.vault_secret_path = _read("VAULT_SECRET_PATH") or "secret/data/sdlc"
        self.jira_host = _read("JIRA_HOST")
        if self.jira_host and not self.jira_host.startswith("http"):
            self.jira_host = f"https://{self.jira_host}"
        self.jira_host = self.jira_host.rstrip("/") if self.jira_host else None
        self.jira_email = _read("JIRA_EMAIL")
        self.jira_api_token = _read("JIRA_API_TOKEN")
        self.jira_project_key = _read("JIRA_PROJECT_KEY") or "SDLC"
        self.confluence_space_key = _read("CONFLUENCE_SPACE_KEY") or self.jira_project_key
        self.skip_ssl_verify = _read("SDLC_SKIP_SSL_VERIFY") == "true"

@lru_cache(maxsize=1)
def get_env() -> EnvConfig:
    return EnvConfig()

def has_azure_openai_config() -> bool:
    c = get_env()
    return bool(c.azure_endpoint and c.azure_api_key and c.azure_deployment)

env = get_env()
