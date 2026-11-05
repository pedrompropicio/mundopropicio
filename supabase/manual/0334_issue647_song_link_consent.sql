-- 0334 — Issue #647-d, autorização 6642205078. R2: PREPARADA, NÃO APLICADA.
-- Ordem da janela: aplicar e provar 0334 ANTES do deploy song-link-event.
-- Sem backfill/default: NULL nas linhas antigas significa antes do 647-d.
BEGIN;

-- §1 — estado, versão do aviso e instante da decisão (relógio do servidor).
ALTER TABLE public.song_link_events
  ADD COLUMN consent_status text,
  ADD COLUMN consent_version text,
  ADD COLUMN consent_at timestamptz;
ALTER TABLE public.song_link_events ADD CONSTRAINT song_link_events_consent_status_check
  CHECK (consent_status IS NULL OR consent_status IN ('pending','granted','denied','not_applicable')) NOT VALID;
ALTER TABLE public.song_link_events VALIDATE CONSTRAINT song_link_events_consent_status_check;

-- O slot actual (0209) só aceita ListenClick/CompleteRegistration. ViewContent
-- precisa de um slot distinto: não pode consumir o das aberturas da chegada.
ALTER TABLE public.song_link_delivery_slots DROP CONSTRAINT song_link_delivery_slots_event_name_check;
ALTER TABLE public.song_link_delivery_slots ADD CONSTRAINT song_link_delivery_slots_event_name_check
  CHECK (event_name IN ('ListenClick','CompleteRegistration','ViewContent')) NOT VALID;
ALTER TABLE public.song_link_delivery_slots VALIDATE CONSTRAINT song_link_delivery_slots_event_name_check;

-- §2 — medição própria desde o primeiro dia; 0333 ainda não está em main.
-- Lista inline idêntica a _shared/protected-zone.ts, incluindo ISO/desconhecidos.
CREATE FUNCTION public.song_link_consent_daily(p_artist_id uuid, p_from date, p_to date)
RETURNS TABLE(dia date, zona text, consent_status text, chegadas bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  -- Guarda canónica de artist_song_link_stats (0299); executada mesmo sem eventos.
  v_company := public.artist_access_check(p_artist_id,'read','songs');
  RETURN QUERY
  SELECT (e.created_at AT TIME ZONE 'Europe/Lisbon')::date,
    CASE WHEN e.country IS NULL
      OR upper(btrim(e.country)) IN ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH')
      OR upper(btrim(e.country)) NOT IN ('AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW')
      THEN 'protegida'::text ELSE 'fora'::text END,
    e.consent_status,
    count(*) FILTER (WHERE e.event = 'arrival')
  FROM public.song_link_events e
  WHERE e.artist_id = p_artist_id AND e.company_id = v_company
    AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
    AND e.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
  GROUP BY 1,2,3
  ORDER BY 1,2,3;
END;
$function$;
ALTER FUNCTION public.song_link_consent_daily(uuid,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.song_link_consent_daily(uuid,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.song_link_consent_daily(uuid,date,date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_consent_daily(uuid,date,date) TO authenticated, service_role;
-- Mesmo role técnico opcional da 0299: não criar roles na homologação.
DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_sfohvvlqccmmebvjgibx') THEN
    GRANT EXECUTE ON FUNCTION public.song_link_consent_daily(uuid,date,date) TO sandbox_exec_sfohvvlqccmmebvjgibx;
  END IF;
END;
$acl$;
COMMENT ON FUNCTION public.song_link_consent_daily(uuid,date,date) IS
  '#647-d: chegadas por dia Europe/Lisbon, zona e consentimento; NULL = antes do 647-d.';
COMMIT;
