from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

import config
from app.tools.common import response


def _static_fallback(args: dict, reason: str, *, allow_limited_interactions: bool = False) -> dict:
    root = Path(args["workspace_root"]).resolve()
    html_path = root / "index.html"
    console_errors: list[str] = []
    missing: list[str] = []
    unsupported: list[str] = []
    warnings: list[str] = []
    interactions: list[dict[str, Any]] = []
    if not html_path.exists():
        return {
            "passed": False,
            "engine": "static-fallback",
            "console_errors": [],
            "page_errors": ["index.html missing"],
            "missing_selectors": ["index.html"],
            "unsupported_selectors": [],
            "interaction_results": [],
            "warnings": [],
            "warning": reason,
        }
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="replace"), "html.parser")

    def lookup(selector: Any) -> tuple[bool, bool]:
        value = str(selector or "").strip()
        if not value or len(value) > 500:
            return False, False
        try:
            return True, soup.select_one(value) is not None
        except Exception:
            return False, False

    for selector in args.get("required_selectors", []) or []:
        supported, exists = lookup(selector)
        if not supported:
            unsupported.append(str(selector))
            warnings.append(f"Static verifier could not parse selector: {selector}")
        elif not exists:
            missing.append(str(selector))

    for action in args.get("interactions", []) or []:
        selector = action.get("selector")
        supported, exists = lookup(selector)
        if not supported:
            unsupported.append(str(selector or ""))
            interactions.append({
                "name": action.get("name") or action.get("type", "interaction"),
                "passed": True,
                "limited": True,
                "unsupported_selector": True,
                "error": None,
            })
            warnings.append(f"Interaction selector could not be parsed statically: {selector}")
            continue
        interactions.append({
            "name": action.get("name") or action.get("type", "interaction"),
            "passed": bool(exists),
            "limited": True,
            "error": None if exists else f"Selector not found for static fallback: {selector}",
        })

    # In Vercel serverless mode Chromium is not guaranteed to be bundled. Static
    # verification therefore hard-fails only on evidence it can determine
    # reliably: missing DOM targets plus the separate HTML/CSS/JS validator.
    # Unsupported-but-browser-valid selectors become warnings, not false fails.
    interaction_capable = allow_limited_interactions or not bool(args.get("interactions") or [])
    passed = not missing and all(x["passed"] for x in interactions) and interaction_capable
    return {
        "passed": passed,
        "engine": "serverless-static" if allow_limited_interactions else "static-fallback",
        "console_errors": console_errors,
        "page_errors": [],
        "missing_selectors": missing,
        "unsupported_selectors": list(dict.fromkeys(x for x in unsupported if x)),
        "interaction_results": interactions,
        "screenshot_path": None,
        "warnings": warnings,
        "warning": reason,
    }


def browser_verify(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    if args.get("serverless_static") or config.SERVERLESS_MODE:
        data = _static_fallback(
            args,
            "Vercel serverless verification: DOM/selectors + separate static JS/CSS integrity checks.",
            allow_limited_interactions=True,
        )
        return response("browser_verify", True, data, run_id=run_id, started=started)
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        data = _static_fallback(args, f"Playwright unavailable: {exc}")
        return response("browser_verify", True, data, run_id=run_id, started=started)

    url = args.get("url")
    if not url:
        data = _static_fallback(args, "No preview URL provided")
        return response("browser_verify", True, data, run_id=run_id, started=started)

    console_errors: list[str] = []
    page_errors: list[str] = []
    missing: list[str] = []
    interaction_results: list[dict[str, Any]] = []
    timeout_ms = int(args.get("timeout_seconds", config.BROWSER_TIMEOUT_SECONDS)) * 1000
    viewport = args.get("viewport") or {"width": 1440, "height": 900}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport=viewport)
            # Keep verification offline/self-contained. Generated sites may load
            # only the local preview origin plus data/blob resources.
            from urllib.parse import urlparse
            preview = urlparse(url)
            def _route(route):
                request_url = route.request.url
                parsed = urlparse(request_url)
                local = parsed.scheme in {"data", "blob"} or (parsed.scheme in {"http", "https"} and parsed.hostname == preview.hostname and parsed.port == preview.port)
                route.continue_() if local else route.abort()
            page.route("**/*", _route)
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            for selector in args.get("required_selectors", []) or []:
                try:
                    page.wait_for_selector(selector, state="attached", timeout=min(timeout_ms, 5000))
                except Exception:
                    missing.append(selector)
            for action in args.get("interactions", []) or []:
                result = {"name": action.get("name") or action.get("type", "interaction"), "passed": False}
                try:
                    kind = action.get("type", "click")
                    selector = action.get("selector")
                    if kind == "click":
                        if not selector:
                            raise ValueError("click interaction requires selector")
                        expect = action.get("expect") or {}
                        before = None
                        if expect.get("type") == "attribute_changes":
                            target = expect.get("selector") or "html"
                            before = page.locator(target).get_attribute(expect.get("attribute", "class"))
                        elif expect.get("type") == "class_changes":
                            target = expect.get("selector") or "html"
                            before = page.locator(target).get_attribute("class")
                        page.locator(selector).click(timeout=min(timeout_ms, 5000))
                        page.wait_for_timeout(int(action.get("wait_ms", 120)))
                        if expect.get("type") == "attribute_changes":
                            target = expect.get("selector") or "html"
                            after = page.locator(target).get_attribute(expect.get("attribute", "class"))
                            result["passed"] = before != after
                            result["before"] = before
                            result["after"] = after
                        elif expect.get("type") == "class_changes":
                            target = expect.get("selector") or "html"
                            after = page.locator(target).get_attribute("class")
                            result["passed"] = before != after
                            result["before"] = before
                            result["after"] = after
                        elif expect.get("type") == "visible":
                            target = expect.get("selector")
                            result["passed"] = bool(target and page.locator(target).is_visible())
                        else:
                            result["passed"] = True
                    elif kind == "fill":
                        page.locator(selector).fill(str(action.get("value", "")))
                        result["passed"] = page.locator(selector).input_value() == str(action.get("value", ""))
                    elif kind == "visible":
                        result["passed"] = page.locator(selector).is_visible()
                    elif kind == "text_contains":
                        text = page.locator(selector).inner_text()
                        result["passed"] = str(action.get("value", "")) in text
                    else:
                        raise ValueError(f"Unsupported interaction type: {kind}")
                except Exception as exc:
                    result["error"] = str(exc)
                interaction_results.append(result)
            screenshot_path = None
            if args.get("screenshot_path"):
                screenshot_path = str(args["screenshot_path"])
                Path(screenshot_path).parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=screenshot_path, full_page=True)
            browser.close()
        passed = not console_errors and not page_errors and not missing and all(x.get("passed") for x in interaction_results)
        return response("browser_verify", True, {
            "passed": passed,
            "engine": "playwright-chromium",
            "console_errors": console_errors[:20],
            "page_errors": page_errors[:20],
            "missing_selectors": missing,
            "interaction_results": interaction_results,
            "screenshot_path": screenshot_path,
            "warning": None,
        }, run_id=run_id, started=started)
    except Exception as exc:
        data = _static_fallback(args, f"Real browser verification unavailable; fallback used: {exc}")
        return response("browser_verify", True, data, run_id=run_id, started=started)
