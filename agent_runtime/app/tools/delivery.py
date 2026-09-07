from __future__ import annotations

import json
import os
import tempfile
import time
import zipfile
from pathlib import Path

import config
from app.tools.common import response


def package_project(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        project = Path(args["workspace_root"]).resolve()
        output = Path(args["output_path"]).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        exclude = set(args.get("exclude") or config.INTERNAL_EXCLUDES)
        fd, tmp = tempfile.mkstemp(prefix=output.stem + ".", suffix=".zip.tmp", dir=output.parent)
        os.close(fd)
        file_count = 0
        try:
            with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
                for path in project.rglob("*"):
                    if not path.is_file():
                        continue
                    rel = path.relative_to(project)
                    if any(part in exclude or part.startswith(".agent") for part in rel.parts):
                        continue
                    zf.write(path, rel.as_posix())
                    file_count += 1
            os.replace(tmp, output)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return response("package_project", True, {
            "artifact_path": str(output),
            "file_count": file_count,
            "size_bytes": output.stat().st_size,
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("package_project", False, error=str(exc), run_id=run_id, started=started)


def save_run_manifest(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        path = Path(args["manifest_path"]).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "run_id": run_id,
            "project_id": args.get("project_id"),
            "model_id": args.get("model_id"),
            "config_hash": args.get("config_hash"),
            "verification": args.get("verification", {}),
            "state_summary": args.get("state_summary", {}),
        }
        # Explicitly never persist credential-like fields.
        for key in list(payload):
            if "token" in key.lower() or "key" in key.lower():
                payload.pop(key, None)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        return response("save_run_manifest", True, {"manifest_path": str(path)}, run_id=run_id, started=started)
    except Exception as exc:
        return response("save_run_manifest", False, error=str(exc), run_id=run_id, started=started)
