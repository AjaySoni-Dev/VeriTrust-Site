from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "agent_runtime"

# Vercel-safe defaults. Every agent build and Codex login is request-bound;
# persistent user auth is stored only in the encrypted Supabase vault.
os.environ.setdefault("NEXORA_SERVERLESS_MODE", "1")
# Supabase anon credentials are intentionally public client credentials. Vercel env values override these defaults.
os.environ.setdefault("SUPABASE_URL", "https://swvykvhyiwbkymdsjifr.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dnlrdmh5aXdia3ltZHNqaWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTgzOTIsImV4cCI6MjA5NTE5NDM5Mn0.HP5FynJUtbvlc32L5gzOYYe8ZnM94CoiE_03qmVt8EY")
os.environ.setdefault("MODEL_TIMEOUT_SECONDS", "70")
os.environ.setdefault("MODEL_RETRIES", "1")
if str(RUNTIME) not in sys.path:
    sys.path.insert(0, str(RUNTIME))

from app.api.routes_provider_models import router as models_router  # noqa: E402
from app.api.routes_nexora import router as nexora_router  # noqa: E402
from app.api.routes_serverless import router as serverless_router  # noqa: E402
from app.api.routes_codex import router as codex_router  # noqa: E402
from app.services.codex_vault import codex_vault_configured  # noqa: E402
from app.services.template_storage import (  # noqa: E402
    catalog_path as template_catalog_path,
    load_catalog as load_template_catalog,
    package_bucket as template_package_bucket,
    preview_bucket as template_preview_bucket,
    template_storage_configured,
)

app = FastAPI(
    title="Nexora AI Vercel Agent Runtime",
    version="5.0.0",
    description=(
        "Vercel-native streamed agentic website generation with OpenRouter, "
        "NVIDIA NIM, and ChatGPT-authenticated OpenAI Codex."
    ),
)
app.include_router(models_router)
app.include_router(nexora_router)
app.include_router(serverless_router)
app.include_router(codex_router)


@app.get("/api")
def api_root():
    return {
        "ok": True,
        "app": "Nexora AI Vercel Agent Runtime",
        "version": "5.0.0",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": "Nexora AI Vercel Agent Runtime",
        "version": "5.0.0",
        "serverless": True,
        "vercel_entrypoint": "server.py",
        "storage": "ephemeral-/tmp-per-request",
        "agent_endpoint": "/api/agent/build",
        "providers": ["openrouter", "nvidia", "codex"],
        "codex_auth": "OpenAI ChatGPT device-code + encrypted Supabase vault",
        "codex_vault_configured": codex_vault_configured(),
        "template_storage": {
            "configured": template_storage_configured(),
            "preview_bucket": template_preview_bucket(),
            "package_bucket": template_package_bucket(),
            "catalog_path": template_catalog_path(),
        },
    }


@app.get("/api/templates/health")
def template_storage_health():
    result = {
        "ok": True,
        "configured": template_storage_configured(),
        "preview_bucket": template_preview_bucket(),
        "package_bucket": template_package_bucket(),
        "catalog_path": template_catalog_path(),
        "catalog_count": None,
        "catalog_error": None,
    }
    try:
        catalog = load_template_catalog(force=True)
        templates = catalog.get("templates") if isinstance(catalog, dict) else None
        result["catalog_count"] = len(templates) if isinstance(templates, list) else 0
    except Exception as exc:
        result["ok"] = False
        result["catalog_error"] = str(exc)
    return result


@app.get("/api/codex/route-check")
def codex_route_check():
    """Unauthenticated routing diagnostic used by the browser before login."""
    return {
        "ok": True,
        "route": "/api/codex/login",
        "entrypoint": "server.py",
        "verification_origin": "https://auth.openai.com",
    }


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
    if request.url.path.startswith("/api/") or request.url.path == "/api":
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(404)
async def api_not_found(request: Request, _exc):
    if request.url.path.startswith("/api/") or request.url.path == "/api":
        return JSONResponse(
            status_code=404,
            content={
                "ok": False,
                "error": "Nexora API route not found",
                "path": request.url.path,
                "hint": "Redeploy this ZIP from its project root with Vercel Framework Preset set to FastAPI.",
            },
        )
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
