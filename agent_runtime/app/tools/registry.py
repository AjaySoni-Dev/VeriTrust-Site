from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import config
from app.agent.policy import PHASE_ALLOWED_TOOLS
from app.tools.browser import browser_verify
from app.tools.checkpoints import create_checkpoint, rollback
from app.tools.delivery import package_project, save_run_manifest
from app.tools.diagnostics import get_diagnostics
from app.tools.execution import run_command, run_file
from app.tools.filesystem import create_file, create_files, delete_file, edit_file, list_files, move_file, read_file, search_files
from app.tools.patching import apply_patch, validate_patch
from app.agent.verifier import validate_project

TOOL_REGISTRY: dict[str, Callable[[dict], dict]] = {
    "list_files": list_files,
    "search_files": search_files,
    "read_file": read_file,
    "create_file": create_file,
    "create_files": create_files,
    "apply_patch": apply_patch,
    "edit_file": edit_file,
    "move_file": move_file,
    "delete_file": delete_file,
    "create_checkpoint": create_checkpoint,
    "rollback": rollback,
    "run_file": run_file,
    "run_command": run_command,
    "get_diagnostics": get_diagnostics,
    "validate_patch": validate_patch,
    "validate_project": validate_project,
    "browser_verify": browser_verify,
    "package_project": package_project,
    "save_run_manifest": save_run_manifest,
}

PATH_FIELDS = {"path", "source", "destination", "cwd"}


def guard_action(args: dict) -> dict:
    tool_name = args["tool_name"]
    arguments = dict(args.get("arguments") or {})
    state = args.get("state") or {}
    policy = args.get("policy") or {}
    phase = state.get("phase", "INSPECT")
    allowed = PHASE_ALLOWED_TOOLS.get(phase, set())
    if tool_name not in TOOL_REGISTRY:
        return {"allowed": False, "normalized_args": {}, "reason": "unknown_tool"}
    if tool_name not in allowed:
        return {"allowed": False, "normalized_args": {}, "reason": f"tool_not_allowed_in_phase:{phase}"}

    workspace_root = Path(state["workspace_path"]).resolve()
    for key in PATH_FIELDS:
        value = arguments.get(key)
        if not value or key == "cwd":
            continue
        candidate = Path(str(value))
        if candidate.is_absolute():
            return {"allowed": False, "normalized_args": {}, "reason": f"absolute_path_rejected:{key}"}
        resolved = (workspace_root / candidate).resolve()
        try:
            resolved.relative_to(workspace_root)
        except ValueError:
            return {"allowed": False, "normalized_args": {}, "reason": f"path_escape_rejected:{key}"}

    if tool_name == "run_command":
        argv = arguments.get("argv") or []
        if not argv or Path(argv[0]).name.lower() not in config.COMMAND_ALLOWLIST:
            return {"allowed": False, "normalized_args": {}, "reason": "command_not_allowlisted"}
    if tool_name in {"apply_patch", "edit_file", "delete_file"} and not arguments.get("expected_version"):
        return {"allowed": False, "normalized_args": {}, "reason": "expected_version_required"}
    return {"allowed": True, "normalized_args": arguments, "reason": "allowed"}


def dispatch_tool(args: dict) -> dict:
    tool_name = args["tool_name"]
    handler = (args.get("registry") or TOOL_REGISTRY).get(tool_name)
    if handler is None:
        return {"success": False, "tool": tool_name, "data": {}, "error": "unknown_tool", "metadata": {"run_id": args.get("run_id", "")}}
    payload = dict(args.get("arguments") or {})
    payload.setdefault("run_id", args.get("run_id", ""))
    payload.setdefault("workspace_root", args.get("workspace_root"))
    if args.get("checkpoint_root"):
        payload.setdefault("checkpoint_root", args["checkpoint_root"])
    return handler(payload)
