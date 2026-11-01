-- 0299 — Issue #350 (Lote B, #435): tentativas e sinais de abertura Spotify separados.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- RETURNS TABLE ganha três colunas no fim: exige DROP FUNCTION + CREATE OR REPLACE,
-- pois CREATE OR REPLACE sozinho não permite alterar o tipo de retorno.
-- DROP sem CASCADE: qualquer dependência nova bloqueia a aplicação.
-- Conferência Live por SELECT em 2026-11-01: pg_depend = 0 dependentes;
-- pg_views (definition contém artist_song_link_stats) = 0 vistas;
-- pg_proc (prosrc contém artist_song_link_stats, excluindo a própria) = 0 funções.
-- Owner postgres, STABLE SECURITY DEFINER e search_path public, crm mantidos.
-- ACL preservada: postgres, authenticated, service_role e role técnico Live existente;
-- PUBLIC/anon sem EXECUTE. Nenhum role é criado; diferença de sandbox conforme PROC-promocao.
-- aberturas_app mantém o valor legado: soma tentativas e sinais, não visitas distintas.
-- Métricas novas usam a mesma janela Europe/Lisbon e os mesmos grupos dia/link/UTM/canal.
-- taxa_abertura é uma razão numeric (não percentagem); denominador zero devolve 0.

-- ROLLBACK COMENTADO — DROP e definição anterior completa copiada por pg_get_functiondef.
-- DROP FUNCTION public.artist_song_link_stats(uuid,date,date);
-- CREATE OR REPLACE FUNCTION public.artist_song_link_stats(p_artist_id uuid, p_from date, p_to date)
--  RETURNS TABLE(dia date, link_id uuid, slug text, song_id uuid, utm_campaign text, utm_content text, chegadas bigint, escolhas bigint, escolhas_por_destino jsonb, aberturas_app bigint, aberturas_web bigint, campanha_id text, campanha_nome text, gasto_campanha_dia numeric, moeda text, custo_por_chegada numeric, canal text)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'crm'
-- AS $function$
--   WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','songs') AS company_id),
--   ev AS (
--     SELECT e.link_id, e.event, e.opened, coalesce(e.destination,'(sem)') AS destination,
--       coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
--       (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
--       public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
--     FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id, guard g
--     WHERE e.artist_id = p_artist_id AND e.company_id = g.company_id
--       AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
--       AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
--   ),
--   base AS (
--     SELECT dia, link_id, utm_campaign, utm_content, canal,
--       count(*) FILTER (WHERE event = 'arrival') AS chegadas,
--       count(*) FILTER (WHERE event = 'choice')  AS escolhas,
--       count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
--       count(*) FILTER (WHERE opened = 'web')    AS aberturas_web
--     FROM ev GROUP BY 1,2,3,4,5
--   ),
--   dest AS (
--     SELECT dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
--     FROM (SELECT dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
--           FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6) x
--     GROUP BY 1,2,3,4,5
--   ),
--   camp AS (
--     SELECT DISTINCT ON (public.song_link_utm_slug(ms.name))
--       public.song_link_utm_slug(ms.name) AS cslug, ms.connection_id, ms.external_campaign_id,
--       ms.name, coalesce(ms.currency, c.selected_ad_account_currency) AS currency
--     FROM crm.meta_campaign_snapshot ms
--     JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
--     CROSS JOIN guard g
--     WHERE c.platform = 'meta' AND c.connection_scope = 'artist'
--       AND c.artist_id = p_artist_id AND c.company_id = g.company_id
--     ORDER BY public.song_link_utm_slug(ms.name), ms.last_synced_at DESC NULLS LAST
--   ),
--   spend AS (
--     SELECT i.connection_id, i.external_campaign_id, i.date_start,
--       sum(i.spend_cents)/100.0 AS gasto, max(i.currency) AS currency
--     FROM crm.meta_campaign_insights_daily i
--     JOIN camp cm ON cm.connection_id = i.connection_id AND cm.external_campaign_id = i.external_campaign_id
--     WHERE i.date_start BETWEEN p_from AND p_to
--     GROUP BY 1,2,3
--   ),
--   tot AS (SELECT dia, utm_campaign, sum(chegadas) AS n FROM base GROUP BY 1,2)
--   SELECT b.dia, b.link_id, l.slug, l.song_id, nullif(b.utm_campaign,''), nullif(b.utm_content,''),
--     b.chegadas, b.escolhas, coalesce(d.d, '{}'::jsonb), b.aberturas_app, b.aberturas_web,
--     cm.external_campaign_id, cm.name, s.gasto, coalesce(s.currency, cm.currency),
--     CASE WHEN s.gasto IS NOT NULL AND t.n > 0 THEN round(s.gasto / t.n, 4) END,
--     b.canal
--   FROM base b
--   JOIN public.song_links l ON l.id = b.link_id
--   LEFT JOIN dest d ON d.dia = b.dia AND d.link_id = b.link_id
--                   AND d.utm_campaign = b.utm_campaign AND d.utm_content = b.utm_content AND d.canal = b.canal
--   LEFT JOIN camp cm ON b.utm_campaign <> '' AND cm.cslug = b.utm_campaign
--   LEFT JOIN spend s ON s.connection_id = cm.connection_id
--                    AND s.external_campaign_id = cm.external_campaign_id AND s.date_start = b.dia
--   LEFT JOIN tot t ON t.dia = b.dia AND t.utm_campaign = b.utm_campaign
--   ORDER BY b.dia DESC, b.chegadas DESC
-- $function$;
-- ALTER FUNCTION public.artist_song_link_stats(uuid,date,date) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date) FROM anon;
-- GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date) TO authenticated, service_role;
-- -- Role técnico existente só em Live: preservar a ACL sem o criar no mp-homolog-3.
-- DO $acl$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_sfohvvlqccmmebvjgibx') THEN
--     GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date) TO sandbox_exec_sfohvvlqccmmebvjgibx;
--   END IF;
-- END;
-- $acl$;

-- ALTERAÇÃO PREPARADA — não aplicada.
DROP FUNCTION public.artist_song_link_stats(uuid,date,date);
CREATE OR REPLACE FUNCTION public.artist_song_link_stats(p_artist_id uuid, p_from date, p_to date)
 RETURNS TABLE(dia date, link_id uuid, slug text, song_id uuid, utm_campaign text, utm_content text, chegadas bigint, escolhas bigint, escolhas_por_destino jsonb, aberturas_app bigint, aberturas_web bigint, campanha_id text, campanha_nome text, gasto_campanha_dia numeric, moeda text, custo_por_chegada numeric, canal text, tentativas_app bigint, aberturas_spotify bigint, taxa_abertura numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','songs') AS company_id),
  ev AS (
    SELECT e.link_id, e.event, e.opened, e.arrival_event_id, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
      public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
    FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id, guard g
    WHERE e.artist_id = p_artist_id AND e.company_id = g.company_id
      AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
      AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
  ),
  base AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      -- Compatibilidade: aberturas_app soma tentativas e sinais da mesma visita.
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web,
      count(*) FILTER (WHERE event IN ('arrival', 'choice') AND opened = 'app') AS tentativas_app,
      count(DISTINCT arrival_event_id) FILTER (WHERE event = 'app_open' AND destination = 'spotify') AS aberturas_spotify,
      count(*) FILTER (WHERE event = 'arrival' AND destination = 'spotify') AS chegadas_spotify
    FROM ev GROUP BY 1,2,3,4,5
  ),
  dest AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
    FROM (SELECT dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6) x
    GROUP BY 1,2,3,4,5
  ),
  camp AS (
    SELECT DISTINCT ON (public.song_link_utm_slug(ms.name))
      public.song_link_utm_slug(ms.name) AS cslug, ms.connection_id, ms.external_campaign_id,
      ms.name, coalesce(ms.currency, c.selected_ad_account_currency) AS currency
    FROM crm.meta_campaign_snapshot ms
    JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
    CROSS JOIN guard g
    WHERE c.platform = 'meta' AND c.connection_scope = 'artist'
      AND c.artist_id = p_artist_id AND c.company_id = g.company_id
    ORDER BY public.song_link_utm_slug(ms.name), ms.last_synced_at DESC NULLS LAST
  ),
  spend AS (
    SELECT i.connection_id, i.external_campaign_id, i.date_start,
      sum(i.spend_cents)/100.0 AS gasto, max(i.currency) AS currency
    FROM crm.meta_campaign_insights_daily i
    JOIN camp cm ON cm.connection_id = i.connection_id AND cm.external_campaign_id = i.external_campaign_id
    WHERE i.date_start BETWEEN p_from AND p_to
    GROUP BY 1,2,3
  ),
  tot AS (SELECT dia, utm_campaign, sum(chegadas) AS n FROM base GROUP BY 1,2)
  SELECT b.dia, b.link_id, l.slug, l.song_id, nullif(b.utm_campaign,''), nullif(b.utm_content,''),
    b.chegadas, b.escolhas, coalesce(d.d, '{}'::jsonb), b.aberturas_app, b.aberturas_web,
    cm.external_campaign_id, cm.name, s.gasto, coalesce(s.currency, cm.currency),
    CASE WHEN s.gasto IS NOT NULL AND t.n > 0 THEN round(s.gasto / t.n, 4) END,
    b.canal, b.tentativas_app, b.aberturas_spotify,
    CASE WHEN b.chegadas_spotify = 0 THEN 0::numeric
         ELSE b.aberturas_spotify::numeric / b.chegadas_spotify END AS taxa_abertura
  FROM base b
  JOIN public.song_links l ON l.id = b.link_id
  LEFT JOIN dest d ON d.dia = b.dia AND d.link_id = b.link_id
                  AND d.utm_campaign = b.utm_campaign AND d.utm_content = b.utm_content AND d.canal = b.canal
  LEFT JOIN camp cm ON b.utm_campaign <> '' AND cm.cslug = b.utm_campaign
  LEFT JOIN spend s ON s.connection_id = cm.connection_id
                   AND s.external_campaign_id = cm.external_campaign_id AND s.date_start = b.dia
  LEFT JOIN tot t ON t.dia = b.dia AND t.utm_campaign = b.utm_campaign
  ORDER BY b.dia DESC, b.chegadas DESC
$function$;

ALTER FUNCTION public.artist_song_link_stats(uuid,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date) TO authenticated, service_role;
-- Role técnico existente só em Live: preservar a ACL sem o criar no mp-homolog-3.
DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_sfohvvlqccmmebvjgibx') THEN
    GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date) TO sandbox_exec_sfohvvlqccmmebvjgibx;
  END IF;
END;
$acl$;
