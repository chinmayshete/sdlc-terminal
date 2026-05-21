"""Vault Secret Provider — replaces vault.ts."""
from __future__ import annotations
from ..config.env import env
import httpx

class SecretProvider:
    async def get_secret(self, key: str) -> str | None: raise NotImplementedError

class EnvSecretProvider(SecretProvider):
    async def get_secret(self, key: str) -> str | None:
        import os; return os.getenv(key)

class VaultSecretProvider(SecretProvider):
    def __init__(self):
        self._addr = env.vault_addr; self._token = env.vault_token; self._path = env.vault_secret_path; self._cache: dict[str, str] = {}

    async def get_secret(self, key: str) -> str | None:
        if key in self._cache: return self._cache[key]
        if not self._token: return None
        try:
            async with httpx.AsyncClient(verify=not env.skip_ssl_verify, timeout=10) as c:
                r = await c.get(f"{self._addr}/v1/{self._path}", headers={"X-Vault-Token": self._token})
            if r.status_code != 200: return None
            data = r.json().get("data", {}).get("data", {})
            self._cache.update(data)
            return data.get(key)
        except Exception: return None

def create_secret_provider() -> SecretProvider:
    return VaultSecretProvider() if env.vault_enabled else EnvSecretProvider()
