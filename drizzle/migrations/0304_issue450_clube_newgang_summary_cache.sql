-- 0304 — Issue #450 E2b: cache do resumo CRM Clube Newgang.
-- Data: 2026-11-02. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Origem das medições: despacho do Pedro, 0 · Cowork, 2026-11-02 00:05 UTC.
-- PostgREST: 26 chamadas, média 6.928 ms, máximo 7.869 ms; authenticated timeout 8s.
-- Não executado contra bases; só teste PGlite em memória, sem credenciais.
-- Agregação prévia da referência preserva min(name) sem multiplicar capturas.
-- A RPC deixa de ser STABLE: o fallback escreve a cache; ACL existente preservada.

CREATE OR REPLACE FUNCTION public.clube_newgang_summary_compute(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_today date:=(now() AT TIME ZONE 'Europe/Lisbon')::date; BEGIN
 WITH first_capture AS (SELECT DISTINCT ON (lower(btrim(email))) * FROM public.lead_capture WHERE source='clube_newgang' AND company_id = p_company_id AND email IS NOT NULL ORDER BY lower(btrim(email)),created_at,id),
 geo AS (SELECT DISTINCT ON (lower(btrim(email))) lower(btrim(email)) AS ne,nullif(btrim(geo_city),'') AS gc,upper(nullif(btrim(geo_country),'')) AS gco FROM public.lead_capture WHERE source='clube_newgang' AND company_id = p_company_id AND email IS NOT NULL AND nullif(btrim(geo_city),'') IS NOT NULL ORDER BY lower(btrim(email)),created_at,id),
 fp AS (SELECT f.*,p.birth_date AS p_birth,nullif(btrim(p.residence_country),'') AS p_rc,nullif(btrim(p.city),'') AS p_city,g.gc,g.gco FROM first_capture f LEFT JOIN LATERAL (
 SELECT cm.* FROM public.club_members cm JOIN public.portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id AND ps.brand_key='newgang'
 WHERE cm.company_id=f.company_id AND lower(btrim(cm.email))=lower(btrim(f.email)) ORDER BY cm.created_at,cm.id LIMIT 1) m ON true
 LEFT JOIN public.club_member_profiles p ON p.member_id=m.id AND p.company_id=m.company_id AND p.site_id=m.site_id
 LEFT JOIN geo g ON g.ne=lower(btrim(f.email))),
 municipalities AS (SELECT city_key,min(name) AS name FROM public.portugal_municipalities_ref GROUP BY city_key),
 cities AS (SELECT fp.*,coalesce(p_rc,raw->>'residence_country') AS dc,
 nullif(btrim(coalesce(p_city,raw->>'city')),'') AS declared_city,
 CASE WHEN gco='PT' AND lower(gc)='lisbon' THEN 'Lisboa' ELSE gc END AS estimated_city FROM fp),
 b0 AS (SELECT cities.*,
 CASE WHEN upper(coalesce(nullif(btrim(dc),''),'PT')) IN ('PT','PORTUGAL')
 THEN coalesce(rd.name,declared_city) ELSE declared_city END AS dcity,
 CASE WHEN gco IN ('PT','BR') THEN CASE WHEN gco='PT'
 THEN coalesce(re.name,estimated_city) ELSE estimated_city END END AS ecity
 FROM cities
 LEFT JOIN municipalities rd ON rd.city_key=public.club_city_key(declared_city)
 LEFT JOIN municipalities re ON re.city_key=public.club_city_key(estimated_city)),
 b AS (SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS d,coalesce(dcity,ecity) AS city,(dcity IS NULL AND ecity IS NOT NULL) AS est,coalesce(nullif(utm_source,''),'(direto)')||' / '||coalesce(nullif(utm_medium,''),'—')||' / '||coalesce(nullif(utm_campaign,''),'—') AS utm,coalesce(p_birth,public._clube_newgang_birth(raw)) AS bd FROM b0),a AS (SELECT *,CASE WHEN bd IS NULL THEN 'sem data' WHEN extract(year FROM age(v_today,bd))<18 THEN '<18' WHEN extract(year FROM age(v_today,bd))<25 THEN '18–24' WHEN extract(year FROM age(v_today,bd))<35 THEN '25–34' WHEN extract(year FROM age(v_today,bd))<45 THEN '35–44' ELSE '45+' END AS faixa FROM b), age_counts AS (SELECT faixa,count(*) AS n FROM a GROUP BY faixa)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM a),'today',(SELECT count(*) FROM a WHERE d=v_today),'last7',(SELECT count(*) FROM a WHERE d>v_today-7),'by_day',coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'n',n) ORDER BY d) FROM (SELECT d,count(*) n FROM a GROUP BY d)x),'[]'::jsonb),'by_city',coalesce((SELECT jsonb_agg(jsonb_build_object('k',k,'n',n,'n_declarada',nd,'n_estimada',ne) ORDER BY n DESC,k) FROM (SELECT coalesce(min(city),'(sem cidade)') k,count(*) n,count(*) FILTER (WHERE city IS NOT NULL AND NOT est) nd,count(*) FILTER (WHERE est) ne FROM a GROUP BY public.club_city_key(city) ORDER BY 2 DESC,1 LIMIT 10)x),'[]'::jsonb),'by_utm',coalesce((SELECT jsonb_agg(jsonb_build_object('k',utm,'n',n) ORDER BY n DESC,utm) FROM (SELECT utm,count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 20)x),'[]'::jsonb),'by_age',(SELECT jsonb_agg(jsonb_build_object('k',f,'n',coalesce(ac.n,0)) ORDER BY o) FROM unnest(ARRAY['<18','18–24','25–34','35–44','45+','sem data']) WITH ORDINALITY AS t(f,o) LEFT JOIN age_counts ac ON ac.faixa=t.f)) INTO v; RETURN v;
END $function$;

REVOKE EXECUTE ON FUNCTION public.clube_newgang_summary_compute(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clube_newgang_summary_compute(uuid) TO service_role;

CREATE TABLE public.clube_newgang_summary_cache (
 company_id uuid PRIMARY KEY,
 payload jsonb NOT NULL,
 computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clube_newgang_summary_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clube_newgang_summary_cache FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.clube_newgang_summary_cache TO service_role;

CREATE OR REPLACE FUNCTION public.clube_newgang_summary_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_company uuid;
BEGIN
 FOR v_company IN SELECT DISTINCT company_id FROM public.lead_capture
 WHERE source='clube_newgang' AND company_id IS NOT NULL LOOP
  INSERT INTO public.clube_newgang_summary_cache(company_id,payload)
  VALUES (v_company,public.clube_newgang_summary_compute(v_company))
  ON CONFLICT (company_id) DO UPDATE SET payload=excluded.payload,computed_at=now();
 END LOOP;
END $function$;
REVOKE EXECUTE ON FUNCTION public.clube_newgang_summary_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clube_newgang_summary_refresh() TO service_role;

CREATE OR REPLACE FUNCTION public.clube_newgang_summary()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_company uuid; v_payload jsonb; v_computed_at timestamptz;
BEGIN
 PERFORM public._clube_newgang_assert_access();
 v_company := public.current_company_id();
 SELECT payload,computed_at INTO v_payload,v_computed_at
 FROM public.clube_newgang_summary_cache WHERE company_id=v_company;
 IF NOT FOUND THEN
  INSERT INTO public.clube_newgang_summary_cache(company_id,payload)
  VALUES(v_company,public.clube_newgang_summary_compute(v_company))
  ON CONFLICT (company_id) DO UPDATE SET payload=excluded.payload,computed_at=now()
  RETURNING payload,computed_at INTO v_payload,v_computed_at;
 END IF;
 RETURN v_payload || jsonb_build_object('computed_at',v_computed_at);
END $function$;

CREATE INDEX IF NOT EXISTS lead_capture_clube_company_created_idx
 ON public.lead_capture(company_id,created_at) WHERE source='clube_newgang';

-- aplicar pelo 0 com Sim próprio
-- SELECT cron.schedule('clube-newgang-summary-refresh', '*/10 * * * *',
--   'SELECT public.clube_newgang_summary_refresh();');

-- ROLLBACK COMENTADO — não executar nesta preparação.
-- CREATE OR REPLACE FUNCTION public.clube_newgang_summary()
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE v jsonb; v_today date:=(now() AT TIME ZONE 'Europe/Lisbon')::date; BEGIN
--  PERFORM public._clube_newgang_assert_access();
--  WITH first_capture AS (SELECT DISTINCT ON (lower(btrim(email))) * FROM public.lead_capture WHERE source='clube_newgang' AND public.row_belongs_to_current_company(company_id) AND email IS NOT NULL ORDER BY lower(btrim(email)),created_at,id),
--  geo AS (SELECT DISTINCT ON (lower(btrim(email))) lower(btrim(email)) AS ne,nullif(btrim(geo_city),'') AS gc,upper(nullif(btrim(geo_country),'')) AS gco FROM public.lead_capture WHERE source='clube_newgang' AND public.row_belongs_to_current_company(company_id) AND email IS NOT NULL AND nullif(btrim(geo_city),'') IS NOT NULL ORDER BY lower(btrim(email)),created_at,id),
--  fp AS (SELECT f.*,p.birth_date AS p_birth,nullif(btrim(p.residence_country),'') AS p_rc,nullif(btrim(p.city),'') AS p_city,g.gc,g.gco FROM first_capture f LEFT JOIN LATERAL (
--  SELECT cm.* FROM public.club_members cm JOIN public.portal_sites ps ON ps.id=cm.site_id AND ps.company_id=cm.company_id AND ps.brand_key='newgang'
--  WHERE cm.company_id=f.company_id AND lower(btrim(cm.email))=lower(btrim(f.email)) ORDER BY cm.created_at,cm.id LIMIT 1) m ON true
--  LEFT JOIN public.club_member_profiles p ON p.member_id=m.id AND p.company_id=m.company_id AND p.site_id=m.site_id
--  LEFT JOIN geo g ON g.ne=lower(btrim(f.email))),
--  b0 AS (SELECT *,public.club_city_display(coalesce(p_rc,raw->>'residence_country'),coalesce(p_city,raw->>'city')) AS dcity,
--  CASE WHEN gco IN ('PT','BR') THEN public.club_city_display(gco,CASE WHEN gco='PT' AND lower(gc)='lisbon' THEN 'Lisboa' ELSE gc END) END AS ecity FROM fp),
--  b AS (SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS d,coalesce(dcity,ecity) AS city,(dcity IS NULL AND ecity IS NOT NULL) AS est,coalesce(nullif(utm_source,''),'(direto)')||' / '||coalesce(nullif(utm_medium,''),'—')||' / '||coalesce(nullif(utm_campaign,''),'—') AS utm,coalesce(p_birth,public._clube_newgang_birth(raw)) AS bd FROM b0),a AS (SELECT *,CASE WHEN bd IS NULL THEN 'sem data' ELSE CASE WHEN extract(year FROM age(v_today,bd))<18 THEN '<18' WHEN extract(year FROM age(v_today,bd))<25 THEN '18–24' WHEN extract(year FROM age(v_today,bd))<35 THEN '25–34' WHEN extract(year FROM age(v_today,bd))<45 THEN '35–44' ELSE '45+' END END AS faixa FROM b)
--  SELECT jsonb_build_object('total',(SELECT count(*) FROM a),'today',(SELECT count(*) FROM a WHERE d=v_today),'last7',(SELECT count(*) FROM a WHERE d>v_today-7),'by_day',coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'n',n) ORDER BY d) FROM (SELECT d,count(*) n FROM a GROUP BY d)x),'[]'::jsonb),'by_city',coalesce((SELECT jsonb_agg(jsonb_build_object('k',k,'n',n,'n_declarada',nd,'n_estimada',ne) ORDER BY n DESC,k) FROM (SELECT coalesce(min(city),'(sem cidade)') k,count(*) n,count(*) FILTER (WHERE city IS NOT NULL AND NOT est) nd,count(*) FILTER (WHERE est) ne FROM a GROUP BY public.club_city_key(city) ORDER BY 2 DESC,1 LIMIT 10)x),'[]'::jsonb),'by_utm',coalesce((SELECT jsonb_agg(jsonb_build_object('k',utm,'n',n) ORDER BY n DESC,utm) FROM (SELECT utm,count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 20)x),'[]'::jsonb),'by_age',(SELECT jsonb_agg(jsonb_build_object('k',f,'n',(SELECT count(*) FROM a WHERE faixa=f)) ORDER BY o) FROM unnest(ARRAY['<18','18–24','25–34','35–44','45+','sem data']) WITH ORDINALITY AS t(f,o))) INTO v; RETURN v;
-- END $function$;
-- DROP FUNCTION public.clube_newgang_summary_refresh();
-- DROP FUNCTION public.clube_newgang_summary_compute(uuid);
-- DROP TABLE public.clube_newgang_summary_cache;
-- DROP INDEX public.lead_capture_clube_company_created_idx;
-- SELECT cron.unschedule('clube-newgang-summary-refresh');
