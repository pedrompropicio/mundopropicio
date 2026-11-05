-- 0339 — Issue #666 E2b: linhas de negócio por empresa e herança Master/sub-eventos.
-- R2 — PREPARADA, NÃO APLICADA. Autorização de preparação: 6643343481.
-- Aplicar 0339 antes do Publish do ERP, com autorização própria para a janela.
-- Sem DML de instalação: eventos existentes mantêm business_line_id NULL.
-- Rollback: supabase/manual/rollback_0339_issue666_business_lines_comentado.sql

-- §1 — Catálogo por empresa. Linhas em uso desactivam-se; a FK impede apagá-las.
CREATE TABLE public.business_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX business_lines_company_name_unique
  ON public.business_lines (company_id, lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_lines TO authenticated;
GRANT ALL ON public.business_lines TO service_role;
ALTER TABLE public.business_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_lines_select ON public.business_lines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY business_lines_write ON public.business_lines
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'platform_admin')
  );
CREATE POLICY company_isolation_business_lines ON public.business_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.business_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- §2 — Campo opcional; nenhum escritor existente precisa de fornecer uma linha.
ALTER TABLE public.events ADD COLUMN business_line_id uuid NULL
  REFERENCES public.business_lines(id) ON DELETE RESTRICT;
CREATE INDEX idx_events_business_line_id ON public.events (business_line_id);

-- §3 — Corre depois de trg_set_company_id. Invoker: preserva as políticas existentes.
CREATE FUNCTION public.inherit_event_business_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_parent_line uuid;
  v_parent_company uuid;
  v_propagating boolean;
BEGIN
  IF NEW.business_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_lines b
    WHERE b.id = NEW.business_line_id AND b.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'business_line_other_company';
  END IF;

  IF NEW.parent_event_id IS NOT NULL THEN
    -- Serializa a inserção do filho com a mudança da linha do Master.
    SELECT e.business_line_id, e.company_id INTO v_parent_line, v_parent_company
      FROM public.events e WHERE e.id = NEW.parent_event_id FOR SHARE;
    IF NOT FOUND OR v_parent_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'business_line_other_company';
    END IF;
    v_propagating := pg_trigger_depth() > 1
      AND current_setting('app.business_line_propagating', true) = NEW.parent_event_id::text;
    IF TG_OP = 'UPDATE'
       AND NEW.business_line_id IS DISTINCT FROM v_parent_line
       AND NOT coalesce(v_propagating, false) THEN
      RAISE EXCEPTION 'business_line_inherited_from_master';
    END IF;
    -- Mesmo na propagação nunca aceita uma linha diferente da linha canónica do pai.
    NEW.business_line_id := v_parent_line;
  END IF;

  IF NEW.business_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_lines b
    WHERE b.id = NEW.business_line_id AND b.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'business_line_other_company';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.inherit_event_business_line() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inherit_event_business_line() TO service_role;

CREATE TRIGGER trg_zz_business_line
  BEFORE INSERT OR UPDATE OF business_line_id, parent_event_id, company_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.inherit_event_business_line();

-- §4 — Cada filho actualizado propaga aos seus próprios filhos, incluindo NULL.
CREATE FUNCTION public.propagate_event_business_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_previous text := current_setting('app.business_line_propagating', true);
BEGIN
  PERFORM set_config('app.business_line_propagating', NEW.id::text, true);
  UPDATE public.events SET business_line_id = NEW.business_line_id
    WHERE parent_event_id = NEW.id
      AND business_line_id IS DISTINCT FROM NEW.business_line_id;
  PERFORM set_config('app.business_line_propagating', coalesce(v_previous, ''), true);
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.propagate_event_business_line() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagate_event_business_line() TO service_role;

CREATE TRIGGER trg_propagate_business_line
  AFTER UPDATE OF business_line_id ON public.events
  FOR EACH ROW WHEN (OLD.business_line_id IS DISTINCT FROM NEW.business_line_id)
  EXECUTE FUNCTION public.propagate_event_business_line();
