from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "agent_runtime"
os.environ.setdefault("NEXORA_SERVERLESS_MODE", "1")
os.environ.setdefault("MODEL_TIMEOUT_SECONDS", "70")
os.environ.setdefault("MODEL_RETRIES", "1")
if str(RUNTIME) not in sys.path:
    sys.path.insert(0, str(RUNTIME))

from fastapi import FastAPI  # noqa: E402
from app.api.routes_provider_models import router as models_router  # noqa: E402
from app.api.routes_nexora import router as nexora_router  # noqa: E402
from app.api.routes_serverless import router as serverless_router  # noqa: E402
from app.api.routes_codex import router as codex_router  # noqa: E402
from app.services.codex_vault import codex_vault_configured  # noqa: E402

app = FastAPI(
    title="Nexora AI Vercel Agent Runtime",
    version="4.1.0",
    description="Request-bound streamed agentic website generation with OpenRouter, NVIDIA NIM, and ChatGPT-authenticated Codex.",
)
app.include_router(models_router)
app.include_router(nexora_router)
app.include_router(serverless_router)
app.include_router(codex_router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": "Nexora AI Vercel Agent Runtime",
        "version": "4.1.0",
        "serverless": True,
        "storage": "ephemeral-/tmp-per-build",
        "agent_endpoint": "/api/agent/build",
        "providers": ["openrouter", "nvidia", "codex"],
        "codex_auth": "ChatGPT device-code + encrypted Supabase vault",
        "codex_vault_configured": codex_vault_configured(),
    }


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response
