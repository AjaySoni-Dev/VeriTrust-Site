# Remediation deployment and rollback

1. Freeze key creation, external API access, and billing (`VERITRUST_EXTERNAL_API_ENABLED=false`, `VERITRUST_BILLING_ENABLED=false`).
2. Take an encrypted Supabase backup and record row counts for organizations, memberships, scans, API keys, usage, and billing tables.
3. Apply migrations `202607100001` through `202607100003` to a clean project, then to an isolated copy of the prior schema. Run `npm run check` against both.
4. Deploy server code with both feature flags disabled. Verify `/health/live`, authenticated `/health/ready`, CSP/HSTS, cookie flags, RLS/ACL queries, and Stripe test fixtures.
5. Rotate `VERITRUST_API_KEY_PEPPER` and session secrets. Existing keys remain revoked; owners create replacements only after notification.
6. Enable the external API only after key migration, concurrency, idempotency, and load tests pass. Enable billing only after Stripe replay/out-of-order tests and schema-contract checks pass.

Rollback is forward-fix for credential, session, quota, and billing state. Never reactivate pre-remediation keys. Application rollback requires feature flags off first; migration rollback requires the pre-deploy backup and an incident record.

