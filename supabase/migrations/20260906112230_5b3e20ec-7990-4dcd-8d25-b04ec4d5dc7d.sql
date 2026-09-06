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

  -- Famílias com venda aberta no período. O reconhecimento é feito SÓ pelo nome
  -- e aliases do evento-mãe: os nomes dos filhos são cidades e apanhavam
  -- campanhas de outras turnês na mesma cidade.
  WITH w AS (SELECT * FROM public.ads_event_windows(p_company_id)),
  roots AS (
    SELECT DISTINCT coalesce(e.parent_event_id, e.id) AS root
      FROM public.events e
      JOIN w ON w.event_id = e.id
     WHERE e.company_id = p_company_id
       AND e.status = 'active'
       AND w.win_start IS NOT NULL
       AND w.win_start <= v_end
       AND w.win_end   >= v_start
  ),
  cand AS (
    SELECT r.root
      FROM roots r
      JOIN public.events p ON p.id = r.root
     WHERE (
        EXISTS (
          SELECT 1 FROM regexp_split_to_table(public.ads_norm_text(p.name), '[^a-z0-9]+') AS tok
           WHERE length(tok) >= 4 AND tok ~ '^[a-z]+$'
             AND v_name ~ ('(^|[^a-z0-9])' || tok || '([^a-z0-9]|$)')
        )
        OR EXISTS (
          SELECT 1 FROM unnest(p.ads_match_aliases) AS a
           WHERE public.ads_norm_text(a) <> ''
             AND v_name ~ ('(^|[^a-z0-9])'
                   || regexp_replace(public.ads_norm_text(a), '([^a-z0-9 ])', '\\\1', 'g')
                   || '([^a-z0-9]|$)')
        )
      )
  )
  SELECT count(*)::int, min(root::text)::uuid INTO v_roots, v_root FROM cand;

  IF v_roots = 1 THEN
    SELECT e.ads_allocation_level INTO v_level FROM public.events e WHERE e.id = v_root;

    IF v_level = 'externo' THEN
      RETURN QUERY SELECT NULL::uuid, 'none'::text, 'evento com tráfego externo'::text; RETURN;
    END IF;

    IF v_level = 'cidade' THEN
      WITH w AS (SELECT * FROM public.ads_event_windows(p_company_id))
      SELECT count(*)::int, min(e.id::text)::uuid INTO v_kids, v_child
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

  RETURN QUERY SELECT NULL::uuid, 'none'::text, v_note2; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ads_event(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_ads_event(uuid, text, date) TO authenticated, service_role;