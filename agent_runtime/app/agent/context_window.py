from __future__ import annotations

"""Context-window accounting and deterministic compaction.

The hosted model advertises a very large context window, but reliable agent
software still needs explicit accounting. This module deliberately uses a
conservative tokenizer-independent estimate so the runtime does not depend on
loading the 120B model tokenizer locally.
"""

import math
from dataclasses import dataclass
from typing import Any

import config


class ContextWindowError(RuntimeError):
    pass


def estimate_text_tokens(text: str) -> int:
    """Conservative token estimate for mixed prose/code/JSON.

    Nemotron's exact tokenizer is not shipped with this lightweight runtime.
    A ~3 characters/token estimate intentionally errs on the safe side for
    source code and JSON. Newlines add a small structural overhead.
    """
    if not text:
        return 0
    chars = len(text)
    newlines = text.count("\n")
    return max(1, math.ceil(chars / 3.0) + math.ceil(newlines / 8.0))


def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for message in messages:
        total += 8  # role/message framing safety overhead
        content = message.get("content")
        if isinstance(content, str):
            total += estimate_text_tokens(content)
        else:
            total += estimate_text_tokens(str(content))
    return total


def _slice_by_token_budget(text: str, token_budget: int, *, from_end: bool = False) -> str:
    if token_budget <= 0 or not text:
        return ""
    # Conservative inverse of estimate_text_tokens.
    char_budget = max(1, int(token_budget * 2.7))
    if len(text) <= char_budget:
        return text
    return text[-char_budget:] if from_end else text[:char_budget]


def compact_text_middle(text: str, target_tokens: int) -> tuple[str, dict[str, Any]]:
    """Preserve instructions/request at the front and schemas/rules at the end.

    This is the final safety net. File-aware compaction happens earlier, so the
    omitted middle is normally oversized source/context rather than the user
    request or output contract.
    """
    original = estimate_text_tokens(text)
    if original <= target_tokens:
        return text, {
            "compacted": False,
            "original_tokens": original,
            "compacted_tokens": original,
            "tokens_saved": 0,
            "strategy": "none",
        }

    marker = (
        "\n\n[CONTEXT COMPACTED BY CONTROLLER: oversized middle section omitted; "
        "front/back instructions and high-priority context preserved.]\n\n"
    )
    marker_tokens = estimate_text_tokens(marker)
    usable = max(64, target_tokens - marker_tokens)
    head_ratio = min(max(config.CONTEXT_KEEP_HEAD_RATIO, 0.1), 0.8)
    tail_ratio = min(max(config.CONTEXT_KEEP_TAIL_RATIO, 0.1), 0.8)
    ratio_sum = head_ratio + tail_ratio
    if ratio_sum > 0.96:
        head_ratio *= 0.96 / ratio_sum
        tail_ratio *= 0.96 / ratio_sum
    head_budget = max(32, int(usable * head_ratio))
    tail_budget = max(32, int(usable * tail_ratio))
    compacted = _slice_by_token_budget(text, head_budget) + marker + _slice_by_token_budget(text, tail_budget, from_end=True)

    # One more hard trim if conservative estimation still overshoots.
    current = estimate_text_tokens(compacted)
    if current > target_tokens:
        overflow = current - target_tokens
        tail_budget = max(16, tail_budget - overflow - 16)
        compacted = _slice_by_token_budget(text, head_budget) + marker + _slice_by_token_budget(text, tail_budget, from_end=True)
        current = estimate_text_tokens(compacted)

    return compacted, {
        "compacted": True,
        "original_tokens": original,
        "compacted_tokens": current,
        "tokens_saved": max(0, original - current),
        "strategy": "preserve_head_and_tail",
    }


@dataclass(frozen=True)
class ContextBudget:
    context_window: int
    requested_output_tokens: int
    safety_margin: int
    hard_input_limit: int
    effective_input_limit: int
    compaction_trigger: int


def build_context_budget(
    max_output_tokens: int,
    *,
    context_window: int | None = None,
    model_max_output_tokens: int | None = None,
    safety_margin: int | None = None,
    soft_input_limit: int | None = None,
) -> ContextBudget:
    context_window = int(context_window if context_window is not None else config.MODEL_CONTEXT_WINDOW_TOKENS)
    model_output_cap = int(model_max_output_tokens if model_max_output_tokens is not None else config.MODEL_MAX_TOKENS)
    output = max(1, min(int(max_output_tokens), model_output_cap))
    safety = max(1024, int(safety_margin if safety_margin is not None else config.CONTEXT_SAFETY_MARGIN_TOKENS))
    hard_input = context_window - output - safety
    if hard_input <= 0:
        raise ContextWindowError(
            f"Invalid context configuration: window={context_window}, output={output}, safety={safety}"
        )
    soft = int(soft_input_limit if soft_input_limit is not None else config.MODEL_SOFT_INPUT_LIMIT_TOKENS)
    effective = min(hard_input, soft if soft > 0 else hard_input)
    trigger_ratio = min(max(float(config.CONTEXT_COMPACTION_TRIGGER_RATIO), 0.5), 1.0)
    trigger = max(1, int(effective * trigger_ratio))
    return ContextBudget(context_window, output, safety, hard_input, effective, trigger)


def fit_messages_to_context(
    messages: list[dict[str, Any]],
    max_output_tokens: int,
    *,
    context_window: int | None = None,
    model_max_output_tokens: int | None = None,
    safety_margin: int | None = None,
    soft_input_limit: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Guarantee the estimated request stays inside configured context limits.

    The system message is always preserved. Older non-system messages compact
    first; the newest user message is compacted only if necessary.
    """
    budget = build_context_budget(
        max_output_tokens,
        context_window=context_window,
        model_max_output_tokens=model_max_output_tokens,
        safety_margin=safety_margin,
        soft_input_limit=soft_input_limit,
    )
    original_tokens = estimate_messages_tokens(messages)
    if original_tokens <= budget.compaction_trigger:
        return messages, {
            "compacted": False,
            "original_prompt_tokens_est": original_tokens,
            "prompt_tokens_est": original_tokens,
            "tokens_saved_est": 0,
            "hard_input_limit": budget.hard_input_limit,
            "effective_input_limit": budget.effective_input_limit,
            "context_window": budget.context_window,
            "reserved_output_tokens": budget.requested_output_tokens,
            "safety_margin_tokens": budget.safety_margin,
            "strategy": "none",
        }

    fitted = [dict(m) for m in messages]
    system_tokens = sum(
        estimate_text_tokens(str(m.get("content", ""))) + 8
        for m in fitted if m.get("role") == "system"
    )
    non_system_indices = [i for i, m in enumerate(fitted) if m.get("role") != "system"]
    if not non_system_indices:
        raise ContextWindowError("System prompt alone exceeds the allowed context budget")

    available = budget.effective_input_limit - system_tokens - (8 * len(non_system_indices))
    if available < 128:
        raise ContextWindowError("Insufficient context budget after preserving the system prompt")

    # Give the newest user turn most of the surviving budget. Any older turns
    # retain bounded summaries rather than disappearing completely.
    newest = non_system_indices[-1]
    older = non_system_indices[:-1]
    older_budget_each = max(64, min(2000, int(available * 0.08 / max(1, len(older))))) if older else 0
    spent_older = 0
    item_stats: list[dict[str, Any]] = []
    for idx in older:
        content = str(fitted[idx].get("content", ""))
        compacted, stat = compact_text_middle(content, older_budget_each)
        fitted[idx]["content"] = compacted
        spent_older += estimate_text_tokens(compacted)
        if stat["compacted"]:
            item_stats.append({"message_index": idx, **stat})

    newest_budget = max(128, available - spent_older)
    newest_content = str(fitted[newest].get("content", ""))
    compacted, stat = compact_text_middle(newest_content, newest_budget)
    fitted[newest]["content"] = compacted
    if stat["compacted"]:
        item_stats.append({"message_index": newest, **stat})

    final_tokens = estimate_messages_tokens(fitted)
    if final_tokens > budget.hard_input_limit:
        # Hard-limit pass: target the newest message again using the exact
        # remaining budget. If this fails, stop explicitly instead of sending
        # an invalid request to NVIDIA.
        other_tokens = final_tokens - estimate_text_tokens(str(fitted[newest].get("content", "")))
        exact_newest_budget = max(64, budget.hard_input_limit - other_tokens - 16)
        compacted, stat2 = compact_text_middle(str(fitted[newest].get("content", "")), exact_newest_budget)
        fitted[newest]["content"] = compacted
        final_tokens = estimate_messages_tokens(fitted)
        if stat2["compacted"]:
            item_stats.append({"message_index": newest, **stat2})
    if final_tokens > budget.hard_input_limit:
        raise ContextWindowError(
            f"Unable to compact prompt below hard input limit: estimated={final_tokens}, limit={budget.hard_input_limit}"
        )

    return fitted, {
        "compacted": True,
        "original_prompt_tokens_est": original_tokens,
        "prompt_tokens_est": final_tokens,
        "tokens_saved_est": max(0, original_tokens - final_tokens),
        "hard_input_limit": budget.hard_input_limit,
        "effective_input_limit": budget.effective_input_limit,
        "context_window": budget.context_window,
        "reserved_output_tokens": budget.requested_output_tokens,
        "safety_margin_tokens": budget.safety_margin,
        "strategy": "file_aware_then_message_head_tail",
        "items": item_stats,
    }
