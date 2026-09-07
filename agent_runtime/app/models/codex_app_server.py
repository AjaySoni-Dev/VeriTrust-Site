from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import config
from app.agent.context_window import estimate_messages_tokens, estimate_text_tokens, fit_messages_to_context


class CodexRPCError(RuntimeError):
    def __init__(self, message: str, *, code: int | None = None, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


@dataclass
class _PendingRequest:
    event: threading.Event = field(default_factory=threading.Event)
    response: dict[str, Any] | None = None


@dataclass
class _TurnCollector:
    thread_id: str
    event: threading.Event = field(default_factory=threading.Event)
    final_messages: list[str] = field(default_factory=list)
    streamed_parts: list[str] = field(default_factory=list)
    status: str | None = None
    error: dict[str, Any] | None = None
    token_usage: dict[str, Any] = field(default_factory=dict)
    rerouted_model: str | None = None


class CodexAppServerClient:
    """Persistent JSON-RPC client for the official Codex App Server backend.

    The website never reuses the user's normal Codex profile.  The App Server
    is launched with an application-owned CODEX_HOME and the default login UX
    uses OpenAI's device-code flow, so authentication happens in the user's
    browser while Codex owns/persists/refreshes the OAuth tokens.  This
    application receives only account metadata and never reads OAuth tokens.
    """

    def __init__(self, command: list[str] | None = None) -> None:
        self._explicit_command = command
        self._proc: subprocess.Popen[str] | None = None
        self._reader_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._write_lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._state_lock = threading.RLock()
        self._initialized = False
        self._next_id = 1
        self._pending: dict[int, _PendingRequest] = {}
        self._turns: dict[str, _TurnCollector] = {}
        self._login_results: dict[str, dict[str, Any]] = {}
        self._account_update: dict[str, Any] = {}
        self._stderr_tail: list[str] = []
        self._started_at: float | None = None
        self._model_cache: tuple[float, list[dict[str, Any]]] | None = None

    # ----------------------------- process lifecycle -----------------------------
    @staticmethod
    def _which_codex() -> str | None:
        configured = config.CODEX_CLI_PATH
        if configured and configured not in {"codex", "codex.exe", "codex.cmd"}:
            p = Path(configured).expanduser()
            if p.exists():
                return str(p.resolve())
        return shutil.which(configured) or shutil.which("codex") or shutil.which("codex.cmd")

    @classmethod
    def cli_status(cls) -> dict[str, Any]:
        path = cls._which_codex()
        if path:
            version = None
            try:
                cp = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=15, shell=False)
                version = (cp.stdout or cp.stderr).strip() or None
            except Exception:
                pass
            return {"installed": True, "available": True, "mode": "codex-cli", "path": path, "version": version}
        npx = shutil.which("npx") or shutil.which("npx.cmd")
        if npx and config.CODEX_NPX_FALLBACK_ENABLED:
            return {"installed": False, "available": True, "mode": "npx-backend", "path": npx, "version": None}
        return {"installed": False, "available": False, "mode": None, "path": None, "version": None}

    @classmethod
    def install_cli(cls) -> dict[str, Any]:
        if not config.CODEX_AUTO_INSTALL_ALLOWED:
            return {"ok": False, "error": "Codex CLI installation is disabled in config.py"}
        npm = shutil.which("npm") or shutil.which("npm.cmd")
        if not npm:
            return {"ok": False, "error": "npm was not found. Install Codex CLI manually, then restart the app."}
        try:
            cp = subprocess.run(
                [npm, "install", "-g", config.CODEX_NPM_PACKAGE],
                capture_output=True,
                text=True,
                timeout=600,
                shell=False,
            )
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        status = cls.cli_status()
        return {
            "ok": cp.returncode == 0 and status["installed"],
            "return_code": cp.returncode,
            "stdout": (cp.stdout or "")[-8000:],
            "stderr": (cp.stderr or "")[-8000:],
            "cli": status,
            "error": None if cp.returncode == 0 else "npm install failed",
        }

    @property
    def running(self) -> bool:
        return bool(self._proc and self._proc.poll() is None)

    def _command(self) -> list[str]:
        if self._explicit_command:
            return list(self._explicit_command)
        path = self._which_codex()
        if path:
            return [path, "app-server"]
        if config.CODEX_NPX_FALLBACK_ENABLED:
            npx = shutil.which("npx") or shutil.which("npx.cmd")
            if npx:
                # No user-global Codex installation is required. npx resolves the
                # official package as a backend runtime and app-server remains
                # private behind this FastAPI process.
                return [npx, "-y", config.CODEX_NPM_PACKAGE, "app-server"]
        raise RuntimeError(
            "Codex backend runtime is unavailable. Install Node.js/npm or the official Codex CLI, then retry."
        )

    def start(self) -> None:
        # Serialize process startup + initialize handshake so concurrent UI and
        # generation requests cannot observe a running-but-uninitialized server.
        with self._start_lock:
            if self.running and self._initialized:
                return
            with self._state_lock:
                if not self.running:
                    command = self._command()
                    creationflags = 0
                    if os.name == "nt" and hasattr(subprocess, "CREATE_NO_WINDOW"):
                        creationflags = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
                    # Isolate this website's ChatGPT/Codex authentication from
                    # ~/.codex (or the user's desktop/CLI profile). This is the
                    # key to "Connect ChatGPT on the web" behaving as an
                    # application connection instead of silently reusing local auth.
                    config.CODEX_WEB_HOME_DIR.mkdir(parents=True, exist_ok=True)
                    child_env = os.environ.copy()
                    child_env["CODEX_HOME"] = str(config.CODEX_WEB_HOME_DIR)
                    self._proc = subprocess.Popen(
                        command,
                        cwd=str(config.ROOT_DIR),
                        env=child_env,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        bufsize=1,
                        shell=False,
                        creationflags=creationflags,
                    )
                    self._initialized = False
                    self._started_at = time.time()
                    self._reader_thread = threading.Thread(target=self._reader_loop, name="codex-app-server-reader", daemon=True)
                    self._stderr_thread = threading.Thread(target=self._stderr_loop, name="codex-app-server-stderr", daemon=True)
                    self._reader_thread.start()
                    self._stderr_thread.start()
            try:
                self.request("initialize", {
                    "clientInfo": {
                        "name": "agentic_website_builder",
                        "title": "Agentic Website Builder",
                        "version": "2.0.0",
                    }
                }, timeout=30, _skip_ensure=True)
                self.notify("initialized", {}, _skip_ensure=True)
                self._initialized = True
            except Exception:
                self.stop()
                raise

    def stop(self) -> None:
        with self._state_lock:
            proc = self._proc
            self._proc = None
            self._initialized = False
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        with self._state_lock:
            for pending in self._pending.values():
                pending.response = {"error": {"message": "Codex app-server stopped"}}
                pending.event.set()
            for collector in self._turns.values():
                collector.error = {"message": "Codex app-server stopped"}
                collector.event.set()
            self._pending.clear()
            self._turns.clear()

    def restart(self) -> None:
        self.stop()
        self.start()

    # -------------------------------- JSON-RPC ---------------------------------
    def _send(self, message: dict[str, Any]) -> None:
        if not self._proc or not self._proc.stdin or self._proc.poll() is not None:
            raise RuntimeError("Codex app-server is not running")
        line = json.dumps(message, separators=(",", ":"), ensure_ascii=False)
        with self._write_lock:
            self._proc.stdin.write(line + "\n")
            self._proc.stdin.flush()

    def request(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        timeout: float | None = None,
        _skip_ensure: bool = False,
    ) -> Any:
        if not _skip_ensure:
            self.start()
        with self._state_lock:
            request_id = self._next_id
            self._next_id += 1
            pending = _PendingRequest()
            self._pending[request_id] = pending
        self._send({"method": method, "id": request_id, "params": params or {}})
        if not pending.event.wait(timeout or config.CODEX_APP_SERVER_TIMEOUT_SECONDS):
            with self._state_lock:
                self._pending.pop(request_id, None)
            raise TimeoutError(f"Codex app-server request timed out: {method}")
        response = pending.response or {}
        if response.get("error"):
            err = response["error"] or {}
            raise CodexRPCError(str(err.get("message") or "Codex RPC error"), code=err.get("code"), data=err.get("data"))
        return response.get("result")

    def notify(self, method: str, params: dict[str, Any] | None = None, *, _skip_ensure: bool = False) -> None:
        if not _skip_ensure:
            self.start()
        self._send({"method": method, "params": params or {}})

    def _reader_loop(self) -> None:
        proc = self._proc
        if not proc or not proc.stdout:
            return
        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except Exception:
                continue
            try:
                self._handle_message(message)
            except Exception:
                continue
        # Wake waiters if the process exits unexpectedly.
        if self._proc is proc and proc.poll() is not None:
            with self._state_lock:
                for pending in self._pending.values():
                    pending.response = {"error": {"message": "Codex app-server exited unexpectedly"}}
                    pending.event.set()
                for collector in self._turns.values():
                    collector.error = {"message": "Codex app-server exited unexpectedly"}
                    collector.event.set()

    def _stderr_loop(self) -> None:
        proc = self._proc
        if not proc or not proc.stderr:
            return
        for raw in proc.stderr:
            text = raw.rstrip()
            if text:
                with self._state_lock:
                    self._stderr_tail.append(text)
                    self._stderr_tail[:] = self._stderr_tail[-80:]

    def _handle_message(self, message: dict[str, Any]) -> None:
        # Server-initiated requests have both method and id. Our model-only
        # threads are read-only/approvalPolicy=never, so unexpected requests are
        # failed closed instead of granting capabilities implicitly.
        if "method" in message and "id" in message:
            method = str(message.get("method"))
            request_id = message.get("id")
            if method in {"tool/requestUserInput", "item/tool/requestUserInput"}:
                self._send({"id": request_id, "result": {"answers": {}}})
            elif method in {"item/commandExecution/requestApproval", "item/fileChange/requestApproval"}:
                self._send({"id": request_id, "result": {"decision": "decline"}})
            elif method == "item/permissions/requestApproval":
                self._send({"id": request_id, "result": {"permissions": {}, "scope": "turn"}})
            else:
                self._send({"id": request_id, "error": {"code": -32601, "message": "Unsupported client-side request"}})
            return

        if "id" in message and "method" not in message:
            request_id = message.get("id")
            if isinstance(request_id, int):
                with self._state_lock:
                    pending = self._pending.pop(request_id, None)
                if pending:
                    pending.response = message
                    pending.event.set()
            return

        method = str(message.get("method") or "")
        params = message.get("params") or {}
        if method == "account/login/completed":
            login_id = params.get("loginId")
            if login_id:
                with self._state_lock:
                    self._login_results[str(login_id)] = dict(params)
            return
        if method == "account/updated":
            with self._state_lock:
                self._account_update = dict(params)
            return

        thread_id = params.get("threadId")
        collector = None
        if thread_id:
            with self._state_lock:
                collector = self._turns.get(str(thread_id))
        if not collector:
            return

        if method == "item/agentMessage/delta":
            delta = params.get("delta")
            if isinstance(delta, str):
                collector.streamed_parts.append(delta)
        elif method == "item/completed":
            item = params.get("item") or {}
            if item.get("type") == "agentMessage":
                text = item.get("text")
                phase = item.get("phase")
                if isinstance(text, str) and text.strip():
                    if phase == "final_answer":
                        collector.final_messages.append(text)
                    elif not collector.final_messages:
                        collector.final_messages.append(text)
        elif method == "thread/tokenUsage/updated":
            collector.token_usage = dict(params)
        elif method == "model/rerouted":
            collector.rerouted_model = params.get("toModel")
        elif method == "turn/completed":
            turn = params.get("turn") or {}
            collector.status = turn.get("status")
            collector.error = turn.get("error")
            collector.event.set()
        elif method == "error":
            collector.error = params.get("error") or params

    # ------------------------------- account APIs -------------------------------
    def account_read(self, refresh: bool = False) -> dict[str, Any]:
        return self.request("account/read", {"refreshToken": bool(refresh)}, timeout=60) or {}

    def login_browser(self) -> dict[str, Any]:
        result = self.request("account/login/start", {
            "type": "chatgpt",
            "useHostedLoginSuccessPage": True,
            "appBrand": "chatgpt",
        }, timeout=60) or {}
        login_id = result.get("loginId")
        if login_id:
            with self._state_lock:
                self._login_results.pop(str(login_id), None)
        return result

    def login_device_code(self) -> dict[str, Any]:
        result = self.request("account/login/start", {"type": "chatgptDeviceCode"}, timeout=60) or {}
        login_id = result.get("loginId")
        if login_id:
            with self._state_lock:
                self._login_results.pop(str(login_id), None)
        return result

    def login_status(self, login_id: str) -> dict[str, Any]:
        with self._state_lock:
            completed = self._login_results.get(login_id)
        account = self.account_read(refresh=False)
        return {
            "login_id": login_id,
            "completed": completed,
            "account": account,
            "authenticated": bool(account.get("account")),
            "account_update": dict(self._account_update),
        }

    def cancel_login(self, login_id: str) -> dict[str, Any]:
        return self.request("account/login/cancel", {"loginId": login_id}, timeout=30) or {}

    def logout(self) -> dict[str, Any]:
        result = self.request("account/logout", {}, timeout=30) or {}
        with self._state_lock:
            self._account_update = {}
            self._model_cache = None
        return result

    def rate_limits(self) -> dict[str, Any]:
        return self.request("account/rateLimits/read", {}, timeout=60) or {}

    def account_usage(self) -> dict[str, Any]:
        try:
            return self.request("account/usage/read", {}, timeout=60) or {}
        except Exception as exc:
            return {"error": str(exc)}

    def model_list(self, *, force: bool = False) -> list[dict[str, Any]]:
        with self._state_lock:
            cached = self._model_cache
        if not force and cached and time.time() - cached[0] < 60:
            return [dict(x) for x in cached[1]]
        models: list[dict[str, Any]] = []
        cursor = None
        for _ in range(10):
            params: dict[str, Any] = {"limit": 100, "includeHidden": False}
            if cursor:
                params["cursor"] = cursor
            result = self.request("model/list", params, timeout=60) or {}
            models.extend(result.get("data") or [])
            cursor = result.get("nextCursor")
            if not cursor:
                break
        with self._state_lock:
            self._model_cache = (time.time(), [dict(x) for x in models])
        return models

    def health(self) -> dict[str, Any]:
        cli = self.cli_status()
        account: dict[str, Any] = {}
        error = None
        # Health checks must not trigger an npx download or start a hidden
        # backend process. Authentication is started only by the user's
        # explicit Connect action.
        if self.running:
            try:
                account = self.account_read(refresh=False)
            except Exception as exc:
                error = str(exc)
        return {
            "cli": cli,
            "app_server_running": self.running,
            "account": account,
            "authenticated": bool(account.get("account")),
            "account_update": dict(self._account_update),
            "error": error,
            "stderr_tail": list(self._stderr_tail[-10:]),
        }

    # -------------------------------- model turn --------------------------------
    def run_model_turn(
        self,
        *,
        prompt: str,
        model: str,
        effort: str | None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        self.start()
        account = self.account_read(refresh=False)
        if not account.get("account"):
            raise RuntimeError("Codex is not connected. Sign in with ChatGPT from the Model panel first.")

        config.CODEX_SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
        thread_result = self.request("thread/start", {
            "model": model,
            "cwd": str(config.CODEX_SANDBOX_DIR),
            "approvalPolicy": "never",
            # IMPORTANT: the legacy thread/start `sandbox` enum is kebab-case
            # in Codex builds that reject camelCase here. The turn-level
            # `sandboxPolicy` object uses different camelCase enum names.
            "sandbox": "read-only",
            "serviceName": config.CODEX_SERVICE_NAME,
        }, timeout=60) or {}
        thread = thread_result.get("thread") or {}
        thread_id = str(thread.get("id") or "")
        if not thread_id:
            raise RuntimeError("Codex app-server did not return a thread id")
        collector = _TurnCollector(thread_id=thread_id)
        with self._state_lock:
            self._turns[thread_id] = collector
        try:
            params: dict[str, Any] = {
                "threadId": thread_id,
                "input": [{"type": "text", "text": prompt}],
                "model": model,
                "cwd": str(config.CODEX_SANDBOX_DIR),
                "approvalPolicy": "never",
                # Do not repeat sandboxPolicy here. The turn inherits the
                # read-only thread sandbox, avoiding schema drift between
                # App Server releases (`sandbox` and `sandboxPolicy` use
                # different enum spellings across protocol generations).
                "summary": "concise",
            }
            if effort:
                params["effort"] = effort
            turn_result = self.request("turn/start", params, timeout=60) or {}
            turn = turn_result.get("turn") or {}
            turn_id = turn.get("id")
            if not collector.event.wait(timeout or config.CODEX_MODEL_TIMEOUT_SECONDS):
                if turn_id:
                    try:
                        self.request("turn/interrupt", {"threadId": thread_id, "turnId": turn_id}, timeout=10)
                    except Exception:
                        pass
                raise TimeoutError("Codex model turn timed out")
            if collector.status != "completed":
                err = collector.error or {}
                raise RuntimeError(str(err.get("message") or f"Codex turn ended with status {collector.status}"))
            content = "\n".join(x for x in collector.final_messages if x.strip()).strip()
            if not content:
                content = "".join(collector.streamed_parts).strip()
            return {
                "content": content,
                "usage_raw": collector.token_usage,
                "rerouted_model": collector.rerouted_model,
                "thread_id": thread_id,
                "turn_id": turn_id,
            }
        finally:
            with self._state_lock:
                self._turns.pop(thread_id, None)
            # These model-helper threads are implementation details, not user
            # conversations. Remove them from Codex history after each call.
            try:
                self.request("thread/unsubscribe", {"threadId": thread_id}, timeout=10)
            except Exception:
                pass
            try:
                self.request("thread/delete", {"threadId": thread_id}, timeout=15)
            except Exception:
                pass


class CodexModelAdapter:
    """Provider-neutral controller adapter backed by Codex App Server."""

    provider = "codex"

    def __init__(
        self,
        client: CodexAppServerClient,
        *,
        model_id: str,
        reasoning_effort: str | None = None,
    ) -> None:
        self.client = client
        self.model_id = model_id
        self.reasoning_effort = reasoning_effort or config.CODEX_DEFAULT_REASONING_EFFORT
        self.configured = True
        self.last_context_info: dict[str, Any] = {}

    def _context_window(self) -> int:
        discovered = int(config.CODEX_MODEL_CONTEXT_WINDOWS.get(self.model_id, config.CODEX_CONTEXT_WINDOW_TOKENS))
        return min(int(config.CODEX_CONTEXT_WINDOW_TOKENS), discovered)

    def _max_output(self) -> int:
        discovered = int(config.CODEX_MODEL_MAX_OUTPUTS.get(self.model_id, config.CODEX_RESERVED_OUTPUT_TOKENS))
        return min(int(config.CODEX_RESERVED_OUTPUT_TOKENS), discovered)

    @staticmethod
    def _messages_to_prompt(messages: list[dict[str, Any]]) -> str:
        blocks: list[str] = []
        for msg in messages:
            role = str(msg.get("role") or "user").upper()
            content = msg.get("content")
            blocks.append(f"[{role}]\n{content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)}")
        blocks.append(
            "[RUNTIME CONTRACT]\n"
            "You are a model component inside a deterministic coding-agent controller. "
            "Do not edit files, run commands, browse, or ask the user questions. Use only the supplied context. "
            "Return exactly the response format requested by the latest user message."
        )
        return "\n\n".join(blocks)

    @staticmethod
    def _normalize_usage(raw: dict[str, Any], prompt_est: int, completion_est: int) -> dict[str, Any]:
        # App-server usage schemas may evolve; preserve raw telemetry and expose
        # stable estimated counters to the existing controller budget logic.
        return {
            "prompt_tokens": prompt_est,
            "completion_tokens": completion_est,
            "total_tokens": prompt_est + completion_est,
            "provider_raw": raw,
        }

    def model_generate(self, args: dict[str, Any]) -> dict[str, Any]:
        messages = list(args.get("messages") or [])
        requested_output = int(args.get("max_tokens") or config.CODEX_RESERVED_OUTPUT_TOKENS)
        model_cap = self._max_output()
        reserve = min(max(1, requested_output), model_cap)
        try:
            fitted, context_info = fit_messages_to_context(
                messages,
                reserve,
                context_window=self._context_window(),
                model_max_output_tokens=model_cap,
                safety_margin=config.CODEX_CONTEXT_SAFETY_MARGIN_TOKENS,
                soft_input_limit=min(config.CODEX_SOFT_INPUT_LIMIT_TOKENS, self._context_window() - 1),
            )
            self.last_context_info = dict(context_info)
            prompt = self._messages_to_prompt(fitted)
            result = self.client.run_model_turn(
                prompt=prompt,
                model=args.get("model_id") or self.model_id,
                effort=args.get("reasoning_effort") or self.reasoning_effort,
                timeout=config.CODEX_MODEL_TIMEOUT_SECONDS,
            )
            content = result.get("content") or ""
            prompt_est = int(context_info.get("prompt_tokens_est") or estimate_messages_tokens(fitted))
            completion_est = estimate_text_tokens(content)
            return {
                "content": content,
                "tool_calls": [],
                "usage": self._normalize_usage(result.get("usage_raw") or {}, prompt_est, completion_est),
                "finish_reason": "stop",
                "error": None,
                "model": result.get("rerouted_model") or self.model_id,
                "context": context_info,
            }
        except Exception as exc:
            return {
                "content": None,
                "tool_calls": [],
                "usage": {},
                "finish_reason": "error",
                "error": str(exc),
                "model": self.model_id,
                "context": self.last_context_info,
            }


# Shared process for UI auth/model discovery and all local runs.
codex_client = CodexAppServerClient()
