from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.run_service import service

router = APIRouter(prefix="/api/models", tags=["provider-models"])


class DiscoverRequest(BaseModel):
    provider: Literal["nvidia", "openrouter"]
    api_key: str = Field(min_length=1, max_length=2048)
    base_url: str | None = Field(default=None, max_length=300)


class TestRequest(DiscoverRequest):
    model_id: str = Field(min_length=1, max_length=220)


@router.get("/providers")
def providers():
    return {
        "default_provider": "openrouter",
        "providers": {
            "openrouter": {"provider": "openrouter", "user_managed_key": True, "ready": True},
            "nvidia": {"provider": "nvidia", "user_managed_key": True, "ready": True},
            "codex": {
                "provider": "codex",
                "user_managed_key": False,
                "account_auth": "chatgpt_device_code",
                "ready": True,
                "models_endpoint": "/api/codex/models",
            },
        },
        "serverless": True,
    }


@router.post("/discover")
def discover(payload: DiscoverRequest):
    return service.discover_models(provider=payload.provider, api_key=payload.api_key, base_url=payload.base_url)


@router.post("/test")
def test(payload: TestRequest):
    return service.test_model(provider=payload.provider, model_id=payload.model_id, api_key=payload.api_key, base_url=payload.base_url)
