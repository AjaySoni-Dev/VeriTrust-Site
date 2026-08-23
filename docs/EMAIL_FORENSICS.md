# MailGraph email forensics

MailGraph is the email-specialist evidence path inside the Unified Gateway. It intentionally separates facts that can be derived from plain text, raw RFC 822 bytes, and trusted receiver telemetry.

## Input modes

| Mode | Accepted evidence | Important limitation |
|---|---|---|
| `plain_text` | Subject/body content and deterministic content rules | No header, MIME, sender-authentication, or infrastructure claims |
| `raw_eml` | Bounded MIME parsing, raw-byte DKIM/ARC/DMARC work, identities, URLs, attachment metadata, conservative Received hops | Historical SPF is unavailable without trusted SMTP facts |
| `trusted_receiver_event` | Raw EML plus authenticated client IP, HELO, envelope sender, receiver, and authserv identity | Requires `VERITRUST_EMAIL_RECEIVER_SECRET` and an allowlisted trusted boundary |

Authentication-Results copied from an uploaded message is not trusted unless the receiver boundary and `VERITRUST_TRUSTED_AUTHSERV_IDS` establish provenance. Infrastructure location describes network infrastructure, never a sender or person's physical location.

## Model and deterministic evidence

MailGuard model evidence requires a qualified `gateway-model-registry-2` contract. The contract must bind repository, revision, provider task, ordered labels, semantic label map, thresholds, and qualification state. See [MODEL_REGISTRY.md](MODEL_REGISTRY.md).

If required model or URL evidence is unavailable, the decision is degraded and the configured fail mode is applied. Deterministic observations still influence a bounded, versioned review risk so strong facts such as a credential request combined with a visible-link destination mismatch do not produce a misleading `0%` risk. Deterministic-only risk is advisory and cannot become a safety certificate.

Attachments remain metadata-only; the email path does not execute files. Image attachments are not sent to Deepfake. URL children are routed to Link Intelligence independently.

## Deployment requirements

- compatible Supabase Gateway and email-evidence schema, RLS, RPCs, storage, queues, and seed rows;
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`;
- `HF_TOKEN` and a qualified MailGuard contract;
- `VERITRUST_CONTENT_HMAC_KEY`, `VERITRUST_GATEWAY_DISPATCH_SECRET`, and `VERITRUST_WEBHOOK_ENCRYPTION_KEY`;
- `VERITRUST_EMAIL_RECEIVER_SECRET` for trusted receiver events;
- explicit `VERITRUST_TRUSTED_AUTHSERV_IDS` when trusting Authentication-Results.

The database migration bundle is intentionally not reconstructed from `docs/database-schema.json`. Obtain and verify the reviewed database release artifacts separately before deploying this application archive.
