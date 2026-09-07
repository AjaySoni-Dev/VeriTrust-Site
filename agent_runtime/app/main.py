from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import config
from app.api.routes_projects import router as projects_router
from app.api.routes_runs import router as runs_router
from app.api.routes_models import router as models_router
from app.api.routes_nexora import router as nexora_router
from app.services.run_service import service

app = FastAPI(
    title="Multi-Provider Agentic Website Builder",
    version="2.0.0",
    description="Purpose-built bounded coding-agent runtime for HTML/CSS/Vanilla JavaScript websites.",
)

STATIC_DIR = (config.ROOT_DIR / "app" / "static").resolve()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(projects_router)
app.include_router(runs_router)
app.include_router(models_router)
app.include_router(nexora_router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": "Multi-Provider Agentic Website Builder",
        **service.providers_health(),
        "workspace_root": str(config.WORKSPACES_DIR),
    }


@app.get("/preview/{run_id}")
@app.get("/preview/{run_id}/")
def preview_root(run_id: str):
    return _preview_file(run_id, "index.html")


@app.get("/preview/{run_id}/{relative_path:path}")
def preview_file(run_id: str, relative_path: str):
    return _preview_file(run_id, relative_path)


def _preview_file(run_id: str, relative_path: str):
    try:
        path = service.manager.resolve_preview_path(run_id, relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    media_type, _ = mimetypes.guess_type(path.name)
    response = FileResponse(path, media_type=media_type or "application/octet-stream")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    # Generated pages are isolated in an iframe in the product UI. This header
    # prevents MIME guessing without blocking their local CSS/JS.
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


NEXORA_ROOT = config.ROOT_DIR.parent.resolve()


def _frontend_file(relative_path: str) -> FileResponse:
    path = (NEXORA_ROOT / relative_path).resolve()
    try:
        path.relative_to(NEXORA_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Frontend path is outside the allowed root") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Frontend file not found")
    return FileResponse(path)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response


@app.get("/")
def nexora_root():
    return _frontend_file("index.html")


@app.get("/chat")
@app.get("/chat/")
@app.get("/app")
@app.get("/app/")
def nexora_chat_alias():
    return RedirectResponse(url="/pages/chat/index.html", status_code=307)


@app.get("/editor")
@app.get("/editor/")
def nexora_editor_alias():
    return RedirectResponse(url="/pages/editor/index.html", status_code=307)


@app.get("/template")
@app.get("/template/")
@app.get("/templates")
@app.get("/templates/")
def nexora_template_alias():
    return RedirectResponse(url="/pages/template/template.html", status_code=307)


@app.get("/login")
@app.get("/login/")
@app.get("/auth/login")
@app.get("/auth/login/")
def nexora_login_alias():
    return RedirectResponse(url="/pages/login/index.html", status_code=307)


@app.get("/signup")
@app.get("/signup/")
@app.get("/auth/signup")
@app.get("/auth/signup/")
def nexora_signup_alias():
    # Preserve the repository's current Vercel routing behavior.
    return RedirectResponse(url="/pages/login/index.html", status_code=307)


# Allowlist only browser-facing static trees. Never mount NEXORA_ROOT itself: it
# also contains agent_runtime/, workspaces and runtime auth/state.
for route, directory, name in [
    ("/pages", NEXORA_ROOT / "pages", "nexora-pages"),
    ("/pages_new", NEXORA_ROOT / "pages_new", "nexora-pages-new"),
    ("/config", NEXORA_ROOT / "config", "nexora-browser-config"),
]:
    if directory.is_dir():
        app.mount(route, StaticFiles(directory=directory, html=True), name=name)
