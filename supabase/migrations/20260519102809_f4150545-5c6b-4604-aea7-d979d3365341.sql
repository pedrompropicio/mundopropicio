
-- 2C.1 Foundation: Zonas/Serviços + Hierarquia 3-níveis

-- A) operacao_frentes.type
ALTER TABLE public.operacao_frentes
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'zone'
  CHECK (type IN ('zone','service'));

-- B) operacao_etapas.zone_id
ALTER TABLE public.operacao_etapas
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.operacao_frentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_operacao_etapas_zone_id ON public.operacao_etapas(zone_id);

-- C) event_team_members
CREATE TABLE IF NOT EXISTS public.event_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('director','general_producer')),
  scope text NOT NULL DEFAULT 'full' CHECK (scope IN ('full','zones')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (event_id, profile_id, role)
);
ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_event_team_members_event ON public.event_team_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_members_profile ON public.event_team_members(profile_id);

-- D) event_team_member_zones
CREATE TABLE IF NOT EXISTS public.event_team_member_zones (
  member_id uuid NOT NULL REFERENCES public.event_team_members(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.operacao_frentes(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, zone_id)
);
ALTER TABLE public.event_team_member_zones ENABLE ROW LEVEL SECURITY;

-- Trigger: zone_id deve apontar para frente type='zone' E mesma event_id do member
CREATE OR REPLACE FUNCTION public.validate_event_team_member_zone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member_event uuid;
  v_zone_event uuid;
  v_zone_type text;
BEGIN
  SELECT event_id INTO v_member_event FROM public.event_team_members WHERE id = NEW.member_id;
  SELECT event_id, type INTO v_zone_event, v_zone_type FROM public.operacao_frentes WHERE id = NEW.zone_id;
  IF v_zone_type IS DISTINCT FROM 'zone' THEN
    RAISE EXCEPTION 'zone_id % não é frente type=zone', NEW.zone_id;
  END IF;
  IF v_zone_event IS DISTINCT FROM v_member_event THEN
    RAISE EXCEPTION 'zone_id e member pertencem a eventos diferentes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_event_team_member_zone ON public.event_team_member_zones;
CREATE TRIGGER trg_validate_event_team_member_zone
  BEFORE INSERT OR UPDATE ON public.event_team_member_zones
  FOR EACH ROW EXECUTE FUNCTION public.validate_event_team_member_zone();

-- Auto-fill company_id em event_team_members (a partir do evento)
CREATE OR REPLACE FUNCTION public.autofill_event_team_members_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.events WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_autofill_event_team_members_company ON public.event_team_members;
CREATE TRIGGER trg_autofill_event_team_members_company
  BEFORE INSERT ON public.event_team_members
  FOR EACH ROW EXECUTE FUNCTION public.autofill_event_team_members_company();

-- ==========================
-- 2) Security definer fns
-- ==========================
CREATE OR REPLACE FUNCTION public.can_manage_operacao_etapa(_etapa_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR public.has_permission(_user_id, 'manage_operacao_etapas')
    OR EXISTS (
      SELECT 1 FROM public.operacao_etapas e
      JOIN public.operacao_frentes f ON f.id = e.frente_id
      WHERE e.id = _etapa_id AND f.current_lead_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.operacao_etapas e
      JOIN public.operacao_frentes z ON z.id = e.zone_id
      WHERE e.id = _etapa_id AND z.type = 'zone' AND z.current_lead_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.operacao_etapas e
      JOIN public.operacao_frentes f ON f.id = e.frente_id
      JOIN public.event_team_members m ON m.event_id = f.event_id
      WHERE e.id = _etapa_id
        AND m.profile_id = _user_id
        AND m.role = 'general_producer'
        AND (
          m.scope = 'full'
          OR EXISTS (
            SELECT 1 FROM public.event_team_member_zones mz
            WHERE mz.member_id = m.id
              AND mz.zone_id IN (e.zone_id, e.frente_id)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_event_operacao(_event_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR public.has_permission(_user_id, 'view_operacao')
    OR EXISTS (
      SELECT 1 FROM public.event_team_members
      WHERE event_id = _event_id AND profile_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event_operacao_full(_event_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.event_team_members
      WHERE event_id = _event_id AND profile_id = _user_id
        AND role = 'general_producer' AND scope = 'full'
    );
$$;

-- ==========================
-- 3) RLS — policies PERMISSIVE adicionais
-- ==========================

-- operacao_etapas
DROP POLICY IF EXISTS "Etapas — Zona/Geral pode escrever" ON public.operacao_etapas;
CREATE POLICY "Etapas — Zona/Geral pode escrever" ON public.operacao_etapas
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage_operacao_etapa(id, auth.uid()))
  WITH CHECK (public.can_manage_operacao_etapa(id, auth.uid()));

DROP POLICY IF EXISTS "Etapas — Diretor/Geral vê" ON public.operacao_etapas;
CREATE POLICY "Etapas — Diretor/Geral vê" ON public.operacao_etapas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.can_view_event_operacao(
    (SELECT event_id FROM public.operacao_frentes WHERE id = frente_id),
    auth.uid()
  ));

-- operacao_frentes
DROP POLICY IF EXISTS "Frentes — Diretor/Geral vê" ON public.operacao_frentes;
CREATE POLICY "Frentes — Diretor/Geral vê" ON public.operacao_frentes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.can_view_event_operacao(event_id, auth.uid()));

DROP POLICY IF EXISTS "Frentes — Geral edita" ON public.operacao_frentes;
CREATE POLICY "Frentes — Geral edita" ON public.operacao_frentes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.can_manage_event_operacao_full(event_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_team_members m
      JOIN public.event_team_member_zones mz ON mz.member_id = m.id
      WHERE m.event_id = operacao_frentes.event_id
        AND m.profile_id = auth.uid()
        AND m.role = 'general_producer'
        AND mz.zone_id = operacao_frentes.id
    )
  )
  WITH CHECK (
    public.can_manage_event_operacao_full(event_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_team_members m
      JOIN public.event_team_member_zones mz ON mz.member_id = m.id
      WHERE m.event_id = operacao_frentes.event_id
        AND m.profile_id = auth.uid()
        AND m.role = 'general_producer'
        AND mz.zone_id = operacao_frentes.id
    )
  );

-- operacao_registros
DROP POLICY IF EXISTS "Registros — Diretor/Geral vê" ON public.operacao_registros;
CREATE POLICY "Registros — Diretor/Geral vê" ON public.operacao_registros
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.can_view_event_operacao(
    (SELECT event_id FROM public.operacao_frentes WHERE id = frente_id),
    auth.uid()
  ));

DROP POLICY IF EXISTS "Registros — Zona/Geral pode escrever" ON public.operacao_registros;
CREATE POLICY "Registros — Zona/Geral pode escrever" ON public.operacao_registros
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'register_operacao')
    OR EXISTS (
      SELECT 1 FROM public.operacao_frentes f
      WHERE f.id = operacao_registros.frente_id
        AND (
          f.current_lead_id = auth.uid()
          OR public.can_manage_event_operacao_full(f.event_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.event_team_members m
            JOIN public.event_team_member_zones mz ON mz.member_id = m.id
            WHERE m.event_id = f.event_id
              AND m.profile_id = auth.uid()
              AND m.role = 'general_producer'
              AND mz.zone_id = f.id
          )
        )
    )
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'register_operacao')
    OR EXISTS (
      SELECT 1 FROM public.operacao_frentes f
      WHERE f.id = operacao_registros.frente_id
        AND (
          f.current_lead_id = auth.uid()
          OR public.can_manage_event_operacao_full(f.event_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.event_team_members m
            JOIN public.event_team_member_zones mz ON mz.member_id = m.id
            WHERE m.event_id = f.event_id
              AND m.profile_id = auth.uid()
              AND m.role = 'general_producer'
              AND mz.zone_id = f.id
          )
        )
    )
  );

-- event_team_members policies
DROP POLICY IF EXISTS "ETM — SELECT" ON public.event_team_members;
CREATE POLICY "ETM — SELECT" ON public.event_team_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
    OR public.can_manage_event_operacao_full(event_id, auth.uid())
  );

DROP POLICY IF EXISTS "ETM — Write" ON public.event_team_members;
CREATE POLICY "ETM — Write" ON public.event_team_members
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
    OR public.can_manage_event_operacao_full(event_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
    OR public.can_manage_event_operacao_full(event_id, auth.uid())
  );

-- RESTRICTIVE tenant isolation event_team_members
DROP POLICY IF EXISTS "ETM — tenant isolation" ON public.event_team_members;
CREATE POLICY "ETM — tenant isolation" ON public.event_team_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR company_id = public.current_company_id()
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR company_id = public.current_company_id()
  );

-- event_team_member_zones policies
DROP POLICY IF EXISTS "ETMZ — SELECT" ON public.event_team_member_zones;
CREATE POLICY "ETMZ — SELECT" ON public.event_team_member_zones
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_team_members m
      WHERE m.id = event_team_member_zones.member_id
        AND (
          m.profile_id = auth.uid()
          OR public.is_platform_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
          OR public.can_manage_event_operacao_full(m.event_id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "ETMZ — Write" ON public.event_team_member_zones;
CREATE POLICY "ETMZ — Write" ON public.event_team_member_zones
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_team_members m
      WHERE m.id = event_team_member_zones.member_id
        AND (
          public.is_platform_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
          OR public.can_manage_event_operacao_full(m.event_id, auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_team_members m
      WHERE m.id = event_team_member_zones.member_id
        AND (
          public.is_platform_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'manage_operacao_frentes')
          OR public.can_manage_event_operacao_full(m.event_id, auth.uid())
        )
    )
  );
