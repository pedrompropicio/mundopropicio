-- PREPARADA, NÃO APLICADA — #646 D2-d / run A / autorização 6668858508.
-- Só estrutura aditiva. Sem backfill, sem consumidores, sem execução externa.
-- PostgreSQL >= 15: NULLS NOT DISTINCT torna horas nulas uma identidade exacta.
-- A promoção é separada; aplicar atomicamente pelo procedimento do 0.

CREATE SCHEMA issue646_private;
REVOKE ALL ON SCHEMA issue646_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.event_ticket_forecast_pct (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_date date,
  session_start_time time without time zone,
  session_sort_order integer,
  percentagem numeric(5,2) NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT ticket_forecast_pct_finite CHECK (
    percentagem BETWEEN 0 AND 100 AND percentagem <> 'NaN'::numeric),
  CONSTRAINT ticket_forecast_pct_shape CHECK (
    (session_date IS NULL AND session_start_time IS NULL AND session_sort_order IS NULL)
    OR (session_date IS NOT NULL AND session_sort_order IS NOT NULL))
);
CREATE UNIQUE INDEX ticket_forecast_pct_event_key ON public.event_ticket_forecast_pct(event_id)
  WHERE session_date IS NULL;
CREATE UNIQUE INDEX ticket_forecast_pct_session_key ON public.event_ticket_forecast_pct
  (event_id, session_date, session_start_time, session_sort_order) NULLS NOT DISTINCT
  WHERE session_date IS NOT NULL;

-- Sem FK: eliminar evento/configuração não elimina o histórico.
CREATE TABLE public.event_ticket_forecast_pct_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  forecast_pct_id uuid NOT NULL,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  old jsonb,
  new jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_forecast_pct_log_event_idx ON public.event_ticket_forecast_pct_log(event_id, seq);

CREATE TABLE public.event_ticket_forecast_rollouts (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  version text NOT NULL CHECK (length(version) > 0),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  target_sha256 text NOT NULL CHECK (target_sha256 ~ '^[0-9a-f]{64}$'),
  source_count integer NOT NULL CHECK (source_count >= 0),
  target_count integer NOT NULL CHECK (target_count >= 0),
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- NULL = IVA ainda não confirmado; zero só quando explicitamente confirmado.
ALTER TABLE public.event_coverage_scenarios ADD COLUMN receita_manual_iva_rate numeric(5,2);
ALTER TABLE public.event_coverage_scenarios ADD CONSTRAINT coverage_manual_iva_rate_check
  CHECK (receita_manual_iva_rate IS NULL OR
    (receita_manual_iva_rate BETWEEN 0 AND 100 AND receita_manual_iva_rate <> 'NaN'::numeric));

CREATE FUNCTION issue646_private.stamp_pct() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.event_id IS DISTINCT FROM OLD.event_id) THEN
    RAISE EXCEPTION 'ticket_forecast_identity_immutable' USING ERRCODE = '42501';
  END IF;
  SELECT e.company_id INTO NEW.company_id FROM public.events e WHERE e.id = NEW.event_id FOR KEY SHARE;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'ticket_forecast_event_not_found' USING ERRCODE = '23503';
  END IF;
  IF NEW.session_date IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.event_sessions s WHERE s.event_id = NEW.event_id
      AND s.company_id = NEW.company_id AND s.date = NEW.session_date
      AND s.start_time IS NOT DISTINCT FROM NEW.session_start_time AND s.sort_order = NEW.session_sort_order) THEN
      RAISE EXCEPTION 'ticket_forecast_session_not_found' USING ERRCODE = '23503';
    END IF;
    -- Uma mesma chave pode existir em versões diferentes; nunca duas vezes na mesma versão.
    IF EXISTS (SELECT 1 FROM public.event_sessions s WHERE s.event_id = NEW.event_id
      AND s.date = NEW.session_date AND s.start_time IS NOT DISTINCT FROM NEW.session_start_time
      AND s.sort_order = NEW.session_sort_order
      GROUP BY s.version_id HAVING count(*) <> 1 OR bool_or(s.company_id IS DISTINCT FROM NEW.company_id)) THEN
      RAISE EXCEPTION 'ticket_forecast_session_ambiguous' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.event_sessions s LEFT JOIN public.bp_versions v ON v.id = s.version_id
      WHERE s.event_id = NEW.event_id AND s.date = NEW.session_date
      AND s.start_time IS NOT DISTINCT FROM NEW.session_start_time AND s.sort_order = NEW.session_sort_order
      AND s.version_id IS NOT NULL AND v.event_id IS DISTINCT FROM NEW.event_id) THEN
      RAISE EXCEPTION 'ticket_forecast_session_version_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.created_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.created_at ELSE statement_timestamp() END;
  NEW.updated_at := statement_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $fn$;

CREATE FUNCTION issue646_private.log_pct() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  INSERT INTO public.event_ticket_forecast_pct_log(forecast_pct_id, company_id, event_id, op, old, new, changed_by)
  VALUES (coalesce(NEW.id, OLD.id), coalesce(NEW.company_id, OLD.company_id),
    coalesce(NEW.event_id, OLD.event_id), TG_OP,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END, auth.uid());
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION issue646_private.stamp_pct() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION issue646_private.log_pct() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ticket_forecast_pct_stamp BEFORE INSERT OR UPDATE ON public.event_ticket_forecast_pct
  FOR EACH ROW EXECUTE FUNCTION issue646_private.stamp_pct();
CREATE TRIGGER ticket_forecast_pct_log AFTER INSERT OR UPDATE OR DELETE ON public.event_ticket_forecast_pct
  FOR EACH ROW EXECUTE FUNCTION issue646_private.log_pct();

ALTER TABLE public.event_ticket_forecast_pct ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_forecast_pct_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_forecast_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_ticket_forecast_pct, public.event_ticket_forecast_pct_log,
  public.event_ticket_forecast_rollouts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_ticket_forecast_pct TO authenticated, service_role;
GRANT SELECT ON public.event_ticket_forecast_pct_log TO authenticated, service_role;
GRANT SELECT ON public.event_ticket_forecast_rollouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_ticket_forecast_rollouts TO service_role;
-- Não há TRUNCATE nem escrita directa no log, mesmo para service_role.

CREATE POLICY ticket_forecast_pct_company ON public.event_ticket_forecast_pct AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY ticket_forecast_pct_read ON public.event_ticket_forecast_pct FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'view_financial_position') OR public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
CREATE POLICY ticket_forecast_pct_write ON public.event_ticket_forecast_pct FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role));
CREATE POLICY ticket_forecast_log_company ON public.event_ticket_forecast_pct_log AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY ticket_forecast_log_read ON public.event_ticket_forecast_pct_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'view_financial_position') OR public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
CREATE POLICY ticket_forecast_rollout_company ON public.event_ticket_forecast_rollouts AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY ticket_forecast_rollout_read ON public.event_ticket_forecast_rollouts FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'view_financial_position') OR public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));

-- Run A: inputs da configuração, sem cálculo financeiro. A ausência de configuração é legítima.
-- Uma linha por evento pedido e sessões físicas apenas da versão pedida (NULL = activa).
CREATE FUNCTION public.get_event_ticket_forecast_inputs(p_company_id uuid, p_event_ids uuid[], p_version_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_company_id IS NULL OR p_company_id IS DISTINCT FROM public.current_company_id()
    OR public.row_belongs_to_current_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'company_forbidden' USING ERRCODE = '42501';
  END IF;
  IF (public.has_permission(v_uid, 'view_financial_position') OR public.is_platform_admin(v_uid)
    OR public.has_role(v_uid, 'admin'::public.app_role) OR public.has_role(v_uid, 'manager'::public.app_role)) IS NOT TRUE THEN
    RAISE EXCEPTION 'ticket_forecast_permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_event_ids IS NULL OR cardinality(p_event_ids) NOT BETWEEN 1 AND 100
    OR (SELECT count(DISTINCT x) FROM unnest(p_event_ids) x) <> cardinality(p_event_ids)
    OR EXISTS (SELECT 1 FROM unnest(p_event_ids) x LEFT JOIN public.events e ON e.id = x
      WHERE e.id IS NULL OR e.company_id IS DISTINCT FROM p_company_id) THEN
    RAISE EXCEPTION 'ticket_forecast_invalid_events' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_ticket_forecast_pct p WHERE p.event_id = ANY(p_event_ids)
      AND p.company_id IS DISTINCT FROM p_company_id)
    OR EXISTS (SELECT 1 FROM public.event_coverage_scenarios c WHERE c.event_id = ANY(p_event_ids)
      AND c.company_id IS DISTINCT FROM p_company_id) THEN
    RAISE EXCEPTION 'ticket_forecast_input_company_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_version_id IS NOT NULL AND (cardinality(p_event_ids) <> 1 OR NOT EXISTS
    (SELECT 1 FROM public.bp_versions v WHERE v.id = p_version_id AND v.event_id = p_event_ids[1])) THEN
    RAISE EXCEPTION 'ticket_forecast_invalid_version' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_sessions s WHERE s.event_id = ANY(p_event_ids)
    AND s.version_id IS NOT DISTINCT FROM p_version_id
    GROUP BY s.event_id, s.date, s.start_time, s.sort_order
    HAVING count(*) <> 1 OR bool_or(s.company_id IS DISTINCT FROM p_company_id)) THEN
    RAISE EXCEPTION 'ticket_forecast_session_ambiguous' USING ERRCODE = '23514';
  END IF;
  SELECT jsonb_build_object('version', 'ticket-forecast-inputs-v1', 'company_id', p_company_id,
    'events', jsonb_agg(jsonb_build_object(
      'event_id', e.id, 'percentagem', coalesce(d.percentagem, 100),
      'origem', CASE WHEN d.id IS NULL THEN 'padrao' ELSE 'evento' END,
      'receita_manual_iva_rate', c.receita_manual_iva_rate,
      'sessions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'session_id', s.id, 'session_date', s.date, 'session_start_time', s.start_time,
        'session_sort_order', s.sort_order, 'percentagem', coalesce(p.percentagem, d.percentagem, 100),
        'origem', CASE WHEN p.id IS NOT NULL THEN 'sessao' WHEN d.id IS NOT NULL THEN 'evento' ELSE 'padrao' END
      ) ORDER BY s.date, s.start_time NULLS FIRST, s.sort_order, s.id)
      FROM public.event_sessions s LEFT JOIN public.event_ticket_forecast_pct p ON p.event_id = s.event_id
        AND p.session_date = s.date AND p.session_start_time IS NOT DISTINCT FROM s.start_time
        AND p.session_sort_order = s.sort_order
      WHERE s.event_id = e.id AND s.version_id IS NOT DISTINCT FROM p_version_id), '[]'::jsonb)
    ) ORDER BY e.id)) INTO v_result
  FROM public.events e LEFT JOIN public.event_ticket_forecast_pct d ON d.event_id = e.id AND d.session_date IS NULL
  LEFT JOIN public.event_coverage_scenarios c ON c.event_id = e.id
  WHERE e.id = ANY(p_event_ids);
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.get_event_ticket_forecast_inputs(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_forecast_inputs(uuid, uuid[], uuid) TO authenticated, service_role;
