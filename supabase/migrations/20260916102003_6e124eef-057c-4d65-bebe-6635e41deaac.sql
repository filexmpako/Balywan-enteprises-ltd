-- Track per-wakala served/unserved status alongside the existing active/inactive
-- evaluation, so the weekly report's drill-down can show both.
ALTER TABLE public.wakala_status_history
  ADD COLUMN is_served boolean;
