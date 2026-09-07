from __future__ import annotations

import time
from typing import Any

import config
from app.agent.context_window import estimate_messages_tokens, estimate_text_tokens, fit_messages_to_context
from app.tools.common import redact_secret


class NIMModelAdapter:
    provider = "nvidia"
    """OpenAI-compatible adapter for NVIDIA hosted NIM.

    Endpoint: https://integrate.api.nvidia.com/v1
    Model:    nvidia/nemotron-3-super-120b-a12b

    The adapter owns provider-specific request formatting. The custom agent
    controller still owns state, retries, security, tool execution and success.
    """

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, model_id: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else config.NVIDIA_API_KEY
        self.base_url = base_url or config.NVIDIA_BASE_URL
        self.model_id = model_id or config.NVIDIA_MODEL_ID
        self.configured = bool(self.api_key and self.api_key != "PASTE_YOUR_NVIDIA_API_KEY_HERE")
        self._client = None
        self.last_context_info: dict[str, Any] = {}

    @property
    def client(self):
        if self._client is None:
            if not self.configured:
                raise RuntimeError("NVIDIA_API_KEY is not configured in config.py")
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise RuntimeError("The 'openai' package is missing. Run start.py so dependencies can be installed.") from exc
            self._client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=config.MODEL_TIMEOUT_SECONDS,
            )
        return self._client

    @staticmethod
    def _reasoning_budget(max_tokens: int, effort: str | None = None) -> int | None:
        normalized = str(effort or "medium").strip().lower()
        if normalized == "none" or config.MODEL_REASONING_BUDGET <= 0:
            return None
        effort_scale = {
            "minimal": 0.35,
            "low": 0.55,
            "medium": 1.0,
            "high": 1.5,
            "xhigh": 2.0,
            "max": 2.5,
        }.get(normalized, 1.0)
        fraction_scale = {
            "minimal": 0.10,
            "low": 0.18,
            "medium": config.REASONING_BUDGET_FRACTION,
            "high": 0.55,
            "xhigh": 0.72,
            "max": 0.90,
        }.get(normalized, config.REASONING_BUDGET_FRACTION)
        fraction_cap = max(128, int(max_tokens * max(0.05, min(fraction_scale, 0.95))))
        scaled_budget = max(128, int(config.MODEL_REASONING_BUDGET * effort_scale))
        return min(scaled_budget, fraction_cap, max_tokens)

    def _base_kwargs(self, args: dict[str, Any], messages: list[dict[str, Any]]) -> dict[str, Any]:
        max_tokens = min(int(args.get("max_tokens", config.MODEL_MAX_TOKENS)), config.MODEL_MAX_TOKENS)
        kwargs: dict[str, Any] = {
            "model": args.get("model_id") or self.model_id,
            "messages": messages,
            "temperature": float(args.get("temperature", config.MODEL_TEMPERATURE)),
            "top_p": float(args.get("top_p", config.MODEL_TOP_P)),
            "max_tokens": max_tokens,
        }
        if args.get("response_format"):
            kwargs["response_format"] = args["response_format"]
        requested_effort = str(
            args.get("reasoning_effort") or getattr(self, "reasoning_effort", "") or "medium"
        ).strip().lower()
        requested_thinking = args.get("enable_thinking")
        if requested_thinking is None:
            requested_thinking = requested_effort != "none" and config.ENABLE_THINKING
        extra_body: dict[str, Any] = {
            "chat_template_kwargs": {"enable_thinking": bool(requested_thinking)}
        }
        reasoning_budget = args.get("reasoning_budget")
        if reasoning_budget is None:
            reasoning_budget = self._reasoning_budget(max_tokens, requested_effort)
        if reasoning_budget is not None and int(reasoning_budget) > 0 and extra_body["chat_template_kwargs"]["enable_thinking"]:
            extra_body["reasoning_budget"] = min(int(reasoning_budget), max_tokens)
        kwargs["extra_body"] = extra_body

        tools = args.get("tools") or None
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = args.get("tool_choice", "auto")
        return kwargs

    @staticmethod
    def _normalize_usage(usage_obj: Any) -> dict[str, Any]:
        if usage_obj is None:
            return {}
        if hasattr(usage_obj, "model_dump"):
            return usage_obj.model_dump()
        if isinstance(usage_obj, dict):
            return dict(usage_obj)
        return {}

    def _stream_response(self, kwargs: dict[str, Any], on_token=None) -> dict[str, Any]:
        stream = self.client.chat.completions.create(**kwargs, stream=True)
        content_parts: list[str] = []
        reasoning_parts: list[str] = []
        tool_buffers: dict[int, dict[str, Any]] = {}
        finish_reason = None
        usage: dict[str, Any] = {}

        for chunk in stream:
            chunk_usage = self._normalize_usage(getattr(chunk, "usage", None))
            if chunk_usage:
                usage = chunk_usage
            if not getattr(chunk, "choices", None):
                continue
            choice = chunk.choices[0]
            if getattr(choice, "finish_reason", None) is not None:
                finish_reason = choice.finish_reason
            delta = choice.delta
            # Model reasoning is counted for transparent usage reporting but is
            # intentionally never persisted or exposed as raw chain-of-thought.
            reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
            if reasoning:
                reasoning_parts.append(str(reasoning))
            content = getattr(delta, "content", None)
            if content:
                content_parts.append(content)
                if callable(on_token):
                    try:
                        on_token(str(content), "".join(content_parts))
                    except Exception:
                        pass
            for call in getattr(delta, "tool_calls", None) or []:
                index = int(getattr(call, "index", 0) or 0)
                buf = tool_buffers.setdefault(index, {
                    "id": getattr(call, "id", None),
                    "type": getattr(call, "type", None) or "function",
                    "function": {"name": "", "arguments": ""},
                })
                if getattr(call, "id", None):
                    buf["id"] = call.id
                func = getattr(call, "function", None)
                if func is not None:
                    name = getattr(func, "name", None)
                    arguments = getattr(func, "arguments", None)
                    if name:
                        buf["function"]["name"] += name
                    if arguments:
                        buf["function"]["arguments"] += arguments

        content_text = "".join(content_parts)
        if reasoning_parts and not self._reasoning_tokens(usage):
            usage["reasoning_tokens_est"] = estimate_text_tokens("".join(reasoning_parts))
        normalized_calls = [tool_buffers[i] for i in sorted(tool_buffers)]
        return {
            "content": content_text or None,
            "tool_calls": normalized_calls,
            "usage": usage,
            "finish_reason": finish_reason,
        }

    def _nonstream_response(self, kwargs: dict[str, Any]) -> dict[str, Any]:
        response = self.client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        usage = self._normalize_usage(getattr(response, "usage", None))
        reasoning = getattr(message, "reasoning_content", None) or getattr(message, "reasoning", None)
        if reasoning and not self._reasoning_tokens(usage):
            usage["reasoning_tokens_est"] = estimate_text_tokens(str(reasoning))
        normalized_calls = []
        for call in getattr(message, "tool_calls", None) or []:
            normalized_calls.append({
                "id": call.id,
                "type": call.type,
                "function": {"name": call.function.name, "arguments": call.function.arguments},
            })
        return {
            "content": getattr(message, "content", None),
            "tool_calls": normalized_calls,
            "usage": usage,
            "finish_reason": response.choices[0].finish_reason,
        }

    @staticmethod
    def _reasoning_tokens(usage: dict[str, Any]) -> int:
        details = usage.get("completion_tokens_details") or usage.get("output_tokens_details") or {}
        if not isinstance(details, dict):
            details = details.model_dump() if hasattr(details, "model_dump") else {}
        value = details.get("reasoning_tokens") or usage.get("reasoning_tokens") or usage.get("reasoning_output_tokens") or 0
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    def model_generate(self, args: dict[str, Any]) -> dict[str, Any]:
        if not self.configured:
            return {
                "content": None,
                "tool_calls": [],
                "usage": {},
                "finish_reason": None,
                "context": {},
                "error": "NVIDIA_API_KEY is not configured in config.py",
            }

        requested_max_tokens = min(int(args.get("max_tokens", config.MODEL_MAX_TOKENS)), config.MODEL_MAX_TOKENS)
        raw_messages = args.get("messages") or []
        messages, context_info = fit_messages_to_context(raw_messages, requested_max_tokens)
        self.last_context_info = context_info
        kwargs = self._base_kwargs(args, messages)

        last_error = None
        for attempt in range(config.MODEL_RETRIES + 1):
            try:
                normalized = self._stream_response(kwargs, on_token=args.get("on_token")) if bool(args.get("stream", config.MODEL_STREAM)) else self._nonstream_response(kwargs)
                usage = normalized.get("usage") or {}
                if not usage.get("prompt_tokens"):
                    usage["prompt_tokens_est"] = estimate_messages_tokens(messages)
                if not usage.get("completion_tokens"):
                    usage["completion_tokens_est"] = estimate_text_tokens(normalized.get("content") or "")
                if not usage.get("total_tokens"):
                    usage["total_tokens"] = int(usage.get("prompt_tokens") or usage.get("prompt_tokens_est") or 0) + int(usage.get("completion_tokens") or usage.get("completion_tokens_est") or 0)
                usage["context_compacted"] = bool(context_info.get("compacted"))
                usage["context_tokens_saved_est"] = int(context_info.get("tokens_saved_est", 0))
                normalized["usage"] = usage
                normalized["context"] = context_info
                normalized["error"] = None
                return normalized
            except Exception as exc:
                last_error = redact_secret(str(exc), self.api_key)
                if attempt < config.MODEL_RETRIES:
                    time.sleep(min(2 ** attempt, 4))

        return {
            "content": None,
            "tool_calls": [],
            "usage": {},
            "finish_reason": None,
            "context": context_info,
            "error": last_error or "Unknown NVIDIA model error",
        }


def model_generate(args: dict[str, Any]) -> dict[str, Any]:
    return NIMModelAdapter().model_generate(args)
