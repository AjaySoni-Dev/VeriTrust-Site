from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

import config
from app.tools.common import response

JS_NODE_RE = re.compile(r"(?P<path>[^\s:]+\.js):(?P<line>\d+)")


def get_diagnostics(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        max_errors = int(args.get("max_errors", 20))
        errors: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []
        sources = args.get("sources") or []
        for source in sources:
            if isinstance(source, dict):
                if source.get("console_errors"):
                    for msg in source["console_errors"]:
                        errors.append({"source": "browser_console", "message": str(msg)[:2000]})
                if source.get("page_errors"):
                    for msg in source["page_errors"]:
                        errors.append({"source": "browser_page", "message": str(msg)[:2000]})
                for item in source.get("diagnostics", []) or []:
                    errors.append(item if isinstance(item, dict) else {"source": "validator", "message": str(item)})
                stderr = source.get("stderr") or ""
                if stderr:
                    match = JS_NODE_RE.search(stderr)
                    item = {"source": "runtime", "message": stderr[-3000:]}
                    if match:
                        item.update({"path": match.group("path"), "line": int(match.group("line"))})
                    errors.append(item)
                for selector in source.get("missing_selectors", []) or []:
                    errors.append({"source": "browser", "type": "missing_selector", "selector": selector, "message": f"Missing selector: {selector}"})
                for interaction in source.get("interaction_results", []) or []:
                    if not interaction.get("passed", False):
                        errors.append({"source": "browser", "type": "interaction_failed", "message": interaction.get("error") or str(interaction), "interaction": interaction})
        errors = errors[:max_errors]
        return response("get_diagnostics", True, {
            "has_errors": bool(errors),
            "errors": errors,
            "warnings": warnings,
            "summary": f"{len(errors)} error(s), {len(warnings)} warning(s)",
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("get_diagnostics", False, error=str(exc), run_id=run_id, started=started)
