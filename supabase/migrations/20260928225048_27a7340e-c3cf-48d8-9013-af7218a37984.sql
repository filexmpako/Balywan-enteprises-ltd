ALTER TABLE public.wakala_status_history ADD COLUMN IF NOT EXISTS cp_servicing_val numeric NOT NULL DEFAULT 0;
ALTER TABLE public.wakala_status_history ADD COLUMN IF NOT EXISTS iop_value numeric NOT NULL DEFAULT 0;
