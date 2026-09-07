from __future__ import annotations

import json
import queue
import re
import threading
import time
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.models.codex_sdk_adapter import CodexSdkModelAdapter
from app.services.codex_runtime import authenticated_codex_client, refresh_and_persist
from app.services.codex_vault import authenticate_user, save_codex_home
from app.services.serverless_build_service import ServerlessBuildService, collect_workspace_files
from app.services.template_storage import TemplateStorageError, resolve_template_seed
from app.tools.common import redact_secret

router = APIRouter(prefix="/api/agent", tags=["serverless-agent"])

# Vercel documents a finite request/response body budget. Keep the terminal
# SSE event below that budget with room for progress events and JSON escaping.
MAX_FINAL_SSE_EVENT_BYTES = 3_500_000




class ExistingFile(BaseModel):
    name: str = Field(min_length=1, max_length=260)
    content: str = Field(default="", max_length=600000)
    language: str | None = Field(default=None, max_length=40)

class BuildRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=30000)
    project_name: str = Field(default="Nexora Agent Project", max_length=180)
    provider: Literal["nvidia", "openrouter", "codex"] = "openrouter"
    model_id: str = Field(min_length=1, max_length=220)
    api_key: str = Field(default="", max_length=2048)
    base_url: str | None = Field(default=None, max_length=300)
    enable_thinking: bool = True
    reasoning_effort: Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"] | None = None
    existing_files: list[ExistingFile] = Field(default_factory=list, max_length=24)
    template_id: str | None = Field(default=None, max_length=80)
    template_version: str | None = Field(default=None, max_length=32)


def _bearer(authorization: str | None) -> str:
    value = (authorization or "").strip()
    return value[7:].strip() if value.lower().startswith("bearer ") else ""


def _public_state(state, *, final: bool = False) -> dict[str, Any]:
    """Return only UI-relevant state, never the full controller history.

    Re-streaming the entire AgentState on every update can duplicate tool and
    diagnostic history until a Vercel response hits its body limit. The browser
    only needs counters, plan state, verification, and the most recent trace.
    """
    trace_limit = 30 if final else 5
    plan = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in (state.plan or [])]
    trace = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in (state.trace or [])[-trace_limit:]]
    return {
        "run_id": state.run_id,
        "project_id": state.project_id,
        "phase": state.phase,
        "status": state.status,
        "current_step_id": state.current_step_id,
        "plan": plan,
        "iteration_count": state.iteration_count,
        "token_budget_used": state.token_budget_used,
        "reasoning_tokens_used": state.reasoning_tokens_used,
        "last_completion_tokens_est": state.last_completion_tokens_est,
        "context_compaction_count": state.context_compaction_count,
        "self_repair_count": state.self_repair_count,
        "model_provider": state.model_provider,
        "model_id": state.model_id,
        "reasoning_effort": state.reasoning_effort,
        "changes": list(state.change_history[-16:]),
        "final_verification": state.final_verification if final or state.status in {"completed", "failed", "cancelled"} else {},
        "trace": trace,
        "started_at": state.started_at,
        "finished_at": state.finished_at,
        "preview_url": None,
    }


def _event(name: str, payload: dict[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _partial_file_line_counts(streamed_json: str) -> list[dict[str, Any]]:
    """Extract conservative per-file line estimates from an incomplete JSON stream."""
    if not streamed_json:
        return []
    pattern = re.compile(r'"(?:path|name)"\s*:\s*"([^"\\]+)"\s*,\s*"content"\s*:\s*"', re.I)
    files: list[dict[str, Any]] = []
    for match in pattern.finditer(streamed_json):
        name = match.group(1).strip()
        if not name:
            continue
        start = match.end()
        i = start
        escaped = False
        while i < len(streamed_json):
            ch = streamed_json[i]
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                break
            i += 1
        fragment = streamed_json[start:i]
        # JSON source strings encode physical newlines as \n. Counting those
        # provides a stable live line estimate without needing complete JSON.
        lines = max(1, fragment.count("\\n") + fragment.count("\n") + 1)
        files.append({"name": name, "lines": lines, "bytes": len(fragment.encode("utf-8", errors="ignore"))})
    return files[:24]


@router.post("/build")
def build(payload: BuildRequest, authorization: str | None = Header(default=None)):
    if payload.provider in {"openrouter", "nvidia"} and not payload.api_key.strip():
        raise HTTPException(status_code=400, detail=f"{payload.provider} API key is required.")

    access_token = _bearer(authorization)
    codex_user = None
    if payload.provider == "codex":
        try:
            codex_user = authenticate_user(access_token)
        except Exception as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    template_info: dict[str, Any] | None = None
    template_seed_files: list[dict[str, str]] = []
    if payload.template_id:
        if not access_token:
            raise HTTPException(status_code=401, detail="Sign in to Nexora before using a stored template.")
        try:
            template_info, template_seed_files, _template_user = resolve_template_seed(
                template_id=payload.template_id,
                version=payload.template_version,
                access_token=access_token,
            )
        except TemplateStorageError as exc:
            message = str(exc)
            status = 403 if "paid Nexora plan" in message else 503
            raise HTTPException(status_code=status, detail=message) from exc
        except Exception as exc:
            message = str(exc) or "Could not authorize the selected template."
            status = 401 if any(word in message.lower() for word in ("session", "sign in", "expired", "authorized")) else 503
            raise HTTPException(status_code=status, detail=message) from exc

    existing_by_name: dict[str, dict[str, Any]] = {
        str(item.get("name") or ""): item for item in template_seed_files if str(item.get("name") or "").strip()
    }
    for item in payload.existing_files:
        dumped = item.model_dump()
        existing_by_name[str(dumped.get("name") or "")] = dumped
    build_existing_files = list(existing_by_name.values())[:24]

    build_prompt = payload.prompt
    if template_info:
        build_prompt = (
            "NEXORA SUPABASE TEMPLATE STARTER\n"
            f"Template: {template_info.get('name')}\n"
            f"Template ID: {template_info.get('template_id')}\n"
            f"Version: {template_info.get('version')}\n"
            f"Category: {template_info.get('category')}\n"
            "The workspace has been seeded with the authenticated template source files from private Supabase Storage. "
            "Use those files as the real starting implementation: preserve the template's strongest structure, responsive behavior, "
            "visual hierarchy, and interactions while adapting content and details to the user's request. Do not replace it with a generic unrelated starter.\n\n"
            f"USER REQUEST\n{payload.prompt}"
        )

    events: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue()
    done = threading.Event()
    state_box: dict[str, Any] = {}
    last_file_signature: list[tuple[str, int, int]] = []
    lock = threading.Lock()
    model_stream_count = 0
    last_model_emit = 0.0
    last_model_signature: tuple[tuple[str, int], ...] = ()

    service = ServerlessBuildService()
    selected_effort = (payload.reasoning_effort or "").strip().lower() or None
    if not payload.enable_thinking:
        selected_effort = "none"

    def on_update(state) -> None:
        nonlocal last_file_signature
        state_box["state"] = state
        files = collect_workspace_files(state.workspace_path, include_content=False)
        signature = [(f["name"], int(f.get("bytes", 0)), int(f.get("lines", 0))) for f in files]
        with lock:
            changed = signature != last_file_signature
            if changed:
                last_file_signature = signature
        events.put(("progress", {
            "run": _public_state(state, final=False),
            "files": files if changed else None,
        }))


    def on_model_stream(event: dict[str, Any]) -> None:
        nonlocal model_stream_count, last_model_emit, last_model_signature
        phase = str(event.get("phase") or "")
        if phase not in {"ACT", "REPAIR"}:
            return
        full_text = str(event.get("full_text") or "")
        model_stream_count += 1
        files = _partial_file_line_counts(full_text)
        signature = tuple((str(item.get("name") or ""), int(item.get("lines") or 0)) for item in files)
        now = time.monotonic()
        if signature == last_model_signature and (now - last_model_emit) < 0.12 and model_stream_count % 10:
            return
        last_model_signature = signature
        last_model_emit = now
        events.put(("model_stream", {
            "phase": phase.lower(),
            "token_events": model_stream_count,
            "characters": len(full_text),
            "files": files,
        }))

    def run_with_codex():
        assert codex_user is not None
        with authenticated_codex_client(codex_user.id, codex_user.access_token) as (client, home, row, work):
            adapter = CodexSdkModelAdapter(
                client,
                model_id=payload.model_id,
                reasoning_effort=selected_effort,
                cwd=work,
            )
            state = service.run(
                prompt=build_prompt,
                project_name=payload.project_name,
                provider="codex",
                model_id=payload.model_id,
                api_key="",
                enable_thinking=payload.enable_thinking,
                reasoning_effort=selected_effort,
                adapter=adapter,
                existing_files=build_existing_files,
                on_update=on_update,
                on_model_stream=on_model_stream,
            )
            # Codex may refresh OAuth tokens during a long build. Persist the
            # latest file-backed cache before the Vercel invocation exits.
            try:
                refresh_and_persist(codex_user.id, codex_user.access_token, client, home)
            except Exception:
                try:
                    save_codex_home(
                        codex_user.id,
                        codex_user.access_token,
                        home,
                        account_email=(row or {}).get("account_email"),
                        plan_type=(row or {}).get("plan_type"),
                        models=(row or {}).get("model_snapshot") if isinstance((row or {}).get("model_snapshot"), list) else [],
                    )
                except Exception:
                    pass
            return state

    def worker() -> None:
        state = None
        try:
            if payload.provider == "codex":
                state = run_with_codex()
            else:
                state = service.run(
                    prompt=build_prompt,
                    project_name=payload.project_name,
                    provider=payload.provider,
                    model_id=payload.model_id,
                    api_key=payload.api_key,
                    model_base_url=payload.base_url,
                    enable_thinking=payload.enable_thinking,
                    reasoning_effort=selected_effort,
                    existing_files=build_existing_files,
                    on_update=on_update,
                    on_model_stream=on_model_stream,
                )
            files = collect_workspace_files(state.workspace_path, include_content=True)
            event_name = "complete" if state.status == "completed" else "failed"
            terminal_payload = {
                "run": _public_state(state, final=True),
                "files": files,
                "template": template_info,
            }
            encoded_size = len(_event(event_name, terminal_payload).encode("utf-8"))
            if encoded_size > MAX_FINAL_SSE_EVENT_BYTES:
                events.put(("failed", {
                    "error": (
                        "The generated project exceeded Nexora's Vercel-safe streamed response budget. "
                        "Ask the agent to keep generated source/assets smaller or reference large media by URL."
                    ),
                    "run": _public_state(state, final=True),
                    "files": collect_workspace_files(state.workspace_path, include_content=False),
                    "payload_bytes": encoded_size,
                }))
            else:
                events.put((event_name, terminal_payload))
        except Exception as exc:
            events.put(("failed", {
                "error": redact_secret(str(exc), payload.api_key),
                "run": _public_state(state, final=True) if state is not None else None,
                # Failure payloads remain metadata-only to avoid turning a
                # provider/controller exception into a Vercel response-size error.
                "files": collect_workspace_files(state.workspace_path, include_content=False) if state is not None else [],
            }))
        finally:
            done.set()

    thread = threading.Thread(target=worker, name="nexora-vercel-agent", daemon=True)
    thread.start()

    def stream():
        # Immediate bytes are important for long AI calls and make UI status
        # visible before the first provider response arrives.
        yield _event("connected", {
            "ok": True,
            "mode": "streamed-agent",
            "template": template_info,
        })
        try:
            while True:
                try:
                    name, item = events.get(timeout=8)
                    yield _event(name, item)
                    if name in {"complete", "failed"}:
                        break
                except queue.Empty:
                    if done.is_set() and events.empty():
                        break
                    yield ": keepalive\n\n"
        finally:
            state = state_box.get("state")
            if state is not None and not done.is_set():
                # Client disconnected/aborted. The controller observes this at
                # its next bounded transition and stops instead of continuing a
                # detached serverless job.
                state.cancel_requested = True
            if state is not None and done.is_set():
                service.cleanup(state)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
