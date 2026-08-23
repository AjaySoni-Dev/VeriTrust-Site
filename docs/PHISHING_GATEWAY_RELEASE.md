# MailGraph, Link Intelligence, and Gateway release

## Diagnosis

The supplied report is not a browser race. MailGraph awaits its URL work before
correlation. Its `Registry bound` label also proves that Supabase selected a
model version and created a model-run row. The remaining generic `MODEL_ERROR`
was produced after registry preparation, at the provider request/output
boundary.

This was reproduced against production on 2026-08-23 with the supplied EML.
Fresh scan `59cdaaab-7d94-48aa-ad5a-f809f513a33a` failed MailGuard and all four
Swift children. The exact extracted URL then succeeded through the standalone
Swift page, but required approximately 20 seconds. The deployed MailGraph
policy allowed only about 5 seconds per nested model request. That timing,
together with all five failures occurring at the same provider boundary,
isolates the fault to the nested inference deadline and request fan-out, not UI
result rendering.

After the first deployment, controlled production scan
`079e4453-a8f4-4645-81ce-44b377921534` completed in 8.5 seconds with all five
models failed. This proved the waits were present but the provider rejected the
requests early. The HF text-classification request schema accepts a single
string for `inputs`; it does not define URL or message arrays. The integration
batch payload therefore diverged from the working standalone Swift payload.

After the string-request release, a one-URL production probe
`34bf0b32-c071-4766-9154-adc6cfefa2ac` still failed both models in 10.6 seconds,
while the identical URL succeeded through standalone Swift in 9.6 seconds.
That isolates the final divergence to the JSONB-derived registry contract
object injected only by MailGraph. The final adapter keeps Supabase model
selection, identity matching, run creation, and audit binding, but executes
inference using the verified immutable runtime contract used by the standalone
detector. URL children are processed by a single-consumer bounded queue.

The previous implementation made that boundary fragile in four ways:

1. a valid database contract could silently select a different model than the
   standalone route;
2. concurrent URLs each performed the same Hugging Face metadata preflight;
3. MailGraph used a 5-second fallback model budget, issued one provider request
   per URL, and could overrun the classifier input limit;
4. provider 4xx responses and malformed output collapsed into `MODEL_ERROR`.

The repaired runtime uses one bounded, ordered model plan; single-flight model
preflight; the exact standalone Swift string request for every URL; bounded and
fully awaited concurrent URL execution; individual MailGuard string requests;
deadline-bounded transient retries; immutable runtime/database identity
matching; and specific persisted failure codes. No text-classification request
contains array `inputs` or the unsupported legacy `options` object.

## Required release order

1. Apply `migrations/20260823110000_direct_module_bus_alignment.sql`, followed
   by `migrations/20260823120000_gateway_model_run_timestamp_guard.sql`, in the
   Supabase SQL editor. The timestamp guard fixes the integration-only model-run
   insert failure that occurs before either classifier starts.
2. Remove the obsolete Vercel variables below and retain the required secrets.
3. Verify the pinned runtime configuration with `npm run config:check`.
4. create a new Vercel deployment (editing variables does not change an existing
   deployment);
5. call the health route and confirm the public release marker, then call the
   private health route and confirm runtime and database registry readiness;
6. submit a new scan with a new idempotency key. Old reports are immutable.

## Vercel key matrix

Delete these non-secret variables. Their values are now immutable source
configuration and Vercel cannot override them:

```text
HF_PHISHING_MAILGUARD_MODEL
HF_LINK_SWIFT_MODEL
HF_MODEL_CONTRACTS
VERITRUST_GATEWAY_SYNC_BUDGET_MS
VERITRUST_GATEWAY_MODEL_CONCURRENCY
VERITRUST_GATEWAY_SERVERLESS_BATCH
VERITRUST_SITE_URL
VERITRUST_ALLOWED_ORIGINS
```

Required secrets whose values must come from their authoritative systems, not
from source code or screenshots:

```text
SUPABASE_URL=<Project Settings -> API -> Project URL>
SUPABASE_ANON_KEY=<Project Settings -> API -> anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Project Settings -> API -> service_role secret>
HF_ACCESS_TOKEN=<keep the existing Hugging Face token with Inference Providers permission>
VERITRUST_CONTENT_HMAC_KEY=<existing CONTENT_HMAC value, or a new random value of at least 32 bytes>
VERITRUST_GATEWAY_DISPATCH_SECRET=<must match the Supabase Vault veritrust_gateway_dispatch_secret value>
VERITRUST_WEBHOOK_ENCRYPTION_KEY=<a random 32-byte key in the encoding expected by the webhook service>
VERITRUST_ADMIN_SECRET=<a distinct random admin secret>
```

The screenshot aliases `CONTENT_HMAC`, `DISPATCH`, `WEBHOOK_ENCRYPTION`, and
`ADMIN` remain accepted. Configure either the canonical name or its alias, not
two independently generated values. Do not rotate `DISPATCH` on only one side;
Vercel and Supabase Vault must change together.

`VERITRUST_EMAIL_RECEIVER_SECRET` is required only for the trusted receiver
endpoint. An uploaded EML cannot supply trusted SMTP facts, so SPF remains
unavailable for browser uploads by design.

## Verification queries

Registry readiness (must return exactly two rows):

```sql
select model_key,
       version,
       provider,
       rollout_status,
       timeout_ms,
       supported_artifacts,
       configuration ->> 'repository_id' as repository_id,
       configuration ->> 'revision_sha' as revision_sha,
       configuration ->> 'qualification_state' as qualification_state
from public.gateway_model_versions
where rollout_status = 'active'
  and model_key in ('mailguard', 'swift')
order by model_key, org_id nulls first;
```

Inspect the historical failing scan without exposing message content:

```sql
select s.id as scan_id,
       mr.model_key,
       mr.status as run_status,
       mr.error_code,
       mr.error_detail,
       e.status as evidence_status,
       e.reason_codes,
       e.raw_response_redacted
from public.gateway_scans s
left join public.gateway_model_runs mr on mr.scan_id = s.id
left join public.gateway_evidence e on e.model_run_id = mr.id
where s.id = 'f185b12b-61c1-45e5-875e-1f9b544b8228'::uuid
order by mr.created_at;
```

Inspect only fresh post-release scans; old results do not change:

```sql
select s.id,
       s.status,
       s.degraded,
       mr.model_key,
       mr.status as model_status,
       mr.error_code,
       e.score,
       e.verdict,
       e.reason_codes
from public.gateway_scans s
join public.gateway_model_runs mr on mr.scan_id = s.id
left join public.gateway_evidence e on e.model_run_id = mr.id
where s.created_at >= now() - interval '1 hour'
  and mr.model_key in ('mailguard', 'swift')
order by s.created_at desc, mr.created_at;
```

Private health request:

```powershell
Invoke-RestMethod `
  -Uri 'https://www.veritrustlab.in/api/health' `
  -Headers @{ 'X-VeriTrust-Admin-Secret' = $env:VERITRUST_ADMIN_SECRET }
```

Required health assertions:

```text
release = mailgraph-model-run-timestamp-guard-2026-08-23
diagnostics.hf_token_configured = true
diagnostics.model_contracts.mailguard.ready = true
diagnostics.model_contracts.swift.ready = true
diagnostics.database_model_registry.mailguard.ready = true
diagnostics.database_model_registry.swift.ready = true
diagnostics.database_model_registry.mailguard.invalid_tenant_override_count = 0
diagnostics.database_model_registry.swift.invalid_tenant_override_count = 0
diagnostics.database_model_registry_error = null
```

The first fresh EML report must show `phishing-evidence-6`. If `/api/health`
does not show the release marker, Vercel is serving code without the
application-side timestamp guard. Applying the database trigger is still an
immediate server-side repair for the currently deployed direct-module build.
