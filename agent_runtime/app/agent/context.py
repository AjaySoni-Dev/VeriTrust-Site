from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import config
from app.agent.context_window import estimate_text_tokens
from app.tools.filesystem import read_file


def _tokens(text: str) -> set[str]:
    return {
        x for x in re.findall(r"[a-zA-Z0-9_-]{3,}", text.lower())
        if x not in {"the", "and", "with", "this", "that", "from", "website", "make", "file", "files"}
    }


def _merge_ranges(ranges: list[tuple[int, int]], total_lines: int) -> list[tuple[int, int]]:
    cleaned = sorted((max(0, a), min(total_lines, b)) for a, b in ranges if a < b)
    merged: list[list[int]] = []
    for start, end in cleaned:
        if not merged or start > merged[-1][1] + 2:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(a, b) for a, b in merged]


def compact_file_content(content: str, *, request: str, target_tokens: int) -> tuple[str, dict[str, Any]]:
    """Preserve relevant code windows plus file head/tail under a token budget.

    Relevant matches are treated as higher priority than generic head/tail text,
    so a final size reduction never silently discards the reason the file was
    selected in the first place.
    """
    original_tokens = estimate_text_tokens(content)
    if original_tokens <= target_tokens:
        return content, {
            "compacted": False,
            "original_tokens": original_tokens,
            "compacted_tokens": original_tokens,
            "strategy": "none",
        }

    lines = content.splitlines()
    if not lines:
        return content, {"compacted": False, "original_tokens": original_tokens, "compacted_tokens": original_tokens, "strategy": "none"}

    query_terms = _tokens(request)
    relevant_indices: list[int] = []
    if query_terms:
        for idx, line in enumerate(lines):
            if query_terms & _tokens(line):
                relevant_indices.append(idx)

    # Build explicit priority blocks: file opening, relevant windows, file end.
    head_range = (0, min(len(lines), 48))
    tail_range = (max(0, len(lines) - 36), len(lines))
    relevant_ranges = [
        (max(0, idx - 10), min(len(lines), idx + 11))
        for idx in relevant_indices[:24]
    ]
    merged_relevant = _merge_ranges(relevant_ranges, len(lines))

    def render_range(start: int, end: int) -> str:
        return "\n".join(f"{i + 1:06d}: {lines[i]}" for i in range(start, end))

    head_text = render_range(*head_range)
    relevant_texts = [render_range(a, b) for a, b in merged_relevant]
    relevant_text = "\n/* ... relevant window ... */\n".join(relevant_texts)
    tail_text = render_range(*tail_range)

    sections: list[str] = []
    if head_text:
        sections.append("/* FILE HEAD */\n" + head_text)
    if relevant_text:
        sections.append("/* REQUEST-RELEVANT WINDOWS */\n" + relevant_text)
    if tail_text:
        sections.append("/* FILE TAIL */\n" + tail_text)
    compacted = "\n/* ... compacted gap ... */\n".join(sections)

    if estimate_text_tokens(compacted) > target_tokens:
        # Guarantee the relevant window survives. Allocate it first, then use the
        # remaining budget for head/tail structure. If relevant text itself is
        # huge, keep its beginning/end around multiple matched regions.
        marker = "\n/* ... source compacted to fit model context ... */\n"
        marker_tokens = estimate_text_tokens(marker)
        rel_budget = min(max(160, int(target_tokens * 0.58)), max(160, target_tokens - 160))
        if relevant_text:
            if estimate_text_tokens(relevant_text) > rel_budget:
                rel_chars = max(256, int(rel_budget * 2.65))
                rel_head = int(rel_chars * 0.62)
                relevant_text = relevant_text[:rel_head] + marker + relevant_text[-(rel_chars - rel_head):]
        else:
            rel_budget = 0

        used_rel = estimate_text_tokens(relevant_text)
        remaining = max(96, target_tokens - used_rel - marker_tokens * 2)
        head_budget = max(48, int(remaining * 0.55))
        tail_budget = max(48, remaining - head_budget)
        head_chars = max(128, int(head_budget * 2.65))
        tail_chars = max(128, int(tail_budget * 2.65))
        parts = []
        if head_text:
            parts.append("/* FILE HEAD */\n" + head_text[:head_chars])
        if relevant_text:
            parts.append("/* REQUEST-RELEVANT WINDOWS */\n" + relevant_text)
        if tail_text:
            parts.append("/* FILE TAIL */\n" + tail_text[-tail_chars:])
        compacted = marker.join(parts)

    # Absolute hard trim only if estimation is still over budget. Place the
    # relevant block first so it remains within the retained prefix.
    if estimate_text_tokens(compacted) > target_tokens:
        priority = "/* REQUEST-RELEVANT WINDOWS */\n" + (relevant_text or "(no lexical match; structural context only)")
        rest = "\n/* STRUCTURAL CONTEXT */\n" + head_text + "\n" + tail_text
        priority_budget = min(target_tokens - 64, max(128, int(target_tokens * 0.68)))
        priority_chars = max(256, int(priority_budget * 2.55))
        priority = priority[:priority_chars]
        remaining_tokens = max(64, target_tokens - estimate_text_tokens(priority) - 16)
        rest_chars = max(128, int(remaining_tokens * 2.45))
        compacted = priority + "\n/* ... compacted ... */\n" + rest[:rest_chars]

    final_tokens = estimate_text_tokens(compacted)
    return compacted, {
        "compacted": True,
        "original_tokens": original_tokens,
        "compacted_tokens": final_tokens,
        "tokens_saved": max(0, original_tokens - final_tokens),
        "strategy": "relevance_windows_plus_head_tail",
        "original_lines": len(lines),
        "relevant_matches": len(relevant_indices),
    }


def select_relevant_context(args: dict) -> dict:
    """Rank files, read only relevant content, and compact to a real token budget."""
    request = str(args.get("request", ""))
    workspace_root = args["workspace_root"]
    candidate_files = args.get("candidate_files") or []
    search_results = args.get("search_results") or []
    max_files = int(args.get("max_files", config.MAX_FILES_IN_CONTEXT))
    total_token_budget = int(args.get("token_budget", config.MAX_TOTAL_FILE_CONTEXT_TOKENS))
    per_file_budget = int(args.get("per_file_token_budget", config.MAX_FILE_TOKENS_IN_CONTEXT))
    query_tokens = _tokens(request)
    search_paths = {m.get("path") for m in search_results if isinstance(m, dict)}

    scored: list[tuple[int, str]] = []
    for path in candidate_files:
        name_tokens = _tokens(path)
        score = len(query_tokens & name_tokens) * 4
        if path in search_paths:
            score += 10
        if Path(path).name in {"index.html", "style.css", "script.js"}:
            score += 2
        scored.append((score, path))
    scored.sort(key=lambda x: (-x[0], x[1]))

    selected: list[dict[str, Any]] = []
    used_tokens = 0
    compacted_files = 0
    saved_tokens = 0
    for _, path in scored[: max_files * 3]:
        remaining = total_token_budget - used_tokens
        if remaining <= 256:
            break
        result = read_file({
            "workspace_root": workspace_root,
            "path": path,
            "max_bytes": min(
                config.MAX_FILE_BYTES_IN_CONTEXT,
                max(4096, int(min(per_file_budget, remaining) * 3.4)),
            ),
            "run_id": args.get("run_id", ""),
        })
        if not result["success"]:
            continue
        data = result["data"]
        content = data.get("content", "")
        target = max(256, min(per_file_budget, remaining))
        compacted_content, stats = compact_file_content(content, request=request, target_tokens=target)
        size_tokens = estimate_text_tokens(compacted_content)
        if selected and used_tokens + size_tokens > total_token_budget:
            continue
        if stats.get("compacted"):
            compacted_files += 1
            saved_tokens += int(stats.get("tokens_saved", 0))
        selected.append({
            "path": path,
            "version": data["version"],
            "content": compacted_content,
            "truncated": bool(data.get("truncated")) or bool(stats.get("compacted")),
            "context_stats": stats,
        })
        used_tokens += size_tokens
        if len(selected) >= max_files or used_tokens >= total_token_budget:
            break

    return {
        "selected_context": selected,
        "omitted_count": max(0, len(candidate_files) - len(selected)),
        "estimated_tokens": used_tokens,
        "compacted_files": compacted_files,
        "tokens_saved_est": saved_tokens,
        "rationale_short": "Ranked by request/search relevance; oversized files were compacted into relevant windows under token budgets.",
    }
