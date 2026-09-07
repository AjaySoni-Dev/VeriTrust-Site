# VeriTrust Architecture

## Product center of gravity

VeriTrust MailGraph is an email threat and forensic-intelligence workflow. Link Intelligence, the Evidence Correlation Gateway, Cases, reporting, privacy and API access support that workflow; they are not separate product stories.

## Runtime flow

1. **Input capability classification** — `plain_text`, `raw_eml`, or `trusted_receiver_event`.
2. **Bounded parsing** — raw email is parsed with explicit byte, MIME-depth, part-count and timeout limits.
3. **Content evidence** — MailGuard and deterministic content observations.
4. **Authentication evidence** — DKIM/DMARC/ARC from raw evidence; SPF only when trusted SMTP facts are supplied.
5. **Identity relationships** — visible and technical sender identities, linked domains and infrastructure relationships.
6. **URL intelligence** — extracted URLs become child artifacts evaluated independently.
7. **Attachment metadata** — attachment metadata/hashes are recorded; attachment content is not executed.
8. **Infrastructure context** — Received-header infrastructure is extracted, classified and optionally enriched with ASN/geolocation.
9. **Correlation** — the Gateway combines available specialist and deterministic evidence under policy.
10. **Persistence/reporting** — results, evidence, cases and audit identifiers use the existing Supabase contract.

## Trust model

A saved email is not automatically a trusted record of the complete SMTP transaction. Copied `Authentication-Results` and lower Received headers can be misleading unless anchored to a trusted receiver boundary.

For `raw_eml`, infrastructure is therefore **observed/unverified**. For `trusted_receiver_event`, the receiver-added boundary can support stronger SMTP and SPF evidence. The system never converts this into a person-location claim.

## Risk versus evidence completeness

VeriTrust intentionally separates:

- specialist model score;
- deterministic rule evidence;
- correlated Gateway risk;
- evidence completeness.

Evidence completeness reports how much usable forensic evidence was available. It does not change the risk formula and is not a safety score.

## Database boundary

No new tables or migrations are required by the current cleanup. New provenance, completeness, infrastructure-summary and attachment metadata fields are response/JSON metadata derived from existing evidence and existing JSON-capable artifact metadata.

## Live SMTP enforcement path

The persistent SMTP gateway in `mail-gateway/` is a transport adapter around the existing MailGraph/Gateway stack, not a second threat engine. It receives SMTP on a private listener, records the directly observed client IP/HELO/MAIL FROM/receiver timestamp, prepends the receiver-owned `Received:` header, and submits the exact received RFC 822 bytes to `/internal/v2/phishing/receiver-eml`. The API authenticates both the scoped Gateway API key and the separate receiver secret before accepting those facts as `trusted_receiver_event` evidence.

The transport adapter then applies the already-computed Gateway recommendation: `allow/warn` relay downstream; `manual_review/hold` produce a temporary SMTP failure; `quarantine/block` produce a permanent policy rejection. Required evidence failure or API unavailability does not silently bypass inspection. This keeps model/rule scoring, deterministic floors, policy thresholds, case persistence and report provenance centralized in the existing Gateway.

Vercel continues to host the HTTP/API surface. The SMTP listener must run as a separate long-lived process on Windows/Linux or behind a mature MTA content-filter hook.
