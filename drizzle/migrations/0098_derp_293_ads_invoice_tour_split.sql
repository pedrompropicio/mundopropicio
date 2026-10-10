-- #293: repartição de uma linha de campanha (evento = Master de turnê) por Master + cidades.
-- A linha do PDF fica intacta (D-ERP31); a repartição vive em event_split e é expandida na geração.
ALTER TABLE public.ads_invoice_line ADD COLUMN IF NOT EXISTS event_split jsonb;
ALTER TABLE public.ads_invoice_line DROP CONSTRAINT IF EXISTS ads_invoice_line_event_split_array;
ALTER TABLE public.ads_invoice_line ADD CONSTRAINT ads_invoice_line_event_split_array
  CHECK (event_split IS NULL OR jsonb_typeof(event_split) = 'array');
COMMENT ON COLUMN public.ads_invoice_line.event_split IS
  '#293: [{event_id, amount, source}] — repartição confirmada por humano da linha por Master + cidades; soma = amount ao cêntimo. NULL = linha inteira em event_id.';

-- Sugestão: gasto por conjunto da campanha no mês da fatura + eventos da turnê (Master e cidades).
CREATE OR REPLACE FUNCTION public.ads_invoice_line_tour_suggestion(_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE l record; inv record; v_uid uuid := auth.uid(); v_from date; v_to date; r jsonb;
BEGIN
  SELECT * INTO l FROM public.ads_invoice_line WHERE id = _line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NULL OR NOT (public.is_platform_admin(v_uid) OR (l.company_id = public.current_company_id() AND (
       public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'editor') OR public.has_role(v_uid,'accountant')))) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM public.ads_invoice WHERE id = l.invoice_id;
  v_from := date_trunc('month', COALESCE(inv.billing_period, inv.issue_date))::date;
  v_to := (v_from + interval '1 month')::date;
  SELECT jsonb_build_object(
    'line', jsonb_build_object('id', l.id, 'amount', l.amount, 'campaign_name', l.campaign_name,
                               'external_campaign_id', l.external_campaign_id, 'event_id', l.event_id),
    'month', to_char(v_from, 'YYYY-MM'),
    'master', (SELECT jsonb_build_object('id', e.id, 'name', e.name) FROM public.events e WHERE e.id = l.event_id),
    'cities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'city', c.name) ORDER BY e.name)
                          FROM public.events e LEFT JOIN public.cities c ON c.id = e.city_id
                         WHERE e.parent_event_id = l.event_id), '[]'::jsonb),
    'adsets', COALESCE((SELECT jsonb_agg(jsonb_build_object('adset_name', a.adset_name, 'spend', a.spend) ORDER BY a.spend DESC)
                          FROM (SELECT d.adset_name, round(sum(d.spend_cents) / 100.0, 2) AS spend
                                  FROM crm.meta_adset_insights_daily d
                                 WHERE d.company_id = l.company_id
                                   AND d.date_start >= v_from AND d.date_start < v_to
                                   AND (d.external_campaign_id = l.external_campaign_id
                                        OR (l.external_campaign_id IS NULL AND d.campaign_name = l.campaign_name))
                                 GROUP BY d.adset_name) a), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.ads_invoice_line_tour_suggestion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ads_invoice_line_tour_suggestion(uuid) TO authenticated, service_role;

-- Gravar (ou limpar com _parts NULL/[]) a repartição confirmada.
CREATE OR REPLACE FUNCTION public.ads_invoice_line_set_tour_split(_line_id uuid, _parts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE l record; inv record; v_uid uuid := auth.uid(); p jsonb; v_sum numeric := 0; v_ids uuid[] := '{}'; v_eid uuid; v_amt numeric;
BEGIN
  SELECT * INTO l FROM public.ads_invoice_line WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NULL OR NOT (public.is_platform_admin(v_uid) OR (l.company_id = public.current_company_id() AND (
       public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'editor') OR public.has_role(v_uid,'accountant')))) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM public.ads_invoice WHERE id = l.invoice_id;
  IF inv.status = 'applied' OR inv.parent_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'A fatura já foi lançada: reabre-a antes de repartir.' USING ERRCODE = '42501';
  END IF;
  IF _parts IS NULL OR jsonb_typeof(_parts) <> 'array' OR jsonb_array_length(_parts) = 0 THEN
    UPDATE public.ads_invoice_line SET event_split = NULL, updated_at = now() WHERE id = _line_id;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;
  IF l.is_adjustment OR l.event_id IS NULL THEN
    RAISE EXCEPTION 'Só linhas de campanha com evento podem ser repartidas.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE parent_event_id = l.event_id) THEN
    RAISE EXCEPTION 'O evento da linha não é Master de turnê.' USING ERRCODE = '23514';
  END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(_parts) LOOP
    v_eid := (p->>'event_id')::uuid;
    v_amt := round((p->>'amount')::numeric, 2);
    IF v_amt IS NULL OR v_amt < 0 THEN RAISE EXCEPTION 'Valor inválido na repartição.' USING ERRCODE = '23514'; END IF;
    IF v_eid IS DISTINCT FROM l.event_id AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_eid AND parent_event_id = l.event_id) THEN
      RAISE EXCEPTION 'Evento % não pertence à turnê.', v_eid USING ERRCODE = '23514';
    END IF;
    IF v_eid = ANY(v_ids) THEN RAISE EXCEPTION 'Evento repetido na repartição.' USING ERRCODE = '23514'; END IF;
    v_ids := v_ids || v_eid;
    v_sum := v_sum + v_amt;
  END LOOP;
  IF round(v_sum, 2) <> round(l.amount, 2) THEN
    RAISE EXCEPTION 'A soma das partes (%) não é o valor da linha (%).', round(v_sum,2), round(l.amount,2) USING ERRCODE = '23514';
  END IF;
  UPDATE public.ads_invoice_line
     SET event_split = (SELECT jsonb_agg(jsonb_build_object('event_id', x->>'event_id', 'amount', round((x->>'amount')::numeric, 2),
                                                            'source', COALESCE(x->>'source', 'manual')))
                          FROM jsonb_array_elements(_parts) x),
         matched_by = v_uid, matched_at = now(), updated_at = now()
   WHERE id = _line_id;
  RETURN jsonb_build_object('ok', true, 'parts', jsonb_array_length(_parts));
END $function$;
REVOKE ALL ON FUNCTION public.ads_invoice_line_set_tour_split(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ads_invoice_line_set_tour_split(uuid, jsonb) TO authenticated, service_role;