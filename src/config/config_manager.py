"""Config Manager — replaces config-manager.ts. Multi-env config loading + vault."""
from __future__ import annotations
import json, os, copy
from pathlib import Path
from .config_schema import AppConfig, AzureConfig, FeaturesConfig, LoggingConfig, DatabaseConfig, ServicesConfig, SENSITIVE_FIELDS, get_default_config, validate_config
from .vault import create_secret_provider, SecretProvider
from .paths import paths

CONFIG_DIR = paths["root_dir"] / "config"
_cached: AppConfig | None = None

async def load_config(provider: SecretProvider | None = None) -> AppConfig:
    global _cached
    if _cached: return _cached
    app_env = os.getenv("APP_ENV", "dev").strip().lower()
    if app_env not in ("dev", "staging", "prod"): app_env = "dev"
    config = get_default_config(app_env)
    base = _load_json(CONFIG_DIR / "base.json")
    env_cfg = _load_json(CONFIG_DIR / "environments" / f"{app_env}.json")
    merged = _deep_merge(_deep_merge(_to_dict(config), base), env_cfg)
    config = _from_dict(merged, app_env)
    _apply_env_overrides(config)
    prov = provider or create_secret_provider()
    await _apply_secrets(config, prov)
    errors = validate_config(config)
    for e in errors:
        if e.severity == "error": print(f"[Config] {e.message}")
    _cached = config; return config

def get_config() -> AppConfig:
    if not _cached: raise RuntimeError("Config not loaded. Call load_config() first.")
    return _cached

def reset_config(): global _cached; _cached = None

def get_redacted_config(config: AppConfig) -> dict:
    d = _to_dict(config)
    for fp in SENSITIVE_FIELDS: _set_nested(d, fp, "********")
    return d

def get_config_summary(config: AppConfig) -> list[str]:
    return [f"Environment: {config.app_env}", f"Azure Endpoint: {config.azure.endpoint or '(not set)'}",
        f"Azure Deployment: {config.azure.deployment}", "Azure API Key: ********",
        f"Mock Mode: {'enabled' if config.features.use_mock else 'disabled'}",
        f"Code Scanning: {'enabled' if config.features.enable_code_scanning else 'disabled'}",
        f"Logging: {config.logging.level}/{config.logging.format}",
        f"Database: {config.database.host}:{config.database.port}/{config.database.name}",
        f"Jenkins: {config.services.jenkins_url}", f"Vault: {config.services.vault_addr}"]

def _load_json(p: Path) -> dict:
    try: return json.loads(p.read_text("utf-8"))
    except Exception: return {}

def _deep_merge(target: dict, source: dict) -> dict:
    r = copy.deepcopy(target)
    for k, v in source.items():
        if isinstance(v, dict) and isinstance(r.get(k), dict): r[k] = _deep_merge(r[k], v)
        else: r[k] = v
    return r

def _to_dict(c: AppConfig) -> dict:
    import dataclasses; return dataclasses.asdict(c)

def _from_dict(d: dict, env: str) -> AppConfig:
    return AppConfig(app_env=env,
        azure=AzureConfig(**{k: d.get("azure", {}).get(k, "") for k in ("endpoint", "deployment", "api_key", "api_version")}),
        features=FeaturesConfig(**{k: d.get("features", {}).get(k, False) for k in ("use_mock", "enable_code_scanning", "enable_cicd_integration")}),
        logging=LoggingConfig(**{k: d.get("logging", {}).get(k, "") for k in ("level", "format")}),
        database=DatabaseConfig(**{k: d.get("database", {}).get(k, "") for k in ("host", "port", "name", "ssl", "username", "password")}),
        services=ServicesConfig(**{k: d.get("services", {}).get(k, "") for k in ("jenkins_url", "sonarqube_url", "vault_addr")}))

def _apply_env_overrides(c: AppConfig):
    e = os.getenv("AZURE_OPENAI_ENDPOINT", "").strip().strip("\"'")
    if e: c.azure.endpoint = e.rstrip("/")
    d = os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip().strip("\"'")
    if d: c.azure.deployment = d
    v = os.getenv("AZURE_OPENAI_API_VERSION", "").strip().strip("\"'")
    if v: c.azure.api_version = v
    m = os.getenv("SDLC_USE_MOCK", "").strip().strip("\"'")
    if m: c.features.use_mock = m == "true"

async def _apply_secrets(c: AppConfig, prov: SecretProvider):
    k = await prov.get_secret("AZURE_OPENAI_API_KEY")
    if k: c.azure.api_key = k
    u = await prov.get_secret("DB_USERNAME")
    if u: c.database.username = u
    p = await prov.get_secret("DB_PASSWORD")
    if p: c.database.password = p

def _set_nested(d: dict, path: str, val):
    parts = path.split(".")
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict): return
        cur = cur[p]
    if parts[-1] in cur: cur[parts[-1]] = val
