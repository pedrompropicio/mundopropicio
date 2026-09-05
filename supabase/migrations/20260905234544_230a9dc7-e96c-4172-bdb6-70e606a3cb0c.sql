-- 1. sponsorship_segments
CREATE TABLE public.sponsorship_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsorship_segments TO authenticated;
GRANT ALL ON public.sponsorship_segments TO service_role;

ALTER TABLE public.sponsorship_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsorship_segments_select" ON public.sponsorship_segments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sponsorship_segments_write" ON public.sponsorship_segments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  );
CREATE POLICY "company_isolation_sponsorship_segments" ON public.sponsorship_segments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- seed idempotente
CREATE OR REPLACE FUNCTION public.seed_sponsorship_segments(_company_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.sponsorship_segments (company_id, name, sort_order)
  SELECT _company_id, s.name, s.ord
  FROM (VALUES
    ('Bebidas', 10), ('Banca & Seguros', 20), ('Telecom', 30), ('Media', 40),
    ('Retalho & Consumo', 50), ('Institucional', 60), ('Outros', 70)
  ) AS s(name, ord)
  ON CONFLICT (company_id, name) DO NOTHING;
$$;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_sponsorship_segments(c.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tg_seed_sponsorship_segments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_sponsorship_segments(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_sponsorship_segments_after_company
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_sponsorship_segments();

-- 2. event_sponsorship_targets
CREATE TABLE public.event_sponsorship_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.sponsorship_segments(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  baseline_amount numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, segment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sponsorship_targets TO authenticated;
GRANT ALL ON public.event_sponsorship_targets TO service_role;

ALTER TABLE public.event_sponsorship_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "est_select" ON public.event_sponsorship_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "est_write" ON public.event_sponsorship_targets
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  );
CREATE POLICY "company_isolation_event_sponsorship_targets" ON public.event_sponsorship_targets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE OR REPLACE FUNCTION public.tg_est_baseline_and_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.baseline_amount IS NULL THEN NEW.baseline_amount := NEW.amount; END IF;
  ELSE
    NEW.baseline_amount := OLD.baseline_amount;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER est_baseline_and_touch
BEFORE INSERT OR UPDATE ON public.event_sponsorship_targets
FOR EACH ROW EXECUTE FUNCTION public.tg_est_baseline_and_touch();

-- 3. segmento no card do pipeline
ALTER TABLE public.sponsorship_pipeline
  ADD COLUMN segment_id uuid NULL REFERENCES public.sponsorship_segments(id) ON DELETE SET NULL;

-- 4. encerramento datado da captação
ALTER TABLE public.events
  ADD COLUMN sponsorship_closed_at timestamptz NULL;