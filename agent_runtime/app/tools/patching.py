from __future__ import annotations

import difflib
import re
import time
from pathlib import Path

from app.tools.common import atomic_write, file_hash, relative_from_root, response, safe_project_path

HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def _apply_unified_diff(original: str, patch: str) -> str:
    """Apply a standard single-file unified diff with exact context validation."""
    old_lines = original.splitlines(keepends=True)
    patch_lines = patch.splitlines(keepends=True)
    result: list[str] = []
    old_pos = 0
    i = 0
    saw_hunk = False
    while i < len(patch_lines):
        raw = patch_lines[i]
        if raw.startswith(("--- ", "+++ ")):
            i += 1
            continue
        match = HUNK_RE.match(raw.rstrip("\n"))
        if not match:
            i += 1
            continue
        saw_hunk = True
        old_start = int(match.group(1))
        target_index = old_start - 1
        if target_index < old_pos or target_index > len(old_lines):
            raise ValueError("Invalid or overlapping patch hunk")
        result.extend(old_lines[old_pos:target_index])
        old_pos = target_index
        i += 1
        while i < len(patch_lines) and not HUNK_RE.match(patch_lines[i].rstrip("\n")):
            line = patch_lines[i]
            if line.startswith("\\ No newline"):
                i += 1
                continue
            if not line:
                i += 1
                continue
            prefix = line[0]
            body = line[1:]
            if prefix == " ":
                if old_pos >= len(old_lines) or old_lines[old_pos] != body:
                    raise ValueError("Patch context does not match current file")
                result.append(old_lines[old_pos])
                old_pos += 1
            elif prefix == "-":
                if old_pos >= len(old_lines) or old_lines[old_pos] != body:
                    raise ValueError("Patch removal does not match current file")
                old_pos += 1
            elif prefix == "+":
                result.append(body)
            else:
                # End of hunk metadata or unexpected text; do not silently alter.
                raise ValueError(f"Unsupported patch line prefix: {prefix!r}")
            i += 1
    if not saw_hunk:
        raise ValueError("No unified diff hunk found")
    result.extend(old_lines[old_pos:])
    return "".join(result)


def _diff_stats(old: str, new: str) -> tuple[int, int, str]:
    diff = list(difflib.unified_diff(old.splitlines(), new.splitlines(), lineterm=""))
    added = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))
    preview = "\n".join(diff[:160])
    return added, removed, preview


def apply_patch(args: dict) -> dict:
    """Primary versioned edit function.

    Supports the blueprint's unified `patch` contract. The controller also uses
    `new_content` as a reliability fallback: it computes and records a minimal
    diff before atomically replacing the file, while still enforcing the
    expected version precondition.
    """
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        old_version = file_hash(path)
        if old_version != args["expected_version"]:
            raise ValueError("stale_file_version")
        old_text = path.read_text(encoding="utf-8")
        if "new_content" in args:
            new_text = str(args["new_content"])
        else:
            new_text = _apply_unified_diff(old_text, str(args["patch"]))
        added, removed, diff_preview = _diff_stats(old_text, new_text)
        atomic_write(path, new_text)
        new_version = file_hash(path)
        return response("apply_patch", True, {
            "path": relative_from_root(root, path),
            "old_version": old_version,
            "new_version": new_version,
            "lines_added": added,
            "lines_removed": removed,
            "diff_preview": diff_preview,
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("apply_patch", False, error=str(exc), run_id=run_id, started=started)


def validate_patch(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        actual = file_hash(path)
        issues = []
        if args.get("new_version") and actual != args["new_version"]:
            issues.append("new_version_mismatch")
        text = path.read_text(encoding="utf-8", errors="replace")
        if "syntax" in args.get("checks", ["syntax"]):
            if path.suffix.lower() == ".css" and text.count("{") != text.count("}"):
                issues.append("css_brace_mismatch")
            if path.suffix.lower() == ".html" and "<html" not in text.lower():
                issues.append("missing_html_root")
        return response("validate_patch", True, {
            "valid": not issues,
            "checks": {"version": actual, "basic_syntax": not issues},
            "issues": issues,
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("validate_patch", False, error=str(exc), run_id=run_id, started=started)
