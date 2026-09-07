from __future__ import annotations

import json
import queue
import threading
import time
import urllib.parse
from tempfile import TemporaryDirectory
from typing import Any

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.models.codex_sdk_adapter import CodexSdkModelAdapter
from app.services.codex_runtime import (
    account_summary,
    authenticated_codex_client,
    models_summary,
    refresh_and_persist,
    model_dump,
)
from app.services.codex_vault import (
    CodexVaultError,
    authenticate_user,
    codex_env,
    codex_vault_configured,
    delete_vault_row,
    isolated_codex_home,
    public_status,
    read_vault_row,
    save_codex_home,
)

router = APIRouter(prefix="/api/codex", tags=["codex-chatgpt"])

OFFICIAL_CODEX_DEVICE_URL = "https://auth.openai.com/codex/device"


def _safe_openai_verification_url(value: Any) -> str:
    """Return only the official OpenAI Codex device authorization URL.

    A relative URL would be resolved against the Nexora/Vercel domain and can
    produce Vercel NOT_FOUND pages. The Codex SDK currently returns the
    official absolute URL, but this guard makes the browser behavior safe if a
    malformed/relative value is ever returned by a runtime or proxy.
    """
    raw = str(value or "").strip()
    try:
        parsed = urllib.parse.urlparse(raw)
    except Exception:
        return OFFICIAL_CODEX_DEVICE_URL
    if (
        parsed.scheme.lower() == "https"
        and (parsed.hostname or "").lower() == "auth.openai.com"
        and parsed.path.rstrip("/") == "/codex/device"
    ):
        return OFFICIAL_CODEX_DEVICE_URL
    return OFFICIAL_CODEX_DEVICE_URL


def _login_completed_error(value: Any) -> str | None:
    """Return an SDK login error only when completion explicitly failed."""
    data = model_dump(value)
    if isinstance(data, dict):
        # Pydantic RootModel values may be nested under ``root``.
        root = data.get("root")
        if isinstance(root, dict):
            data = root
        if data.get("success") is False:
            return str(data.get("error") or "OpenAI did not authorize the ChatGPT Codex login.")
    return None


def _bearer(authorization: str | None) -> str:
    value = (authorization or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return ""


def _event(name: str, payload: dict[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _error_response(exc: Exception, status: int = 400):
    return JSONResponse(status_code=status, content={"ok": False, "error": str(exc)})


class TestCodexRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=220)
    reasoning_effort: str | None = Field(default=None, max_length=40)


@router.get("/status")
def status(authorization: str | None = Header(default=None)):
    try:
        if not codex_vault_configured():
            return {
                "ok": True,
                "configured": False,
                "connected": False,
                "setup_required": True,
                "message": "Set NEXORA_CODEX_VAULT_KEY on Vercel and run config/nexora_production_migration.sql in Supabase.",
            }
        user = authenticate_user(_bearer(authorization))
        row = read_vault_row(user.id, user.access_token)
        return {"ok": True, "configured": True, **public_status(row)}
    except Exception as exc:
        return _error_response(exc, 401 if "session" in str(exc).lower() else 400)


@router.post("/login")
def login(authorization: str | None = Header(default=None)):
    try:
        user = authenticate_user(_bearer(authorization))
    except Exception as exc:
        return _error_response(exc, 401)
    if not codex_vault_configured():
        return _error_response(CodexVaultError("Codex vault is not configured. Configure the required Codex vault environment variables in the deployment environment."), 503)

    events: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
    done = threading.Event()
    cancel_box: dict[str, Any] = {}

    def worker() -> None:
        try:
            try:
                from openai_codex import Codex, CodexConfig
            except ImportError as exc:
                raise CodexVaultError("OpenAI Codex SDK is missing from the Vercel deployment.") from exc

            # A fresh login replaces any previous credential for this user only.
            # CODEX_HOME holds credentials; model/SDK working state uses a
            # different temporary directory so auth.json is never the cwd.
            with isolated_codex_home(user.id, user.access_token, restore=False) as (home, _):
                with TemporaryDirectory(prefix="nexora-codex-login-work-") as work:
                    config = CodexConfig(
                        env=codex_env(home),
                        cwd=work,
                        config_overrides=('cli_auth_credentials_store="file"', 'forced_login_method="chatgpt"'),
                        client_name="nexora_vercel_login",
                        client_title="Nexora AI",
                    )
                    with Codex(config) as client:
                        handle = client.login_chatgpt_device_code()
                        cancel_box["handle"] = handle
                        verification_url = _safe_openai_verification_url(handle.verification_url)
                        events.put(("device_code", {
                            "verification_url": verification_url,
                            "verification_origin": "https://auth.openai.com",
                            "user_code": handle.user_code,
                            "expires_hint_seconds": 270,
                        }))
                        completed = handle.wait()
                        login_error = _login_completed_error(completed)
                        if login_error:
                            raise CodexVaultError(login_error)
                        account = account_summary(client.account(refresh_token=True))
                        models = models_summary(client.models(include_hidden=False))
                        save_codex_home(
                            user.id,
                            user.access_token,
                            home,
                            account_email=account.get("email"),
                            plan_type=account.get("plan_type"),
                            models=models,
                        )
                        events.put(("complete", {
                            "ok": True,
                            "connected": True,
                            "account_email": account.get("email"),
                            "plan_type": account.get("plan_type"),
                            "models": models,
                        }))
        except Exception as exc:
            events.put(("failed", {"ok": False, "error": str(exc)}))
        finally:
            done.set()

    thread = threading.Thread(target=worker, name="nexora-codex-login", daemon=True)
    thread.start()

    def stream():
        yield _event("connected", {"ok": True, "mode": "chatgpt-device-code", "provider": "codex"})
        started = time.monotonic()
        sent_terminal = False
        try:
            while True:
                if time.monotonic() - started > 270 and not done.is_set():
                    try:
                        handle = cancel_box.get("handle")
                        if handle is not None:
                            handle.cancel()
                    except Exception:
                        pass
                    yield _event("failed", {"ok": False, "error": "ChatGPT sign-in timed out before the Vercel request deadline. Start Connect ChatGPT again and complete the OpenAI device authorization promptly."})
                    sent_terminal = True
                    break
                try:
                    name, payload = events.get(timeout=5)
                    yield _event(name, payload)
                    if name in {"complete", "failed"}:
                        sent_terminal = True
                        break
                except queue.Empty:
                    if done.is_set() and events.empty():
                        break
                    yield ": keepalive\n\n"
        finally:
            if not sent_terminal and not done.is_set():
                try:
                    handle = cancel_box.get("handle")
                    if handle is not None:
                        handle.cancel()
                except Exception:
                    pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    try:
        user = authenticate_user(_bearer(authorization))
        delete_vault_row(user.id, user.access_token)
        return {"ok": True, "connected": False}
    except Exception as exc:
        return _error_response(exc, 400)


@router.get("/models")
def models(authorization: str | None = Header(default=None)):
    try:
        user = authenticate_user(_bearer(authorization))
        with authenticated_codex_client(user.id, user.access_token) as (client, home, _, work):
            account, available = refresh_and_persist(user.id, user.access_token, client, home)
        return {
            "ok": True,
            "models": available,
            "account_email": account.get("email"),
            "plan_type": account.get("plan_type"),
        }
    except Exception as exc:
        return _error_response(exc, 400)


@router.post("/test")
def test(payload: TestCodexRequest, authorization: str | None = Header(default=None)):
    try:
        user = authenticate_user(_bearer(authorization))
        with authenticated_codex_client(user.id, user.access_token) as (client, home, _, work):
            adapter = CodexSdkModelAdapter(client, model_id=payload.model_id, reasoning_effort=payload.reasoning_effort, cwd=work)
            result = adapter.model_generate({
                "messages": [{"role": "user", "content": "Reply with exactly: NEXORA_CODEX_READY"}],
                "max_tokens": 32,
            })
            if result.get("error"):
                raise CodexVaultError(str(result["error"]))
            account, available = refresh_and_persist(user.id, user.access_token, client, home)
        return {
            "ok": "NEXORA_CODEX_READY" in str(result.get("content") or ""),
            "content": str(result.get("content") or "")[:300],
            "models": available,
            "account_email": account.get("email"),
            "plan_type": account.get("plan_type"),
        }
    except Exception as exc:
        return _error_response(exc, 400)
