CREATE TABLE public.wakala_status_history (
  id bigserial PRIMARY KEY,
  msisdn text NOT NULL,
  owner_id text REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  owner_name text,
  reporting_week text NOT NULL,
  reporting_month text,
  cash_in_txns numeric NOT NULL DEFAULT 0,
  cash_out_txns numeric NOT NULL DEFAULT 0,
  total_txns numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  threshold_used numeric NOT NULL DEFAULT 25,
  rule_mode text NOT NULL DEFAULT 'combined',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (msisdn, reporting_week)
);
CREATE INDEX idx_wsh_week ON public.wakala_status_history (reporting_week);
CREATE INDEX idx_wsh_month ON public.wakala_status_history (reporting_month);
CREATE INDEX idx_wsh_owner ON public.wakala_status_history (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wakala_status_history TO authenticated;
GRANT ALL ON public.wakala_status_history TO service_role;
ALTER TABLE public.wakala_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage wakala status history" ON public.wakala_status_history
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read own wakala status history" ON public.wakala_status_history
  FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND public.owns_owner(owner_id));

CREATE TABLE public.wakala_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  owner_name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  wakala_msisdn text NOT NULL,
  wakala_name text,
  category text NOT NULL DEFAULT 'Other',
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  priority text NOT NULL DEFAULT 'Normal',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wakala_issues_status_chk CHECK (status IN ('Open', 'In Progress', 'Resolved')),
  CONSTRAINT wakala_issues_priority_chk CHECK (priority IN ('Low', 'Normal', 'High'))
);
CREATE INDEX idx_wakala_issues_owner ON public.wakala_issues (owner_id);
CREATE INDEX idx_wakala_issues_status ON public.wakala_issues (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wakala_issues TO authenticated;
GRANT ALL ON public.wakala_issues TO service_role;
ALTER TABLE public.wakala_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage wakala issues" ON public.wakala_issues
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read own wakala issues" ON public.wakala_issues
  FOR SELECT TO authenticated
  USING (public.owns_owner(owner_id));

CREATE POLICY "Owners create own wakala issues" ON public.wakala_issues
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_owner(owner_id));

CREATE TABLE public.wakala_issue_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.wakala_issues(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'owner',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wakala_issue_messages_issue ON public.wakala_issue_messages (issue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wakala_issue_messages TO authenticated;
GRANT ALL ON public.wakala_issue_messages TO service_role;
ALTER TABLE public.wakala_issue_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage issue messages" ON public.wakala_issue_messages
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Owners read own issue messages" ON public.wakala_issue_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wakala_issues i WHERE i.id = issue_id AND public.owns_owner(i.owner_id)));

CREATE POLICY "Owners post on own issues" ON public.wakala_issue_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.wakala_issues i WHERE i.id = issue_id AND public.owns_owner(i.owner_id)));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_wakala_issues_updated_at
  BEFORE UPDATE ON public.wakala_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();