-- ---------- upload registry ----------
CREATE TABLE public.file_upload_archives (
  upload_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('Monthly KPI','Daily MGT','Base Wakala Index','SA Till Registry','Priority Wakala','Other')),
  file_size BIGINT NOT NULL DEFAULT 0,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Importing','Success','Success (Partial)','Failed')),
  validation_status TEXT NOT NULL DEFAULT 'Pending',
  file_location TEXT,
  import_summary JSONB,
  processing_time_ms INTEGER,
  target_date DATE,
  reporting_period VARCHAR(7),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_upload_hash ON public.file_upload_archives(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX idx_file_upload_archives_history ON public.file_upload_archives(status, target_date);
CREATE INDEX idx_upload_type ON public.file_upload_archives(report_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_upload_archives TO authenticated;
GRANT ALL ON public.file_upload_archives TO service_role;
ALTER TABLE public.file_upload_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uploads staff full" ON public.file_upload_archives
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ---------- daily transactions ----------
CREATE TABLE public.daily_transaction_records (
  record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id TEXT REFERENCES public.file_upload_archives(upload_id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  wakala_id TEXT,
  transaction_ref TEXT NOT NULL,
  branch_msisdn TEXT NOT NULL,
  dest_msisdn TEXT,
  reporting_date DATE NOT NULL,
  reporting_period VARCHAR(7) NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  cash_in NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (cash_in >= 0),
  cash_out NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (cash_out >= 0),
  commission NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  bucket TEXT CHECK (bucket IN ('SA_INTERNAL','BASE','IOP')),
  matched_via TEXT,
  attributed_owner_id TEXT,
  attributed_owner_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_trans_dedupe UNIQUE (transaction_ref, branch_msisdn)
);
CREATE INDEX idx_daily_trans_upload_id ON public.daily_transaction_records(upload_id);
CREATE INDEX idx_daily_trans_owner_id ON public.daily_transaction_records(owner_id);
CREATE INDEX idx_daily_trans_date ON public.daily_transaction_records(reporting_date);
CREATE INDEX idx_daily_trans_period ON public.daily_transaction_records(reporting_period);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_transaction_records TO authenticated;
GRANT ALL ON public.daily_transaction_records TO service_role;
ALTER TABLE public.daily_transaction_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trans staff full" ON public.daily_transaction_records
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "trans owner read" ON public.daily_transaction_records
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

-- ---------- classification audit ----------
CREATE TABLE public.classification_audit_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id TEXT REFERENCES public.file_upload_archives(upload_id) ON DELETE CASCADE,
  reporting_period VARCHAR(7) NOT NULL,
  owner_id TEXT,
  owner_name TEXT,
  bucket TEXT NOT NULL CHECK (bucket IN ('SA_INTERNAL','BASE','IOP')),
  matched_via TEXT,
  transaction_ref TEXT,
  branch_msisdn TEXT,
  dest_msisdn TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  transaction_time TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_class_audit_period ON public.classification_audit_records(reporting_period);
CREATE INDEX idx_class_audit_owner ON public.classification_audit_records(owner_id);
GRANT SELECT, INSERT, DELETE ON public.classification_audit_records TO authenticated;
GRANT ALL ON public.classification_audit_records TO service_role;
ALTER TABLE public.classification_audit_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class audit staff full" ON public.classification_audit_records
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "class audit owner read" ON public.classification_audit_records
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

-- ---------- reconciliation ----------
CREATE TABLE public.owner_reconciliation_records (
  reco_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES public.file_upload_archives(upload_id) ON DELETE CASCADE,
  parsed_owner_code TEXT NOT NULL,
  parsed_owner_name TEXT NOT NULL,
  parsed_phone TEXT,
  classification TEXT NOT NULL DEFAULT 'New' CHECK (classification IN ('Existing','New','Updated','Duplicate','Unmatched')),
  detected_changes JSONB,
  resolution_action TEXT NOT NULL DEFAULT 'Keep Existing' CHECK (resolution_action IN ('Keep Existing','Create New','Update Details','Map Existing','Ignore')),
  mapped_owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (upload_id, parsed_owner_code)
);
CREATE INDEX idx_recon_stage_upload ON public.owner_reconciliation_records(upload_id);
CREATE INDEX idx_recon_stage_mapped ON public.owner_reconciliation_records(mapped_owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_reconciliation_records TO authenticated;
GRANT ALL ON public.owner_reconciliation_records TO service_role;
ALTER TABLE public.owner_reconciliation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recon staff full" ON public.owner_reconciliation_records
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ---------- performance summaries ----------
CREATE TABLE public.performance_summaries (
  summary_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  reporting_month VARCHAR(7) NOT NULL CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$'),
  mtd_volume NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_volume NUMERIC(15,2) NOT NULL DEFAULT 0,
  iop_volume NUMERIC(15,2) NOT NULL DEFAULT 0,
  attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  avg_active NUMERIC(9,2) NOT NULL DEFAULT 0,
  accum_comm NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_achievement NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  performance_status TEXT NOT NULL DEFAULT 'On Track' CHECK (performance_status IN ('Underperforming','On Track','Excellent','Critically Low')),
  rank_position INTEGER CHECK (rank_position > 0),
  kpi1_status TEXT,
  kpi2_status TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_perf_summary_period ON public.performance_summaries(COALESCE(owner_id, '__COMPANY__'), reporting_month);
CREATE INDEX idx_perf_summary_ranking ON public.performance_summaries(reporting_month, rank_position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_summaries TO authenticated;
GRANT ALL ON public.performance_summaries TO service_role;
ALTER TABLE public.performance_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf staff full" ON public.performance_summaries
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "perf owner read" ON public.performance_summaries
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

-- ---------- snapshots ----------
CREATE TABLE public.daily_kpi_snapshots (
  snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_date DATE UNIQUE NOT NULL,
  total_volume NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_volume >= 0),
  total_transactions INTEGER NOT NULL DEFAULT 0 CHECK (total_transactions >= 0),
  active_wakalas INTEGER NOT NULL DEFAULT 0 CHECK (active_wakalas >= 0),
  product_sellers INTEGER NOT NULL DEFAULT 0 CHECK (product_sellers >= 0),
  attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_kpi_snapshots TO authenticated;
GRANT ALL ON public.daily_kpi_snapshots TO service_role;
ALTER TABLE public.daily_kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily snap staff full" ON public.daily_kpi_snapshots
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.monthly_kpi_snapshots (
  snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_month VARCHAR(7) UNIQUE NOT NULL CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$'),
  total_volume NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_volume >= 0),
  total_transactions INTEGER NOT NULL DEFAULT 0 CHECK (total_transactions >= 0),
  avg_active_wakalas NUMERIC(9,2) NOT NULL DEFAULT 0,
  product_sellers INTEGER NOT NULL DEFAULT 0 CHECK (product_sellers >= 0),
  target_volume NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (target_volume >= 0),
  attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_kpi_snapshots TO authenticated;
GRANT ALL ON public.monthly_kpi_snapshots TO service_role;
ALTER TABLE public.monthly_kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly snap staff full" ON public.monthly_kpi_snapshots
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.owner_performance_snapshots (
  owner_snap_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  reporting_period VARCHAR(10) NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('Daily','Monthly')),
  volume_target NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (volume_target >= 0),
  volume_actual NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (volume_actual >= 0),
  attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  remaining_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_actual NUMERIC(15,2) NOT NULL DEFAULT 0,
  projected_attainment NUMERIC(9,2) NOT NULL DEFAULT 0,
  active_wakalas INTEGER NOT NULL DEFAULT 0 CHECK (active_wakalas >= 0),
  product_sellers INTEGER NOT NULL DEFAULT 0 CHECK (product_sellers >= 0),
  performance_status TEXT NOT NULL DEFAULT 'On Track' CHECK (performance_status IN ('Underperforming','On Track','Excellent','Critically Low')),
  rank_position INTEGER CHECK (rank_position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, reporting_period, period_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_performance_snapshots TO authenticated;
GRANT ALL ON public.owner_performance_snapshots TO service_role;
ALTER TABLE public.owner_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner snap staff full" ON public.owner_performance_snapshots
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "owner snap owner read" ON public.owner_performance_snapshots
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

CREATE TABLE public.company_performance_snapshots (
  company_snap_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_period VARCHAR(10) NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('Daily','Monthly')),
  total_volume NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  attainment_rate NUMERIC(9,2) NOT NULL DEFAULT 0,
  active_owners INTEGER NOT NULL DEFAULT 0,
  active_wakalas INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporting_period, period_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_performance_snapshots TO authenticated;
GRANT ALL ON public.company_performance_snapshots TO service_role;
ALTER TABLE public.company_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company snap staff full" ON public.company_performance_snapshots
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "company snap read" ON public.company_performance_snapshots
  FOR SELECT TO authenticated USING (true);

-- ---------- notifications ----------
CREATE TABLE public.notifications (
  notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(recipient_user_id) WHERE is_read = FALSE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications own read" ON public.notifications
  FOR SELECT TO authenticated USING (recipient_user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "notifications own update" ON public.notifications
  FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY "notifications staff write" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ---------- immutable audit log ----------
CREATE TABLE public.audit_logs (
  log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL,
  impacted_entity TEXT NOT NULL DEFAULT '',
  meta_details JSONB,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(logged_at);
CREATE INDEX idx_audit_logs_mutation ON public.audit_logs(impacted_entity, logged_at);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit insert authenticated" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit read staff" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());

-- ---------- float governance ----------
CREATE TABLE public.float_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  requested_amount NUMERIC(15,2) NOT NULL CHECK (requested_amount >= 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Confirmed','Returned','Completed','Rejected')),
  confirmed_by_manager_id TEXT,
  confirmed_by_manager_name TEXT,
  confirmed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejected_by_manager_id TEXT,
  rejected_by_manager_name TEXT,
  shortfall_reason TEXT,
  loan_id TEXT
);
CREATE INDEX idx_float_owner ON public.float_requests(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.float_requests TO authenticated;
GRANT ALL ON public.float_requests TO service_role;
ALTER TABLE public.float_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "float staff full" ON public.float_requests
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "float owner read" ON public.float_requests
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));
CREATE POLICY "float owner create" ON public.float_requests
  FOR INSERT TO authenticated WITH CHECK (public.owns_owner(owner_id) AND status = 'Pending');

CREATE TABLE public.float_return_entries (
  id TEXT PRIMARY KEY,
  float_request_id TEXT NOT NULL REFERENCES public.float_requests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('CRDB','YAS','NBC','Other')),
  channel_other TEXT,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  receipt_photo_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_float_return_request ON public.float_return_entries(float_request_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.float_return_entries TO authenticated;
GRANT ALL ON public.float_return_entries TO service_role;
ALTER TABLE public.float_return_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "float returns staff full" ON public.float_return_entries
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "float returns owner" ON public.float_return_entries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.float_requests f WHERE f.id = float_request_id AND public.owns_owner(f.owner_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.float_requests f WHERE f.id = float_request_id AND public.owns_owner(f.owner_id)));

CREATE TABLE public.loan_records (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  float_request_id TEXT REFERENCES public.float_requests(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding','Repayment Submitted','Paid')),
  repaid_amount NUMERIC(15,2),
  repayment_description TEXT,
  repayment_submitted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  approved_by_manager_id TEXT,
  approved_by_manager_name TEXT,
  marked_paid_by_manager_id TEXT,
  marked_paid_by_manager_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loans_owner ON public.loan_records(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_records TO authenticated;
GRANT ALL ON public.loan_records TO service_role;
ALTER TABLE public.loan_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans staff full" ON public.loan_records
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "loans owner read" ON public.loan_records
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));
CREATE POLICY "loans owner repay" ON public.loan_records
  FOR UPDATE TO authenticated USING (public.owns_owner(owner_id)) WITH CHECK (public.owns_owner(owner_id));

-- ---------- app settings ----------
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read authenticated" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings staff write" ON public.app_settings
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));