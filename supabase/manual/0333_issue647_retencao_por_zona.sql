-- Classe R2 — PREPARADA, NÃO APLICADA. Issue #647 / E2b, Autorização 6642205078.
-- Ordem: depois da 0331, antes de instalar os crons. Instalar numa transação.
-- Apenas preparação; sem execução externa.
-- Decisão Pedro 04/11/2026, 6641273976: campanhas BR avaliadas pela LGPD, não pelo RGPD.
-- Jurídico LGPD e confirmação Pedro 6641501328 (04/11): identificadores aos 30 dias na zona
-- protegida e aos 90 dias no BR/restantes países; linha anonimizada 13 meses, hora arredondada;
-- agregados sem prazo. Não altera agregados, relatórios, refresh ou purge_song_link_events.

-- §1 — mesma normalização, 32 países protegidos e ISO-2 válidos de protected-zone.ts.
-- NULL, vazio, formato inválido e códigos desconhecidos fecham como protegidos.
CREATE OR REPLACE FUNCTION public.song_link_is_protected_zone(p_country text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $zone$
 WITH normalized AS (SELECT upper(btrim(coalesce(p_country,''))) AS code)
 SELECT CASE
  WHEN code='' OR code !~ '^[A-Z]{2}$' THEN true
  -- Os 249 ISO-2 canónicos distinguem desconhecidos (XX/ZZ) de países fora da zona.
  WHEN code <> ALL(string_to_array(
   'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW', ' ')) THEN true
  ELSE code = ANY(ARRAY['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'])
 END FROM normalized;
$zone$;
REVOKE ALL ON FUNCTION public.song_link_is_protected_zone(text) FROM PUBLIC, anon, authenticated;

-- §2 — troca da assinatura, mantendo o corpo da 0331 salvo prazos, guardas e bloqueio.
-- As linhas que podem entrar durante a função são recentes: created_at >= now() − 30 dias,
-- nunca elegíveis. Cobertura e UPDATE só tocam linhas antigas que a SLE não volta a escrever
-- (janelas operacionais <= 2 h). Bloquear a tabela travaria os inserts da SLE durante a função.
DROP FUNCTION public.anonymize_song_link_events(integer, integer);
CREATE OR REPLACE FUNCTION public.anonymize_song_link_events(p_days_protected integer DEFAULT 30, p_days_other integer DEFAULT 90, p_batch integer DEFAULT 20000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
AS $anon$
DECLARE v_count bigint; v_mark text := current_setting('song_link.retencao',true);
BEGIN
 IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_days_protected IS NULL OR p_days_protected<30 THEN RAISE EXCEPTION 'p_days_protected must be >= 30'; END IF;
 IF p_days_other IS NULL OR p_days_other<p_days_protected THEN RAISE EXCEPTION 'p_days_other must be >= p_days_protected'; END IF;
 IF p_batch IS NULL OR p_batch<1 THEN RAISE EXCEPTION 'p_batch must be positive'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.song_link_events e JOIN public.song_links sl ON sl.id=e.link_id
  WHERE e.created_at < now() - make_interval(days => CASE WHEN public.song_link_is_protected_zone(e.country) THEN p_days_protected ELSE p_days_other END) AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
    AND e.company_id IS NOT NULL AND e.artist_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.song_link_ident_daily_stats a
      WHERE a.company_id=e.company_id AND a.artist_id=e.artist_id
        AND a.dia=(e.created_at AT TIME ZONE 'Europe/Lisbon')::date AND a.link_id=e.link_id
        AND a.utm_campaign=coalesce(e.utm_campaign,'') AND a.utm_content=coalesce(e.utm_content,'')
        AND a.canal=public.song_link_event_canal(sl.canal,e.utm_source,e.utm_medium,e.utm_campaign))
 ) OR EXISTS (
  SELECT 1 FROM public.song_link_events e
  WHERE e.created_at < now() - make_interval(days => CASE WHEN public.song_link_is_protected_zone(e.country) THEN p_days_protected ELSE p_days_other END) AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
    AND e.company_id IS NOT NULL AND e.artist_id IS NOT NULL AND e.song_id IS NOT NULL
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%') AND e.event IN ('app_open','choice')
    AND NOT EXISTS (SELECT 1 FROM public.song_link_ident_daily_origins a
      WHERE a.company_id=e.company_id AND a.artist_id=e.artist_id AND a.song_id=e.song_id
        AND a.metric_day=(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
 ) THEN RAISE EXCEPTION 'retencao: missing daily aggregate coverage, including latest eligible day; run backfill/refresh before anonymizing'; END IF;
 PERFORM set_config('song_link.retencao','on',true);
 UPDATE public.song_link_events SET ip_hash=NULL,fbclid=NULL,ttclid=NULL,capi_fbp=NULL,capi_fbc=NULL,
   capi_external_id=NULL,event_id=NULL,arrival_event_id=NULL,created_at=date_trunc('hour',created_at)
 WHERE ctid IN (SELECT e.ctid FROM public.song_link_events e WHERE e.created_at < now() - make_interval(days => CASE WHEN public.song_link_is_protected_zone(e.country) THEN p_days_protected ELSE p_days_other END) AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
   ORDER BY e.created_at,e.id LIMIT p_batch);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 PERFORM set_config('song_link.retencao',coalesce(v_mark,''),true);
 RETURN v_count;
END $anon$;
REVOKE ALL ON FUNCTION public.anonymize_song_link_events(integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_song_link_events(integer,integer,integer) TO service_role;
COMMENT ON FUNCTION public.anonymize_song_link_events(integer,integer,integer) IS 'Só serviço; mínimo 30 dias protegidos e 90 por omissão nos restantes (LGPD BR); lote limitado; cobertura diária por zona; NULL dos oito IDs e hora UTC; linha 13 meses, agregados sem prazo; sem bloqueio explícito da tabela.';
