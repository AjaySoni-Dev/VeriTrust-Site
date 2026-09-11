# VeriTrust Release Validation — 2026-09-11

This file records reproducible checks for the source archive delivered for the SIH26106 implementation.

## Automated repository validation

Run from the repository root with the project-supported Node 24 runtime:

```bash
npm ci
npm run check
npm run config:check
npm audit --omit=dev --audit-level=high
```

For this source archive, `npm run check` passes **40/40 tests** and verifies **24 HTML pages**, **132 JavaScript/TypeScript source files**, **6/12 Vercel functions**, module-disabled behavior, security headers, SEO/private-page indexing rules, local links, and committed-secret rules.

The release environment also:

- accepted `package-lock.json` with `npm install --package-lock-only --ignore-scripts --offline` without changing the lockfile;
- returned **0 vulnerabilities** from the locally available npm advisory cache using `npm audit --omit=dev --audit-level=high --offline`;
- parsed all modified CSS with PostCSS;
- syntax-checked the runtime JavaScript through the repository verifier;
- validated the new input, result, URL-intelligence, modal CSS, and investigation script assets over a local static HTTP server;
- retained the existing OpenAPI, database migration, SMTP enforcement, forensic integrity, campaign-correlation, and threat-intelligence regression coverage.

The source archive intentionally does not include `node_modules`. Install dependencies with Node 24 before deployment. An Internet-connected CI/deployment environment should repeat `npm audit` against the live registry before public release.

## Professional investigation UI regression coverage

The automated suite now also locks the following UI behavior:

1. **Focused email input page** — `/phishing` contains only the email submission workflow; the old pre-flight evidence matrix and embedded result report are removed.
2. **Dedicated result route** — completed investigations open `/phishing-result?scan_id=...`; the result page is private (`noindex, nofollow`) and loads the saved evidence report by scan ID.
3. **Modal processing workflow** — email and URL analysis use a native dialog with a dimmed backdrop, streamed backend stage updates, and a visually highlighted active stage instead of a right-side processing card.
4. **Compact controls** — analysis buttons and module-switch controls use smaller professional dimensions; contextual help controls are 14 px.
5. **No presentation-only labels** — the former `LIVE FORENSIC ENGINE`, `LIVE FORENSIC SCOPE`, and SIH badge copy are not present in the shipped investigation UI.
6. **Progressive evidence upgrade** — upgrading a text investigation to original EML evidence navigates back to `/phishing?mode=eml&parent_scan_id=...`, preserving investigation lineage without mixing input and result states.

## Forensic USP regression coverage

The test suite continues to verify:

1. **Trust-Boundary GeoTrace** — trusted receiver observations remain distinguishable from copied/unverified relay claims.
2. **Evidence Passport** — unchanged evidence verifies; tampered evidence and self-consistent packages signed by an unrecognized issuer are rejected.
3. **MailGraph Campaign Memory** — durable cross-scan entities correlate; ASN-only overlap cannot manufacture a campaign.
4. **Progressive Evidence Escalation** — Text → Original EML → Trusted Receiver remains represented in the report and acquisition workflow.

## Security dependency pins

`package.json` keeps security-sensitive transitive dependencies pinned using npm overrides:

- `undici` = `8.10.2`
- `nodemailer` = `9.1.1`
- `deepmerge-ts` = `8.0.1`

A regression test verifies these override and lockfile resolutions.

## Database

Apply `supabase/migrations/20260911_forensic_intelligence.sql` only after confirming the target Supabase project contains the existing `organizations`, `gateway_scans`, and `gateway_artifacts` tables used by this repository. The migration is idempotent, enables RLS on the new tables, and makes issued Evidence Passport rows immutable to updates.

## Deployment boundaries

- Use the Node version declared in `package.json` (`24.x`). The release validation container itself runs an older Node 22 build, so npm correctly emits engine warnings during package-lock-only validation; the source targets Node 24 for deployment.
- The bundled SMTP listener is a trusted/private receiver reference implementation and does **not** implement inbound STARTTLS. Keep it on a trusted private segment/VPN or place a reviewed TLS-capable MTA in front.
- RDAP and AbuseIPDB are external enrichments. Provider failure is represented as unavailable/limited evidence and must never be interpreted as benign.
- A dedicated Ed25519 signing key is recommended for production Evidence Passports; keep retired valid key IDs in the trusted-key allowlist during rotation.
