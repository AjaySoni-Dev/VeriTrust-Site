# Gateway and MailGraph repair report

> Historical diagnosis only. Use `docs/PHISHING_GATEWAY_RELEASE.md` for the
> final source-pinned direct-module architecture, Supabase migration, and
> Vercel environment matrix. Do not apply the legacy environment steps below
> to the current release.

## Root cause of report `247abc98-8184-4eac-97bb-b58ac0e27c2f`

The authoritative content model did not call Hugging Face. `prepareModelRun` selected an active `gateway_model_versions` row and rejected its `configuration` because it was not a complete `gateway-model-registry-2` contract. The resulting reason chain was:

```text
GATEWAY_MODEL_CONTRACT_UNRESOLVED
-> PHISHING_MODEL_UNAVAILABLE
-> required evidence unavailable
-> degraded decision
```

The former correlation implementation ignored completed deterministic evidence with a null numeric score. Because at least one non-scored observation existed, its unknown-risk fallback also did not run. That produced the misleading `0% policy risk` despite credential, visible-link, and identity observations.

## Code repairs

- Standalone phishing routes now resolve a qualified contract instead of always calling a function that rejects a null contract.
- Superseded 2026-08-23: Gateway database rows must now contain a complete contract that matches the runtime identity. Legacy fallback was removed so persisted provenance always names the model that actually executed.
- MailGuard requests `top_k` equal to the complete ordered label set and explicitly requests softmax output.
- Hugging Face metadata is checked before inference for exact current revision, live provider mapping, and task compatibility.
- Provider authentication, missing model, revision drift, unavailable mapping, task mismatch, rate limit, timeout, and network failures now have distinct codes.
- Correlation v3 gives bounded weight to deterministic email evidence and represents unavailable required evidence as unknown risk instead of zero.
- Admin health diagnostics report token and contract readiness without exposing tokens or model IDs.
- Runtime configuration, module-switch, contract, correlation, and mocked inference tests are present and run through `npm run check`.

### Authenticated header repair

The shared header previously gated cookie-session verification on the browser's public Supabase configuration. A failed or delayed `/api/client-config` request could therefore make an existing secure server session look signed out and leave `Log in` visible. The header now verifies the HttpOnly-cookie session through `/api/auth-session` independently of that public configuration request. Its login control remains hidden while the session is pending, becomes `Log out` only after authentication is confirmed, and stays hidden when session status is temporarily unavailable.

Regression coverage in `tests/site-auth-navigation.test.js` prevents the public-config gate and premature login rendering from returning.

## Deployment state that source code cannot prove

This ZIP has no Vercel project link, no environment file, and no production secrets. The public production health route returns operational status but intentionally does not expose private diagnostics. Therefore the repository cannot prove whether `HF_TOKEN`, Supabase keys, or Gateway keys exist in the active Vercel Production environment.

On 2026-08-23, the deployed `/api/client-config` and `/api/health` routes both returned HTTP 200, while an anonymous `/api/auth-session?action=session` request correctly returned HTTP 401. Because the client-config handler reads the required Supabase URL and anonymous key, this is evidence that those two values were available to that deployment at check time. It does not establish that `SUPABASE_SERVICE_ROLE_KEY`, `HF_TOKEN`, the pinned model contracts, Gateway secrets, or every environment scope is configured correctly.

The ZIP also contains only `docs/database-schema.json`, a read-only inventory. It does not contain the SQL migrations, seed data, or verification assertions listed by that inventory. Production database compatibility and the active model-version rows must be verified through the controlled Supabase release workflow.

The later correlation-v3 reports that still show `GATEWAY_MODEL_CONTRACT_UNRESOLVED` prove that the correlation repair was deployed but a qualified MailGuard contract was not resolved. Repository variables such as `HF_PHISHING_MAILGUARD_MODEL` identify a model only; they do not bind its immutable revision and label semantics. The repository now includes `config/hf-model-contracts.canary.json`, `npm run config:canary`, and `docs/VERCEL_ENV_CHECKLIST.md` so deployment values can be copied coherently without guessing.

## Required release sequence

1. Run `npm ci` and `npm run check`.
2. Load the intended environment and run `npm run config:check`.
3. In Vercel Production settings, configure the required Supabase, HF, Gateway, origin, and optional receiver variables documented in `.env.example`.
4. Add a genuinely qualified `HF_MODEL_CONTRACTS.mailguard` entry as described in `MODEL_REGISTRY.md`; do not treat a researched public model as qualified merely because its provider is live.
5. Verify database `gateway_model_versions` rows, RPCs, RLS, storage, queues, policies, and seed records against the controlled migration bundle.
6. Redeploy. Vercel variable changes do not affect an already-created deployment.
7. Call `/api/health` with `X-VeriTrust-Admin-Secret` and confirm HF token and contract readiness.
8. Submit a new known-fixture scan with a new idempotency key. Existing persisted reports are immutable and will continue to show their original v2 decision.

If preflight returns `HF_MODEL_PROVIDER_UNAVAILABLE`, the chosen repository has no live mapping for the adapter provider and must be served through a qualified dedicated endpoint/worker or replaced by a separately qualified model. If it returns `HF_AUTH_FAILED`, fix or rotate the Vercel HF token and redeploy.
