from __future__ import annotations
from pydantic import BaseModel


class RunEventEnvelope(BaseModel):
    run_id: str
    status: str
    phase: str
    trace_count: int
