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
