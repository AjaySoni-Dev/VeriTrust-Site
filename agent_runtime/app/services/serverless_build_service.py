from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any, Callable

import config
from app.agent.controller import AgentController, init_agent_state
from app.agent.policy import POLICY
from app.agent.state import save_state
from app.models.base import ModelAdapter
from app.services.run_service import RunService
from app.tools.common import redact_secret
from app.workspace.manager import WorkspaceManager


_TEXT_EXTENSIONS = {".html", ".htm", ".css", ".js", ".json", ".txt", ".md", ".svg"}


def _language(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".html": "html", ".htm": "html", ".css": "css", ".js": "javascript",
        ".json": "json", ".md": "markdown", ".svg": "svg", ".txt": "text",
    }.get(ext, "text")


def collect_workspace_files(workspace: str | Path, *, include_content: bool = True) -> list[dict[str, Any]]:
    root = Path(workspace).resolve()
    if not root.exists():
        return []
    files: list[dict[str, Any]] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if any(part in config.INTERNAL_EXCLUDES for part in Path(rel).parts):
            continue
        if path.suffix.lower() not in _TEXT_EXTENSIONS:
            continue
        size = path.stat().st_size
        if size > config.MAX_PROJECT_FILE_BYTES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        item = {
            "name": rel,
            "language": _language(rel),
            "bytes": size,
            "lines": max(1, text.count("\n") + 1) if text else 0,
        }
        if include_content:
            item["content"] = text
        files.append(item)
    return files


class ServerlessBuildService:
    """Run one complete agent build inside one active serverless invocation.

    No durable correctness depends on Python globals, background work after the
    response, or a later request reaching the same Vercel instance.
    """

    def __init__(self, manager: WorkspaceManager | None = None) -> None:
        self.manager = manager or WorkspaceManager()
        self.provider_service = RunService(manager=self.manager)

    @staticmethod
    def _run_id() -> str:
        return "run_" + uuid.uuid4().hex[:14]

    def run(
        self,
        *,
        prompt: str,
        project_name: str,
        provider: str,
        model_id: str,
        api_key: str,
        model_base_url: str | None = None,
        enable_thinking: bool = True,
        reasoning_effort: str | None = None,
        adapter: ModelAdapter | None = None,
        existing_files: list[dict[str, Any]] | None = None,
        on_update: Callable[[Any], None] | None = None,
        on_model_stream: Callable[[dict[str, Any]], None] | None = None,
    ):
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty")
        requested_effort = (reasoning_effort or "").strip().lower() or None
        if not enable_thinking:
            requested_effort = "none"
        if adapter is None:
            adapter, selected_model, selected_effort = self.provider_service._build_adapter(
                provider=provider,
                model_id=model_id,
                reasoning_effort=requested_effort,
                api_key=api_key,
                base_url=model_base_url,
            )
        else:
            selected_model = model_id or getattr(adapter, "model_id", "test-model")
            selected_effort = requested_effort or getattr(adapter, "reasoning_effort", None)
            adapter.reasoning_effort = selected_effort
            provider = getattr(adapter, "provider", provider)

        project = self.manager.create_project(project_name or "Nexora Agent Project")
        run_id = self._run_id()
        paths = self.manager.create_run_workspace(project["project_id"], run_id)

        seeded_files = []
        workspace_root = Path(paths["workspace"]).resolve()
        for item in (existing_files or [])[:24]:
            rel = str(item.get("name") or item.get("path") or "").replace("\\", "/").lstrip("/")
            content = str(item.get("content") or "")
            if not rel or rel.startswith("../") or "/../" in f"/{rel}" or len(content.encode("utf-8")) > config.MAX_PROJECT_FILE_BYTES:
                continue
            target = (workspace_root / rel).resolve()
            try:
                target.relative_to(workspace_root)
            except ValueError:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            seeded_files.append(rel)

        state = init_agent_state({
            "run_id": run_id,
            "project_id": project["project_id"],
            "workspace_root": str(paths["workspace"]),
            "run_root": str(paths["run_root"]),
            "user_request": prompt.strip(),
            "model_provider": provider,
            "model_id": selected_model,
            "reasoning_effort": selected_effort,
            "is_revision": bool(seeded_files),
            "inject_demo_bug": False,
        })

        policy = dict(POLICY)
        if config.SERVERLESS_MODE:
            # Stay within Vercel's request-bound execution model. The controller
            # remains bounded and still retains verify/repair cycles.
            policy["max_iterations"] = min(int(policy.get("max_iterations", 24)), 12)
            # Two targeted repair attempts materially reduce user-facing false
            # failures while remaining bounded inside the request lifecycle.
            policy["max_error_retries_per_step"] = min(int(policy.get("max_error_retries_per_step", 3)), 2)
            policy["max_replans"] = 0
            policy["command_timeout_seconds"] = min(int(policy.get("command_timeout_seconds", 60)), 12)
            policy["browser_timeout_seconds"] = min(int(policy.get("browser_timeout_seconds", 30)), 6)

        success = False
        try:
            controller = AgentController(
                state=state,
                manager=self.manager,
                adapter=adapter,
                checkpoint_root=Path(paths["checkpoint_root"]),
                base_url="serverless://nexora",
                on_state_change=on_update,
                on_model_stream=on_model_stream,
                policy=policy,
            )
            controller.run_agent_loop()
            state = controller.state
            success = state.status == "completed"
            if on_update:
                on_update(state)
            return state
        except Exception as exc:
            state.status = "failed"
            state.phase = "FAILED"
            state.final_verification = {
                "satisfied": False,
                "passed": [],
                "failed": [{"id": "SYSTEM", "reason": redact_secret(str(exc), api_key)}],
                "uncertain": [],
                "next_action": "stop",
            }
            save_state(state)
            if on_update:
                on_update(state)
            return state
        finally:
            self.manager.complete_run(project["project_id"], run_id, success=success)

    @staticmethod
    def cleanup(state) -> None:
        try:
            run_root = Path(state.run_root).resolve()
            tmp = Path("/tmp/nexora-agent").resolve()
            if config.SERVERLESS_MODE:
                run_root.relative_to(tmp)
                shutil.rmtree(run_root, ignore_errors=True)
        except Exception:
            pass
