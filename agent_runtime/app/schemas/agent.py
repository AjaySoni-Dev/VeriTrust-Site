from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


Phase = Literal[
    "ANALYZE", "PLAN", "INSPECT", "ACT", "VERIFY", "REPAIR", "REPLAN",
    "COMPLETE", "FAILED", "CANCELLED",
]


class Requirement(BaseModel):
    id: str
    text: str
    category: str = "feature"
    verification_hint: str | None = None


class PlanStep(BaseModel):
    id: str
    title: str
    description: str = ""
    status: Literal["pending", "working", "passed", "failed", "skipped"] = "pending"
    reason: str | None = None


class TraceEvent(BaseModel):
    id: int
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    phase: str
    kind: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class AgentState(BaseModel):
    run_id: str
    project_id: str
    workspace_path: str
    run_root: str
    original_request: str
    latest_request: str
    requirements: list[Requirement] = Field(default_factory=list)
    plan: list[PlanStep] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    phase: Phase = "ANALYZE"
    current_step_id: str | None = None
    completed_steps: list[str] = Field(default_factory=list)
    pending_steps: list[str] = Field(default_factory=list)
    failed_steps: list[str] = Field(default_factory=list)
    project_files: list[str] = Field(default_factory=list)
    file_versions: dict[str, str] = Field(default_factory=dict)
    relevant_files: list[str] = Field(default_factory=list)
    tool_history: list[dict[str, Any]] = Field(default_factory=list)
    change_history: list[dict[str, Any]] = Field(default_factory=list)
    execution_history: list[dict[str, Any]] = Field(default_factory=list)
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    verification_results: list[dict[str, Any]] = Field(default_factory=list)
    verification_spec: dict[str, Any] = Field(default_factory=dict)
    checkpoint_id: str | None = None
    iteration_count: int = 0
    error_retry_count: int = 0
    patch_retry_count: int = 0
    replan_count: int = 0
    token_budget_used: int = 0
    reasoning_tokens_used: int = 0
    last_prompt_tokens_est: int = 0
    last_completion_tokens_est: int = 0
    context_compaction_count: int = 0
    context_tokens_saved_est: int = 0
    last_context_info: dict[str, Any] = Field(default_factory=dict)
    self_repair_count: int = 0
    status: Literal["queued", "working", "completed", "failed", "cancelled"] = "queued"
    cancel_requested: bool = False
    artifact_path: str | None = None
    manifest_path: str | None = None
    preview_url: str | None = None
    final_verification: dict[str, Any] = Field(default_factory=dict)
    model_provider: Literal["nvidia", "openrouter", "codex"] = "nvidia"
    model_id: str = ""
    reasoning_effort: str | None = None
    is_revision: bool = False
    inject_demo_bug: bool = False
    trace: list[TraceEvent] = Field(default_factory=list)
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: str | None = None


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=20000)
    inject_demo_bug: bool = False
    provider: Literal["nvidia", "openrouter", "codex"] = "nvidia"
    model_id: str | None = Field(default=None, max_length=160)
    reasoning_effort: str | None = Field(default=None, max_length=32)
    api_key: str | None = Field(default=None, max_length=1024)
    base_url: str | None = Field(default=None, max_length=300)


class ModelTestRequest(BaseModel):
    provider: Literal["nvidia", "openrouter", "codex"]
    model_id: str | None = Field(default=None, max_length=160)
    reasoning_effort: str | None = Field(default=None, max_length=32)
    api_key: str | None = Field(default=None, max_length=1024)
    base_url: str | None = Field(default=None, max_length=300)


class ProviderModelsRequest(BaseModel):
    provider: Literal["nvidia", "openrouter", "codex"]
    api_key: str | None = Field(default=None, max_length=1024)
    base_url: str | None = Field(default=None, max_length=300)

class CreateProjectRequest(BaseModel):
    name: str = Field(default="Untitled Project", min_length=1, max_length=120)


class ProjectSummary(BaseModel):
    project_id: str
    name: str
    created_at: str
    updated_at: str
    latest_run_id: str | None = None
    run_count: int = 0
