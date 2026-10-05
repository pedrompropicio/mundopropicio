-- D-ERP172 adenda: v_artist_audience_by_state só com audiência do artista (song_id IS NULL). Mesmas colunas.
CREATE OR REPLACE VIEW public.v_artist_audience_by_state AS
WITH base AS (
  SELECT d.company_id, d.artist_id, d.platform, d.audience_type, d.timeframe, d.snapshot_date, d.value,
         regexp_replace(btrim(SUBSTRING(d.dim_key FROM (POSITION((', '::text) IN (d.dim_key)) + 2))), '\s*\(state\)$'::text, ''::text) AS estado_nome
  FROM public.artist_audience_demographics d
  WHERE d.dimension = 'city'::text AND POSITION((', '::text) IN (d.dim_key)) > 0 AND d.song_id IS NULL
)
SELECT b.company_id, b.artist_id, b.platform, b.audience_type, b.timeframe, b.snapshot_date,
       e.uf, COALESCE(e.regiao, 'Fora do Brasil'::text) AS regiao, b.estado_nome,
       sum(b.value) AS valor,
       round(((100.0 * sum(b.value)) / NULLIF(sum(sum(b.value)) OVER (PARTITION BY b.artist_id, b.platform, b.audience_type, b.snapshot_date), (0)::numeric)), 1) AS quota_pct
FROM base b
LEFT JOIN public.br_estados e ON e.nome = b.estado_nome
GROUP BY b.company_id, b.artist_id, b.platform, b.audience_type, b.timeframe, b.snapshot_date, e.uf, e.regiao, b.estado_nome;