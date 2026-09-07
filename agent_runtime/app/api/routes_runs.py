from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.run_service import service

router = APIRouter(prefix="/api", tags=["runs"])


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    state = service.get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    return state.model_dump(mode="json")


@router.post("/runs/{run_id}/stop")
def stop_run(run_id: str):
    try:
        state = service.cancel_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run_id": run_id, "status": state.status, "cancel_requested": state.cancel_requested}


@router.get("/runs/{run_id}/artifact")
def download_artifact(run_id: str):
    try:
        path = service.artifact_for_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return FileResponse(path, media_type="application/zip", filename=path.name)


@router.get("/model/health")
def model_health():
    return service.model_health()


@router.post("/model/test")
def test_model():
    result = service.test_model()
    if not result.get("ok"):
        # Keep as 200 so the UI can render the normalized model error without
        # treating the web app itself as unavailable.
        return result
    return result

@router.get("/runs/{run_id}/files")
def run_files(run_id: str):
    state = service.get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    root = Path(state.workspace_path).resolve()
    files = []
    for rel in state.project_files:
        path = (root / rel).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            continue
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        files.append({
            "name": rel,
            "language": path.suffix.lstrip(".") or "text",
            "content": content,
            "line_count": max(1, content.count("\n") + 1) if content else 0,
            "bytes": path.stat().st_size,
        })
    return {"run_id": run_id, "status": state.status, "phase": state.phase, "files": files}
