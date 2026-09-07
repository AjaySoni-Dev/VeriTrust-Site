from __future__ import annotations

from pathlib import Path
from typing import Any

import config
from app.agent.context_window import fit_messages_to_context


class CodexSdkModelAdapter:
    """Provider-neutral adapter backed by an authenticated Codex SDK client.

    Nexora keeps Codex in a read-only sandbox and uses the SDK as an inference
    component. Model output is streamed through the same ``on_token`` callback
    contract used by the other providers; the controller remains responsible
    for applying and verifying project changes.
    """

    provider = "codex"
    configured = True

    def __init__(
        self,
        codex_client: Any,
        *,
        model_id: str,
        reasoning_effort: str | None = None,
        cwd: str | Path | None = None,
    ) -> None:
        self.client = codex_client
        self.model_id = str(model_id or "").strip()
        self.reasoning_effort = (reasoning_effort or "").strip() or None
        self.cwd = str(Path(cwd).resolve()) if cwd else None
        self.last_context_info: dict[str, Any] = {}
        if not self.model_id:
            raise ValueError("A Codex model must be selected.")

    @staticmethod
    def _flatten_messages(messages: list[dict[str, Any]]) -> str:
        chunks: list[str] = []
        for message in messages:
            role = str(message.get("role") or "user").upper()
            content = message.get("content")
            if isinstance(content, list):
                content = "\n".join(
                    str(item.get("text") or item.get("content") or item)
                    if isinstance(item, dict)
                    else str(item)
                    for item in content
                )
            chunks.append(f"[{role}]\n{str(content or '').strip()}")
        return "\n\n".join(chunks).strip()

    @staticmethod
    def _thread_usage_dict(token_usage: Any) -> dict[str, Any]:
        """Normalize Codex ``ThreadTokenUsage`` into Nexora's usage schema."""
        if token_usage is None:
            return {}

        last = getattr(token_usage, "last", None)
        if last is None and isinstance(token_usage, dict):
            last = token_usage.get("last") or token_usage.get("total")
        if last is None:
            last = token_usage

        if hasattr(last, "model_dump"):
            try:
                raw = last.model_dump(mode="json", by_alias=False, exclude_none=True)
            except Exception:
                raw = {}
        elif isinstance(last, dict):
            raw = dict(last)
        else:
            raw = {}
            for key in (
                "input_tokens",
                "output_tokens",
                "total_tokens",
                "cached_input_tokens",
                "reasoning_output_tokens",
                "cache_write_input_tokens",
            ):
                value = getattr(last, key, None)
                if value is not None:
                    raw[key] = value

        def number(*keys: str) -> int:
            for key in keys:
                candidate = raw.get(key)
                if candidate is None:
                    continue
                try:
                    return max(0, int(candidate))
                except (TypeError, ValueError):
                    continue
            return 0

        input_tokens = number("input_tokens", "inputTokens")
        output_tokens = number("output_tokens", "outputTokens")
        total_tokens = number("total_tokens", "totalTokens") or (input_tokens + output_tokens)
        cached_tokens = number("cached_input_tokens", "cachedInputTokens")
        reasoning_tokens = number(
            "reasoning_output_tokens",
            "reasoningOutputTokens",
            "reasoning_tokens",
        )

        usage: dict[str, Any] = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": total_tokens,
        }
        if cached_tokens:
            usage["cached_input_tokens"] = cached_tokens
        if reasoning_tokens:
            usage["reasoning_output_tokens"] = reasoning_tokens
            usage["reasoning_tokens"] = reasoning_tokens
            usage["completion_tokens_details"] = {"reasoning_tokens": reasoning_tokens}
        return usage

    def model_generate(self, args: dict[str, Any]) -> dict[str, Any]:
        try:
            from openai_codex import Sandbox

            raw_messages = args.get("messages") or []
            requested_output = min(
                int(args.get("max_tokens") or config.CODEX_RESERVED_OUTPUT_TOKENS),
                config.CODEX_RESERVED_OUTPUT_TOKENS,
            )
            messages, context_info = fit_messages_to_context(
                raw_messages,
                requested_output,
                context_window=config.CODEX_CONTEXT_WINDOW_TOKENS,
                model_max_output_tokens=config.CODEX_RESERVED_OUTPUT_TOKENS,
                safety_margin=config.CODEX_CONTEXT_SAFETY_MARGIN_TOKENS,
                soft_input_limit=config.CODEX_SOFT_INPUT_LIMIT_TOKENS,
            )
            prompt = self._flatten_messages(messages)
            if not prompt:
                raise ValueError("Codex model call contained no prompt text.")

            thread = self.client.thread_start(
                model=self.model_id,
                cwd=self.cwd,
                ephemeral=True,
                sandbox=Sandbox.read_only,
                developer_instructions=(
                    "You are a model component inside Nexora's deterministic website-building controller. "
                    "Do not modify files or execute commands. Return only the requested text/JSON/code payload."
                ),
            )
            run_kwargs: dict[str, Any] = {
                "model": self.model_id,
                "sandbox": Sandbox.read_only,
            }
            effort = str(args.get("reasoning_effort") or self.reasoning_effort or "").strip()
            if args.get("enable_thinking") is False:
                effort = "none"
            if effort:
                run_kwargs["effort"] = effort

            # Native SDK streaming. No post-completion chunk replay is used.
            turn = thread.turn(prompt, **run_kwargs)
            on_token = args.get("on_token")
            running_parts: list[str] = []
            completed_texts: list[str] = []
            token_usage: Any = None
            finish_reason = "completed"
            turn_error: str | None = None

            for event in turn.stream():
                method = str(getattr(event, "method", "") or "")
                payload = getattr(event, "payload", None)

                if method == "item/agentMessage/delta":
                    delta = str(getattr(payload, "delta", "") or "")
                    if delta:
                        running_parts.append(delta)
                        if callable(on_token):
                            try:
                                on_token(delta, "".join(running_parts))
                            except Exception:
                                # UI callbacks must not be able to abort inference.
                                pass
                    continue

                if method == "item/completed":
                    item = getattr(payload, "item", None)
                    root = getattr(item, "root", item)
                    item_type = getattr(root, "type", None)
                    item_type = getattr(item_type, "value", item_type)
                    if str(item_type or "") == "agentMessage":
                        text = str(getattr(root, "text", "") or "")
                        if text:
                            completed_texts.append(text)
                    continue

                if method == "thread/tokenUsage/updated":
                    token_usage = getattr(payload, "token_usage", None)
                    continue

                if method == "turn/completed":
                    completed_turn = getattr(payload, "turn", None)
                    status = getattr(completed_turn, "status", None)
                    finish_reason = str(getattr(status, "value", status) or "completed")
                    error = getattr(completed_turn, "error", None)
                    if error:
                        turn_error = str(getattr(error, "message", None) or error)

            content = "".join(running_parts).strip()
            if not content:
                # A runtime can legally omit deltas while still returning the
                # completed agent-message item. Preserve it without inventing
                # artificial token events.
                content = "".join(completed_texts).strip()

            usage = self._thread_usage_dict(token_usage)
            if not usage:
                # Compatibility fallback for a runtime that does not publish a
                # token-usage notification; this estimates usage only, not text.
                prompt_est = max(
                    0,
                    int(
                        context_info.get("prompt_tokens_est")
                        or context_info.get("original_prompt_tokens_est")
                        or 0
                    ),
                )
                completion_est = max(0, (len(content) + 3) // 4)
                usage = {
                    "prompt_tokens_est": prompt_est,
                    "completion_tokens_est": completion_est,
                    "total_tokens": prompt_est + completion_est,
                }

            usage["context_compacted"] = bool(context_info.get("compacted"))
            usage["context_tokens_saved_est"] = int(context_info.get("tokens_saved_est") or 0)
            self.last_context_info = {
                **context_info,
                "provider": "codex",
                "model": self.model_id,
                "usage": usage,
                "turn_id": getattr(turn, "id", None),
            }

            if finish_reason == "failed" or turn_error:
                return {
                    "content": content,
                    "tool_calls": [],
                    "usage": usage,
                    "finish_reason": finish_reason,
                    "error": turn_error or "Codex turn failed.",
                }

            return {
                "content": content,
                "tool_calls": [],
                "usage": usage,
                "finish_reason": finish_reason,
                "error": None,
            }
        except Exception as exc:
            return {
                "content": "",
                "tool_calls": [],
                "usage": {},
                "finish_reason": "error",
                "error": str(exc),
            }
