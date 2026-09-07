from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

import config
from app.agent.operations import verify_requirements_llm
from app.tools.execution import run_command
from app.tools.filesystem import read_file


def _balanced_code(text: str, pairs: list[tuple[str, str]], *, template_strings: bool = False) -> bool:
    """Conservative delimiter scan that ignores comments and quoted text.

    The old raw character counter produced false failures whenever CSS/JS strings,
    data URLs, or template literals contained braces. Node remains authoritative
    when available; this is the serverless fallback.
    """
    opens = {left: right for left, right in pairs}
    closes = {right: left for left, right in pairs}
    stack: list[str] = []
    i = 0
    state = "normal"
    quote = ""
    escaped = False
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "line_comment":
            if ch in "\r\n":
                state = "normal"
            i += 1
            continue
        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "normal"
                i += 2
            else:
                i += 1
            continue
        if state == "string":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                state = "normal"
            i += 1
            continue
        if state == "template":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "`":
                state = "normal"
            # Template contents are intentionally ignored by the fallback. Node
            # catches interpolation syntax when present in the runtime image.
            i += 1
            continue
        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch in {"'", '"'}:
            state, quote, escaped = "string", ch, False
            i += 1
            continue
        if template_strings and ch == "`":
            state, escaped = "template", False
            i += 1
            continue
        if ch in opens:
            stack.append(ch)
        elif ch in closes:
            if not stack or stack[-1] != closes[ch]:
                return False
            stack.pop()
        i += 1
    return not stack and state not in {"block_comment", "string", "template"}


def validate_project(args: dict) -> dict:
    root = Path(args["workspace_root"]).resolve()
    diagnostics: list[dict[str, Any]] = []
    checks: dict[str, Any] = {}

    index = root / "index.html"
    checks["index_exists"] = index.exists()
    if not index.exists():
        diagnostics.append({"source": "validator", "type": "missing_file", "path": "index.html", "message": "index.html is required"})
        return {"passed": False, "checks": checks, "diagnostics": diagnostics}

    html = index.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    checks["html_root"] = soup.html is not None
    checks["body_exists"] = soup.body is not None
    if soup.html is None:
        diagnostics.append({"source": "validator", "path": "index.html", "message": "Missing <html> root"})
    if soup.body is None:
        diagnostics.append({"source": "validator", "path": "index.html", "message": "Missing <body>"})

    ids = [tag.get("id") for tag in soup.find_all(attrs={"id": True})]
    duplicates = sorted({x for x in ids if ids.count(x) > 1})
    checks["duplicate_ids"] = not duplicates
    if duplicates:
        diagnostics.append({"source": "validator", "path": "index.html", "message": f"Duplicate id(s): {duplicates}"})

    refs: list[str] = []
    for tag, attr in [("link", "href"), ("script", "src")]:
        for node in soup.find_all(tag):
            value = node.get(attr)
            if value and not value.startswith(("http://", "https://", "//", "data:", "#")):
                refs.append(value.split("?")[0].split("#")[0])
    missing_refs = []
    escaping_refs = []
    for ref in refs:
        if not ref:
            continue
        candidate = (root / ref).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            escaping_refs.append(ref)
            continue
        if not candidate.is_file():
            missing_refs.append(ref)
    checks["local_refs_exist"] = not missing_refs and not escaping_refs
    if missing_refs:
        diagnostics.append({"source": "validator", "path": "index.html", "message": f"Missing local resources: {missing_refs}"})
    if escaping_refs:
        diagnostics.append({"source": "validator", "path": "index.html", "message": f"Resource reference escapes project: {escaping_refs}"})

    css_path = root / "style.css"
    if css_path.exists():
        css = css_path.read_text(encoding="utf-8", errors="replace")
        checks["css_braces"] = _balanced_code(css, [("{", "}")])
        if not checks["css_braces"]:
            diagnostics.append({"source": "validator", "path": "style.css", "message": "CSS brace mismatch"})
    else:
        checks["css_braces"] = True

    js_path = root / "script.js"
    if js_path.exists():
        if shutil.which("node"):
            result = run_command({
                "workspace_root": str(root),
                "run_id": args.get("run_id", ""),
                "argv": ["node", "--check", "script.js"],
                "cwd": str(root),
                "timeout_seconds": args.get("timeout_seconds", config.COMMAND_TIMEOUT_SECONDS),
            })
            checks["js_syntax"] = bool(result["success"] and result["data"].get("exit_code") == 0)
            if not checks["js_syntax"]:
                diagnostics.append({"source": "node", "path": "script.js", "message": result["data"].get("stderr") or result.get("error")})
        else:
            js = js_path.read_text(encoding="utf-8", errors="replace")
            # Conservative fallback only; the browser verifier is authoritative.
            checks["js_syntax"] = _balanced_code(js, [("{", "}"), ("(", ")"), ("[", "]")], template_strings=True)
            if not checks["js_syntax"]:
                diagnostics.append({"source": "validator", "path": "script.js", "message": "Basic JS delimiter mismatch (Node not available)"})
    else:
        checks["js_syntax"] = True

    passed = all(bool(v) for v in checks.values()) and not diagnostics
    return {"passed": passed, "checks": checks, "diagnostics": diagnostics}


def verify_requirements(args: dict) -> dict:
    adapter = args["adapter"]
    requirements = args.get("requirements") or []
    technical = args.get("technical_evidence") or {}
    browser = args.get("browser_evidence") or {}
    workspace_root = args["workspace_root"]
    candidate_files = args.get("candidate_files") or ["index.html", "style.css", "script.js"]

    project_evidence: list[dict[str, Any]] = []
    for path in candidate_files[: config.MAX_FILES_IN_CONTEXT]:
        result = read_file({
            "workspace_root": workspace_root,
            "path": path,
            "max_bytes": 50000,
            "run_id": args.get("run_id", ""),
        })
        if result["success"]:
            project_evidence.append({
                "path": path,
                "version": result["data"]["version"],
                "content": result["data"]["content"],
            })

    # Hard gate: model cannot override technical/browser failures.
    hard_failure = (not technical.get("passed", False)) or (not browser.get("passed", False))
    try:
        verdict, usage = verify_requirements_llm(
            adapter,
            requirements=requirements,
            technical=technical,
            browser=browser,
            project_evidence=project_evidence,
        )
    except Exception as exc:
        # Explicit uncertainty instead of silent success.
        verdict = {
            "satisfied": False,
            "passed": [],
            "failed": [],
            "uncertain": [{"id": r.get("id", "?"), "reason": f"Requirement verifier unavailable: {exc}"} for r in requirements],
            "next_action": "repair",
        }
        usage = {}

    if hard_failure:
        verdict["satisfied"] = False
        verdict["next_action"] = "repair"
    if verdict.get("uncertain") and not config.ALLOW_UNCERTAIN_REQUIREMENTS:
        verdict["satisfied"] = False
        verdict["next_action"] = "repair"
    verdict["usage"] = usage
    return verdict
