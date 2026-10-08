-- #283 parte 4
-- 1) lead_capture: company_id na origem (trigger BEFORE INSERT) + backfill
CREATE OR REPLACE FUNCTION public.lead_capture_set_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    IF NEW.event_slug IS NOT NULL THEN
      SELECT e.company_id INTO NEW.company_id FROM public.events e
       WHERE e.slug = NEW.event_slug AND e.company_id IS NOT NULL LIMIT 1;
    END IF;
    IF NEW.company_id IS NULL THEN
      -- Portal público mundopropicio.com: capturas sem evento (sticky_cta, newsletter) são da Mundo Propício.
      NEW.company_id := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lead_capture_set_company_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_capture_set_company_id ON public.lead_capture;
CREATE TRIGGER trg_lead_capture_set_company_id
BEFORE INSERT ON public.lead_capture
FOR EACH ROW EXECUTE FUNCTION public.lead_capture_set_company_id();

UPDATE public.lead_capture lc SET company_id = e.company_id
  FROM public.events e
 WHERE lc.company_id IS NULL AND e.slug = lc.event_slug AND e.company_id IS NOT NULL;
UPDATE public.lead_capture SET company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid
 WHERE company_id IS NULL;

-- 2) sync_runs: só as que resolvem por artist_id
UPDATE public.sync_runs s SET company_id = a.company_id
  FROM public.artists a
 WHERE s.company_id IS NULL AND a.id = s.artist_id AND a.company_id IS NOT NULL;

-- 3) recalculate_pax_benchmarks: NULL = empresa activa; explícito tem de ser a activa
CREATE OR REPLACE FUNCTION public.recalculate_pax_benchmarks(_company_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _rows integer := 0;
  _active uuid := public.current_company_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória';
  END IF;
  IF _active IS NULL THEN
    RAISE EXCEPTION 'Sem empresa activa';
  END IF;
  IF _company_id IS NULL THEN
    _company_id := _active;
  ELSIF _company_id <> _active THEN
    RAISE EXCEPTION 'A empresa indicada não é a empresa activa';
  END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  WITH agg AS (
    SELECT e.company_id, ac.code AS category_code, COUNT(DISTINCT e.id) AS sample_size,
      CASE WHEN SUM(e.tickets_sold) > 0 THEN SUM(t.amount) / SUM(e.tickets_sold) ELSE 0 END AS avg_ticket
    FROM public.transactions t
    JOIN public.account_categories ac ON ac.id = t.category_id
    JOIN public.events e ON e.id = t.event_id
    WHERE t.type = 'income' AND t.status IN ('approved','paid')
      AND ac.code IN ('1.1.02','1.1.03') AND e.tickets_sold > 0
      AND e.company_id = _company_id
    GROUP BY e.company_id, ac.code
    HAVING COUNT(DISTINCT e.id) >= 1
  )
  INSERT INTO public.event_simulator_pax_benchmarks
    (company_id, scope, scope_value, category_code, sample_size, avg_ticket_per_pax, last_calculated_at)
  SELECT company_id, 'global', NULL, category_code, sample_size, ROUND(avg_ticket::numeric, 2), now() FROM agg
  ON CONFLICT (company_id, scope, scope_value, category_code) DO UPDATE
    SET sample_size = EXCLUDED.sample_size, avg_ticket_per_pax = EXCLUDED.avg_ticket_per_pax, last_calculated_at = now();
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows;
END;
$function$;