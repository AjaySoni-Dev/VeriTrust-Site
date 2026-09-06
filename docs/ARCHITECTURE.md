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
