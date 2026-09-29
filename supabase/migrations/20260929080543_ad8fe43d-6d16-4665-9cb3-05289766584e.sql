-- F22/F23: deprecate unused tables and columns.
--
-- Re-verified via repo-wide grep that none of these are referenced by any
-- application code (only the auto-generated src/integrations/supabase/
-- types.ts mentions them, which reflects the schema, not usage).
--
-- Renamed rather than dropped: this session has no way to confirm these
-- are actually empty (only that no code queries them), and a DROP would
-- permanently destroy any data already sitting in them with no way back.
-- A rename is functionally identical from the app's point of view (nothing
-- references the old names either way) but preserves the data and stays
-- reversible with a single ALTER TABLE/COLUMN if it turns out one of these
-- was needed after all. Once confirmed genuinely empty and unwanted, these
-- can be dropped outright in a follow-up migration.

-- F22: tables never queried anywhere in src/
ALTER TABLE IF EXISTS public.notifications RENAME TO deprecated_notifications;
ALTER TABLE IF EXISTS public.daily_kpi_snapshots RENAME TO deprecated_daily_kpi_snapshots;
ALTER TABLE IF EXISTS public.owner_reconciliation_records RENAME TO deprecated_owner_reconciliation_records;
ALTER TABLE IF EXISTS public.float_return_entries RENAME TO deprecated_float_return_entries;

-- F23: owners columns never read or written anywhere in src/ — work-location
-- data is instead carried in the owners.extras jsonb column / localStorage.
ALTER TABLE public.owners RENAME COLUMN work_lat TO deprecated_work_lat;
ALTER TABLE public.owners RENAME COLUMN work_lng TO deprecated_work_lng;
ALTER TABLE public.owners RENAME COLUMN work_address TO deprecated_work_address;
