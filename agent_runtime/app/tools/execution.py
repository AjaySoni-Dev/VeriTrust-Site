from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import config
from app.tools.common import redact_secret, response, safe_project_path


def run_command(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        argv = args.get("argv") or []
        if not argv or not isinstance(argv, list) or not all(isinstance(x, str) for x in argv):
            raise ValueError("argv must be a non-empty list of strings")
        executable = Path(argv[0]).name.lower()
        allowed = set(args.get("allowlist") or config.COMMAND_ALLOWLIST)
        if executable not in allowed:
            raise PermissionError(f"Executable {executable!r} is not allowlisted")
        cwd = Path(args.get("cwd") or args["workspace_root"]).resolve()
        root = Path(args["workspace_root"]).resolve()
        try:
            cwd.relative_to(root)
        except ValueError as exc:
            raise PermissionError("cwd escapes workspace") from exc
        env = {"PATH": os.environ.get("PATH", ""), "PYTHONIOENCODING": "utf-8"}
        for key, value in (args.get("env_allowlist") or {}).items():
            if key.upper() in {"HF_TOKEN", "OPENAI_API_KEY", "NVIDIA_API_KEY"}:
                continue
            env[str(key)] = str(value)
        completed = subprocess.run(
            argv,
            cwd=str(cwd),
            env=env,
            capture_output=True,
            text=True,
            shell=False,
            timeout=int(args.get("timeout_seconds", config.COMMAND_TIMEOUT_SECONDS)),
        )
        return response("run_command", True, {
            "exit_code": completed.returncode,
            "stdout": redact_secret(completed.stdout)[-config.MAX_LOG_CHARS:],
            "stderr": redact_secret(completed.stderr)[-config.MAX_LOG_CHARS:],
            "duration_ms": int((time.perf_counter() - started) * 1000),
        }, run_id=run_id, started=started)
    except subprocess.TimeoutExpired as exc:
        return response("run_command", False, {
            "exit_code": None,
            "stdout": redact_secret((exc.stdout or "") if isinstance(exc.stdout, str) else ""),
            "stderr": "command_timeout",
        }, error="command_timeout", run_id=run_id, started=started)
    except Exception as exc:
        return response("run_command", False, error=redact_secret(str(exc)), run_id=run_id, started=started)


def run_file(args: dict) -> dict:
    """Run/serve a target according to a small runtime adapter.

    HTML is served by the FastAPI preview route, so no extra shell process is
    needed. JavaScript can optionally be syntax-checked with Node.
    """
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        runtime = args.get("runtime", "auto")
        if path.suffix.lower() in {".html", ".htm"} or runtime == "browser":
            preview_url = args.get("preview_url")
            if not preview_url:
                raise ValueError("preview_url is required for HTML runtime")
            return response("run_file", True, {
                "exit_code": 0,
                "stdout": "FastAPI preview route ready",
                "stderr": "",
                "preview_url": preview_url,
            }, run_id=run_id, started=started)
        if path.suffix.lower() == ".js" and shutil.which("node"):
            result = run_command({
                "workspace_root": root,
                "run_id": run_id,
                "argv": ["node", "--check", str(path.relative_to(Path(root).resolve()))],
                "cwd": root,
                "timeout_seconds": args.get("timeout_seconds", config.COMMAND_TIMEOUT_SECONDS),
            })
            data = result.get("data", {})
            data["preview_url"] = args.get("preview_url")
            return response("run_file", result["success"], data, result.get("error"), run_id=run_id, started=started)
        return response("run_file", True, {
            "exit_code": 0,
            "stdout": "No executable runtime required for this static project file.",
            "stderr": "",
            "preview_url": args.get("preview_url"),
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("run_file", False, error=str(exc), run_id=run_id, started=started)
