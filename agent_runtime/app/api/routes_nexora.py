from __future__ import annotations

import json
import os
import queue
import tempfile
import threading
import time
from typing import Any, Iterator, Literal

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.agent.context_window import estimate_messages_tokens, estimate_text_tokens, fit_messages_to_context
from app.models.codex_sdk_adapter import CodexSdkModelAdapter
from app.models.nim_adapter import NIMModelAdapter
from app.models.openrouter_adapter import OpenRouterModelAdapter
from app.models.provider_urls import validate_provider_base_url
from app.services.codex_runtime import authenticated_codex_client, refresh_and_persist
from app.services.codex_vault import authenticate_user, save_codex_home

router = APIRouter(prefix="/api/nexora", tags=["nexora"])

# Nexora intentionally keeps the complete conversational transcript until the
# conversation approaches a 100k-token context budget. Older turns are then
# semantically compacted by the selected model while recent turns stay verbatim.
CONVERSATION_CONTEXT_WINDOW_TOKENS = 100_000
CONVERSATION_COMPACTION_TRIGGER_TOKENS = 90_000
CONVERSATION_RECENT_KEEP_TOKENS = 28_000
CONVERSATION_SUMMARY_MAX_TOKENS = 6_000

# Speech-to-text is server-side so the Hugging Face token never reaches the browser.
SPEECH_TO_TEXT_PROVIDER = "fal-ai"
SPEECH_TO_TEXT_MODEL = "nvidia/nemotron-3.5-asr-streaming-0.6b"
SPEECH_TO_TEXT_MAX_BYTES = 8 * 1024 * 1024
SPEECH_TO_TEXT_TIMEOUT_SECONDS = 90.0
SPEECH_TO_TEXT_ALLOWED_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/flac",
    "application/octet-stream",
}
SPEECH_TO_TEXT_SUFFIXES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/flac": ".flac",
}


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1, max_length=60_000)


class ChatRequest(BaseModel):
    provider: Literal["nvidia", "openrouter", "codex"] = "openrouter"
    model_id: str = Field(min_length=1, max_length=180)
    api_key: str = Field(default="", max_length=1024)
    base_url: str | None = Field(default=None, max_length=300)
    message: str = Field(min_length=1, max_length=60_000)
    system: str | None = Field(default=None, max_length=30_000)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=5000)
    temperature: float = Field(default=0.6, ge=0, le=2)
    max_tokens: int = Field(default=3200, ge=16, le=32768)
    response_format: dict[str, Any] | None = None
    enable_thinking: bool = True
    reasoning_effort: Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"] | None = None


class ProjectContext(BaseModel):
    name: str | None = Field(default=None, max_length=180)
    files: list[str] = Field(default_factory=list, max_length=40)
    has_existing_project: bool = False


class TurnRouteRequest(ChatRequest):
    project: ProjectContext | None = None


def _bearer(authorization: str | None) -> str:
    value = (authorization or "").strip()
    return value[7:].strip() if value.lower().startswith("bearer ") else ""


def _adapter(payload: ChatRequest):
    if payload.provider == "nvidia":
        if not payload.api_key.strip():
            raise ValueError("NVIDIA NIM API key is required.")
        return NIMModelAdapter(
            api_key=payload.api_key,
            base_url=validate_provider_base_url("nvidia", payload.base_url),
            model_id=payload.model_id,
        )
    if payload.provider == "openrouter":
        if not payload.api_key.strip():
            raise ValueError("OpenRouter API key is required.")
        return OpenRouterModelAdapter(
            api_key=payload.api_key,
            base_url=validate_provider_base_url("openrouter", payload.base_url),
            model_id=payload.model_id,
        )
    raise ValueError("Codex uses authenticated ChatGPT account access, not an API key adapter.")


def _usage_dict(result: dict[str, Any]) -> dict[str, Any]:
    value = result.get("usage")
    return dict(value) if isinstance(value, dict) else {}


def _reasoning_token_count(usage: dict[str, Any]) -> tuple[int, bool]:
    details = usage.get("completion_tokens_details") or usage.get("output_tokens_details") or {}
    if not isinstance(details, dict):
        details = details.model_dump() if hasattr(details, "model_dump") else {}
    exact = details.get("reasoning_tokens") or usage.get("reasoning_tokens") or usage.get("reasoning_output_tokens")
    estimated = usage.get("reasoning_tokens_est")
    try:
        if exact is not None:
            return max(0, int(exact)), False
        if estimated is not None:
            return max(0, int(estimated)), True
    except (TypeError, ValueError):
        pass
    return 0, False


def _history_dicts(history: list[ChatHistoryMessage]) -> list[dict[str, str]]:
    return [{"role": item.role, "content": item.content} for item in history]


def _semantic_compact(adapter, older: list[dict[str, str]]) -> str:
    transcript = "\n\n".join(
        f"[{str(item.get('role') or 'user').upper()}]\n{str(item.get('content') or '')}"
        for item in older
    )
    prompt = (
        "Compact the earlier conversation into durable conversational memory. "
        "Preserve every user goal, constraint, preference, decision, correction, named entity, unresolved question, "
        "project state, code/file fact, website-brief decision (purpose, structure, style, theme, palette, responsiveness, content), "
        "canonical project/schema/revision fact, referenced id, and commitment that could matter later. Remove repetition and social filler only. "
        "Do not invent facts. Write a dense structured summary in plain text, not JSON.\n\n"
        f"EARLIER CONVERSATION:\n{transcript}"
    )
    result = adapter.model_generate({
        "messages": [
            {"role": "system", "content": "You are a loss-minimizing conversation-context compactor."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": CONVERSATION_SUMMARY_MAX_TOKENS,
        "stream": False,
    })
    if result.get("error") or not str(result.get("content") or "").strip():
        # The deterministic fitter is only a safety fallback when semantic
        # compaction itself is unavailable; it never routes user intent.
        fitted, _ = fit_messages_to_context(
            older,
            CONVERSATION_SUMMARY_MAX_TOKENS,
            context_window=CONVERSATION_CONTEXT_WINDOW_TOKENS,
            model_max_output_tokens=CONVERSATION_SUMMARY_MAX_TOKENS,
            safety_margin=4096,
            soft_input_limit=70_000,
        )
        return "\n\n".join(
            f"[{str(item.get('role') or 'user').upper()}] {str(item.get('content') or '')}"
            for item in fitted
        )
    return str(result.get("content") or "").strip()


def _prepare_messages(
    adapter,
    *,
    system: str | None,
    history: list[ChatHistoryMessage],
    message: str,
    max_output_tokens: int,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    base_history = _history_dicts(history)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend(base_history)
    messages.append({"role": "user", "content": message})
    original_tokens = estimate_messages_tokens(messages)

    if original_tokens <= CONVERSATION_COMPACTION_TRIGGER_TOKENS:
        return messages, {
            "context_window": CONVERSATION_CONTEXT_WINDOW_TOKENS,
            "compacted": False,
            "original_tokens_est": original_tokens,
            "prompt_tokens_est": original_tokens,
            "tokens_saved_est": 0,
        }

    recent_rev: list[dict[str, str]] = []
    recent_tokens = 0
    older_count = len(base_history)
    for index in range(len(base_history) - 1, -1, -1):
        item = base_history[index]
        cost = estimate_messages_tokens([item])
        if recent_rev and recent_tokens + cost > CONVERSATION_RECENT_KEEP_TOKENS:
            older_count = index + 1
            break
        recent_rev.append(item)
        recent_tokens += cost
        older_count = index
    recent = list(reversed(recent_rev))
    older = base_history[:older_count]

    summary = _semantic_compact(adapter, older) if older else ""
    compacted_messages: list[dict[str, str]] = []
    if system:
        compacted_messages.append({"role": "system", "content": system})
    if summary:
        compacted_messages.append({
            "role": "system",
            "content": "[COMPACTED CONVERSATION MEMORY — earlier turns]\n" + summary,
        })
    compacted_messages.extend(recent)
    compacted_messages.append({"role": "user", "content": message})

    # Final hard-bound check reserves response capacity inside the advertised
    # 100k context budget without discarding the newest user turn.
    fitted, fit_info = fit_messages_to_context(
        compacted_messages,
        max_output_tokens,
        context_window=CONVERSATION_CONTEXT_WINDOW_TOKENS,
        model_max_output_tokens=max_output_tokens,
        safety_margin=4096,
        soft_input_limit=92_000,
    )
    final_tokens = estimate_messages_tokens(fitted)
    return fitted, {
        "context_window": CONVERSATION_CONTEXT_WINDOW_TOKENS,
        "compacted": True,
        "original_tokens_est": original_tokens,
        "prompt_tokens_est": final_tokens,
        "tokens_saved_est": max(0, original_tokens - final_tokens),
        "older_turns_compacted": len(older),
        "recent_turns_kept_verbatim": len(recent),
        "fit": fit_info,
    }


def _sse_data(payload: Any) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stream_adapter_sse(adapter, payload: ChatRequest) -> Iterator[str]:
    events: queue.Queue[tuple[str, Any]] = queue.Queue()
    done = threading.Event()

    yield _sse_data({
        "type": "status",
        "phase": "reasoning" if payload.enable_thinking else "generate",
        "status": "Thinking…" if payload.enable_thinking else "Responding…",
    })

    def worker() -> None:
        try:
            messages, context_info = _prepare_messages(
                adapter,
                system=payload.system,
                history=payload.history,
                message=payload.message,
                max_output_tokens=payload.max_tokens,
            )

            def on_token(delta: str, _full_text: str) -> None:
                if delta:
                    events.put(("token", str(delta)))

            result = adapter.model_generate({
                "messages": messages,
                "response_format": payload.response_format,
                "temperature": payload.temperature,
                "max_tokens": payload.max_tokens,
                "model_id": payload.model_id,
                "stream": True,
                "on_token": on_token,
                "enable_thinking": payload.enable_thinking,
                "reasoning_effort": payload.reasoning_effort,
            })
            result["nexora_context"] = context_info
            events.put(("result", result))
        except Exception as exc:
            events.put(("error", str(exc)))
        finally:
            done.set()

    threading.Thread(target=worker, name="nexora-chat-stream", daemon=True).start()

    while True:
        try:
            kind, value = events.get(timeout=8)
        except queue.Empty:
            if done.is_set() and events.empty():
                break
            yield ": keepalive\n\n"
            continue

        if kind == "token":
            yield _sse_data({"choices": [{"delta": {"content": value}}]})
            continue
        if kind == "error":
            yield _sse_data({"error": {"message": value}})
            yield "data: [DONE]\n\n"
            break

        result = value if isinstance(value, dict) else {}
        if result.get("error"):
            yield _sse_data({"error": {"message": str(result.get("error"))}})
            yield "data: [DONE]\n\n"
            break
        yield _sse_data({"choices": [{"delta": {}, "finish_reason": result.get("finish_reason")} ]})
        usage = _usage_dict(result)
        reasoning_tokens, estimated = _reasoning_token_count(usage)
        if reasoning_tokens:
            yield _sse_data({
                "type": "reasoning",
                "reasoning_tokens": reasoning_tokens,
                "estimated": estimated,
                "status": "Reasoning complete",
            })
        if usage:
            yield _sse_data({"type": "usage", "usage": usage})
        context_info = result.get("nexora_context") or {}
        if context_info.get("compacted"):
            yield _sse_data({
                "type": "context",
                "compacted": True,
                "context_window": CONVERSATION_CONTEXT_WINDOW_TOKENS,
                "tokens_saved_est": context_info.get("tokens_saved_est", 0),
            })
        yield "data: [DONE]\n\n"
        break


def _planner_system_prompt() -> str:
    return """You are Nexora's conversational turn planner. You are an AI decision layer, not a keyword router.
Interpret the latest message using the entire supplied conversation and current-project metadata.
Return ONLY one valid JSON object with this exact shape:
{
  "action": "chat|clarify|build_website|revise_website",
  "confidence": 0.0,
  "goal": "short user goal",
  "projectName": "short project name or empty",
  "pageType": "free-form page/app category",
  "scale": "simple|standard|rich|full",
  "buildBrief": "complete context-resolved build/revision brief or empty",
  "assistantDirective": "what the conversational assistant should do next",
  "briefCoverage": [
    {"id":"purpose|structure|style|theme|palette|responsiveness","state":"resolved|delegated|missing","evidence":"short evidence from the conversation or why it is still missing"}
  ],
  "questions": [
    {"id":"semantic-decision-id","question":"one project-specific clarification","kind":"single|multiple|palette|text","required":true,"allowCustom":false,"options":["project-specific AI option A","project-specific AI option B","project-specific AI option C"]}
  ],
  "plan": [
    {"id":"S1","title":"user-visible implementation step","description":"short outcome"}
  ]
}
Decision policy:
- Every ordinary conversational message, including greetings, belongs to chat and must be answered by the selected AI model.
- For every NEW website/page/app request, explicitly audit six core briefing dimensions in briefCoverage: purpose/audience or primary action; structure/content focus; visual style/direction; theme mode (light/dark/system or delegated); color palette; and responsiveness/device priority. Mark a dimension resolved only when the conversation actually specifies it, delegated when the user explicitly lets the AI decide it, and missing otherwise. Do not pretend a generic creation request resolves design choices that were never stated.
- Choose clarify whenever any core briefing dimension that would materially affect the result is still missing. Resolve the brief sequentially: ask EXACTLY ONE highest-value missing question in the current turn, then wait for the user's answer before deciding the next turn. A short generic creation request such as “create a webpage for X” normally requires multiple sequential turns before build_website. Use the entire conversation and compacted memory, never repeat a dimension already resolved/delegated, and treat phrases such as “you decide”, “surprise me”, or “AI decides” as valid delegated answers. The question and every option must be generated for this user's actual project and context; do not use a fixed option catalogue. Return only that one question in questions[]. Prefer 3-5 concise options when choices are useful, plus a custom option only when it genuinely helps. If allowCustom=true, include exactly one AI-authored option whose label contains the word “Custom” so the client can reveal free-form input without inventing an option. For palette questions, generate project-specific palette options and include three #RRGGBB colors in each palette option string so the UI can render truthful swatches. Use stable semantic ids such as purpose, structure, style, theme, palette, or responsiveness. Use kind=palette for colors, kind=multiple only when multiple simultaneous selections make sense, kind=text only when free-form input is genuinely required, and allowCustom=true only when a custom response is useful. Once no material core question remains, choose build_website rather than asking cosmetic or redundant questions. Never start a build merely because creation words appear.
- Choose build_website when the user clearly wants an editable webpage/site/app UI AND the core brief is sufficiently resolved/delegated. A detailed request may resolve several or all dimensions in one message, so do not ask unnecessary questions. Unless the user explicitly narrows device support, the generated implementation must still be technically responsive across mobile, tablet/laptop, and desktop; if device priority is a meaningful product choice and has not been resolved/delegated, ask it before building.
- Choose revise_website when a current generated project exists and the latest request asks to change, fix, add, remove, restyle, or otherwise edit that project.
- For build_website/revise_website, make buildBrief fully self-contained: incorporate every relevant earlier-turn choice about purpose/audience, primary actions, structure, content, style, theme, exact palette/colors when known, responsive/device priority, motion/interaction expectations, and revision constraints. Never write vague references such as “as discussed”, “same as above”, “use previous choices”, or “keep the earlier style” without restating those choices. The generation model must be able to build correctly from buildBrief even if it saw no earlier chat. Provide a concise 3-8 step plan. For chat/clarify, plan may be empty.
- Do not expose provider names, internal routing, hidden reasoning, credentials, or infrastructure details in assistantDirective/plan.
- Never infer intent from isolated trigger words when the meaning of the whole message says otherwise."""


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("Turn planner did not return a JSON object")
        value = json.loads(cleaned[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("Turn planner returned a non-object JSON value")
    return value


def _run_planner(adapter, payload: TurnRouteRequest) -> dict[str, Any]:
    project = payload.project.model_dump() if payload.project else {"has_existing_project": False, "files": [], "name": None}
    user_message = (
        f"LATEST USER MESSAGE:\n{payload.message}\n\n"
        f"CURRENT PROJECT METADATA:\n{json.dumps(project, ensure_ascii=False)}"
    )
    messages, context_info = _prepare_messages(
        adapter,
        system=_planner_system_prompt(),
        history=payload.history,
        message=user_message,
        max_output_tokens=1600,
    )
    result = adapter.model_generate({
        "messages": messages,
        "temperature": 0.12,
        "max_tokens": 1600,
        "model_id": payload.model_id,
        "stream": False,
        "enable_thinking": payload.enable_thinking,
        "reasoning_effort": payload.reasoning_effort,
    })
    if result.get("error"):
        raise RuntimeError(str(result["error"]))
    route = _extract_json_object(str(result.get("content") or ""))
    action = str(route.get("action") or "").strip()
    if action not in {"chat", "clarify", "build_website", "revise_website"}:
        raise ValueError(f"Turn planner returned unsupported action: {action or 'empty'}")

    coverage_ids = {"purpose", "structure", "style", "theme", "palette", "responsiveness"}
    normalized_coverage: list[dict[str, str]] = []
    for item in route.get("briefCoverage") or []:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "").strip().lower()
        state = str(item.get("state") or "missing").strip().lower()
        if item_id not in coverage_ids or state not in {"resolved", "delegated", "missing"}:
            continue
        normalized_coverage.append({
            "id": item_id,
            "state": state,
            "evidence": str(item.get("evidence") or "").strip()[:500],
        })
    coverage_by_id = {item["id"]: item for item in normalized_coverage}
    route["briefCoverage"] = [
        coverage_by_id.get(item_id, {"id": item_id, "state": "missing", "evidence": "Not resolved by the planner."})
        for item_id in ("purpose", "structure", "style", "theme", "palette", "responsiveness")
    ] if action in {"clarify", "build_website"} and not project.get("has_existing_project") else normalized_coverage

    # Enforce the conversational contract at the API boundary as well as in the
    # prompt. Even if a provider emits several clarification objects, the UI
    # receives only the first highest-priority AI-authored question this turn.
    raw_questions = route.get("questions") if isinstance(route.get("questions"), list) else []
    missing_coverage = [
        item["id"] for item in route.get("briefCoverage") or []
        if isinstance(item, dict) and item.get("state") == "missing"
    ]
    if action == "build_website" and missing_coverage and not project.get("has_existing_project"):
        # A planner occasionally jumps from one answered choice straight into a
        # build. Correct that inconsistency with the same AI planner rather than
        # inventing a local hard-coded question or option catalogue.
        correction_message = (
            f"{user_message}\n\n"
            "PLANNER VALIDATION CORRECTION:\n"
            f"Your previous route attempted build_website while these core brief dimensions were still missing: {', '.join(missing_coverage)}.\n"
            "Return a corrected route JSON. Use action=clarify and generate EXACTLY ONE project-specific AI-authored question for the highest-value missing dimension, with suitable AI-authored options. Preserve already resolved/delegated decisions from the conversation. Do not build yet.\n"
            f"PREVIOUS ROUTE:\n{json.dumps(route, ensure_ascii=False)}"
        )
        repair_messages, _ = _prepare_messages(
            adapter,
            system=_planner_system_prompt(),
            history=payload.history,
            message=correction_message,
            max_output_tokens=1600,
        )
        repair_result = adapter.model_generate({
            "messages": repair_messages,
            "temperature": 0.08,
            "max_tokens": 1600,
            "model_id": payload.model_id,
            "stream": False,
            "enable_thinking": payload.enable_thinking,
            "reasoning_effort": payload.reasoning_effort,
        })
        if repair_result.get("error"):
            raise RuntimeError(str(repair_result["error"]))
        corrected = _extract_json_object(str(repair_result.get("content") or ""))
        corrected_action = str(corrected.get("action") or "").strip()
        if corrected_action != "clarify":
            raise ValueError("Turn planner tried to build before the required website brief was resolved")
        route.update(corrected)
        action = "clarify"
        raw_questions = route.get("questions") if isinstance(route.get("questions"), list) else []

    if action == "clarify":
        normalized_questions: list[dict[str, Any]] = []
        for raw_question in raw_questions:
            if not isinstance(raw_question, dict):
                continue
            question = str(raw_question.get("question") or "").strip()
            if not question:
                continue
            kind = str(raw_question.get("kind") or "single").strip().lower()
            if kind not in {"single", "multiple", "palette", "text"}:
                kind = "single"
            options = []
            if kind != "text":
                for option in raw_question.get("options") or []:
                    text = str(option or "").strip()
                    if text and text not in options:
                        options.append(text)
                    if len(options) >= 6:
                        break
                if not options:
                    continue
            normalized_questions.append({
                "id": str(raw_question.get("id") or "decision").strip() or "decision",
                "question": question,
                "kind": kind,
                "required": raw_question.get("required") is not False,
                "allowCustom": bool(raw_question.get("allowCustom")),
                "options": options,
            })
            break
        if not normalized_questions:
            raise ValueError("Turn planner chose clarify but did not return one usable AI-authored question")
        route["questions"] = normalized_questions
    else:
        # Questions are meaningful only on clarification turns; stripping them
        # prevents stale planner output from accidentally rendering later.
        route["questions"] = []

    _stabilize_build_brief(route, payload, project)
    route["context"] = {
        "windowTokens": CONVERSATION_CONTEXT_WINDOW_TOKENS,
        "compacted": bool(context_info.get("compacted")),
        "tokensSavedEst": int(context_info.get("tokens_saved_est") or 0),
        "buildBriefVersion": route.get("buildBriefVersion"),
    }
    return route


def _stabilize_build_brief(route: dict[str, Any], payload: TurnRouteRequest, project: dict[str, Any]) -> None:
    action = str(route.get("action") or "").strip()
    if action not in {"build_website", "revise_website"}:
        return

    raw_brief = str(route.get("buildBrief") or "").strip()
    coverage = route.get("briefCoverage") if isinstance(route.get("briefCoverage"), list) else []
    evidence_lines: list[str] = []
    for item in coverage:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "").strip()
        state = str(item.get("state") or "").strip()
        evidence = str(item.get("evidence") or "").strip()
        if item_id and state in {"resolved", "delegated"}:
            evidence_lines.append(f"- {item_id}: {state} — {evidence or 'AI may decide this dimension.'}")

    parts = [
        "NEXORA BUILD BRIEF SNAPSHOT v1",
        f"Action: {action}",
        f"Goal: {str(route.get('goal') or '').strip() or str(payload.message).strip()}",
    ]
    project_name = str(route.get("projectName") or project.get("name") or "").strip()
    if project_name:
        parts.append(f"Project: {project_name}")
    parts.extend([
        "",
        "Latest user request:",
        str(payload.message).strip(),
    ])
    if raw_brief:
        parts.extend(["", "Planner-resolved requirements:", raw_brief])
    if evidence_lines:
        parts.extend(["", "Resolved/delegated briefing decisions:", *evidence_lines])
    if action == "revise_website":
        parts.extend([
            "",
            "Revision invariant:",
            "Preserve the existing canonical project, stable IDs, pages, content, interactions and design decisions unless the user explicitly requests a change. Do not rebuild unrelated parts.",
        ])
    parts.extend([
        "",
        "Generation invariants:",
        "- The implementation must remain responsive across mobile, tablet/laptop and desktop unless the user explicitly narrows support.",
        "- Canonical visible content must be an atomic editable node tree. Ordinary text fields contain plain text only; never embed HTML tags, escaped HTML, Markdown formatting, select options, whole cards, statistics or section markup inside text.",
        "- Unless the user explicitly requests a static/no-motion experience, include restrained editable entrance motion on major sections and subtle hover/transition feedback on appropriate interactive elements. Respect prefers-reduced-motion.",
        "- Preserve accessibility, semantic structure, canonical JSON editability and deterministic compilation.",
        "- Treat explicit user decisions as higher priority than model defaults.",
    ])
    route["buildBrief"] = "\n".join(part for part in parts if part is not None).strip()
    route["buildBriefVersion"] = "nexora.build-brief/1.0"


def _with_codex_adapter(payload: ChatRequest, access_token: str):
    user = authenticate_user(access_token)
    return user, authenticated_codex_client(user.id, user.access_token)



def _speech_output_text(output: Any) -> str:
    """Normalize huggingface_hub ASR return shapes across compatible versions."""
    if output is None:
        return ""
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, dict):
        return str(output.get("text") or "").strip()
    value = getattr(output, "text", None)
    return str(value or "").strip()


def _speech_error_message(exc: Exception) -> str:
    name = type(exc).__name__
    raw = str(exc or "").strip()
    lowered = raw.lower()
    if "timeout" in name.lower() or "timeout" in lowered:
        return "Speech transcription timed out. Please try a shorter recording."
    if "401" in raw or "403" in raw or "unauthorized" in lowered or "forbidden" in lowered:
        return "Speech transcription is not authorized. Check the HF_ACCESS_TOKEN Vercel environment variable."
    if "429" in raw or "rate limit" in lowered:
        return "Speech transcription is temporarily rate-limited. Please try again shortly."
    if "503" in raw or "unavailable" in lowered:
        return "The speech model is temporarily unavailable. Please try again shortly."
    return "Speech transcription failed. Please try again."


@router.post("/speech-to-text")
async def speech_to_text(request: Request, authorization: str | None = Header(default=None)):
    """Transcribe a bounded microphone recording with Hugging Face Inference Providers.

    The browser sends only audio plus the signed-in Nexora session token. The
    HF_ACCESS_TOKEN stays in Vercel and is never serialized into the response.
    """
    try:
        authenticate_user(_bearer(authorization))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Sign in to Nexora before using voice input.") from exc

    hf_token = (os.getenv("HF_ACCESS_TOKEN") or "").strip()
    if not hf_token:
        raise HTTPException(
            status_code=503,
            detail="Voice transcription is not configured. Add HF_ACCESS_TOKEN to the Vercel environment and redeploy.",
        )

    content_type = str(request.headers.get("content-type") or "application/octet-stream").split(";", 1)[0].strip().lower()
    if content_type not in SPEECH_TO_TEXT_ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format. Record or upload WAV, WebM, OGG, MP4/M4A, MP3, or FLAC audio.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > SPEECH_TO_TEXT_MAX_BYTES:
                raise HTTPException(status_code=413, detail="Voice recording is too large. Keep recordings under 8 MB.")
        except ValueError:
            pass

    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=400, detail="No audio was received.")
    if len(audio) > SPEECH_TO_TEXT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Voice recording is too large. Keep recordings under 8 MB.")

    try:
        from huggingface_hub import InferenceClient
    except Exception as exc:  # pragma: no cover - deployment dependency guard
        raise HTTPException(status_code=503, detail="Speech transcription dependency is unavailable on the server.") from exc

    suffix = SPEECH_TO_TEXT_SUFFIXES.get(content_type, ".wav")
    started = time.perf_counter()
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="nexora-voice-", suffix=suffix, delete=False) as handle:
            handle.write(audio)
            temp_path = handle.name

        client = InferenceClient(
            provider=SPEECH_TO_TEXT_PROVIDER,
            api_key=hf_token,
            timeout=SPEECH_TO_TEXT_TIMEOUT_SECONDS,
        )
        output = await run_in_threadpool(
            client.automatic_speech_recognition,
            temp_path,
            model=SPEECH_TO_TEXT_MODEL,
        )
        transcript = _speech_output_text(output)
        if not transcript:
            raise HTTPException(status_code=422, detail="No speech could be transcribed from that recording.")
        elapsed_ms = max(0, round((time.perf_counter() - started) * 1000))
        return {
            "ok": True,
            "text": transcript,
            "model": SPEECH_TO_TEXT_MODEL,
            "provider": SPEECH_TO_TEXT_PROVIDER,
            "duration_ms": elapsed_ms,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=_speech_error_message(exc)) from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

@router.post("/route")
def route_turn(payload: TurnRouteRequest, authorization: str | None = Header(default=None)):
    if payload.provider == "codex":
        user = authenticate_user(_bearer(authorization))
        try:
            with authenticated_codex_client(user.id, user.access_token) as (client, home, row, work):
                adapter = CodexSdkModelAdapter(client, model_id=payload.model_id, reasoning_effort=payload.reasoning_effort, cwd=work)
                result = _run_planner(adapter, payload)
                try:
                    refresh_and_persist(user.id, user.access_token, client, home)
                except Exception:
                    try:
                        save_codex_home(
                            user.id,
                            user.access_token,
                            home,
                            account_email=(row or {}).get("account_email"),
                            plan_type=(row or {}).get("plan_type"),
                            models=(row or {}).get("model_snapshot") if isinstance((row or {}).get("model_snapshot"), list) else [],
                        )
                    except Exception:
                        pass
                return result
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        return _run_planner(_adapter(payload), payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/chat")
def chat(payload: ChatRequest, authorization: str | None = Header(default=None)):
    if payload.provider == "codex":
        user = authenticate_user(_bearer(authorization))

        def codex_stream() -> Iterator[str]:
            try:
                with authenticated_codex_client(user.id, user.access_token) as (client, home, row, work):
                    adapter = CodexSdkModelAdapter(client, model_id=payload.model_id, reasoning_effort=payload.reasoning_effort, cwd=work)
                    yield from _stream_adapter_sse(adapter, payload)
                    try:
                        refresh_and_persist(user.id, user.access_token, client, home)
                    except Exception:
                        try:
                            save_codex_home(
                                user.id,
                                user.access_token,
                                home,
                                account_email=(row or {}).get("account_email"),
                                plan_type=(row or {}).get("plan_type"),
                                models=(row or {}).get("model_snapshot") if isinstance((row or {}).get("model_snapshot"), list) else [],
                            )
                        except Exception:
                            pass
            except Exception as exc:
                yield _sse_data({"error": {"message": str(exc)}})
                yield "data: [DONE]\n\n"

        stream = codex_stream()
    else:
        try:
            adapter = _adapter(payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        stream = _stream_adapter_sse(adapter, payload)

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
