from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.codex_app_server import codex_client
from app.schemas.agent import ModelTestRequest, ProviderModelsRequest
from app.services.run_service import service

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/providers")
def providers():
    return service.providers_health()


@router.post("/test")
def test_model(payload: ModelTestRequest):
    return service.test_model(
        provider=payload.provider,
        model_id=payload.model_id,
        reasoning_effort=payload.reasoning_effort,
        api_key=payload.api_key,
        base_url=payload.base_url,
    )




@router.post("/discover")
def discover_models(payload: ProviderModelsRequest):
    return service.discover_models(
        provider=payload.provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
    )


@router.post("/codex/install", status_code=status.HTTP_200_OK)
def install_codex_cli():
    # Explicit user-triggered action only. start.py never installs a global npm
    # package without the user clicking this control.
    result = codex_client.install_cli()
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error") or "Codex CLI installation failed")
    codex_client.stop()
    return result


@router.get("/codex/status")
def codex_status():
    return service.codex_health()




@router.post("/codex/connect-web")
def codex_connect_web():
    """Start the browser-based ChatGPT connection without a localhost callback.

    Device-code auth is intentionally the canonical website flow because the
    frontend owns the browser ceremony and the backend App Server can live on a
    different machine.
    """
    try:
        return codex_client.login_device_code()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/codex/login/browser")
def codex_login_browser():
    try:
        return codex_client.login_browser()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/codex/login/device")
def codex_login_device():
    try:
        return codex_client.login_device_code()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/codex/login/{login_id}")
def codex_login_status(login_id: str):
    try:
        return codex_client.login_status(login_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/codex/login/{login_id}/cancel")
def codex_login_cancel(login_id: str):
    try:
        return codex_client.cancel_login(login_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/codex/logout")
def codex_logout():
    try:
        return codex_client.logout()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/codex/list")
def codex_models(force: bool = False):
    return service.codex_models(force=force)


@router.get("/codex/rate-limits")
def codex_rate_limits():
    try:
        return codex_client.rate_limits()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/codex/usage")
def codex_usage():
    try:
        return codex_client.account_usage()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
