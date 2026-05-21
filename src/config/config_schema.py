"""Config Schema — replaces config-schema.ts."""
from __future__ import annotations
from dataclasses import dataclass, field
from ..core.types import PolicyViolation

SENSITIVE_FIELDS = ["azure.apiKey", "database.password", "database.username"]

@dataclass
class AzureConfig:
    endpoint: str = ""; deployment: str = "gpt-4.1"; api_key: str = ""; api_version: str = "2024-12-01-preview"

@dataclass
class FeaturesConfig:
    use_mock: bool = False; enable_code_scanning: bool = True; enable_cicd_integration: bool = True

@dataclass
class LoggingConfig:
    level: str = "info"; format: str = "json"

@dataclass
class DatabaseConfig:
    host: str = "localhost"; port: int = 5432; name: str = "nexus"; ssl: bool = False
    username: str = "nexus"; password: str = ""

@dataclass
class ServicesConfig:
    jenkins_url: str = ""; sonarqube_url: str = ""; vault_addr: str = "http://127.0.0.1:8200"

@dataclass
class AppConfig:
    app_env: str = "dev"; azure: AzureConfig = field(default_factory=AzureConfig)
    features: FeaturesConfig = field(default_factory=FeaturesConfig); logging: LoggingConfig = field(default_factory=LoggingConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig); services: ServicesConfig = field(default_factory=ServicesConfig)

def get_default_config(env: str = "dev") -> AppConfig:
    return AppConfig(app_env=env)

def validate_config(config: AppConfig) -> list[PolicyViolation]:
    v = []
    if not config.azure.endpoint: v.append(PolicyViolation("CFG-001", "azure.endpoint is not set.", "warning"))
    if not config.azure.api_key: v.append(PolicyViolation("CFG-002", "azure.apiKey is not set.", "warning"))
    return v
