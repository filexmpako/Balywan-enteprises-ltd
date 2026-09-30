# Apply 3 pending migrations to the live database

Verified: all three files exist in `supabase/migrations/` and match the pasted SQL. None have been applied to the live database. No application code changes.

## Steps

1. **Apply migration 1** (`20260929072742_...sql`) — restrict `app_settings` reads: staff read all keys; owners read only `activityRules`, `weeklyWakalaStatsHistory`, `weeklyKpiHistory`.
2. **Apply migration 2** (`20260929075451_...sql`) — null out orphaned references, then add foreign keys:
   - `float_requests.loan_id` → `loan_records.id`
   - `daily_transaction_records.attributed_owner_id` → `owners.owner_id`
   - `classification_audit_records.owner_id` → `owners.owner_id`
   - Add index `idx_file_upload_archives_filename` on `file_upload_archives.file_name`.
3. **Apply migration 3** (`20260929080543_...sql`) — rename (not drop) unused tables to `deprecated_*` (`notifications`, `daily_kpi_snapshots`, `owner_reconciliation_records`, `float_return_entries`) and rename `owners.work_lat/work_lng/work_address` to `deprecated_*`. Data is preserved.
4. **Run the 5 verification queries** you listed and show the results:
   - `app_settings` policies
   - the 3 new foreign keys
   - the new index
   - `owners` columns matching `%work_%`
   - tables matching `deprecated_%`

## Notes

- Each file is submitted byte-for-byte as it exists in the repo — no edits, no new copies.
- The pasted version of migration 2 wrapped the FK additions in idempotent `DO` blocks; the actual file uses plain `ADD CONSTRAINT`. Since these constraints don't exist yet, both are equivalent — the file version is applied as-is.
- Migration 3's file renames the owners columns directly instead of the guarded loop; same result since the columns exist.
- Expected side effect: after migration 1, the generated database types will refresh; no code changes are needed because the app never reads the renamed tables/columns.
