from __future__ import annotations

from urllib.parse import urlparse

import config


DEFAULT_BASE_URLS = {
    "openrouter": config.OPENROUTER_BASE_URL,
    "nvidia": config.NVIDIA_BASE_URL,
}

ALLOWED_PROVIDER_HOSTS = {
    "openrouter": {"openrouter.ai"},
    "nvidia": {"integrate.api.nvidia.com"},
}


def validate_provider_base_url(provider: str, value: str | None = None) -> str:
    provider = str(provider or "").strip().lower()
    if provider not in DEFAULT_BASE_URLS:
        raise ValueError(f"No OpenAI-compatible base URL is defined for provider: {provider}")
    endpoint = str(value or DEFAULT_BASE_URLS[provider]).strip().rstrip("/")
    parsed = urlparse(endpoint)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or hostname not in ALLOWED_PROVIDER_HOSTS[provider]:
        allowed = ", ".join(sorted(ALLOWED_PROVIDER_HOSTS[provider]))
        raise ValueError(f"{provider} base URL must use HTTPS on the official provider host: {allowed}")
    return endpoint
