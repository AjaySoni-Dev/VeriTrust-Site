# Backup and restore runbook

- Target RPO: 15 minutes for identity, organization, billing, key-revocation, and audit metadata; 24 hours for regenerable scan reports.
- Target RTO: 4 hours for critical metadata and 8 hours for retained storage objects.
- Use encrypted Supabase PITR/backups appropriate to the production plan. Restrict restore/export access to named operators and record every restore.
- Quarterly, restore into an isolated project and verify counts, constraints, RLS/ACLs, revoked keys, billing reconciliation, quota reservations, lifecycle jobs, and storage-object references.
- Before migrations, capture the backup identifier, expected locks, abort threshold, and forward-fix owner. A failed drill or missed RPO/RTO blocks release.

