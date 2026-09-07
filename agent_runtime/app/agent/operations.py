from __future__ import annotations

import json
from typing import Any

import config
from app.agent import prompts
from app.models.base import ModelAdapter


def _json_from_text(text: str | None) -> dict[str, Any]:
    if not text:
        raise ValueError("Model returned empty content")
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        # Isolate the outermost object first, then use json-repair for common
        # trailing comma / quoting mistakes.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end < start:
            raise ValueError("Model response did not contain a JSON object")
        candidate = cleaned[start : end + 1]
        try:
            # Optional high-tolerance parser when installed; start.py does not
            # depend on it, so offline-first installation remains smaller.
            from json_repair import repair_json  # type: ignore
            candidate = repair_json(candidate)
        except ImportError:
            import re
            # Common model JSON defect: trailing commas before ] or }.
            candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        value = json.loads(candidate)
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object from model")
    return value


def _merge_usage(*items: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    numeric_keys = {
        "prompt_tokens", "completion_tokens", "total_tokens",
        "prompt_tokens_est", "completion_tokens_est", "context_tokens_saved_est",
    }
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if key in numeric_keys and isinstance(value, (int, float)):
                merged[key] = int(merged.get(key, 0) or 0) + int(value)
            elif key not in merged:
                merged[key] = value
            elif key == "context_compacted":
                merged[key] = bool(merged[key] or value)
    if not merged.get("total_tokens"):
        prompt = int(merged.get("prompt_tokens") or merged.get("prompt_tokens_est") or 0)
        completion = int(merged.get("completion_tokens") or merged.get("completion_tokens_est") or 0)
        if prompt or completion:
            merged["total_tokens"] = prompt + completion
    return merged


def _call_json(adapter: ModelAdapter, user_prompt: str, *, max_tokens: int | None = None, on_token=None) -> tuple[dict[str, Any], dict[str, Any]]:
    requested_max = max_tokens or config.MODEL_MAX_TOKENS

    def invoke(prompt: str, *, temperature: float | None = None) -> dict[str, Any]:
        reasoning_effort = str(getattr(adapter, "reasoning_effort", "") or "").strip() or None
        enable_thinking = reasoning_effort != "none" if reasoning_effort else config.ENABLE_THINKING
        return adapter.model_generate({
            "messages": [
                {"role": "system", "content": prompts.BASE_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            "temperature": config.MODEL_TEMPERATURE if temperature is None else temperature,
            "top_p": config.MODEL_TOP_P,
            "max_tokens": requested_max,
            "enable_thinking": enable_thinking,
            "reasoning_effort": reasoning_effort,
            "stream": True,
            "on_token": on_token,
        })

    first = invoke(user_prompt)
    if first.get("error"):
        raise RuntimeError(first["error"])

    first_usage = first.get("usage") or {}
    first_text = first.get("content") or ""
    first_issue = None
    if first.get("finish_reason") == "length":
        first_issue = "The structured response was truncated at the provider output limit."
    else:
        try:
            return _json_from_text(first_text), first_usage
        except (ValueError, json.JSONDecodeError) as exc:
            first_issue = f"The structured response was not valid JSON: {exc}"

    # One bounded recovery pass. This is deliberately not an unbounded model
    # retry loop: the controller owns the broader repair/replan policy.
    previous = first_text
    if len(previous) > 120_000:
        previous = previous[:60_000] + "\n...[middle omitted for recovery]...\n" + previous[-60_000:]
    recovery_prompt = f"""The previous response for the task below could not be consumed by the deterministic agent.

ORIGINAL TASK:
{user_prompt}

FAILURE:
{first_issue}

PREVIOUS RESPONSE:
{previous}

Retry from scratch and return ONLY one complete valid JSON object matching the exact schema requested by ORIGINAL TASK. Keep generated code concise enough to finish within the output limit. Do not use markdown fences, comments outside JSON, or trailing prose."""
    second = invoke(recovery_prompt, temperature=min(config.MODEL_TEMPERATURE, 0.35))
    combined_usage = _merge_usage(first_usage, second.get("usage") or {})
    if second.get("error"):
        raise RuntimeError(f"Structured output recovery failed: {second['error']}")
    if second.get("finish_reason") == "length":
        raise RuntimeError(
            "The model hit its output limit twice while producing the required website JSON. "
            "Use a model with a larger output limit or request a smaller first build, then revise it agentically."
        )
    try:
        return _json_from_text(second.get("content")), combined_usage
    except (ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Structured output recovery returned invalid JSON: {exc}") from exc


def analyze_request(adapter: ModelAdapter, request: str, files: list[str]) -> tuple[dict, dict]:
    return _call_json(adapter, prompts.ANALYZE_PROMPT.format(request=request, files=json.dumps(files, indent=2)), max_tokens=3000)


def create_plan(args: dict) -> dict:
    adapter: ModelAdapter = args["adapter"]
    prompt = prompts.PLAN_PROMPT.format(
        goal=args.get("goal", ""),
        requirements=json.dumps(args.get("requirements", []), ensure_ascii=False, indent=2),
        files=json.dumps(args.get("project_context", {}).get("files", []), indent=2),
        constraints=json.dumps(args.get("constraints", []), ensure_ascii=False),
    )
    data, usage = _call_json(adapter, prompt, max_tokens=3500)
    return {"data": data, "usage": usage}


def generate_site_bundle(adapter: ModelAdapter, *, request: str, goal: str, requirements: list[dict], plan: list[dict], on_token=None) -> tuple[dict, dict]:
    prompt = prompts.BUILD_PROMPT.format(
        request=request,
        goal=goal,
        requirements=json.dumps(requirements, ensure_ascii=False, indent=2),
        plan=json.dumps(plan, ensure_ascii=False, indent=2),
    )
    return _call_json(adapter, prompt, on_token=on_token)


def revise_site_bundle(adapter: ModelAdapter, *, request: str, requirements: list[dict], plan: list[dict], context: list[dict], on_token=None) -> tuple[dict, dict]:
    prompt = prompts.REVISION_PROMPT.format(
        request=request,
        requirements=json.dumps(requirements, ensure_ascii=False, indent=2),
        plan=json.dumps(plan, ensure_ascii=False, indent=2),
        context=json.dumps(context, ensure_ascii=False, indent=2),
    )
    return _call_json(adapter, prompt, on_token=on_token)


def decide_next_action(args: dict) -> dict:
    adapter: ModelAdapter = args["adapter"]
    prompt = prompts.DECIDE_ACTION_PROMPT.format(
        phase=args.get("phase", "INSPECT"),
        state=json.dumps(args.get("state_summary", {}), ensure_ascii=False),
        context=json.dumps(args.get("relevant_context", []), ensure_ascii=False),
        allowed_tools=json.dumps(args.get("allowed_tools", [])),
        retry_context=json.dumps(args.get("retry_context", {}), ensure_ascii=False),
    )
    data, usage = _call_json(adapter, prompt, max_tokens=1200)
    return {"data": data, "usage": usage}


def diagnose_failure(args: dict) -> dict:
    adapter: ModelAdapter = args["adapter"]
    prompt = prompts.DIAGNOSE_PROMPT.format(
        diagnostics=json.dumps(args.get("diagnostics", {}), ensure_ascii=False, indent=2),
        changes=json.dumps(args.get("recent_changes", []), ensure_ascii=False, indent=2),
        files=json.dumps(args.get("relevant_files", []), ensure_ascii=False),
        retry_count=args.get("retry_count", 0),
    )
    data, usage = _call_json(adapter, prompt, max_tokens=2200)
    return {"data": data, "usage": usage}


def propose_repair(adapter: ModelAdapter, *, request: str, failed_requirements: list, diagnosis: dict, diagnostics: dict, context: list[dict], on_token=None) -> tuple[dict, dict]:
    prompt = prompts.REPAIR_PROMPT.format(
        request=request,
        failed_requirements=json.dumps(failed_requirements, ensure_ascii=False, indent=2),
        diagnosis=json.dumps(diagnosis, ensure_ascii=False, indent=2),
        diagnostics=json.dumps(diagnostics, ensure_ascii=False, indent=2),
        context=json.dumps(context, ensure_ascii=False, indent=2),
    )
    return _call_json(adapter, prompt, on_token=on_token)


def verify_requirements_llm(adapter: ModelAdapter, *, requirements: list[dict], technical: dict, browser: dict, project_evidence: list[dict]) -> tuple[dict, dict]:
    prompt = prompts.VERIFY_REQUIREMENTS_PROMPT.format(
        requirements=json.dumps(requirements, ensure_ascii=False, indent=2),
        technical=json.dumps(technical, ensure_ascii=False, indent=2),
        browser=json.dumps(browser, ensure_ascii=False, indent=2),
        project_evidence=json.dumps(project_evidence, ensure_ascii=False, indent=2),
    )
    return _call_json(adapter, prompt, max_tokens=3500)
