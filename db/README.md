# VeriTrust database baseline

This directory is the clean-environment Supabase baseline reconstructed from the read-only schema/security snapshot generated on 3 August 2026.

## What is included

- 79 VeriTrust-owned `public` tables and 901 columns
- 30 enums, 519 constraints, and 73 non-constraint indexes
- 59 functions/RPCs in `public` and `veritrust_private`
- two security-invoker views and 44 triggers
- RLS state plus 66 application/Storage policies
- eight private Storage buckets and three PGMQ queues
- exact application grants, safe default privileges, and an RLS DDL guard
- deterministic local/staging seed data with no user or production rows

Supabase-owned `auth`, `storage`, `vault`, `net`, `cron`, and `pgmq` tables are prerequisites. The baseline enables required extensions but never recreates those managed tables.

## Safe application

Apply these migrations only to a new, disposable local or staging Supabase project first. The migrations use the standard `supabase/migrations` location, so the CLI can apply them in filename order. Then run the SQL contract tests in `db/tests`.

Do not paste this baseline over the current production database. Production already contains the source schema; doing that would create duplicate-object failures. Future production changes must be small forward-only migrations produced by diffing a validated staging database against this baseline.

## Environment-specific configuration

The audit export intentionally contains no Vault values and did not include the cron command body. After the baseline passes in staging, use `post-deploy/configure-gateway-runtime.sql.example` as a reviewed template. Replace both placeholders locally, never commit the populated file, and run it through the approved secret/deployment channel.

## Regeneration and verification

The generated files are pinned to the source snapshot SHA-256 in `supabase/schema-manifest.json`.

```powershell
node scripts/generate-supabase-baseline.js C:\path\to\schema-snapshot.json
npm run check:db
```

Regeneration rejects snapshots containing auth users, table rows, Vault values, or credential-shaped content.

## Task 4: atomic integrity forward migration

`supabase/migrations/20260803103000_atomic_scan_usage_billing.sql` is a forward migration layered on the snapshot baseline. It introduces serialized quota reservations, idempotent commit/refund, mandatory transactional scan completion, API-key metering reservations, a billing outbox, claim-token protected Stripe processing, and stale-reservation recovery.

For an existing database, run `db/preflight/004_atomic_integrity.sql` first. The forward migration deliberately marks its scan lifecycle constraint `NOT VALID`: existing inconsistent rows do not block deployment, while all new or changed rows are enforced. Any nonzero `completed_without_result` or terminal-timestamp count requires reconciliation from retained provider/audit evidence; the migration never fabricates a result.

Deployment order is database migration first, application second. Do not deploy the application before the atomic RPCs exist because compatibility table writes have been removed and the application now fails closed.

## Task 5: unified case workflow forward migration

`supabase/migrations/20260803104000_unified_case_workflow.sql` adds the customer-facing investigation model: one case per standard or gateway scan, normalized append-only evidence, machine and analyst decision history, workflow assignment/status/priority, and an audit event stream. Existing `scans`, `scan_results`, `gateway_scans`, `gateway_evidence`, and `gateway_decisions` remain authoritative source records and are backfilled into the new model without replacement or deletion.

Run `db/preflight/005_unified_case_workflow.sql` before applying the migration. All orphan counts should be zero. A nonzero `standard_scans_with_multiple_results` count is supported, but should be reviewed because each result becomes a separate evidence item and machine decision. Apply the Task 5 migration before deploying the application routes and `cases.html`/`case.html` UI. Run `db/tests/004_unified_case_workflow_contract.sql` in staging to verify automatic case creation, evidence normalization, analyst authorization, and state transitions.
