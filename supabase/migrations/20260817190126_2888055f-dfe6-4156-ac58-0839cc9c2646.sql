-- ============================================================
-- Hasidadi Enterprises — core schema (DatabaseArchitecture.md)
-- ============================================================

-- ---------- roles & identity ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'float_manager', 'owner');

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'float_manager')
  )
$$;

-- ---------- owners ----------
CREATE TABLE public.owners (
  owner_id TEXT PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  master_agent_id TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  title TEXT,
  member_since TEXT,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Pending','Suspended')),
  name_aliases TEXT[] NOT NULL DEFAULT '{}',
  work_lat DOUBLE PRECISION,
  work_lng DOUBLE PRECISION,
  work_address TEXT,
  avatar_photo_id TEXT,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_owners_user_id ON public.owners(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owners TO authenticated;
GRANT ALL ON public.owners TO service_role;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_owner(_owner_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owners o
    WHERE o.owner_id = _owner_id AND o.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.owner_id FROM public.owners o WHERE o.user_id = auth.uid() LIMIT 1
$$;

CREATE POLICY "profiles readable by self and staff" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles self insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "roles readable by self and staff" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "owners staff full" ON public.owners
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "owners self read" ON public.owners
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owners self update" ON public.owners
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------- wakalas ----------
CREATE TABLE public.wakalas (
  wakala_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'base' CHECK (kind IN ('base','iop')),
  name TEXT NOT NULL,
  msisdn TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  code TEXT,
  site_id TEXT,
  site_ward TEXT,
  district TEXT,
  alternate_number TEXT,
  owner_match_status TEXT,
  source TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_address TEXT,
  location_accuracy DOUBLE PRECISION,
  location_captured_at TEXT,
  photo_id TEXT,
  date_added TEXT,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wakalas_owner_id ON public.wakalas(owner_id);
CREATE INDEX idx_wakalas_msisdn ON public.wakalas(msisdn);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wakalas TO authenticated;
GRANT ALL ON public.wakalas TO service_role;
ALTER TABLE public.wakalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wakalas staff full" ON public.wakalas
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "wakalas owner read" ON public.wakalas
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));
CREATE POLICY "wakalas owner write" ON public.wakalas
  FOR INSERT TO authenticated WITH CHECK (public.owns_owner(owner_id));
CREATE POLICY "wakalas owner update" ON public.wakalas
  FOR UPDATE TO authenticated USING (public.owns_owner(owner_id)) WITH CHECK (public.owns_owner(owner_id));

-- ---------- SA till registry ----------
CREATE TABLE public.sa_tills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  till_msisdn TEXT NOT NULL UNIQUE,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  owner_name TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_tills_owner ON public.sa_tills(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sa_tills TO authenticated;
GRANT ALL ON public.sa_tills TO service_role;
ALTER TABLE public.sa_tills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_tills staff full" ON public.sa_tills
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "sa_tills owner read" ON public.sa_tills
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

-- ---------- base wakala index ----------
CREATE TABLE public.base_wakala_index (
  msisdn TEXT PRIMARY KEY,
  code TEXT,
  wakala_code TEXT,
  full_name TEXT,
  wakala_name TEXT,
  site_id TEXT,
  site_ward TEXT,
  district TEXT,
  alt_msisdn TEXT,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  owner_name TEXT,
  creation_date TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_base_wakala_owner ON public.base_wakala_index(owner_id);
CREATE INDEX idx_base_wakala_alt ON public.base_wakala_index(alt_msisdn);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.base_wakala_index TO authenticated;
GRANT ALL ON public.base_wakala_index TO service_role;
ALTER TABLE public.base_wakala_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "base_index staff full" ON public.base_wakala_index
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "base_index owner read" ON public.base_wakala_index
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

-- ---------- personnel ----------
CREATE TABLE public.personnel (
  personnel_id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Pending','Suspended')),
  member_since TEXT,
  avatar TEXT,
  assigned_till TEXT,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_personnel_owner ON public.personnel(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personnel staff full" ON public.personnel
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "personnel owner read" ON public.personnel
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id) OR user_id = auth.uid());

-- ---------- targets ----------
CREATE TABLE public.monthly_kpi_targets (
  target_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  reporting_month VARCHAR(7) NOT NULL CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$'),
  volume_target NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (volume_target >= 0),
  active_stations INTEGER NOT NULL DEFAULT 0 CHECK (active_stations >= 0),
  comm_yield NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (comm_yield >= 0),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, reporting_month)
);
CREATE INDEX idx_monthly_targets_period ON public.monthly_kpi_targets(reporting_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_kpi_targets TO authenticated;
GRANT ALL ON public.monthly_kpi_targets TO service_role;
ALTER TABLE public.monthly_kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "targets staff full" ON public.monthly_kpi_targets
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "targets owner read" ON public.monthly_kpi_targets
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

CREATE TABLE public.manual_owner_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  kpi1_base_target NUMERIC(15,2),
  kpi1_iop_target NUMERIC(15,2),
  kpi2_normal_percent NUMERIC(5,2),
  kpi2_priority_percent NUMERIC(5,2),
  set_by TEXT NOT NULL DEFAULT '',
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_owner_targets TO authenticated;
GRANT ALL ON public.manual_owner_targets TO service_role;
ALTER TABLE public.manual_owner_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manual targets staff full" ON public.manual_owner_targets
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "manual targets owner read" ON public.manual_owner_targets
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

CREATE TABLE public.agent_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  location TEXT,
  period VARCHAR(7) NOT NULL,
  monthly_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  achieved_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  achievement_percentage NUMERIC(8,4) NOT NULL DEFAULT 0,
  raw_msisdn TEXT,
  matched_till_msisdn TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_targets_period ON public.agent_targets(period);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_targets TO authenticated;
GRANT ALL ON public.agent_targets TO service_role;
ALTER TABLE public.agent_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent targets staff full" ON public.agent_targets
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "agent targets owner read" ON public.agent_targets
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));

CREATE TABLE public.priority_wakalas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msisdn TEXT NOT NULL,
  period VARCHAR(7) NOT NULL,
  owner_id TEXT REFERENCES public.owners(owner_id) ON DELETE SET NULL,
  owner_name TEXT,
  wakala_code TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (msisdn, period)
);
CREATE INDEX idx_priority_period ON public.priority_wakalas(period);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.priority_wakalas TO authenticated;
GRANT ALL ON public.priority_wakalas TO service_role;
ALTER TABLE public.priority_wakalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "priority staff full" ON public.priority_wakalas
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "priority owner read" ON public.priority_wakalas
  FOR SELECT TO authenticated USING (public.owns_owner(owner_id));