-- 1. Colunas de configuração de tráfego pago no evento
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ads_allocation_level text NOT NULL DEFAULT 'tour',
  ADD COLUMN IF NOT EXISTS ads_match_aliases text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ads_allocation_level_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_ads_allocation_level_check
  CHECK (ads_allocation_level IN ('tour','cidade','externo'));

COMMENT ON COLUMN public.events.ads_allocation_level IS
  'Nivel de lancamento do trafego pago (so tem significado no evento-mae ou em eventos sem filhos): '
  '''tour'' — todo o trafego da familia lanca na mae; '
  '''cidade'' — lanca no evento-filho da cidade identificada na campanha; '
  '''externo'' — nao corremos trafego para este evento; nunca atribuir automaticamente.';

COMMENT ON COLUMN public.events.ads_match_aliases IS
  'Nomes alternativos/siglas por que a familia e reconhecida nos nomes de campanha (comparados como frase completa com fronteira de palavra).';

-- 2. Configuracao inicial
UPDATE public.events SET ads_allocation_level='tour',   ads_match_aliases=ARRAY['Raphael Ghanem','RG']    WHERE id='be6dc629-91d0-4216-b360-92028f949484';
UPDATE public.events SET ads_allocation_level='cidade', ads_match_aliases=ARRAY['Simone Mendes','SM']     WHERE id='5e56f568-506f-4469-8802-050182c6d479';
UPDATE public.events SET ads_allocation_level='tour',   ads_match_aliases=ARRAY['Ensaios da Anitta','EDA'] WHERE id='fdfb39fe-45f2-43f5-9ec9-7cb536360ae1';
UPDATE public.events SET ads_allocation_level='externo', ads_match_aliases='{}'                            WHERE id='e103ed22-d53c-4eb7-99e8-a6cdbf1d2dfd';
UPDATE public.events SET ads_allocation_level='externo'                                                    WHERE parent_event_id='e103ed22-d53c-4eb7-99e8-a6cdbf1d2dfd';
UPDATE public.events SET ads_allocation_level='tour',   ads_match_aliases=ARRAY['Ivete Clareou']           WHERE id='4fca2381-1db9-4ff5-9dc0-91068de88a02';

-- 3. Linhas de fatura: nota de correspondencia + origem 'regra'
ALTER TABLE public.ads_invoice_line ADD COLUMN IF NOT EXISTS match_note text;
ALTER TABLE public.ads_invoice_line DROP CONSTRAINT IF EXISTS ads_invoice_line_match_source_check;
ALTER TABLE public.ads_invoice_line
  ADD CONSTRAINT ads_invoice_line_match_source_check
  CHECK (match_source IN ('erp_link','fuzzy','manual','none','regra'));

-- 4. Normalizacao de texto (minusculas, sem acentos, espacos colapsados)
CREATE OR REPLACE FUNCTION public.ads_norm_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(coalesce(p_text,''),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')),
    '\s+', ' ', 'g'))
$$;

-- 5. Janela de venda por evento (mae herda a uniao das janelas dos filhos)
CREATE OR REPLACE FUNCTION public.ads_event_windows(p_company_id uuid)
RETURNS TABLE(event_id uuid, root_id uuid, win_start date, win_end date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH fs AS (
    SELECT z.event_id AS eid, min(ts.sale_date) AS d
      FROM public.ticket_sales ts
      JOIN public.event_ticket_zones z ON z.id = ts.zone_id
     GROUP BY 1
    UNION ALL
    SELECT t.event_id, min(t.sale_date) FROM public.ticketline_daily_sales t GROUP BY 1
    UNION ALL
    SELECT b.event_id, min(b.sale_date) FROM public.bol_daily_sales b GROUP BY 1
  ),
  first_sale AS (SELECT eid, min(d) AS d FROM fs WHERE eid IS NOT NULL GROUP BY 1),
  ev AS (
    SELECT e.id, e.parent_event_id, e.date AS end_own, f.d AS start_own,
           coalesce(e.parent_event_id, e.id) AS root
      FROM public.events e
      LEFT JOIN first_sale f ON f.eid = e.id
     WHERE e.company_id = p_company_id
  ),
  kids AS (
    SELECT parent_event_id AS pid, min(start_own) AS s, max(end_own) AS e
      FROM ev WHERE parent_event_id IS NOT NULL GROUP BY 1
  )
  SELECT ev.id, ev.root,
         least(ev.start_own, k.s)::date,
         greatest(ev.end_own, k.e)::date
    FROM ev LEFT JOIN kids k ON k.pid = ev.id
$$;

-- 6. Resolucao campanha -> evento (so leitura)
CREATE OR REPLACE FUNCTION public.resolve_ads_event(
  p_company_id uuid,
  p_campaign_name text,
  p_billing_period date
)
RETURNS TABLE(event_id uuid, match_source text, note text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, crm, pg_temp
AS $$
DECLARE
  v_name  text := public.ads_norm_text(p_campaign_name);
  v_start date := date_trunc('month', p_billing_period)::date;
  v_end   date := (date_trunc('month', p_billing_period) + interval '1 month - 1 day')::date;
  v_locked uuid;
  v_roots  int;
  v_root   uuid;
  v_level  text;
  v_kids   int;
  v_child  uuid;
  v_link   uuid;
  v_link_level text;
  v_note2  text;
BEGIN
  IF v_name = '' THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, 'sem correspondência'::text; RETURN;
  END IF;

  -- 1) vínculo trancado no ERP
  SELECT s.linked_event_id INTO v_locked
    FROM crm.meta_campaign_snapshot s
   WHERE s.company_id = p_company_id
     AND s.linked_event_locked IS TRUE
     AND s.linked_event_id IS NOT NULL
     AND public.ads_norm_text(s.name) = v_name
   LIMIT 1;
  IF v_locked IS NOT NULL THEN
    RETURN QUERY SELECT v_locked, 'erp_link'::text, 'vínculo trancado'::text; RETURN;
  END IF;

  -- 2) família por token do nome ou alias
  WITH w AS (SELECT * FROM public.ads_event_windows(p_company_id)),
  cand AS (
    SELECT DISTINCT coalesce(e.parent_event_id, e.id) AS root
      FROM public.events e
      JOIN w ON w.event_id = e.id
     WHERE e.company_id = p_company_id
       AND e.status = 'active'
       AND w.win_start IS NOT NULL
       AND w.win_start <= v_end
       AND w.win_end   >= v_start
       AND (
         EXISTS (
           SELECT 1 FROM regexp_split_to_table(public.ads_norm_text(e.name), '[^a-z0-9]+') AS tok
            WHERE length(tok) >= 4 AND tok ~ '^[a-z]+$'
              AND v_name ~ ('(^|[^a-z0-9])' || tok || '([^a-z0-9]|$)')
         )
         OR EXISTS (
           SELECT 1 FROM unnest(e.ads_match_aliases) AS a
            WHERE public.ads_norm_text(a) <> ''
              AND v_name ~ ('(^|[^a-z0-9])'
                    || regexp_replace(public.ads_norm_text(a), '([^a-z0-9 ])', '\\\1', 'g')
                    || '([^a-z0-9]|$)')
         )
       )
  )
  SELECT count(*)::int, min(root) INTO v_roots, v_root FROM cand;

  IF v_roots = 1 THEN
    SELECT e.ads_allocation_level INTO v_level FROM public.events e WHERE e.id = v_root;

    IF v_level = 'externo' THEN
      RETURN QUERY SELECT NULL::uuid, 'none'::text, 'evento com tráfego externo'::text; RETURN;
    END IF;

    IF v_level = 'cidade' THEN
      WITH w AS (SELECT * FROM public.ads_event_windows(p_company_id))
      SELECT count(*)::int, min(e.id) INTO v_kids, v_child
        FROM public.events e
        JOIN w ON w.event_id = e.id
        JOIN public.cities c ON c.id = e.city_id
       WHERE e.parent_event_id = v_root
         AND e.status = 'active'
         AND w.win_start IS NOT NULL
         AND w.win_start <= v_end
         AND w.win_end   >= v_start
         AND v_name ~ ('(^|[^a-z0-9])'
               || regexp_replace(public.ads_norm_text(c.name), '([^a-z0-9 ])', '\\\1', 'g')
               || '([^a-z0-9]|$)');
      IF v_kids = 1 THEN
        RETURN QUERY SELECT v_child, 'regra'::text, NULL::text; RETURN;
      END IF;
      RETURN QUERY SELECT v_root, 'regra'::text, 'sem cidade identificada, lançado na tour'::text; RETURN;
    END IF;

    RETURN QUERY SELECT v_root, 'regra'::text, NULL::text; RETURN;
  END IF;

  v_note2 := CASE WHEN coalesce(v_roots,0) = 0
                  THEN 'sem candidato: nenhum evento à venda no período casa com o nome'
                  ELSE 'vários candidatos: nome casa com mais do que uma família' END;

  -- 3) fallback: vínculo do ERP (nao trancado)
  SELECT s.linked_event_id INTO v_link
    FROM crm.meta_campaign_snapshot s
   WHERE s.company_id = p_company_id
     AND s.linked_event_id IS NOT NULL
     AND public.ads_norm_text(s.name) = v_name
   LIMIT 1;

  IF v_link IS NOT NULL THEN
    SELECT coalesce(p.ads_allocation_level, e.ads_allocation_level) INTO v_link_level
      FROM public.events e
      LEFT JOIN public.events p ON p.id = e.parent_event_id
     WHERE e.id = v_link;
    IF v_link_level = 'externo' THEN
      RETURN QUERY SELECT NULL::uuid, 'none'::text, 'evento com tráfego externo'::text; RETURN;
    END IF;
    RETURN QUERY SELECT v_link, 'erp_link'::text, 'vínculo do ERP, sem regra'::text; RETURN;
  END IF;

  -- 4) nada
  RETURN QUERY SELECT NULL::uuid, 'none'::text, v_note2; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ads_event(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_ads_event(uuid, text, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ads_event_windows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ads_event_windows(uuid) TO authenticated, service_role;