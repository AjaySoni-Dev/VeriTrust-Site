# Vercel environment checklist

## MailGraph and Gateway model transport

Keep `HF_TOKEN` or `HF_ACCESS_TOKEN` configured as a secret with Hugging Face Inference Providers permission. Never commit or paste that token into a report.

MailGuard and Swift model repositories, immutable revisions, label contracts,
site origins, the 55-second execution budget, and the single-consumer Link
Intelligence queue are pinned in source. Remove these obsolete Vercel variables:

- `HF_PHISHING_MAILGUARD_MODEL`;
- `HF_LINK_SWIFT_MODEL`;
- `HF_MODEL_CONTRACTS`;
- `VERITRUST_GATEWAY_SYNC_BUDGET_MS`;
- `VERITRUST_GATEWAY_MODEL_CONCURRENCY`;
- `VERITRUST_GATEWAY_SERVERLESS_BATCH`;
- `VERITRUST_SITE_URL`;
- `VERITRUST_ALLOWED_ORIGINS`.

Gateway registry rows must contain the same complete contracts; incomplete or
divergent database provenance is rejected before the direct module call.

The canary profile pins immutable revisions and model label semantics. It is suitable for transport and fixture verification. It is not a claim of production accuracy; promotion requires VeriTrust's representative evaluation and governance gates.

## Required platform values

The active Gateway deployment also needs:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`;
- `VERITRUST_CONTENT_HMAC_KEY` or the accepted alias `CONTENT_HMAC`, at least 32 bytes;
- `VERITRUST_GATEWAY_DISPATCH_SECRET` or `DISPATCH`, at least 32 bytes;
- `VERITRUST_WEBHOOK_ENCRYPTION_KEY` or `WEBHOOK_ENCRYPTION`, a 32-byte key in the encoding accepted by the webhook service;
- `VERITRUST_ADMIN_SECRET` or `ADMIN` for private health diagnostics.

The short aliases visible in the supplied Vercel screenshot are accepted by the runtime. `npm run config:check` also accepts them.

## Gateway database registry

Standalone Link Intelligence and MailGraph execute the same source-pinned model
contract. MailGraph additionally requires active Supabase
`gateway_model_versions` rows because Gateway evidence must bind a persisted
registry version before inference. The MailGuard row must support `email`; the
Swift row must support `url`. `gateway_module_contracts` is an auditable mirror
of the direct internal module bus and is not runtime configuration.

Apply `20260823120000_gateway_model_run_timestamp_guard.sql` after the module
alignment migration. It prevents Vercel request latency or clock skew from
making `started_at` precede the Supabase-generated `created_at` value.

Call `/api/health` with `X-VeriTrust-Admin-Secret`. In addition to `diagnostics.model_contracts`, inspect:

- `diagnostics.database_model_registry.mailguard.ready`;
- `diagnostics.database_model_registry.swift.ready`;
- `diagnostics.database_model_registry_error`.

This repository does not fabricate or automatically mutate production registry rows. If either database readiness value is false, apply the controlled Supabase migration/seed bundle used by the deployed database before expecting Gateway inference to run.

## Trusted receiver values

`VERITRUST_EMAIL_RECEIVER_SECRET` is required only for the trusted receiver ingestion endpoint. Generate a unique random value; do not use a shared example. `VERITRUST_TRUSTED_AUTHSERV_IDS` must list only the Authentication-Results authserv IDs belonging to the configured trusted receiver.

An EML uploaded through the browser cannot establish trusted SMTP client IP and HELO facts. SPF therefore remains `UNAVAILABLE` for an uploaded EML even when every environment variable is correct. Use the trusted receiver endpoint when receiver-grounded SPF and Authentication-Results evidence is required.

## Expected sample limitations

The supplied synthetic fixture uses `.example` infrastructure and a DKIM signature whose body hash does not verify. Those observations should remain visible. Attachment execution and media-authenticity analysis also remain unavailable when their modules are disabled. These are evidence limitations, not model-transport failures.

After redeployment, create a new scan. Previously persisted reports are immutable.
