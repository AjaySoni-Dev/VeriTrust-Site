from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Any

import config
from app.agent.controller import AgentController, init_agent_state
from app.agent.state import save_state
from app.models.base import ModelAdapter
from app.models.codex_app_server import CodexModelAdapter, codex_client
from app.models.nim_adapter import NIMModelAdapter
from app.models.openrouter_adapter import OpenRouterModelAdapter
from app.models.provider_urls import validate_provider_base_url
from app.schemas.agent import AgentState
from app.tools.common import redact_secret
from app.workspace.manager import WorkspaceManager


class RunService:
    """Own project/run lifecycle and model-provider selection.

    Model providers never receive filesystem or shell capabilities from this
    service. They only return model text to the deterministic AgentController,
    which remains the single owner of mutations, verification and retries.
    """

    def __init__(self, manager: WorkspaceManager | None = None) -> None:
        self.manager = manager or WorkspaceManager()
        self._states: dict[str, AgentState] = {}
        self._threads: dict[str, threading.Thread] = {}
        self._active_project_runs: dict[str, str] = {}
        self._lock = threading.RLock()

    @staticmethod
    def new_run_id() -> str:
        return "run_" + uuid.uuid4().hex[:14]

    def create_project(self, name: str) -> dict[str, Any]:
        return self.manager.create_project(name)

    def list_projects(self) -> list[dict[str, Any]]:
        return self.manager.list_projects()

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        return self.manager.get_project(project_id)

    def _on_state_change(self, state: AgentState) -> None:
        with self._lock:
            self._states[state.run_id] = state

    # --------------------------- provider management ---------------------------
    @staticmethod
    def _normalize_provider(provider: str | None) -> str:
        value = (provider or config.DEFAULT_MODEL_PROVIDER or "nvidia").strip().lower()
        if value not in {"nvidia", "openrouter", "codex"}:
            raise ValueError(f"Unsupported model provider: {value}")
        return value

    @staticmethod
    def _effort_values(model: dict[str, Any]) -> list[str]:
        values: list[str] = []
        for item in model.get("supportedReasoningEfforts") or []:
            if isinstance(item, str):
                values.append(item)
            elif isinstance(item, dict):
                value = item.get("reasoningEffort") or item.get("effort")
                if value:
                    values.append(str(value))
        return values

    def _build_adapter(
        self,
        *,
        provider: str,
        model_id: str | None,
        reasoning_effort: str | None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> tuple[ModelAdapter, str, str | None]:
        provider = self._normalize_provider(provider)
        if provider == "nvidia":
            selected = (model_id or config.NVIDIA_MODEL_ID).strip()
            adapter = NIMModelAdapter(api_key=(api_key or None), base_url=validate_provider_base_url("nvidia", base_url), model_id=selected)
            if not adapter.configured:
                raise ValueError("NVIDIA API key is missing. Add it in Nexora Settings or set NVIDIA_API_KEY on the server.")
            effort = (reasoning_effort or "").strip() or None
            adapter.reasoning_effort = effort
            return adapter, selected, effort

        if provider == "openrouter":
            selected = (model_id or config.OPENROUTER_MODEL_ID).strip()
            adapter = OpenRouterModelAdapter(api_key=api_key, base_url=validate_provider_base_url("openrouter", base_url), model_id=selected)
            if not adapter.configured:
                raise ValueError("OpenRouter API key is missing. Add it in Nexora Settings.")
            effort = (reasoning_effort or "").strip() or None
            adapter.reasoning_effort = effort
            return adapter, selected, effort

        cli = codex_client.cli_status()
        if not cli.get("installed"):
            raise ValueError("OpenAI Codex CLI is not installed. Use 'Install Codex CLI' in the Model panel first.")
        try:
            account = codex_client.account_read(refresh=False)
        except Exception as exc:
            raise ValueError(f"Could not read Codex account: {exc}") from exc
        if not account.get("account"):
            raise ValueError("OpenAI Codex is not connected. Click 'Connect ChatGPT' before generating.")

        try:
            models = codex_client.model_list(force=False)
        except Exception as exc:
            raise ValueError(f"Could not load Codex models: {exc}") from exc
        if not models:
            raise ValueError("Codex returned no picker-visible models for this account.")

        default_model = next((m for m in models if m.get("isDefault")), models[0])
        selected = (model_id or default_model.get("model") or default_model.get("id") or config.CODEX_DEFAULT_MODEL).strip()
        selected_meta = next(
            (m for m in models if selected in {str(m.get("id") or ""), str(m.get("model") or "")}),
            None,
        )
        if selected_meta is None:
            raise ValueError("Selected Codex model is not available to the connected account. Refresh the model list.")

        effort_values = self._effort_values(selected_meta)
        default_effort = selected_meta.get("defaultReasoningEffort") or config.CODEX_DEFAULT_REASONING_EFFORT
        effort = (reasoning_effort or default_effort or "").strip() or None
        if effort_values and effort not in effort_values:
            raise ValueError(f"Reasoning effort '{effort}' is not supported by {selected}. Choose one of: {', '.join(effort_values)}")

        adapter = CodexModelAdapter(codex_client, model_id=selected, reasoning_effort=effort)
        return adapter, selected, effort

    def nvidia_health(self) -> dict[str, Any]:
        configured = bool(config.NVIDIA_API_KEY and config.NVIDIA_API_KEY != "PASTE_YOUR_NVIDIA_API_KEY_HERE")
        return {
            "provider": "nvidia",
            "configured": configured,
            "ready": configured,
            "base_url": config.NVIDIA_BASE_URL,
            "model_id": config.NVIDIA_MODEL_ID,
            "native_tool_calling": config.USE_NATIVE_TOOL_CALLING,
            "context_window_tokens": config.MODEL_CONTEXT_WINDOW_TOKENS,
            "soft_input_limit_tokens": config.MODEL_SOFT_INPUT_LIMIT_TOKENS,
            "max_output_tokens": config.MODEL_MAX_TOKENS,
            "thinking_enabled": config.ENABLE_THINKING,
            "streaming": config.MODEL_STREAM,
        }

    def openrouter_health(self) -> dict[str, Any]:
        return {
            "provider": "openrouter",
            "configured": False,
            "ready": False,
            "user_managed_key": True,
            "base_url": config.OPENROUTER_BASE_URL,
            "model_id": config.OPENROUTER_MODEL_ID,
            "note": "Browser-local key is supplied per request and is never persisted by the backend.",
        }

    def codex_health(self) -> dict[str, Any]:
        health = codex_client.health()
        account = health.get("account") or {}
        account_obj = account.get("account") or {}
        auth_mode = account.get("authMode") or account_obj.get("type") or health.get("account_update", {}).get("authMode")
        plan_type = account.get("planType") or account_obj.get("planType") or health.get("account_update", {}).get("planType")
        return {
            "provider": "codex",
            "configured": bool(health.get("cli", {}).get("available", health.get("cli", {}).get("installed"))),
            "ready": bool(health.get("authenticated")),
            "cli": health.get("cli"),
            "app_server_running": health.get("app_server_running"),
            "authenticated": bool(health.get("authenticated")),
            "chatgpt_managed": auth_mode == "chatgpt",
            "account": account_obj,
            "auth_mode": auth_mode,
            "plan_type": plan_type,
            "error": health.get("error"),
        }

    def providers_health(self) -> dict[str, Any]:
        return {
            "default_provider": config.DEFAULT_MODEL_PROVIDER,
            "providers": {
                "nvidia": self.nvidia_health(),
                "openrouter": self.openrouter_health(),
                "codex": self.codex_health(),
            },
        }

    def codex_models(self, *, force: bool = False) -> dict[str, Any]:
        health = self.codex_health()
        if not health.get("configured"):
            return {"ok": False, "models": [], "error": "Codex CLI is not installed", "health": health}
        if not health.get("authenticated"):
            return {"ok": False, "models": [], "error": "Codex is not connected to ChatGPT", "health": health}
        try:
            models = codex_client.model_list(force=force)
            return {"ok": True, "models": models, "error": None, "health": health}
        except Exception as exc:
            return {"ok": False, "models": [], "error": str(exc), "health": health}

    def discover_models(self, *, provider: str, api_key: str | None = None, base_url: str | None = None) -> dict[str, Any]:
        provider = self._normalize_provider(provider)
        if provider == "codex":
            return self.codex_models(force=True)
        key = (api_key or (config.NVIDIA_API_KEY if provider == "nvidia" else "")).strip()
        if provider == "nvidia" and (not key or key == "PASTE_YOUR_NVIDIA_API_KEY_HERE"):
            return {"ok": False, "models": [], "error": "NVIDIA API key is missing"}
        if provider == "openrouter" and not key:
            return {"ok": False, "models": [], "error": "OpenRouter API key is missing"}
        endpoint = str(base_url or (config.NVIDIA_BASE_URL if provider == "nvidia" else config.OPENROUTER_BASE_URL)).rstrip("/")
        try:
            endpoint = validate_provider_base_url(provider, base_url)
            from openai import OpenAI
            client = OpenAI(base_url=endpoint, api_key=key, timeout=30)
            page = client.models.list()
            models = []
            for item in getattr(page, "data", []) or []:
                raw = item.model_dump() if hasattr(item, "model_dump") else {"id": getattr(item, "id", "")}
                model_id = str(raw.get("id") or "").strip()
                if not model_id:
                    continue
                models.append({
                    "id": model_id,
                    "name": raw.get("name") or model_id,
                    "context_length": raw.get("context_length"),
                    "pricing": raw.get("pricing"),
                    "supported_parameters": raw.get("supported_parameters") or [],
                    "reasoning": raw.get("reasoning"),
                })
            return {"ok": True, "provider": provider, "models": models, "base_url": endpoint, "error": None}
        except Exception as exc:
            return {"ok": False, "provider": provider, "models": [], "base_url": endpoint, "error": redact_secret(str(exc), key)}

    def test_model(self, *, provider: str = "nvidia", model_id: str | None = None, reasoning_effort: str | None = None, api_key: str | None = None, base_url: str | None = None) -> dict[str, Any]:
        try:
            adapter, selected, effort = self._build_adapter(
                provider=provider,
                model_id=model_id,
                reasoning_effort=reasoning_effort,
                api_key=api_key,
                base_url=base_url,
            )
        except Exception as exc:
            return {"ok": False, "provider": provider, "model_id": model_id, "error": str(exc)}
        result = adapter.model_generate({
            "messages": [
                {"role": "system", "content": "Reply with exactly: MODEL_OK"},
                {"role": "user", "content": "Health check"},
            ],
            "temperature": 0,
            "max_tokens": 32,
            "model_id": selected,
            "reasoning_effort": effort,
        })
        return {
            "ok": not bool(result.get("error")),
            "provider": provider,
            "model_id": selected,
            "reasoning_effort": effort,
            "response": result.get("content"),
            "error": result.get("error"),
            "context": result.get("context") or {},
        }

    # ------------------------------- run lifecycle ------------------------------
    def start_run(
        self,
        *,
        project_id: str,
        prompt: str,
        inject_demo_bug: bool,
        base_url: str,
        provider: str = "nvidia",
        model_id: str | None = None,
        reasoning_effort: str | None = None,
        api_key: str | None = None,
        model_base_url: str | None = None,
        adapter: ModelAdapter | None = None,
    ) -> AgentState:
        project = self.manager.get_project(project_id)
        if not project:
            raise KeyError("Project not found")
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty")

        provider = self._normalize_provider(getattr(adapter, "provider", None) if adapter is not None else provider)
        if adapter is None:
            adapter, selected_model, selected_effort = self._build_adapter(
                provider=provider,
                model_id=model_id,
                reasoning_effort=reasoning_effort,
                api_key=api_key,
                base_url=model_base_url,
            )
        else:
            selected_model = model_id or getattr(adapter, "model_id", None) or (config.CODEX_DEFAULT_MODEL if provider == "codex" else (config.OPENROUTER_MODEL_ID if provider == "openrouter" else config.NVIDIA_MODEL_ID))
            selected_effort = reasoning_effort or getattr(adapter, "reasoning_effort", None)

        with self._lock:
            existing = self._active_project_runs.get(project_id)
            if existing:
                existing_state = self.get_run(existing)
                if existing_state and existing_state.status in {"queued", "working"}:
                    raise RuntimeError(f"Project already has active run: {existing}")
                self._active_project_runs.pop(project_id, None)

            run_id = self.new_run_id()
            paths = self.manager.create_run_workspace(project_id, run_id)
            state = init_agent_state({
                "run_id": run_id,
                "project_id": project_id,
                "workspace_root": str(paths["workspace"]),
                "run_root": str(paths["run_root"]),
                "user_request": prompt.strip(),
                "model_provider": provider,
                "model_id": selected_model,
                "reasoning_effort": selected_effort,
                "is_revision": bool(paths["is_revision"]),
                "inject_demo_bug": bool(inject_demo_bug),
            })
            self._states[run_id] = state
            self._active_project_runs[project_id] = run_id

            thread = threading.Thread(
                target=self._run_worker,
                name=f"agent-{run_id}",
                daemon=True,
                kwargs={
                    "state": state,
                    "checkpoint_root": Path(paths["checkpoint_root"]),
                    "base_url": base_url,
                    "adapter": adapter,
                },
            )
            self._threads[run_id] = thread
            thread.start()
            return state

    def _run_worker(
        self,
        *,
        state: AgentState,
        checkpoint_root: Path,
        base_url: str,
        adapter: ModelAdapter,
    ) -> None:
        success = False
        try:
            controller = AgentController(
                state=state,
                manager=self.manager,
                adapter=adapter,
                checkpoint_root=checkpoint_root,
                base_url=base_url,
                on_state_change=self._on_state_change,
            )
            controller.run_agent_loop()
            success = controller.state.status == "completed"
            self._on_state_change(controller.state)
        except Exception as exc:  # Final containment boundary.
            state.status = "failed"
            state.phase = "FAILED"
            state.final_verification = {
                "satisfied": False,
                "passed": [],
                "failed": [{"id": "SYSTEM", "reason": str(exc)}],
                "uncertain": [],
                "next_action": "stop",
            }
            save_state(state)
            self._on_state_change(state)
        finally:
            self.manager.complete_run(state.project_id, state.run_id, success=success)
            with self._lock:
                if self._active_project_runs.get(state.project_id) == state.run_id:
                    self._active_project_runs.pop(state.project_id, None)

    def _load_state_from_disk(self, run_id: str) -> AgentState | None:
        if not run_id.startswith("run_"):
            return None
        candidates = list(config.WORKSPACES_DIR.glob(f"*/runs/{run_id}/state.json"))
        if not candidates:
            return None
        try:
            return AgentState.model_validate_json(candidates[0].read_text(encoding="utf-8"))
        except Exception:
            try:
                return AgentState.model_validate(json.loads(candidates[0].read_text(encoding="utf-8")))
            except Exception:
                return None

    def get_run(self, run_id: str) -> AgentState | None:
        with self._lock:
            state = self._states.get(run_id)
        if state is not None:
            return state
        state = self._load_state_from_disk(run_id)
        if state is not None:
            with self._lock:
                self._states[run_id] = state
        return state

    def cancel_run(self, run_id: str) -> AgentState:
        state = self.get_run(run_id)
        if not state:
            raise KeyError("Run not found")
        if state.status in {"completed", "failed", "cancelled"}:
            return state
        state.cancel_requested = True
        save_state(state)
        self._on_state_change(state)
        return state

    def artifact_for_run(self, run_id: str) -> Path:
        state = self.get_run(run_id)
        if not state:
            raise KeyError("Run not found")
        if not state.artifact_path:
            raise FileNotFoundError("Artifact is not ready")
        path = Path(state.artifact_path).resolve()
        artifact_root = config.ARTIFACTS_DIR.resolve()
        try:
            path.relative_to(artifact_root)
        except ValueError as exc:
            raise PermissionError("Artifact path is outside artifact root") from exc
        if not path.exists():
            raise FileNotFoundError(path.name)
        return path

    # Previous API name retained for compatibility with older clients.
    def model_health(self) -> dict[str, Any]:
        return self.nvidia_health()


service = RunService()
