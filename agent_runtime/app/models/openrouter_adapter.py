from __future__ import annotations

import time
from typing import Any

import config
from app.agent.context_window import estimate_messages_tokens, estimate_text_tokens, fit_messages_to_context
from app.tools.common import redact_secret


class OpenRouterModelAdapter:
    provider = "openrouter"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, model_id: str | None = None) -> None:
        self.api_key = (api_key or "").strip()
        self.base_url = (base_url or config.OPENROUTER_BASE_URL).rstrip("/")
        self.model_id = (model_id or config.OPENROUTER_MODEL_ID).strip()
        self.configured = bool(self.api_key)
        self._client = None
        self.last_context_info: dict[str, Any] = {}

    @property
    def client(self):
        if self._client is None:
            if not self.configured:
                raise RuntimeError("OpenRouter API key is missing")
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise RuntimeError("The 'openai' package is missing. Run start_nexora.py first.") from exc
            self._client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=config.MODEL_TIMEOUT_SECONDS,
                default_headers={
                    "HTTP-Referer": config.OPENROUTER_SITE_URL,
                    "X-OpenRouter-Title": config.OPENROUTER_APP_TITLE,
                },
            )
        return self._client

    @staticmethod
    def _normalize_usage(usage_obj: Any) -> dict[str, Any]:
        if usage_obj is None:
            return {}
        if hasattr(usage_obj, "model_dump"):
            return usage_obj.model_dump()
        if isinstance(usage_obj, dict):
            return dict(usage_obj)
        return {}

    def _request(self, kwargs: dict[str, Any], stream: bool, on_token=None) -> dict[str, Any]:
        if stream:
            response = self.client.chat.completions.create(**kwargs, stream=True)
            parts: list[str] = []
            reasoning_parts: list[str] = []
            finish_reason = None
            usage: dict[str, Any] = {}
            for chunk in response:
                chunk_usage = self._normalize_usage(getattr(chunk, "usage", None))
                if chunk_usage:
                    usage = chunk_usage
                if not getattr(chunk, "choices", None):
                    continue
                choice = chunk.choices[0]
                finish_reason = getattr(choice, "finish_reason", None) or finish_reason
                delta = choice.delta
                content = getattr(delta, "content", None)
                if content:
                    parts.append(content)
                    if callable(on_token):
                        try:
                            on_token(str(content), "".join(parts))
                        except Exception:
                            pass
                reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
                if reasoning:
                    reasoning_parts.append(str(reasoning))
            if reasoning_parts and not self._reasoning_tokens(usage):
                usage["reasoning_tokens_est"] = estimate_text_tokens("".join(reasoning_parts))
            return {"content": "".join(parts) or None, "tool_calls": [], "usage": usage, "finish_reason": finish_reason}

        response = self.client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        usage = self._normalize_usage(getattr(response, "usage", None))
        reasoning = getattr(message, "reasoning_content", None) or getattr(message, "reasoning", None)
        if reasoning and not self._reasoning_tokens(usage):
            usage["reasoning_tokens_est"] = estimate_text_tokens(str(reasoning))
        return {
            "content": getattr(message, "content", None),
            "tool_calls": [],
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
            return {"content": None, "tool_calls": [], "usage": {}, "finish_reason": None, "context": {}, "error": "OpenRouter API key is missing"}

        requested_max_tokens = min(int(args.get("max_tokens", config.MODEL_MAX_TOKENS)), config.MODEL_MAX_TOKENS)
        messages, context_info = fit_messages_to_context(args.get("messages") or [], requested_max_tokens)
        self.last_context_info = context_info
        kwargs: dict[str, Any] = {
            "model": args.get("model_id") or self.model_id,
            "messages": messages,
            "temperature": float(args.get("temperature", config.MODEL_TEMPERATURE)),
            "top_p": float(args.get("top_p", config.MODEL_TOP_P)),
            "max_tokens": requested_max_tokens,
        }
        if args.get("response_format"):
            kwargs["response_format"] = args["response_format"]
        if "enable_thinking" in args:
            enabled = bool(args.get("enable_thinking"))
            effort = str(args.get("reasoning_effort") or ("medium" if enabled else "none")).strip().lower()
            kwargs["extra_body"] = {
                "reasoning": {
                    "enabled": enabled,
                    "effort": effort if enabled else "none",
                    "exclude": not enabled,
                }
            }

        last_error = None
        for attempt in range(config.MODEL_RETRIES + 1):
            try:
                normalized = self._request(kwargs, bool(args.get("stream", config.MODEL_STREAM)), on_token=args.get("on_token"))
                usage = normalized.get("usage") or {}
                if not usage.get("prompt_tokens"):
                    usage["prompt_tokens_est"] = estimate_messages_tokens(messages)
                if not usage.get("completion_tokens"):
                    usage["completion_tokens_est"] = estimate_text_tokens(normalized.get("content") or "")
                if not usage.get("total_tokens"):
                    usage["total_tokens"] = int(usage.get("prompt_tokens") or usage.get("prompt_tokens_est") or 0) + int(usage.get("completion_tokens") or usage.get("completion_tokens_est") or 0)
                usage["context_compacted"] = bool(context_info.get("compacted"))
                usage["context_tokens_saved_est"] = int(context_info.get("tokens_saved_est", 0))
                normalized.update({"usage": usage, "context": context_info, "error": None})
                return normalized
            except Exception as exc:
                last_error = redact_secret(str(exc), self.api_key)
                # Some routed models reject one optional sampling parameter. Retry once with a minimal payload.
                if attempt == 0:
                    kwargs.pop("top_p", None)
                if attempt < config.MODEL_RETRIES:
                    time.sleep(min(2 ** attempt, 4))

        return {"content": None, "tool_calls": [], "usage": {}, "finish_reason": None, "context": context_info, "error": last_error or "Unknown OpenRouter model error"}
