"""Environment configuration — replaces env.ts. Loads .env and provides typed config."""
from __future__ import annotations
import os, ssl
from functools import lru_cache
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
try:
    load_dotenv(dotenv_path=Path.home() / ".nexus_env")
except Exception:
    pass
if os.getenv("SDLC_SKIP_SSL_VERIFY", "").strip().lower() == "true":
    ssl._create_default_https_context = ssl._create_unverified_context

def _read(name: str) -> str | None:
    v = os.getenv(name, "").strip()
    return v.strip("\"'") or None if v else None

class EnvConfig:
    def __init__(self):
        self.llm_provider = _read("LLM_PROVIDER")
        
        self.azure_endpoint = _read("AZURE_OPENAI_ENDPOINT")
        if self.azure_endpoint: self.azure_endpoint = self.azure_endpoint.rstrip("/")
        self.azure_api_key = _read("AZURE_OPENAI_API_KEY")
        self.azure_deployment = _read("AZURE_OPENAI_DEPLOYMENT") or "gpt-4.1"
        self.azure_api_version = _read("AZURE_OPENAI_API_VERSION") or "2024-12-01-preview"
        
        # Custom / Generic LLM Config
        self.llm_api_key = _read("LLM_API_KEY")
        self.llm_base_url = _read("LLM_BASE_URL")
        if self.llm_base_url: self.llm_base_url = self.llm_base_url.rstrip("/")
        self.llm_model = _read("LLM_MODEL") or "gpt-4o"

        # Gemini Specific Config
        self.gemini_api_key = _read("GEMINI_API_KEY")
        self.gemini_model = _read("GEMINI_MODEL") or "gemini-2.5-flash"
        
        # Anthropic Specific Config
        self.anthropic_api_key = _read("ANTHROPIC_API_KEY")
        self.anthropic_model = _read("ANTHROPIC_MODEL") or "claude-3-5-sonnet-latest"
        
        # Bedrock Specific Config
        self.aws_access_key_id = _read("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key = _read("AWS_SECRET_ACCESS_KEY")
        self.aws_region = _read("AWS_REGION") or "us-east-1"
        self.bedrock_model_id = _read("BEDROCK_MODEL_ID") or "anthropic.claude-3-5-sonnet-20241022-v2:0"

        # NVIDIA Specific Config
        self.nvidia_api_key = _read("NVIDIA_API_KEY")
        self.nvidia_model = _read("NVIDIA_MODEL") or "meta/llama-3.1-70b-instruct"

        # Mistral Specific Config
        self.mistral_api_key = _read("MISTRAL_API_KEY")
        self.mistral_model = _read("MISTRAL_MODEL") or "mistral-large-latest"

        # Azure AI Foundry Config
        self.foundry_endpoint = _read("FOUNDRY_ENDPOINT")
        if self.foundry_endpoint: self.foundry_endpoint = self.foundry_endpoint.rstrip("/")
        self.foundry_api_key = _read("FOUNDRY_API_KEY")
        self.foundry_model = _read("FOUNDRY_MODEL")

        # Open Source Config (Ollama/vLLM)
        self.os_base_url = _read("OS_BASE_URL") or "http://localhost:11434/v1"
        if self.os_base_url: self.os_base_url = self.os_base_url.rstrip("/")
        self.os_model = _read("OS_MODEL") or "llama3"
        self.os_api_key = _read("OS_API_KEY")

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

def has_custom_llm_config() -> bool:
    c = get_env()
    return bool(c.llm_api_key and c.llm_base_url and c.llm_model)

def has_llm_config() -> bool:
    c = get_env()
    p = (c.llm_provider or "").lower().strip()
    if p == "azure":
        return has_azure_openai_config()
    elif p == "gemini":
        return bool(c.gemini_api_key)
    elif p == "anthropic":
        return bool(c.anthropic_api_key)
    elif p == "bedrock":
        return bool(c.aws_access_key_id and c.aws_secret_access_key and c.aws_region)
    elif p == "nvidia":
        return bool(c.nvidia_api_key)
    elif p == "mistral":
        return bool(c.mistral_api_key)
    elif p == "azure_ai_foundry":
        return bool(c.foundry_endpoint and c.foundry_api_key and c.foundry_model)
    elif p == "open_source":
        return bool(c.os_base_url and c.os_model)
    elif p == "generic":
        return has_custom_llm_config()
    else:
        # Fallback detection
        if has_azure_openai_config(): return True
        if has_custom_llm_config(): return True
        if c.gemini_api_key: return True
        if c.anthropic_api_key: return True
        if c.aws_access_key_id and c.aws_secret_access_key and c.aws_region: return True
        if c.nvidia_api_key: return True
        if c.mistral_api_key: return True
        if c.foundry_endpoint and c.foundry_api_key and c.foundry_model: return True
        return False

def get_active_provider() -> str:
    c = get_env()
    p = (c.llm_provider or "").lower().strip()
    if p:
        return p
    # Detect based on what is configured
    if has_azure_openai_config(): return "azure"
    if has_custom_llm_config(): return "generic"
    if c.gemini_api_key: return "gemini"
    if c.anthropic_api_key: return "anthropic"
    if c.aws_access_key_id and c.aws_secret_access_key: return "bedrock"
    if c.nvidia_api_key: return "nvidia"
    if c.mistral_api_key: return "mistral"
    if c.foundry_endpoint and c.foundry_api_key: return "azure_ai_foundry"
    return "mock"

def reload_env():
    from dotenv import load_dotenv
    from pathlib import Path
    from .paths import paths
    from .config_manager import reset_config
    
    env_file = paths["root_dir"] / ".env"
    if env_file.exists():
        try:
            load_dotenv(dotenv_path=env_file, override=True)
        except Exception:
            pass
            
    home_env = Path.home() / ".nexus_env"
    if home_env.exists():
        try:
            load_dotenv(dotenv_path=home_env, override=True)
        except Exception:
            pass
            
    c = get_env()
    c.__init__()
    reset_config()

env = get_env()
