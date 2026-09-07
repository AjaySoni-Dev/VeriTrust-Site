"""One-file launcher.

Run this file (for example: `python start.py`). On first run it can install the
Python requirements and Playwright Chromium automatically, then starts FastAPI
and opens the UI in the default browser.
"""
from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REQ = ROOT / "requirements.txt"


def _missing_modules() -> list[str]:
    mapping = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "openai": "openai",
        "pydantic": "pydantic",
        "bs4": "bs4",
        "playwright": "playwright",
    }
    return [package for package, module in mapping.items() if importlib.util.find_spec(module) is None]


def _install_requirements() -> None:
    missing = _missing_modules()
    if not missing:
        return
    from config import AUTO_INSTALL_PYTHON_DEPENDENCIES
    if not AUTO_INSTALL_PYTHON_DEPENDENCIES:
        raise RuntimeError(
            "Missing dependencies: " + ", ".join(missing) +
            ". Install requirements.txt or enable AUTO_INSTALL_PYTHON_DEPENDENCIES in config.py."
        )
    print("[setup] Installing Python dependencies (first launch only)...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(REQ)])


def _install_playwright_browser() -> None:
    from config import AUTO_INSTALL_PLAYWRIGHT_BROWSER
    if not AUTO_INSTALL_PLAYWRIGHT_BROWSER:
        return
    marker = ROOT / "runtime" / ".chromium_install_attempted"
    if marker.exists():
        return
    marker.parent.mkdir(parents=True, exist_ok=True)
    print("[setup] Ensuring Playwright Chromium is available. This may download a browser once...")
    try:
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        marker.write_text("ok", encoding="utf-8")
    except Exception as exc:
        # The app still opens using static checks, but do not create a success
        # marker: the next launch may retry when connectivity is available.
        print(f"[setup] Chromium install failed; continuing with static verification fallback: {exc}")


def _pick_port(preferred: int) -> int:
    for port in range(preferred, preferred + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("Could not find a free local port.")


def _wait_until_ready(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last = exc
            time.sleep(0.25)
    raise RuntimeError(f"Backend did not become ready: {last}")


def main() -> None:
    os.chdir(ROOT)
    _install_requirements()
    _install_playwright_browser()

    # Import after optional dependency setup.
    import uvicorn
    import config

    port = _pick_port(config.PORT)
    os.environ["AGENT_BUILDER_PORT"] = str(port)
    url = f"http://{config.HOST}:{port}"

    from app.models.codex_app_server import CodexAppServerClient
    codex_status = CodexAppServerClient.cli_status()
    print("\nNexora.AI + Agentic Website Builder")
    print("OpenRouter/NVIDIA: configure API key + model in Nexora Settings (stored browser-local and sent per request)")
    print(f"Server NVIDIA fallback: {config.NVIDIA_MODEL_ID} @ {config.NVIDIA_BASE_URL}")
    print(f"Codex CLI: {codex_status.get('version') or ('installed' if codex_status.get('installed') else 'not installed')}")
    print(f"UI:      {url}/pages/chat/index.html")
    if config.NVIDIA_API_KEY == "PASTE_YOUR_NVIDIA_API_KEY_HERE":
        print("[NVIDIA] No server fallback key configured; the browser-local Settings key can still be used.")
    if not codex_status.get("installed"):
        print("[Codex] Optional local Codex support is unavailable until the Codex CLI is installed.")
    else:
        print("[Codex] Optional local Codex CLI support detected.")
    print()

    # Start uvicorn in the current process. A small delayed browser opener avoids
    # racing the server startup and keeps Ctrl+C behavior clean.
    import threading

    def open_when_ready() -> None:
        try:
            _wait_until_ready(url + "/api/health")
            if config.OPEN_BROWSER:
                webbrowser.open(url + "/pages/chat/index.html")
        except Exception as exc:
            print(f"[startup] Could not automatically open browser: {exc}")

    threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run("app.main:app", host=config.HOST, port=port, log_level="info", reload=False)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"\n[startup error] {exc}")
        if os.name == "nt":
            input("Press Enter to close...")
        raise
