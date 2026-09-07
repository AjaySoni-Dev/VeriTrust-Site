from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.agent import CreateProjectRequest, GenerateRequest
from app.services.run_service import service

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def list_projects():
    return {"projects": service.list_projects()}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: CreateProjectRequest):
    return service.create_project(payload.name)


@router.get("/{project_id}")
def get_project(project_id: str):
    try:
        project = service.get_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/generate", status_code=status.HTTP_202_ACCEPTED)
def generate(project_id: str, payload: GenerateRequest, request: Request):
    try:
        base_url = str(request.base_url).rstrip("/")
        state = service.start_run(
            project_id=project_id,
            prompt=payload.prompt,
            inject_demo_bug=payload.inject_demo_bug,
            base_url=base_url,
            provider=payload.provider,
            model_id=payload.model_id,
            reasoning_effort=payload.reasoning_effort,
            api_key=payload.api_key,
            model_base_url=payload.base_url,
        )
        return {
            "run_id": state.run_id,
            "project_id": state.project_id,
            "status": state.status,
            "is_revision": state.is_revision,
            "provider": state.model_provider,
            "model_id": state.model_id,
            "reasoning_effort": state.reasoning_effort,
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
