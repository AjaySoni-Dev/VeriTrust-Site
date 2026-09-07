"""Single user-editable configuration file.

This build supports three model backends:
1) NVIDIA hosted NIM through the OpenAI-compatible API.
2) OpenRouter through a user-supplied browser-local API key.
3) OpenAI Codex App Server, including Sign in with ChatGPT for the standalone
   agent runtime UI.

Nexora's OpenRouter/NVIDIA keys are supplied per request and are not persisted
by the Python backend. Never copy secrets into generated workspaces or exports.
"""
from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# DEFAULT PROVIDER
# ---------------------------------------------------------------------------
# "nvidia", "openrouter", or "codex". The UI can override this per run.
DEFAULT_MODEL_PROVIDER = os.getenv("DEFAULT_MODEL_PROVIDER", "nvidia").strip().lower()

# ---------------------------------------------------------------------------
# NVIDIA HOSTED NIM
# ---------------------------------------------------------------------------
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "PASTE_YOUR_NVIDIA_API_KEY_HERE")
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL_ID = os.getenv("NVIDIA_MODEL_ID", "nvidia/nemotron-3-super-120b-a12b")
MODEL_TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "1.0"))
MODEL_TOP_P = float(os.getenv("MODEL_TOP_P", "0.95"))
MODEL_MAX_TOKENS = int(os.getenv("MODEL_MAX_TOKENS", "16384"))
MODEL_TIMEOUT_SECONDS = int(os.getenv("MODEL_TIMEOUT_SECONDS", "240"))
MODEL_RETRIES = int(os.getenv("MODEL_RETRIES", "2"))
MODEL_STREAM = os.getenv("MODEL_STREAM", "true").lower() == "true"
ENABLE_THINKING = os.getenv("ENABLE_THINKING", "true").lower() == "true"
MODEL_REASONING_BUDGET = int(os.getenv("MODEL_REASONING_BUDGET", "4096"))
REASONING_BUDGET_FRACTION = float(os.getenv("REASONING_BUDGET_FRACTION", "0.35"))


# ---------------------------------------------------------------------------
# OPENROUTER (user key is normally supplied per request from Nexora localStorage)
# ---------------------------------------------------------------------------
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL_ID = os.getenv("OPENROUTER_MODEL_ID", "openai/gpt-4o-mini")
OPENROUTER_APP_TITLE = os.getenv("OPENROUTER_APP_TITLE", "Nexora.AI Agentic Builder")
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://127.0.0.1:8765")

# ---------------------------------------------------------------------------
# OPENAI CODEX APP SERVER
# ---------------------------------------------------------------------------
# The application talks to the official Codex App Server as a PRIVATE BACKEND
# runtime. It does not reuse the user's normal local Codex login. By default it
# launches with an application-owned CODEX_HOME and authenticates through the
# OpenAI/ChatGPT web device-code flow. The browser user never handles an API key.
#
# A globally installed Codex CLI is optional: when absent, an `npx` backend
# fallback can launch @openai/codex without a user-global Codex installation.
CODEX_CLI_PATH = os.getenv("CODEX_CLI_PATH", "codex").strip() or "codex"
CODEX_APP_SERVER_TIMEOUT_SECONDS = int(os.getenv("CODEX_APP_SERVER_TIMEOUT_SECONDS", "300"))
CODEX_LOGIN_TIMEOUT_SECONDS = int(os.getenv("CODEX_LOGIN_TIMEOUT_SECONDS", "300"))
CODEX_MODEL_TIMEOUT_SECONDS = int(os.getenv("CODEX_MODEL_TIMEOUT_SECONDS", "300"))
CODEX_DEFAULT_MODEL = os.getenv("CODEX_DEFAULT_MODEL", "gpt-5.3-codex")
CODEX_DEFAULT_REASONING_EFFORT = os.getenv("CODEX_DEFAULT_REASONING_EFFORT", "high")
CODEX_AUTO_INSTALL_ALLOWED = os.getenv("CODEX_AUTO_INSTALL_ALLOWED", "true").lower() == "true"
CODEX_NPM_PACKAGE = os.getenv("CODEX_NPM_PACKAGE", "@openai/codex")
CODEX_NPX_FALLBACK_ENABLED = os.getenv("CODEX_NPX_FALLBACK_ENABLED", "true").lower() == "true"
CODEX_WEB_LOGIN_MODE = os.getenv("CODEX_WEB_LOGIN_MODE", "device").strip().lower()
# Conservative defaults for Codex-family model calls. The UI discovers actual
# picker-visible models/effort options dynamically from model/list.
CODEX_CONTEXT_WINDOW_TOKENS = int(os.getenv("CODEX_CONTEXT_WINDOW_TOKENS", "100000"))
CODEX_SOFT_INPUT_LIMIT_TOKENS = int(os.getenv("CODEX_SOFT_INPUT_LIMIT_TOKENS", "92000"))
CODEX_RESERVED_OUTPUT_TOKENS = int(os.getenv("CODEX_RESERVED_OUTPUT_TOKENS", "16000"))
CODEX_CONTEXT_SAFETY_MARGIN_TOKENS = int(os.getenv("CODEX_CONTEXT_SAFETY_MARGIN_TOKENS", "4096"))
CODEX_SANDBOX_DIR_NAME = "codex_model_sandbox"
CODEX_SERVICE_NAME = "agentic_website_builder"

# Known public context-window overrides. Unknown dynamically discovered models
# use the conservative CODEX_CONTEXT_WINDOW_TOKENS value above.
CODEX_MODEL_CONTEXT_WINDOWS = {
    "gpt-5.3-codex": 400000,
    "gpt-5.2-codex": 400000,
    "gpt-5-codex": 400000,
    "gpt-5.6-sol": 1050000,
    "gpt-5.6-terra": 1050000,
    "gpt-5.6-luna": 1050000,
}
CODEX_MODEL_MAX_OUTPUTS = {
    "gpt-5.3-codex": 128000,
    "gpt-5.2-codex": 128000,
    "gpt-5-codex": 128000,
    "gpt-5.6-sol": 128000,
    "gpt-5.6-terra": 128000,
    "gpt-5.6-luna": 128000,
}

# ---------------------------------------------------------------------------
# CONTEXT WINDOW + AUTOMATIC COMPACTION (NVIDIA defaults)
# ---------------------------------------------------------------------------
MODEL_CONTEXT_WINDOW_TOKENS = int(os.getenv("MODEL_CONTEXT_WINDOW_TOKENS", "100000"))
CONTEXT_SAFETY_MARGIN_TOKENS = int(os.getenv("CONTEXT_SAFETY_MARGIN_TOKENS", "4096"))
MODEL_SOFT_INPUT_LIMIT_TOKENS = int(os.getenv("MODEL_SOFT_INPUT_LIMIT_TOKENS", "92000"))
CONTEXT_COMPACTION_TRIGGER_RATIO = float(os.getenv("CONTEXT_COMPACTION_TRIGGER_RATIO", "0.92"))
CONTEXT_KEEP_HEAD_RATIO = float(os.getenv("CONTEXT_KEEP_HEAD_RATIO", "0.46"))
CONTEXT_KEEP_TAIL_RATIO = float(os.getenv("CONTEXT_KEEP_TAIL_RATIO", "0.46"))
MAX_FILES_IN_CONTEXT = int(os.getenv("MAX_FILES_IN_CONTEXT", "8"))
MAX_FILE_TOKENS_IN_CONTEXT = int(os.getenv("MAX_FILE_TOKENS_IN_CONTEXT", "24000"))
MAX_TOTAL_FILE_CONTEXT_TOKENS = int(os.getenv("MAX_TOTAL_FILE_CONTEXT_TOKENS", "52000"))
MAX_FILE_BYTES_IN_CONTEXT = int(os.getenv("MAX_FILE_BYTES_IN_CONTEXT", "180000"))
USE_NATIVE_TOOL_CALLING = os.getenv("USE_NATIVE_TOOL_CALLING", "false").lower() == "true"

# ---------------------------------------------------------------------------
# SERVER / STARTUP
# ---------------------------------------------------------------------------
HOST = os.getenv("AGENT_BUILDER_HOST", "127.0.0.1")
PORT = int(os.getenv("AGENT_BUILDER_PORT", "8765"))
OPEN_BROWSER = os.getenv("OPEN_BROWSER", "true").lower() == "true"
AUTO_INSTALL_PYTHON_DEPENDENCIES = os.getenv("AUTO_INSTALL_PYTHON_DEPENDENCIES", "true").lower() == "true"
AUTO_INSTALL_PLAYWRIGHT_BROWSER = os.getenv("AUTO_INSTALL_PLAYWRIGHT_BROWSER", "true").lower() == "true"

# ---------------------------------------------------------------------------
# AGENT POLICY
# ---------------------------------------------------------------------------
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "24"))
MAX_TOTAL_MODEL_TOKENS = int(os.getenv("MAX_TOTAL_MODEL_TOKENS", "2000000"))
MAX_ERROR_RETRIES_PER_STEP = int(os.getenv("MAX_ERROR_RETRIES_PER_STEP", "3"))
MAX_PATCH_RETRIES = int(os.getenv("MAX_PATCH_RETRIES", "2"))
MAX_REPLANS = int(os.getenv("MAX_REPLANS", "2"))
MAX_LOG_CHARS = int(os.getenv("MAX_LOG_CHARS", "12000"))
COMMAND_TIMEOUT_SECONDS = int(os.getenv("COMMAND_TIMEOUT_SECONDS", "60"))
BROWSER_TIMEOUT_SECONDS = int(os.getenv("BROWSER_TIMEOUT_SECONDS", "30"))
ALLOW_UNCERTAIN_REQUIREMENTS = os.getenv("ALLOW_UNCERTAIN_REQUIREMENTS", "false").lower() == "true"
COMMAND_ALLOWLIST = {"node", "python", "python3"}

# ---------------------------------------------------------------------------
# STORAGE
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent
# Vercel Functions have an ephemeral writable /tmp filesystem. Never write to
# the deployed source tree in serverless mode. A build is intentionally kept
# inside one streamed invocation, so /tmp lifetime is sufficient.
SERVERLESS_MODE = (
    os.getenv("NEXORA_SERVERLESS_MODE", "").lower() in {"1", "true", "yes"}
    or bool(os.getenv("VERCEL"))
)
# Stop starting expensive model phases well before Vercel's 300 second ceiling.
# The controller can then spend the reserved tail on deterministic verification,
# packaging, and emitting the terminal SSE event instead of being killed mid-run.
SERVERLESS_MAX_WALL_SECONDS = int(os.getenv("NEXORA_SERVERLESS_MAX_WALL_SECONDS", "245"))
if SERVERLESS_MODE:
    _SERVERLESS_ROOT = Path(os.getenv("NEXORA_TMP_ROOT", "/tmp/nexora-agent")).resolve()
    WORKSPACES_DIR = _SERVERLESS_ROOT / "workspaces"
    ARTIFACTS_DIR = _SERVERLESS_ROOT / "artifacts"
    RUNTIME_DIR = _SERVERLESS_ROOT / "runtime"
else:
    WORKSPACES_DIR = ROOT_DIR / "workspaces"
    ARTIFACTS_DIR = ROOT_DIR / "artifacts"
    RUNTIME_DIR = ROOT_DIR / "runtime"
PROJECTS_DB = RUNTIME_DIR / "projects.json"
CODEX_SANDBOX_DIR = RUNTIME_DIR / CODEX_SANDBOX_DIR_NAME
# Separate auth/config store for the website integration. This prevents the
# builder from silently inheriting ~/.codex credentials from a user's normal
# desktop/CLI installation.
CODEX_WEB_HOME_DIR = RUNTIME_DIR / "codex_web_profile"

ALLOWED_PROJECT_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".json", ".txt", ".md", ".svg",
}
MAX_PROJECT_FILE_BYTES = int(os.getenv("MAX_PROJECT_FILE_BYTES", str(2 * 1024 * 1024)))
INTERNAL_EXCLUDES = {
    ".agent", ".git", "node_modules", "__pycache__", ".pytest_cache",
    "config.py", ".env", ".env.local",
}

# Backward-compatible aliases from previous routed builds.
HF_TOKEN = NVIDIA_API_KEY
HF_BASE_URL = NVIDIA_BASE_URL
HF_MODEL_ID = NVIDIA_MODEL_ID
