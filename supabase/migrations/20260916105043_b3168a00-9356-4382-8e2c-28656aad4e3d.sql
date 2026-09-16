COMMENT ON COLUMN public.wakala_status_history.is_served IS 'Served status reported for the historical week; null when the uploaded report omitted servicing status.';
NOTIFY pgrst, 'reload schema';