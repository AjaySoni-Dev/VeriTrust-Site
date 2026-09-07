# OpenAI Codex Integration Notes

This build integrates Codex through the official **Codex App Server** rather than trying to reuse a ChatGPT browser cookie or pretend a ChatGPT subscription is an OpenAI API key.

## Implemented local flow

- detect the official `codex` CLI
- launch `codex app-server` as a local child process
- perform the JSON-RPC initialize handshake
- start Codex-managed ChatGPT browser OAuth or device-code login
- read account/plan metadata without receiving OAuth tokens
- dynamically discover picker-visible models with `model/list`
- dynamically discover supported reasoning efforts
- show account rate-limit usage
- run bounded read-only helper turns with the selected model/effort
- return only final model text to the custom AgentController

## Security boundary

Codex App Server is not used as the filesystem agent for the project. Each helper thread is configured read-only and with approvals disabled. The application also denies unexpected command/file approval requests. The project's own deterministic tools remain the only path to filesystem mutation and local execution.

## Local-app limitation

The included design is specifically appropriate for this project because `start.py` runs the website generator on the same computer as the user and can spawn that user's local Codex CLI. If this project is later turned into a centrally hosted public SaaS, do not assume the server can spawn each visitor's local Codex process. That deployment architecture would need to be redesigned around an OpenAI-supported remote authentication/runtime approach available at that time.

## Model list policy

The frontend does not hardcode a set of Codex models. The backend asks App Server for the account's current picker-visible models and validates the chosen model again at run start. This prevents stale UI model IDs from silently being used.


## 2026-08-23 web-auth compatibility update

- Default user connection is now OpenAI ChatGPT device-code authentication in the browser.
- The builder launches Codex App Server with an isolated application `CODEX_HOME`; it does not silently reuse the user's normal desktop/CLI auth profile.
- `thread/start` now uses `sandbox: "read-only"`, fixing the observed `unknown variant readOnly` protocol error.
- `turn/start` inherits that thread sandbox instead of sending a second version-sensitive sandbox override.
- A global Codex CLI install is optional when Node.js/npm is present; the backend can fall back to `npx -y @openai/codex app-server`.
