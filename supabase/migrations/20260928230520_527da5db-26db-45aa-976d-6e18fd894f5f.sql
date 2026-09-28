ALTER TABLE public.wakala_status_history
  ADD COLUMN IF NOT EXISTS cp_servicing_val numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iop_value numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wakala_status_history.cp_servicing_val IS 'Cross-partner servicing value recorded for the reporting week and used as the penalty basis.';
COMMENT ON COLUMN public.wakala_status_history.iop_value IS 'IOP volume recorded for the reporting week.';

NOTIFY pgrst, 'reload schema';