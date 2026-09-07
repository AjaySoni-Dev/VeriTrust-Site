# Codex Web Authentication Fix

## What was fixed

1. The failing `thread/start` sandbox value was changed from `readOnly` to `read-only`.
2. The turn no longer sends a second version-sensitive `sandboxPolicy` override; it inherits the read-only thread sandbox.
3. The primary UI connection now uses OpenAI's ChatGPT device-code browser flow (`chatgptDeviceCode`).
4. The Codex App Server is launched with an application-owned `CODEX_HOME` under `runtime/codex_web_profile`, so the builder does not silently reuse the user's normal desktop/CLI Codex login.
5. If no global Codex executable exists but Node.js/npm is installed, the backend can use `npx -y @openai/codex app-server`. Users therefore do not need to manually open or sign in to a local Codex CLI.

## Important architecture boundary

OpenAI's documented subscription-backed ChatGPT authentication is exposed through Codex App Server. There is not a documented third-party browser-only endpoint where an arbitrary website can exchange a ChatGPT web session for direct Codex model HTTP calls. Therefore this build keeps App Server private behind the FastAPI backend while the user-facing authentication ceremony happens entirely on OpenAI's web page.

For a public multi-user SaaS, run one isolated App Server/auth profile per signed-in application user. Never share one App Server profile across unrelated users.
