# Architecture — Multi-Provider Custom Agent Runtime

## Ownership boundaries

```text
Browser UI
   ↓
FastAPI / RunService
   ↓
AgentState (single source of truth)
   ↓
Custom AgentController
   │
   ├── Provider-neutral ModelAdapter
   │      ├── NIMModelAdapter
   │      │      └── NVIDIA hosted NIM
   │      │
   │      └── CodexModelAdapter
   │             └── local codex app-server
   │                    ├── Codex-managed ChatGPT auth
   │                    ├── dynamic model/list
   │                    ├── rate-limit/usage metadata
   │                    └── read-only helper turn
   │
   ├── RelevantContextSelector
   ├── ContextWindowManager
   ├── Action / workspace guard
   ├── Deterministic tool registry
   ├── Checkpoints / rollback
   ├── Technical validator
   └── Playwright browser verifier
            ↓ failure
      targeted diagnose/repair
            ↓ pass
      requirement gate → package
```

The model never owns the controller loop, filesystem mutations, command execution, path policy, retries, rollback, or completion decision.

## OpenAI Codex integration contract

The backend starts the official local process:

```text
codex app-server
```

and communicates over the default stdio JSONL JSON-RPC transport.

Authentication flow:

```text
UI: Connect ChatGPT
      ↓
POST /api/models/codex/login/browser
      ↓
account/login/start(type=chatgpt)
      ↓
authUrl + loginId
      ↓
user completes official sign-in
      ↓
account/login/completed / account/updated
      ↓
account/read confirms connected account
```

Model discovery:

```text
model/list(includeHidden=false)
      ↓
picker-visible model metadata
      ↓
dynamic UI selector
      ↓
supportedReasoningEfforts selector
      ↓
server re-validates selection before run
```

Model invocation:

```text
Controller builds bounded model prompt
      ↓
CodexModelAdapter compacts to provider budget
      ↓
thread/start
  approvalPolicy = never
  sandbox = readOnly
      ↓
turn/start
  selected model
  selected effort
  readOnly sandboxPolicy
      ↓
streamed agentMessage / turn completion
      ↓
final text returned to controller
      ↓
helper thread unsubscribe + delete
```

Unexpected command/file approvals, permission escalation, or user-input requests are failed closed. The Codex model is an inference component; it is not granted authority to modify the website workspace directly.

## Context compaction contract

Before every provider request:

```text
raw messages
   ↓
estimate token use
   ↓
provider-specific context/output bounds
   ↓
reserve output + safety margin
   ↓
within safe input ceiling? ── yes → send
   │ no
   ↓
relevant source windows + head/tail preservation
   ↓
message-level compaction
   ↓
re-estimate
   ↓
inside hard budget? ── yes → send
   │ no
   ↓
explicit context-window error
```

For Codex, the UI model catalog is dynamic but the stable `model/list` metadata currently does not include context-window size. Therefore known model bounds are kept as overrides in `config.py`, while unknown dynamically discovered models use a conservative configured fallback rather than an optimistic guessed maximum.

## NVIDIA request contract

The existing NVIDIA adapter remains supported and isolated from the rest of the agent runtime:

```python
client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NVIDIA_API_KEY,
)
```

The configured Nemotron model uses streaming and optional thinking. Internal `reasoning_content` is not stored or exposed.


## 2026-08-23 web-auth compatibility update

- Default user connection is now OpenAI ChatGPT device-code authentication in the browser.
- The builder launches Codex App Server with an isolated application `CODEX_HOME`; it does not silently reuse the user's normal desktop/CLI auth profile.
- `thread/start` now uses `sandbox: "read-only"`, fixing the observed `unknown variant readOnly` protocol error.
- `turn/start` inherits that thread sandbox instead of sending a second version-sensitive sandbox override.
- A global Codex CLI install is optional when Node.js/npm is present; the backend can fall back to `npx -y @openai/codex app-server`.
