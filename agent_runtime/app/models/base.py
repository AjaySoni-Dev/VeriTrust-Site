from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ModelAdapter(Protocol):
    """Minimal provider-neutral contract consumed by the custom controller."""

    provider: str
    model_id: str
    configured: bool
    last_context_info: dict[str, Any]

    def model_generate(self, args: dict[str, Any]) -> dict[str, Any]:
        """Return normalized {content, tool_calls, usage, finish_reason, error}."""
        ...
