from __future__ import annotations

import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.tools.common import response


def create_checkpoint(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        workspace = Path(args["workspace_root"]).resolve()
        checkpoint_root = Path(args["checkpoint_root"]).resolve()
        checkpoint_root.mkdir(parents=True, exist_ok=True)
        checkpoint_id = f"cp_{uuid.uuid4().hex[:12]}"
        target = checkpoint_root / checkpoint_id
        include = args.get("include")
        if include:
            target.mkdir(parents=True, exist_ok=False)
            for rel in include:
                src = workspace / rel
                if src.exists() and src.is_file():
                    dst = target / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
        else:
            shutil.copytree(workspace, target, ignore=shutil.ignore_patterns(".agent", "__pycache__"))
        (target / ".checkpoint_meta").write_text(str(args.get("label", "checkpoint")), encoding="utf-8")
        return response("create_checkpoint", True, {
            "checkpoint_id": checkpoint_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("create_checkpoint", False, error=str(exc), run_id=run_id, started=started)


def rollback(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        workspace = Path(args["workspace_root"]).resolve()
        checkpoint_root = Path(args["checkpoint_root"]).resolve()
        source = (checkpoint_root / args["checkpoint_id"]).resolve()
        try:
            source.relative_to(checkpoint_root)
        except ValueError as exc:
            raise ValueError("Invalid checkpoint id") from exc
        if not source.exists():
            raise FileNotFoundError(args["checkpoint_id"])
        # Replace project contents but preserve the workspace directory itself.
        for item in workspace.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
        restored_files: list[str] = []
        for item in source.rglob("*"):
            if item.name == ".checkpoint_meta":
                continue
            rel = item.relative_to(source)
            dst = workspace / rel
            if item.is_dir():
                dst.mkdir(parents=True, exist_ok=True)
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, dst)
                restored_files.append(rel.as_posix())
        return response("rollback", True, {
            "restored": True,
            "restored_files": sorted(restored_files),
            "reason": args.get("reason", ""),
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("rollback", False, error=str(exc), run_id=run_id, started=started)
