# VeriTrust Deployment Readiness

VeriTrust is a working email threat and forensic-intelligence prototype with production-oriented controls. “Deployable” here means the repository passes its local verification and is structurally ready for the existing compatible external services; it does not mean a fresh environment can recreate an undocumented database automatically.

## Release gates

- `npm run check` passes.
- JavaScript syntax and local module references pass.
- Public/private page metadata and local links pass.
- CSP and security-header assumptions pass.
- No committed private credentials are detected.
- MailGraph evidence modes preserve their capability boundaries.
- SPF remains unavailable without trusted receiver facts.
- Infrastructure location wording never claims person location.
- Evidence completeness remains separate from risk.
- External Supabase/model/storage/worker/geolocation services are smoke-tested in the target deployment environment.

## External dependency boundary

The deployed Supabase schema and credentials are an external source of truth. Authoritative migrations are not included in this snapshot. Do not certify a new environment as working until its schema and external integrations have been verified against the live runtime.

## Benchmark boundary

No controlled VeriTrust product benchmark is published. Do not describe runtime risk percentages as measured accuracy.
