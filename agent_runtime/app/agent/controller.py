from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import config
from app.agent.context import select_relevant_context
from app.agent.operations import (
    analyze_request,
    create_plan,
    decide_next_action,
    diagnose_failure,
    generate_site_bundle,
    propose_repair,
    revise_site_bundle,
)
from app.agent.policy import POLICY
from app.agent.state import save_state, update_plan
from app.agent.verifier import verify_requirements
from app.models.base import ModelAdapter
from app.models.nim_adapter import NIMModelAdapter
from app.schemas.agent import AgentState, PlanStep, Requirement, TraceEvent
from app.tools.common import file_hash
from app.tools.registry import TOOL_REGISTRY, dispatch_tool, guard_action
from app.workspace.manager import WorkspaceManager


def init_agent_state(args: dict) -> AgentState:
    """Blueprint function: create a clean run state for an isolated workspace."""
    state = AgentState(
        run_id=args["run_id"],
        project_id=args["project_id"],
        workspace_path=str(Path(args["workspace_root"]).resolve()),
        run_root=str(Path(args["run_root"]).resolve()),
        original_request=args["user_request"],
        latest_request=args["user_request"],
        status="queued",
        model_provider=args.get("model_provider", config.DEFAULT_MODEL_PROVIDER),
        model_id=args.get("model_id", config.NVIDIA_MODEL_ID),
        reasoning_effort=args.get("reasoning_effort"),
        is_revision=bool(args.get("is_revision", False)),
        inject_demo_bug=bool(args.get("inject_demo_bug", False)),
    )
    save_state(state)
    return state


class AgentController:
    def __init__(
        self,
        *,
        state: AgentState,
        manager: WorkspaceManager,
        adapter: ModelAdapter,
        checkpoint_root: Path,
        base_url: str,
        on_state_change: Callable[[AgentState], None] | None = None,
        on_model_stream: Callable[[dict[str, Any]], None] | None = None,
        policy: dict[str, Any] | None = None,
    ) -> None:
        self.state = state
        self.manager = manager
        self.adapter = adapter
        self.checkpoint_root = Path(checkpoint_root).resolve()
        self.base_url = base_url.rstrip("/")
        self.on_state_change = on_state_change
        self.on_model_stream = on_model_stream
        self.policy = dict(POLICY if policy is None else policy)
        self._event_id = len(state.trace)
        self._started_monotonic = time.monotonic()
        self._analysis: dict[str, Any] = {}
        self._technical: dict[str, Any] = {}
        self._browser: dict[str, Any] = {}
        self._diagnostics: dict[str, Any] = {}

    def _notify(self) -> None:
        save_state(self.state)
        if self.on_state_change:
            self.on_state_change(self.state)

    def emit(self, kind: str, message: str, data: dict[str, Any] | None = None) -> None:
        self._event_id += 1
        event = TraceEvent(
            id=self._event_id,
            phase=self.state.phase,
            kind=kind,
            message=message,
            data=data or {},
        )
        self.state.trace.append(event)
        self._notify()

    def _set_phase(self, phase: str) -> None:
        self.state.phase = phase  # pydantic validates on serialization boundaries; values are controlled here.
        self._notify()

    def _serverless_deadline_reached(self) -> bool:
        return bool(
            config.SERVERLESS_MODE
            and (time.monotonic() - self._started_monotonic) >= config.SERVERLESS_MAX_WALL_SECONDS
        )

    def _budget_tick(self, *, allow_deadline_tail: bool = False) -> None:
        if self.state.cancel_requested:
            raise InterruptedError("cancel_requested")
        if self._serverless_deadline_reached() and not allow_deadline_tail:
            raise TimeoutError(
                "The hosted build reached its model-work limit before it could safely finish. "
                "Try Low reasoning effort or generate a smaller first version, then revise it."
            )
        self.state.iteration_count += 1
        if self.state.iteration_count > int(self.policy["max_iterations"]):
            raise RuntimeError("iteration_budget_exhausted")
        self._notify()

    def _add_usage(self, usage: dict[str, Any] | None) -> None:
        if not usage:
            return
        total = usage.get("total_tokens") or 0
        try:
            self.state.token_budget_used += int(total)
            details = usage.get("completion_tokens_details") or usage.get("output_tokens_details") or {}
            if not isinstance(details, dict):
                details = details.model_dump() if hasattr(details, "model_dump") else {}
            reasoning = (
                details.get("reasoning_tokens")
                or usage.get("reasoning_tokens")
                or usage.get("reasoning_output_tokens")
                or usage.get("reasoning_tokens_est")
                or 0
            )
            self.state.reasoning_tokens_used += max(0, int(reasoning))
            self.state.last_prompt_tokens_est = int(usage.get("prompt_tokens") or usage.get("prompt_tokens_est") or 0)
            self.state.last_completion_tokens_est = int(usage.get("completion_tokens") or usage.get("completion_tokens_est") or 0)
            if usage.get("context_compacted"):
                self.state.context_compaction_count += 1
                self.state.context_tokens_saved_est += int(usage.get("context_tokens_saved_est") or 0)
            self.state.last_context_info = dict(getattr(self.adapter, "last_context_info", {}) or {})
            limit = int(self.policy.get("max_total_model_tokens", config.MAX_TOTAL_MODEL_TOKENS))
            if self.state.token_budget_used > limit:
                raise RuntimeError("model_token_budget_exhausted")
            self._notify()
        except (ValueError, TypeError):
            pass


    def _model_token_callback(self, delta: str, full_text: str) -> None:
        if not self.on_model_stream:
            return
        try:
            self.on_model_stream({
                "phase": self.state.phase,
                "delta": str(delta or ""),
                "full_text": str(full_text or ""),
            })
        except Exception:
            # UI telemetry must never be able to fail the controller.
            pass

    def _refresh_files(self) -> list[str]:
        result = TOOL_REGISTRY["list_files"]({
            "workspace_root": self.state.workspace_path,
            "run_id": self.state.run_id,
            "recursive": True,
        })
        if not result["success"]:
            raise RuntimeError(result["error"])
        self.state.project_files = result["data"]["files"]
        versions: dict[str, str] = {}
        root = Path(self.state.workspace_path)
        for rel in self.state.project_files:
            try:
                versions[rel] = file_hash(root / rel)
            except Exception:
                pass
        self.state.file_versions = versions
        self._notify()
        return self.state.project_files

    def _load_previous_requirements(self) -> tuple[list[dict], str | None]:
        if not self.state.is_revision:
            return [], None
        project = self.manager.get_project(self.state.project_id) or {}
        previous_run = project.get("latest_run_id")
        if not previous_run or previous_run == self.state.run_id:
            return [], None
        path = config.WORKSPACES_DIR / self.state.project_id / "runs" / previous_run / "state.json"
        if not path.exists():
            return [], None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            reqs = data.get("requirements") or []
            original = data.get("original_request")
            return reqs, original
        except Exception:
            return [], None

    def _merge_requirements(self, old: list[dict], new: list[dict]) -> list[Requirement]:
        merged_texts: list[tuple[str, str, str | None]] = []
        seen = set()
        for item in old + new:
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            key = " ".join(text.lower().split())
            if key in seen:
                continue
            seen.add(key)
            merged_texts.append((text, str(item.get("category", "feature")), item.get("verification_hint")))
        return [Requirement(id=f"R{i+1}", text=t, category=c, verification_hint=h) for i, (t, c, h) in enumerate(merged_texts)]

    def _tool(self, tool_name: str, arguments: dict[str, Any], *, phase: str | None = None) -> dict:
        state_dump = self.state.model_dump(mode="json")
        if phase:
            state_dump["phase"] = phase
        guarded = guard_action({
            "tool_name": tool_name,
            "arguments": arguments,
            "state": state_dump,
            "policy": self.policy,
        })
        if not guarded["allowed"]:
            result = {"success": False, "tool": tool_name, "data": {}, "error": guarded["reason"], "metadata": {"run_id": self.state.run_id}}
            self.state.tool_history.append(result)
            self.emit("GUARD", f"Rejected {tool_name}: {guarded['reason']}")
            return result
        result = dispatch_tool({
            "tool_name": tool_name,
            "arguments": guarded["normalized_args"],
            "run_id": self.state.run_id,
            "workspace_root": self.state.workspace_path,
            "checkpoint_root": str(self.checkpoint_root),
        })
        self.state.tool_history.append({
            "tool": tool_name,
            "success": result.get("success"),
            "error": result.get("error"),
            "metadata": result.get("metadata", {}),
        })
        self._notify()
        return result

    def _analyze(self) -> None:
        self._budget_tick()
        self._set_phase("ANALYZE")
        files = self._refresh_files()
        self.emit("UNDERSTANDING", "Analyzing request and current project state", {"existing_files": len(files)})
        analysis, usage = analyze_request(self.adapter, self.state.latest_request, files)
        self._add_usage(usage)
        self._analysis = analysis
        previous_requirements, previous_original = self._load_previous_requirements()
        new_requirements = analysis.get("requirements") or []
        self.state.requirements = self._merge_requirements(previous_requirements, new_requirements)
        if previous_original:
            self.state.original_request = previous_original
        self.emit("REQUIREMENTS", f"Normalized {len(self.state.requirements)} requirements", {
            "intent": analysis.get("intent"),
            "requirements": [r.model_dump() for r in self.state.requirements],
        })

    def _plan(self) -> None:
        self._budget_tick()
        self._set_phase("PLAN")
        result = create_plan({
            "adapter": self.adapter,
            "goal": self._analysis.get("goal", self.state.latest_request),
            "requirements": [r.model_dump() for r in self.state.requirements],
            "project_context": {"files": self.state.project_files},
            "constraints": self._analysis.get("constraints", []),
        })
        self._add_usage(result.get("usage"))
        data = result["data"]
        steps = data.get("steps") or []
        self.state.plan = [PlanStep(
            id=str(item.get("id") or f"S{i+1}"),
            title=str(item.get("title") or f"Step {i+1}"),
            description=str(item.get("description") or ""),
        ) for i, item in enumerate(steps)]
        self.state.pending_steps = [s.id for s in self.state.plan]
        self.state.acceptance_criteria = [str(x) for x in data.get("acceptance_criteria", [])]
        self.emit("PLAN", f"Created {len(self.state.plan)} execution steps", {"plan": [s.model_dump() for s in self.state.plan]})

    def _inspect(self) -> list[dict]:
        self._budget_tick()
        self._set_phase("INSPECT")
        files = self._refresh_files()
        if not files:
            self.emit("INSPECT", "New workspace is empty; no unnecessary context sent")
            return []
        search_results: list[dict] = []
        for term in (self._analysis.get("search_terms") or [])[:4]:
            res = self._tool("search_files", {"query": str(term), "max_results": 10, "context_lines": 1}, phase="INSPECT")
            if res["success"]:
                search_results.extend(res["data"].get("matches", []))
        selected = select_relevant_context({
            "request": self.state.latest_request,
            "workspace_root": self.state.workspace_path,
            "candidate_files": files,
            "search_results": search_results,
            "max_files": self.policy.get("max_files_in_context", config.MAX_FILES_IN_CONTEXT),
            "token_budget": self.policy.get("max_total_file_context_tokens", config.MAX_TOTAL_FILE_CONTEXT_TOKENS),
            "per_file_token_budget": self.policy.get("max_file_tokens_in_context", config.MAX_FILE_TOKENS_IN_CONTEXT),
            "run_id": self.state.run_id,
        })
        self.state.relevant_files = [x["path"] for x in selected["selected_context"]]
        self.emit("INSPECT", f"Selected {len(self.state.relevant_files)} relevant file(s) from {len(files)}", {
            "selected": self.state.relevant_files,
            "omitted": selected["omitted_count"],
            "estimated_context_tokens": selected.get("estimated_tokens", 0),
            "compacted_files": selected.get("compacted_files", 0),
            "tokens_saved_est": selected.get("tokens_saved_est", 0),
        })
        return selected["selected_context"]

    def _checkpoint(self, label: str) -> None:
        result = self._tool("create_checkpoint", {
            "project_id": self.state.project_id,
            "label": label,
        }, phase="ACT" if self.state.phase == "ACT" else "REPAIR")
        if result["success"]:
            self.state.checkpoint_id = result["data"]["checkpoint_id"]
            self.emit("CHECKPOINT", f"Checkpoint {self.state.checkpoint_id} created")

    def _record_changes(self, results: list[dict]) -> None:
        for result in results:
            if not result.get("success"):
                continue
            data = result.get("data", {})
            entry = {
                "path": data.get("path"),
                "old_version": data.get("old_version"),
                "new_version": data.get("new_version") or data.get("version"),
                "lines_added": data.get("lines_added"),
                "lines_removed": data.get("lines_removed"),
                "diff_preview": data.get("diff_preview"),
            }
            self.state.change_history.append(entry)
        self._notify()

    def _act_fresh(self) -> None:
        self._budget_tick()
        self._set_phase("ACT")
        self.emit("ACT", f"Generating initial project bundle with {self.state.model_provider.upper()} · {self.state.model_id}")
        bundle, usage = generate_site_bundle(
            self.adapter,
            request=self.state.latest_request,
            goal=self._analysis.get("goal", self.state.latest_request),
            requirements=[r.model_dump() for r in self.state.requirements],
            plan=[s.model_dump() for s in self.state.plan],
            on_token=self._model_token_callback,
        )
        self._add_usage(usage)
        files = bundle.get("files") or []
        if not files:
            raise RuntimeError("Model returned no files")
        result = self._tool("create_files", {"files": files, "overwrite": False, "atomic_batch": True}, phase="ACT")
        if not result["success"]:
            raise RuntimeError(f"create_files failed: {result['error']}")
        self.state.verification_spec = bundle.get("verification") or {}
        created_results = [
            {"success": bool(item.get("success")), "data": item}
            for item in (result.get("data", {}).get("results") or [])
            if isinstance(item, dict)
        ]
        if created_results:
            self._record_changes(created_results)
        self._refresh_files()
        self.emit("FILES", f"Created {result['data'].get('created_count', 0)} file(s)", {"files": self.state.project_files})

        if self.state.inject_demo_bug and "script.js" in self.state.project_files:
            # Deterministic hackathon fixture: deliberately add a syntax error so
            # the observable self-repair loop can be demonstrated reproducibly.
            path = Path(self.state.workspace_path) / "script.js"
            old = path.read_text(encoding="utf-8")
            version = file_hash(path)
            broken = old + "\n\n// DEMO_REPAIR_FIXTURE - intentionally invalid syntax\nif (\n"
            patch_result = self._tool("apply_patch", {
                "path": "script.js",
                "expected_version": version,
                "new_content": broken,
            }, phase="ACT")
            if not patch_result.get("success"):
                raise RuntimeError(f"Demo fault injection failed: {patch_result.get('error')}")
            self._record_changes([patch_result])
            self.state.file_versions["script.js"] = patch_result["data"]["new_version"]
            self.emit("DEMO_FAULT", "Injected deterministic JavaScript syntax fixture for self-repair demo")

    def _act_revision(self, context: list[dict]) -> None:
        self._budget_tick()
        self._set_phase("ACT")
        self._checkpoint("before_revision")
        self.emit("ACT", "Planning minimal revision against inspected current files")
        bundle, usage = revise_site_bundle(
            self.adapter,
            request=self.state.latest_request,
            requirements=[r.model_dump() for r in self.state.requirements],
            plan=[s.model_dump() for s in self.state.plan],
            context=context,
            on_token=self._model_token_callback,
        )
        self._add_usage(usage)
        updates = bundle.get("updates") or []
        if not updates:
            raise RuntimeError("Revision model returned no updates")
        results = []
        for update in updates:
            path = str(update.get("path", ""))
            if path not in self.state.file_versions:
                raise RuntimeError(f"Revision attempted to modify uninspected or missing file: {path}")
            result = self._tool("apply_patch", {
                "path": path,
                "expected_version": self.state.file_versions[path],
                "new_content": str(update.get("content", "")),
            }, phase="ACT")
            if not result["success"]:
                raise RuntimeError(f"Patch failed for {path}: {result['error']}")
            results.append(result)
            self.state.file_versions[path] = result["data"]["new_version"]
        self._record_changes(results)
        self.state.verification_spec = bundle.get("verification") or self.state.verification_spec
        self._refresh_files()
        self.emit("PATCH", f"Applied {len(results)} versioned minimal revision patch(es)", {
            "diffs": [{"path": r["data"]["path"], "+": r["data"]["lines_added"], "-": r["data"]["lines_removed"]} for r in results],
        })

    def _verify(self) -> bool:
        # Verification and completion are allowed to use the reserved serverless
        # tail. When the model-work deadline has been reached, verification stays
        # deterministic so no new long provider call can overrun the host.
        deadline_tail = self._serverless_deadline_reached()
        deterministic_only = bool(config.SERVERLESS_MODE)
        self._budget_tick(allow_deadline_tail=True)
        self._set_phase("VERIFY")
        self.emit("RUN", "Running technical and browser verification")
        preview_url = None if config.SERVERLESS_MODE else f"{self.base_url}/preview/{self.state.run_id}/index.html"
        # Vercel runs use client-side preview assembled from returned files; an
        # ephemeral /tmp path must never be exposed as a durable preview URL.
        self.state.preview_url = preview_url

        technical = TOOL_REGISTRY["validate_project"]({
            "workspace_root": self.state.workspace_path,
            "run_id": self.state.run_id,
            "checks": ["integrity", "syntax", "runtime"],
            "timeout_seconds": self.policy["command_timeout_seconds"],
        })
        # validate_project is a hybrid function returning the evidence directly,
        # unlike standard tool envelopes in older prototypes.
        self._technical = technical

        run_result = self._tool("run_file", {
            "path": "index.html",
            "runtime": "browser",
            "timeout_seconds": self.policy["command_timeout_seconds"],
            "preview_url": preview_url or "client-side-preview",
        }, phase="VERIFY")
        self.state.execution_history.append(run_result)

        spec = self.state.verification_spec or {}
        required_selectors = list(dict.fromkeys(["body"] + list(spec.get("required_selectors") or [])))[:30]
        interactions = list(spec.get("interactions") or [])[:12]
        screenshot = str(Path(self.state.run_root) / "verification.png")
        browser_result = self._tool("browser_verify", {
            "url": preview_url,
            "required_selectors": required_selectors,
            "interactions": interactions,
            "viewport": {"width": 1440, "height": 900},
            "timeout_seconds": self.policy["browser_timeout_seconds"],
            "screenshot_path": None if config.SERVERLESS_MODE else screenshot,
            "serverless_static": config.SERVERLESS_MODE,
        }, phase="VERIFY")
        if not browser_result["success"]:
            self._browser = {"passed": False, "page_errors": [browser_result.get("error")], "console_errors": [], "missing_selectors": [], "interaction_results": []}
        else:
            self._browser = browser_result["data"]

        diagnostics_result = self._tool("get_diagnostics", {
            "project_path": self.state.workspace_path,
            "sources": [self._technical, self._browser, run_result.get("data", {})],
            "max_errors": 20,
            "max_log_chars": self.policy["max_log_chars"],
        }, phase="VERIFY")
        self._diagnostics = diagnostics_result["data"] if diagnostics_result["success"] else {"has_errors": True, "errors": [{"message": diagnostics_result.get("error")}]}
        self.state.diagnostics.append(self._diagnostics)

        # Local checks can consume the remainder of the model-work budget, so
        # re-evaluate before deciding whether another provider call is safe.
        deadline_tail = deadline_tail or self._serverless_deadline_reached()
        if deterministic_only or deadline_tail:
            deterministic_passed = bool(
                self._technical.get("passed")
                and self._browser.get("passed")
                and not self._diagnostics.get("has_errors")
            )
            evidence = "Passed deterministic HTML/CSS/JS integrity plus available selector and interaction checks."
            diagnostic_errors = self._diagnostics.get("errors") or []
            first_error = diagnostic_errors[0] if diagnostic_errors else {}
            if isinstance(first_error, dict):
                failure_detail = str(first_error.get("message") or first_error.get("selector") or "").strip()
            else:
                failure_detail = str(first_error or "").strip()
            failure_reason = (
                f"Website verification found a concrete issue: {failure_detail}"
                if failure_detail else
                "Website verification found an issue that could not be safely certified in this run."
            )
            verdict = {
                "satisfied": deterministic_passed,
                "passed": [
                    {"id": requirement.id, "reason": evidence}
                    for requirement in self.state.requirements
                ] if deterministic_passed else [],
                "failed": [] if deterministic_passed else [{
                    "id": "SYSTEM",
                    "reason": failure_reason,
                }],
                "uncertain": [],
                "next_action": "complete" if deterministic_passed else "stop",
                "verification_mode": "deterministic_serverless" if deterministic_only else "deterministic_deadline_tail",
            }
            self.emit(
                "SERVERLESS_VERIFY" if deterministic_only else "DEADLINE_TAIL",
                "Used bounded deterministic final verification" if deterministic_only else "Used reserved host time for deterministic final verification",
            )
        else:
            verdict = verify_requirements({
                "adapter": self.adapter,
                "requirements": [r.model_dump() for r in self.state.requirements],
                "plan": [s.model_dump() for s in self.state.plan],
                "technical_evidence": self._technical,
                "browser_evidence": self._browser,
                "state_summary": {
                    "run_id": self.state.run_id,
                    "phase": self.state.phase,
                    "files": self.state.project_files,
                },
                "workspace_root": self.state.workspace_path,
                "candidate_files": self.state.project_files,
                "run_id": self.state.run_id,
            })
            self._add_usage(verdict.pop("usage", {}))
        self.state.verification_results.append(verdict)
        self.state.final_verification = verdict
        self.emit("VERIFY", (
            f"Requirements passed: {len(verdict.get('passed', []))}/{len(self.state.requirements)}; "
            f"failed={len(verdict.get('failed', []))}, uncertain={len(verdict.get('uncertain', []))}"
        ), {
            "technical_passed": self._technical.get("passed"),
            "browser_passed": self._browser.get("passed"),
            "browser_engine": self._browser.get("engine"),
            "verdict": verdict,
        })
        return bool(verdict.get("satisfied"))

    def _repair(self) -> None:
        self._budget_tick()
        self._set_phase("REPAIR")
        self.state.error_retry_count += 1
        self._checkpoint(f"before_repair_{self.state.error_retry_count}")
        self.emit("DIAGNOSE", "Diagnosing failure using structured evidence and targeted files")

        diag = diagnose_failure({
            "adapter": self.adapter,
            "diagnostics": self._diagnostics,
            "relevant_files": self.state.project_files,
            "recent_changes": self.state.change_history[-8:],
            "retry_count": self.state.error_retry_count,
        })
        self._add_usage(diag.get("usage"))
        diagnosis = diag["data"]
        target_files = [x for x in diagnosis.get("target_files", []) if x in self.state.project_files][:3]
        if not target_files:
            for err in self._diagnostics.get("errors", []):
                path = err.get("path") if isinstance(err, dict) else None
                if path in self.state.project_files and path not in target_files:
                    target_files.append(path)
            if not target_files:
                target_files = [x for x in ["script.js", "style.css", "index.html"] if x in self.state.project_files][:3]
        selected = select_relevant_context({
            "request": diagnosis.get("repair_strategy", self.state.latest_request),
            "workspace_root": self.state.workspace_path,
            "candidate_files": target_files,
            "search_results": [],
            "max_files": 3,
            "token_budget": min(
                self.policy.get("max_total_file_context_tokens", config.MAX_TOTAL_FILE_CONTEXT_TOKENS),
                self.policy.get("max_file_tokens_in_context", config.MAX_FILE_TOKENS_IN_CONTEXT) * 3,
            ),
            "per_file_token_budget": self.policy.get("max_file_tokens_in_context", config.MAX_FILE_TOKENS_IN_CONTEXT),
            "run_id": self.state.run_id,
        })
        failed_requirements = (self.state.final_verification.get("failed") or []) + (self.state.final_verification.get("uncertain") or [])
        bundle, usage = propose_repair(
            self.adapter,
            request=self.state.latest_request,
            failed_requirements=failed_requirements,
            diagnosis=diagnosis,
            diagnostics=self._diagnostics,
            context=selected["selected_context"],
            on_token=self._model_token_callback,
        )
        self._add_usage(usage)
        updates = bundle.get("updates") or []
        if not updates:
            raise RuntimeError("Repair model returned no updates")
        results = []
        current_versions = dict(self.state.file_versions)
        for update in updates:
            path = str(update.get("path", ""))
            if path not in target_files:
                raise RuntimeError(f"Repair attempted non-target file: {path}")
            expected = current_versions.get(path)
            if not expected:
                expected = file_hash(Path(self.state.workspace_path) / path)
            result = self._tool("apply_patch", {
                "path": path,
                "expected_version": expected,
                "new_content": str(update.get("content", "")),
            }, phase="REPAIR")
            if not result["success"]:
                self.state.patch_retry_count += 1
                raise RuntimeError(f"Repair patch failed for {path}: {result['error']}")
            results.append(result)
            current_versions[path] = result["data"]["new_version"]
        self._record_changes(results)
        self.state.self_repair_count += 1
        if bundle.get("verification"):
            # Merge, don't drop previously specified checks.
            old = self.state.verification_spec or {}
            new = bundle["verification"]
            self.state.verification_spec = {
                "required_selectors": list(dict.fromkeys((old.get("required_selectors") or []) + (new.get("required_selectors") or []))),
                "interactions": (old.get("interactions") or []) + [x for x in (new.get("interactions") or []) if x not in (old.get("interactions") or [])],
            }
        self._refresh_files()
        self.emit("PATCH", f"Self-repair applied {len(results)} targeted patch(es)", {
            "root_cause": diagnosis.get("root_cause"),
            "target_files": target_files,
            "diffs": [{"path": r["data"]["path"], "+": r["data"]["lines_added"], "-": r["data"]["lines_removed"]} for r in results],
        })

    def _rollback_if_possible(self, reason: str) -> None:
        if not self.state.checkpoint_id:
            return
        old_phase = self.state.phase
        self.state.phase = "REPAIR"
        result = self._tool("rollback", {
            "checkpoint_id": self.state.checkpoint_id,
            "reason": reason,
        }, phase="REPAIR")
        self.state.phase = old_phase
        if result["success"]:
            self._refresh_files()
            self.emit("ROLLBACK", f"Restored checkpoint after {reason}")

    def _complete(self) -> dict[str, Any]:
        # Packaging is local and bounded; it must be allowed to consume the
        # serverless tail after a successful verification.
        self._budget_tick(allow_deadline_tail=True)
        self._set_phase("COMPLETE")
        artifact_path = self.manager.artifact_path(self.state.project_id, self.state.run_id)
        package = self._tool("package_project", {
            "output_path": str(artifact_path),
            "exclude": list(config.INTERNAL_EXCLUDES),
        }, phase="COMPLETE")
        if not package["success"]:
            raise RuntimeError(f"Packaging failed: {package['error']}")
        config_fingerprint = hashlib.sha256(
            f"{self.state.model_provider}|{self.state.model_id}|{self.state.reasoning_effort}|{self.policy}".encode("utf-8")
        ).hexdigest()
        manifest_path = Path(self.state.run_root) / "run_manifest.json"
        manifest = self._tool("save_run_manifest", {
            "manifest_path": str(manifest_path),
            "project_id": self.state.project_id,
            "model_id": self.state.model_id,
            "config_hash": config_fingerprint,
            "verification": self.state.final_verification,
            "state_summary": {
                "iterations": self.state.iteration_count,
                "self_repairs": self.state.self_repair_count,
                "files": self.state.project_files,
                "changes": len(self.state.change_history),
                "model_tokens_used": self.state.token_budget_used,
                "context_compactions": self.state.context_compaction_count,
                "context_tokens_saved_est": self.state.context_tokens_saved_est,
            },
        }, phase="COMPLETE")
        self.state.artifact_path = package["data"]["artifact_path"]
        if manifest["success"]:
            self.state.manifest_path = manifest["data"]["manifest_path"]
        self.state.status = "completed"
        self.state.finished_at = datetime.now(timezone.utc).isoformat()
        self.emit("DONE", "Preview, verified project ZIP and run summary are ready", {
            "artifact_size": package["data"]["size_bytes"],
            "files": package["data"]["file_count"],
        })
        return {
            "status": "completed",
            "final_state": self.state,
            "artifact_path": self.state.artifact_path,
            "trace_summary": [x.model_dump() for x in self.state.trace],
        }

    def run_agent_loop(self) -> dict[str, Any]:
        """Top-level bounded phase state machine.

        The model never owns this loop, retry counters, path/security decisions,
        rollback, or completion status.
        """
        self.state.status = "working"
        self._notify()
        self.emit("START", "Agent run started", {"provider": self.state.model_provider, "model": self.state.model_id, "reasoning_effort": self.state.reasoning_effort, "revision": self.state.is_revision})
        try:
            self._analyze()
            self._plan()
            context = self._inspect()
            if self.state.is_revision:
                self._act_revision(context)
            else:
                self._act_fresh()

            while True:
                satisfied = self._verify()
                if satisfied:
                    return self._complete()
                if self._serverless_deadline_reached():
                    raise RuntimeError(
                        "The generated site did not pass final checks before the hosted build window ended. "
                        "No unverified output was returned; try Low effort or a smaller first build."
                    )
                if self.state.error_retry_count < int(self.policy["max_error_retries_per_step"]):
                    self._repair()
                    continue
                if self.state.replan_count < int(self.policy["max_replans"]):
                    self.state.replan_count += 1
                    self._set_phase("REPLAN")
                    self.emit("REPLAN", f"Repair budget reached; performing bounded replan {self.state.replan_count}/{self.policy['max_replans']}")
                    # Replan with the same normalized requirements, then make one more repair attempt.
                    self._plan()
                    self.state.error_retry_count = 0
                    self._repair()
                    continue
                raise RuntimeError("verification_failed_after_retry_budget")
        except InterruptedError:
            self.state.status = "cancelled"
            self.state.phase = "CANCELLED"
            self.state.finished_at = datetime.now(timezone.utc).isoformat()
            self.emit("STOP", "Run cancelled by user")
            return {"status": "cancelled", "final_state": self.state, "artifact_path": None, "trace_summary": [x.model_dump() for x in self.state.trace]}
        except Exception as exc:
            self._rollback_if_possible(str(exc))
            self.state.status = "failed"
            self.state.phase = "FAILED"
            self.state.finished_at = datetime.now(timezone.utc).isoformat()
            self.emit("FAILED", str(exc))
            return {"status": "failed", "reason": str(exc), "final_state": self.state, "artifact_path": None, "trace_summary": [x.model_dump() for x in self.state.trace]}


def run_agent_loop(args: dict) -> dict[str, Any]:
    """Blueprint-compatible functional entrypoint around AgentController."""
    controller = AgentController(
        state=args["state"],
        manager=args["manager"],
        adapter=args.get("model_adapter") or NIMModelAdapter(),
        checkpoint_root=Path(args["checkpoint_root"]),
        base_url=args["base_url"],
        on_state_change=args.get("on_state_change"),
        on_model_stream=args.get("on_model_stream"),
        policy=args.get("policy") or POLICY,
    )
    return controller.run_agent_loop()
