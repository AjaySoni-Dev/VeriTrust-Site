from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from app.schemas.agent import AgentState, PlanStep


def atomic_json_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def save_state(state: AgentState) -> None:
    atomic_json_write(Path(state.run_root) / "state.json", state.model_dump(mode="json"))


def update_plan(args: dict) -> list[dict]:
    """Update a plan step without regenerating the whole plan."""
    plan = [PlanStep.model_validate(item) for item in args.get("plan", [])]
    step_id = str(args["step_id"])
    new_status = args["new_status"]
    reason = args.get("reason")
    found = False
    for step in plan:
        if step.id == step_id:
            step.status = new_status
            step.reason = reason
            found = True
            break
    if not found and args.get("new_steps"):
        plan.extend(PlanStep.model_validate(item) for item in args["new_steps"])
    return [step.model_dump() for step in plan]
