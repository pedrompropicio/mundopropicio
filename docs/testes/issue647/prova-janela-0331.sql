-- Classe R2 — PROVA SELECT, NÃO EXECUTADA EM LIVE. Issue #647.
-- O 0 guarda os resultados integrais ANTES e DEPOIS de cada fase de manutenção.
-- Janela sem captura concorrente para comparar somas exactas; caso contrário discriminar chegadas novas.
-- Executar sob o mesmo contexto de acesso canónico para 0299/0257 (empresa/artista autorizado).
-- Este ficheiro não chama backfill, refresh, anonimização, purga, rebuild ou validate.

SELECT CASE WHEN created_at >= now()-make_interval(days=>30) THEN '<=30 dias'
            WHEN created_at >= now()-make_interval(months=>13) THEN '30 dias–13 meses'
            ELSE '>13 meses' END AS idade,
 count(*) AS linhas,
 count(*) FILTER(WHERE ip_hash IS NOT NULL OR fbclid IS NOT NULL OR ttclid IS NOT NULL
   OR capi_fbp IS NOT NULL OR capi_fbc IS NOT NULL OR capi_external_id IS NOT NULL
   OR event_id IS NOT NULL OR arrival_event_id IS NOT NULL) AS com_identificadores,
 count(*) FILTER(WHERE created_at<>date_trunc('hour',created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS hora_nao_arredondada
FROM public.song_link_events GROUP BY 1 ORDER BY 1;

-- Estas cinco somas (e linhas/dimensões, capturadas nos testes PGlite) ficam iguais na retenção.
SELECT 'song_link_report_hourly' AS agregado, coalesce(sum(n),0) AS total FROM public.song_link_report_hourly
UNION ALL SELECT 'song_link_report_visitors_hourly',coalesce(sum(n),0) FROM public.song_link_report_visitors_hourly
UNION ALL SELECT 'song_link_report_visitor_refs_daily',coalesce(sum(n),0) FROM public.song_link_report_visitor_refs_daily
UNION ALL SELECT 'song_link_report_visitor_totals_daily',coalesce(sum(v),0) FROM public.song_link_report_visitor_totals_daily
UNION ALL SELECT 'song_link_arrivals_hourly',coalesce(sum(n),0) FROM public.song_link_arrivals_hourly;

SELECT 'stats' AS agregado,count(*) AS grupos,coalesce(sum(aberturas_spotify),0) AS contagem FROM public.song_link_ident_daily_stats
UNION ALL SELECT 'origins',count(*),coalesce(sum(pessoas_trafego),0) FROM public.song_link_ident_daily_origins;

-- Períodos fixos: comparar os mesmos resultados antes/depois, sem deslocar a janela.
-- Todos os artistas activos têm a guarda de acesso de cada RPC; nenhum identificador é exportado.
SELECT a.id AS artist_id,r.* FROM public.artists a
CROSS JOIN LATERAL public.artist_song_link_stats(a.id,'2026-09-20','2026-10-06') r
WHERE public.artist_access_check(a.id,'read','songs')=a.company_id
ORDER BY a.id,r.dia,r.link_id,r.utm_campaign,r.utm_content,r.canal;

SELECT a.id AS artist_id,public.artist_song_play_origins_compare(a.id,'2026-09-23','2026-10-06') AS resultado
FROM public.artists a WHERE public.artist_access_check(a.id,'read','songs')=a.company_id ORDER BY a.id;

-- Contraexemplo 6636691739: elegível e no lado agregado nos DOIS fusos (inclui igualdade).
SELECT tz,
 event_at < n-make_interval(days=>30) AS elegivel,
 (event_at AT TIME ZONE tz)::date AS dia_evento,
 (n AT TIME ZONE tz)::date-30 AS ultimo_dia_agregado,
 (event_at AT TIME ZONE tz)::date <= (n AT TIME ZONE tz)::date-30 AS coberto,
 (date_trunc('hour',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AT TIME ZONE tz)::date
   = (event_at AT TIME ZONE tz)::date AS arredondamento_preserva_dia
FROM (SELECT timestamptz '2026-11-04 12:00 UTC' n,timestamptz '2026-10-05 10:17 UTC' event_at) x
CROSS JOIN (VALUES('Europe/Lisbon'),('America/Sao_Paulo')) z(tz);
