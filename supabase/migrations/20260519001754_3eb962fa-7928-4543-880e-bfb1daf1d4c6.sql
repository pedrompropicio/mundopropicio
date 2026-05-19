-- =============================================================
-- MP Operação Batch 1 v2 — Parte 2/2
-- =============================================================

-- 1) BUCKET ----------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('operacao-media', 'operacao-media', false)
ON CONFLICT (id) DO NOTHING;

-- 2) TABELAS ---------------------------------------------------

-- a) operacao_frentes
CREATE TABLE IF NOT EXISTS public.operacao_frentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  color text DEFAULT '#3b82f6',
  display_order int NOT NULL DEFAULT 0,
  current_lead_id uuid REFERENCES public.profiles(id),
  lead_handover_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_frentes_event ON public.operacao_frentes(event_id);
CREATE INDEX IF NOT EXISTS idx_op_frentes_company ON public.operacao_frentes(company_id);
CREATE INDEX IF NOT EXISTS idx_op_frentes_lead ON public.operacao_frentes(current_lead_id);

-- b) operacao_frente_team
CREATE TABLE IF NOT EXISTS public.operacao_frente_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  frente_id uuid NOT NULL REFERENCES public.operacao_frentes(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role_in_frente text NOT NULL CHECK (role_in_frente IN ('lead','auxiliary','observer')),
  is_permanent_lead boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_profile_id uuid REFERENCES public.profiles(id),
  UNIQUE (frente_id, profile_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_op_team_permanent_lead
  ON public.operacao_frente_team(frente_id)
  WHERE role_in_frente = 'lead' AND is_permanent_lead = true;
CREATE INDEX IF NOT EXISTS idx_op_team_frente ON public.operacao_frente_team(frente_id);
CREATE INDEX IF NOT EXISTS idx_op_team_profile ON public.operacao_frente_team(profile_id);

-- c) operacao_etapas
CREATE TABLE IF NOT EXISTS public.operacao_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  frente_id uuid NOT NULL REFERENCES public.operacao_frentes(id) ON DELETE CASCADE,
  name text NOT NULL,
  escopo text,
  supplier_id uuid REFERENCES public.suppliers(id),
  forecast_id uuid REFERENCES public.event_forecasts(id),
  category_id uuid REFERENCES public.account_categories(id),
  responsible_profile_id uuid REFERENCES public.profiles(id),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  has_no_date boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','done','cancelled')),
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_etapas_frente ON public.operacao_etapas(frente_id);
CREATE INDEX IF NOT EXISTS idx_op_etapas_status ON public.operacao_etapas(status);
CREATE INDEX IF NOT EXISTS idx_op_etapas_resp ON public.operacao_etapas(responsible_profile_id);

-- d) operacao_registros
CREATE TABLE IF NOT EXISTS public.operacao_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  frente_id uuid NOT NULL REFERENCES public.operacao_frentes(id) ON DELETE CASCADE,
  etapa_id uuid REFERENCES public.operacao_etapas(id) ON DELETE SET NULL,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('evolucao','observacao','punch','chamado')),
  text text,
  audio_url text,
  transcribed_text text,
  priority text CHECK (priority IN ('crit','high','med','low')),
  status text CHECK (status IN ('open','in_progress','resolved','closed')),
  acked_at timestamptz,
  acked_by_profile_id uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  resolved_by_profile_id uuid REFERENCES public.profiles(id),
  sla_due_at timestamptz,
  sla_half_at timestamptz,
  escalation_level int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chamado_requires_priority_status CHECK (
    kind <> 'chamado' OR (priority IS NOT NULL AND status IS NOT NULL)
  ),
  CONSTRAINT status_only_for_chamado CHECK (
    status IS NULL OR kind = 'chamado'
  )
);
CREATE INDEX IF NOT EXISTS idx_op_reg_frente ON public.operacao_registros(frente_id);
CREATE INDEX IF NOT EXISTS idx_op_reg_etapa ON public.operacao_registros(etapa_id);
CREATE INDEX IF NOT EXISTS idx_op_reg_kind_status ON public.operacao_registros(kind, status);
CREATE INDEX IF NOT EXISTS idx_op_reg_chamado_sla
  ON public.operacao_registros(kind, status, sla_due_at)
  WHERE kind = 'chamado' AND status IN ('open','in_progress');
CREATE INDEX IF NOT EXISTS idx_op_reg_created ON public.operacao_registros(created_at DESC);

-- e) operacao_registro_media
CREATE TABLE IF NOT EXISTS public.operacao_registro_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  registro_id uuid NOT NULL REFERENCES public.operacao_registros(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  thumbnail_url text,
  file_type text NOT NULL CHECK (file_type IN ('photo','video')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_media_registro ON public.operacao_registro_media(registro_id);

-- f) operacao_mentions
CREATE TABLE IF NOT EXISTS public.operacao_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  registro_id uuid NOT NULL REFERENCES public.operacao_registros(id) ON DELETE CASCADE,
  mentioned_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  notified_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_mentions_profile ON public.operacao_mentions(mentioned_profile_id);
CREATE INDEX IF NOT EXISTS idx_op_mentions_registro ON public.operacao_mentions(registro_id);

-- g) operacao_chamado_sla
CREATE TABLE IF NOT EXISTS public.operacao_chamado_sla (
  priority text PRIMARY KEY CHECK (priority IN ('crit','high','med','low')),
  sla_minutes int NOT NULL
);
INSERT INTO public.operacao_chamado_sla(priority, sla_minutes) VALUES
  ('crit', 15), ('high', 60), ('med', 240), ('low', 1440)
ON CONFLICT (priority) DO NOTHING;

-- h) operacao_daily_reports
CREATE TABLE IF NOT EXISTS public.operacao_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('montagem','evento','post')),
  pdf_url text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by_profile_id uuid REFERENCES public.profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, report_date, mode)
);
CREATE INDEX IF NOT EXISTS idx_op_daily_event_date ON public.operacao_daily_reports(event_id, report_date DESC);

-- 3) updated_at triggers --------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operacao_frentes','operacao_etapas','operacao_registros'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- 4) PERMISSÕES (role_permissions) ----------------------------
INSERT INTO public.role_permissions(role, permission) VALUES
  ('admin','view_operacao'), ('manager','view_operacao'), ('editor','view_operacao'), ('field_producer','view_operacao'),
  ('admin','manage_operacao_frentes'), ('manager','manage_operacao_frentes'),
  ('admin','manage_operacao_etapas'), ('manager','manage_operacao_etapas'),
  ('admin','register_operacao'), ('manager','register_operacao'), ('editor','register_operacao'), ('field_producer','register_operacao'),
  ('admin','open_chamado'), ('manager','open_chamado'), ('editor','open_chamado'), ('field_producer','open_chamado'), ('viewer','open_chamado'),
  ('admin','manage_chamados'), ('manager','manage_chamados'), ('editor','manage_chamados'), ('field_producer','manage_chamados')
ON CONFLICT (role, permission) DO NOTHING;

-- 5) RLS + POLICIES -------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operacao_frentes','operacao_frente_team','operacao_etapas',
    'operacao_registros','operacao_registro_media','operacao_mentions',
    'operacao_chamado_sla','operacao_daily_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- SELECT (PERMISSIVE) on all 8
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operacao_frentes','operacao_frente_team','operacao_etapas',
    'operacao_registros','operacao_registro_media','operacao_mentions',
    'operacao_chamado_sla','operacao_daily_reports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "op_select" ON public.%I', t);
    IF t = 'operacao_chamado_sla' THEN
      -- config table: visible to anyone with view_operacao (no company_id)
      EXECUTE format($f$CREATE POLICY "op_select" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin() OR public.has_permission(auth.uid(),'view_operacao'))$f$, t);
    ELSE
      EXECUTE format($f$CREATE POLICY "op_select" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin() OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(),'view_operacao')))$f$, t);
    END IF;
  END LOOP;
END $$;

-- RESTRICTIVE company isolation on the 7 tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operacao_frentes','operacao_frente_team','operacao_etapas',
    'operacao_registros','operacao_registro_media','operacao_mentions',
    'operacao_daily_reports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation_%I" ON public.%I', t, t);
    EXECUTE format($f$CREATE POLICY "company_isolation_%I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.current_company_id() OR public.is_platform_admin()) WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin())$f$, t, t);
  END LOOP;
END $$;

-- frentes: INSERT/UPDATE manage_operacao_frentes; DELETE admin/manager
DROP POLICY IF EXISTS "op_frentes_ins" ON public.operacao_frentes;
CREATE POLICY "op_frentes_ins" ON public.operacao_frentes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_frentes_upd" ON public.operacao_frentes;
CREATE POLICY "op_frentes_upd" ON public.operacao_frentes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_frentes'))
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_frentes_del" ON public.operacao_frentes;
CREATE POLICY "op_frentes_del" ON public.operacao_frentes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

-- frente_team: INSERT/UPDATE manage_operacao_frentes; DELETE admin/manager
DROP POLICY IF EXISTS "op_team_ins" ON public.operacao_frente_team;
CREATE POLICY "op_team_ins" ON public.operacao_frente_team FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_team_upd" ON public.operacao_frente_team;
CREATE POLICY "op_team_upd" ON public.operacao_frente_team FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_frentes'))
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_team_del" ON public.operacao_frente_team;
CREATE POLICY "op_team_del" ON public.operacao_frente_team FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

-- etapas: manage_operacao_etapas OR is current_lead of the frente
DROP POLICY IF EXISTS "op_etapas_ins" ON public.operacao_etapas;
CREATE POLICY "op_etapas_ins" ON public.operacao_etapas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(),'manage_operacao_etapas')
    OR EXISTS (SELECT 1 FROM public.operacao_frentes f WHERE f.id = frente_id AND f.current_lead_id = auth.uid())
  );
DROP POLICY IF EXISTS "op_etapas_upd" ON public.operacao_etapas;
CREATE POLICY "op_etapas_upd" ON public.operacao_etapas FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(),'manage_operacao_etapas')
    OR EXISTS (SELECT 1 FROM public.operacao_frentes f WHERE f.id = frente_id AND f.current_lead_id = auth.uid())
  )
  WITH CHECK (
    public.has_permission(auth.uid(),'manage_operacao_etapas')
    OR EXISTS (SELECT 1 FROM public.operacao_frentes f WHERE f.id = frente_id AND f.current_lead_id = auth.uid())
  );
DROP POLICY IF EXISTS "op_etapas_del" ON public.operacao_etapas;
CREATE POLICY "op_etapas_del" ON public.operacao_etapas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

-- registros: INSERT split (chamado=open_chamado; outros=register_operacao); UPDATE manage_chamados; DELETE admin/manager
DROP POLICY IF EXISTS "op_reg_ins_chamado" ON public.operacao_registros;
CREATE POLICY "op_reg_ins_chamado" ON public.operacao_registros FOR INSERT TO authenticated
  WITH CHECK (kind = 'chamado' AND public.has_permission(auth.uid(),'open_chamado'));
DROP POLICY IF EXISTS "op_reg_ins_other" ON public.operacao_registros;
CREATE POLICY "op_reg_ins_other" ON public.operacao_registros FOR INSERT TO authenticated
  WITH CHECK (kind <> 'chamado' AND public.has_permission(auth.uid(),'register_operacao'));
DROP POLICY IF EXISTS "op_reg_upd" ON public.operacao_registros;
CREATE POLICY "op_reg_upd" ON public.operacao_registros FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_chamados') OR public.has_permission(auth.uid(),'register_operacao'))
  WITH CHECK (public.has_permission(auth.uid(),'manage_chamados') OR public.has_permission(auth.uid(),'register_operacao'));
DROP POLICY IF EXISTS "op_reg_del" ON public.operacao_registros;
CREATE POLICY "op_reg_del" ON public.operacao_registros FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

-- media + mentions: INSERT register_operacao OR open_chamado; DELETE admin/manager
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operacao_registro_media','operacao_mentions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "op_child_ins" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "op_child_ins" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'register_operacao') OR public.has_permission(auth.uid(),'open_chamado'))$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "op_child_upd" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "op_child_upd" ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'register_operacao') OR public.has_permission(auth.uid(),'manage_chamados')) WITH CHECK (public.has_permission(auth.uid(),'register_operacao') OR public.has_permission(auth.uid(),'manage_chamados'))$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "op_child_del" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "op_child_del" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))$f$, t);
  END LOOP;
END $$;

-- daily_reports: INSERT/UPDATE manage_operacao_frentes; DELETE admin/manager
DROP POLICY IF EXISTS "op_daily_ins" ON public.operacao_daily_reports;
CREATE POLICY "op_daily_ins" ON public.operacao_daily_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_daily_upd" ON public.operacao_daily_reports;
CREATE POLICY "op_daily_upd" ON public.operacao_daily_reports FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'manage_operacao_frentes'))
  WITH CHECK (public.has_permission(auth.uid(),'manage_operacao_frentes'));
DROP POLICY IF EXISTS "op_daily_del" ON public.operacao_daily_reports;
CREATE POLICY "op_daily_del" ON public.operacao_daily_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

-- 6) STORAGE POLICIES (bucket operacao-media) -----------------
DROP POLICY IF EXISTS "operacao_media_select" ON storage.objects;
CREATE POLICY "operacao_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'operacao-media' AND public.has_permission(auth.uid(),'view_operacao'));
DROP POLICY IF EXISTS "operacao_media_insert" ON storage.objects;
CREATE POLICY "operacao_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'operacao-media' AND public.has_permission(auth.uid(),'register_operacao'));
DROP POLICY IF EXISTS "operacao_media_update" ON storage.objects;
CREATE POLICY "operacao_media_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'operacao-media' AND public.has_permission(auth.uid(),'register_operacao'));
DROP POLICY IF EXISTS "operacao_media_delete" ON storage.objects;
CREATE POLICY "operacao_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'operacao-media' AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)));

-- 7) TRIGGERS DE NEGÓCIO --------------------------------------

-- a) SLA calc no INSERT de chamado
CREATE OR REPLACE FUNCTION public.trg_operacao_set_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_mins int;
BEGIN
  IF NEW.kind = 'chamado' AND NEW.priority IS NOT NULL THEN
    SELECT sla_minutes INTO v_mins FROM public.operacao_chamado_sla WHERE priority = NEW.priority;
    IF v_mins IS NOT NULL THEN
      NEW.sla_due_at := COALESCE(NEW.created_at, now()) + (v_mins * interval '1 minute');
      NEW.sla_half_at := COALESCE(NEW.created_at, now()) + ((v_mins/2.0) * interval '1 minute');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_operacao_set_sla ON public.operacao_registros;
CREATE TRIGGER trg_operacao_set_sla BEFORE INSERT ON public.operacao_registros
  FOR EACH ROW EXECUTE FUNCTION public.trg_operacao_set_sla();

-- b) Lead sync (permanent_lead -> current_lead_id)
CREATE OR REPLACE FUNCTION public.trg_operacao_frente_lead_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_permanent_lead = true AND NEW.role_in_frente = 'lead' THEN
    UPDATE public.operacao_frentes
       SET current_lead_id = NEW.profile_id
     WHERE id = NEW.frente_id AND lead_handover_until IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_op_team_lead_sync ON public.operacao_frente_team;
CREATE TRIGGER trg_op_team_lead_sync AFTER INSERT OR UPDATE ON public.operacao_frente_team
  FOR EACH ROW EXECUTE FUNCTION public.trg_operacao_frente_lead_sync();

-- c) Auditoria (reaproveita log_table_change)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operacao_frentes','operacao_frente_team','operacao_etapas','operacao_registros'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_changes ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_table_change()', t, t);
  END LOOP;
END $$;

-- 8) Função helper de seed --------------------------------------
CREATE OR REPLACE FUNCTION public.seed_operacao_frentes_default(p_event_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE inserted int := 0;
BEGIN
  INSERT INTO public.operacao_frentes (event_id, name, display_order, color) VALUES
    (p_event_id, 'Coordenação Geral', 0, '#7c3aed'),
    (p_event_id, 'Palco Principal', 10, '#ef4444'),
    (p_event_id, 'Palco Secundário', 20, '#f97316'),
    (p_event_id, 'Som & Luz', 30, '#eab308'),
    (p_event_id, 'Energia & Geradores', 40, '#84cc16'),
    (p_event_id, 'Estrutura & Coberturas', 50, '#22c55e'),
    (p_event_id, 'Cenografia', 60, '#10b981'),
    (p_event_id, 'F&B', 70, '#14b8a6'),
    (p_event_id, 'Hospitalidade & Camarins', 80, '#06b6d4'),
    (p_event_id, 'Credenciamento & Acesso', 90, '#3b82f6'),
    (p_event_id, 'Segurança', 100, '#6366f1'),
    (p_event_id, 'Limpeza', 110, '#a855f7'),
    (p_event_id, 'Sinalização', 120, '#d946ef'),
    (p_event_id, 'Bilheteria Física', 130, '#ec4899'),
    (p_event_id, 'Acessibilidade', 140, '#f43f5e');
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_operacao_frentes_default(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_operacao_frentes_default(uuid) TO authenticated;

-- 9) CRON: handover restore (puro SQL, sem URLs — sem net.http_post)
DO $$ BEGIN PERFORM cron.unschedule('operacao-handover-restore'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'operacao-handover-restore',
  '*/1 * * * *',
  $cron$
  UPDATE public.operacao_frentes f
     SET current_lead_id = (
       SELECT t.profile_id FROM public.operacao_frente_team t
        WHERE t.frente_id = f.id AND t.role_in_frente='lead' AND t.is_permanent_lead=true
        LIMIT 1
     ),
     lead_handover_until = NULL
   WHERE f.lead_handover_until IS NOT NULL AND f.lead_handover_until <= now();
  $cron$
);