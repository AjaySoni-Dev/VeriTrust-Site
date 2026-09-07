> **Integrated Nexora build:** when this directory is embedded under Nexora.AI, launch the product from the repository root with `python start_nexora.py` and configure OpenRouter/NVIDIA keys in **Settings → Agentic AI Runtime**. The browser-local user keys are supplied per request; editing `config.py` is not required for that flow.

# Multi-Provider Agentic Website Builder — NVIDIA NIM + OpenAI Codex

A purpose-built static-site coding agent with a deterministic controller, versioned workspace tools, execution/browser verification, bounded self-repair, checkpoints/rollback, evidence-based completion, and provider-aware context compaction.

The runtime supports two inference backends without changing the agent controller:

1. **NVIDIA hosted NIM** using `nvidia/nemotron-3-super-120b-a12b`.
2. **OpenAI Codex App Server** using the locally installed official Codex CLI. The UI can start Codex's managed **Sign in with ChatGPT** flow, discover the models visible to the connected account, and let the user choose a model and supported reasoning effort for each run.

## Run

Run only:

```bash
python start.py
```

`start.py` installs missing Python dependencies when allowed, attempts the Playwright Chromium setup, starts FastAPI, waits for health, and opens the browser UI.

### NVIDIA setup

Open `config.py` and set the backend-only key:

```python
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "PASTE_YOUR_NVIDIA_API_KEY_HERE")
```

The UI can then select **NVIDIA NIM**.

### OpenAI Codex / ChatGPT setup

1. Run `python start.py`.
2. In **Model Backend**, select **OpenAI Codex · ChatGPT account**.
3. If the Codex CLI is not installed, use **Install Codex CLI**. This is an explicit user-triggered action; `start.py` does not silently install global npm packages.
4. Click **Connect ChatGPT**. The backend asks the local `codex app-server` for its managed browser login URL and opens the OpenAI/ChatGPT sign-in page. A device-code fallback is also available.
5. After sign-in, the UI calls App Server `model/list` and renders the picker-visible models returned for that account. It also renders each model's supported reasoning-effort choices.
6. Choose a model + effort and generate normally.

The application does **not** ask the user to paste ChatGPT OAuth access/refresh tokens. In managed ChatGPT mode, Codex owns token persistence and refresh. The website generator only receives account metadata, model metadata, model outputs, and usage/rate-limit information returned by App Server.

## Why Codex App Server instead of pretending ChatGPT is an API key

The integration is built around the official local `codex app-server` JSON-RPC interface. That is the supported surface for deep product integrations that need Codex authentication, model discovery, threads/turns, approvals, and streamed agent events.

The local website builder keeps Codex deliberately **model-only**:

```text
Website Builder UI
       ↓
FastAPI / RunService
       ↓
provider selector
   ├──────────── NVIDIA NIM adapter
   │
   └──────────── Codex App Server adapter
                    ↓
              ChatGPT-managed auth
              dynamic model/list
              read-only helper turn
                    ↓
              model text only
       ↓
Custom AgentController
       ↓
Deterministic tools / workspace / verification
```

Codex helper threads use `approvalPolicy="never"` and a read-only sandbox. The model is told not to edit files, run commands, browse, or ask questions. Filesystem changes, shell execution, retries, rollback, verification, and completion remain owned by this project's custom controller.

## Dynamic Codex model selection

No fixed UI list is used. The backend calls `model/list` and only accepts a selected model that appears in the connected account's picker-visible result. Supported reasoning efforts are also read from model metadata. This means the picker can follow Codex model availability without requiring a frontend rewrite.

The runtime has conservative context-window fallbacks in `config.py` because `model/list` does not expose a context-window size field. Known public model bounds can be overridden in `CODEX_MODEL_CONTEXT_WINDOWS` and `CODEX_MODEL_MAX_OUTPUTS`; unknown models use the conservative defaults.

## Context window + compaction

`app/agent/context_window.py` performs hard input/output accounting for both providers.

Compaction is two-stage:

1. **File-aware compaction** (`app/agent/context.py`) ranks files, preserves request/search-relevant source windows, and applies per-file plus total context caps.
2. **Message-level safety compaction** (`app/agent/context_window.py`) reserves output tokens and a safety margin, preserves high-priority request/instruction sections, compacts oversized messages, re-estimates usage, and refuses a call if it still cannot fit safely.

AgentState records compaction count and estimated context tokens saved. The UI exposes these metrics.

## NVIDIA inference defaults

- Base URL: `https://integrate.api.nvidia.com/v1`
- Model: `nvidia/nemotron-3-super-120b-a12b`
- Maximum requested output: `16384`
- Thinking: enabled through `chat_template_kwargs.enable_thinking`
- Streaming: enabled by default

NVIDIA `reasoning_content` is not persisted or exposed.

## Security / reliability

- backend-only NVIDIA secret
- no ChatGPT OAuth token storage in this application
- local Codex App Server over stdio JSONL
- Codex helper threads are read-only and approval-denied
- selected Codex models must come from dynamic `model/list`
- no `shell=True`
- executable allowlist
- workspace path confinement
- atomic writes
- SHA-256 edit preconditions
- bounded iterations/retries
- finite model/command/browser timeouts
- checkpoints and rollback
- no silent success
- generated ZIP excludes internal state, secrets, and checkpoints

## Tests

```bash
python -m pytest -q
```

The suite includes a fake Codex App Server process that exercises JSON-RPC initialization, ChatGPT account discovery, both login response shapes, model discovery, rate limits, thread/turn streaming, adapter normalization, and provider-specific context accounting without needing a real user's credentials.


## Codex web-login compatibility fix (23 Aug 2026)

The Codex provider now uses the OpenAI device-code browser ceremony as the default Connect flow and an isolated application `CODEX_HOME`. The known `unknown variant readOnly` failure is fixed by using `sandbox="read-only"` on `thread/start` and inheriting that sandbox on turns. See `CODEX_WEB_AUTH_FIX.md`.
