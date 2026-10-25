-- Teste A/B ios-btn-v1 — RASCUNHO, NÃO APLICADO. Aplicar só com "Sim" do Pedro.
DO $$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.song_link_event_claim(jsonb)'::regprocedure) <> 'b1bbf4ad0f9cd7a1c85f6930b3404dbc'
 THEN RAISE EXCEPTION 'source_drift_ab_ios_btn_v1'; END IF;
END $$;

ALTER TABLE public.song_link_events
  ADD COLUMN ab_variant text CHECK (ab_variant IN ('A','B','A_forcado','B_forcado'));
COMMENT ON COLUMN public.song_link_events.ab_variant IS
  'Teste ios-btn-v1: A=página atual, B=botão topo; *_forcado = ?ab= manual (fora da taxa). NULL fora de iOS/janela.';

CREATE OR REPLACE FUNCTION public.song_link_event_claim(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE r public.song_link_events; claimed uuid;
BEGIN
 r := jsonb_populate_record(NULL::public.song_link_events,p_payload);
 INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,mode,destination,opened,event_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,ttclid,country,region,city,device,os,in_app_browser,ip_hash,origin,capi_status,tiktok_status,ab_variant)
 VALUES(r.link_id,r.company_id,r.artist_id,r.song_id,r.event,r.mode,r.destination,r.opened,r.event_id,r.utm_source,r.utm_medium,r.utm_campaign,r.utm_content,r.utm_term,r.fbclid,r.ttclid,r.country,r.region,r.city,r.device,r.os,r.in_app_browser,r.ip_hash,r.origin,'pendente','pendente',r.ab_variant)
 ON CONFLICT (event_id,event) WHERE event_id IS NOT NULL AND created_at >= '2026-10-10 00:00+00'::timestamptz DO NOTHING
 RETURNING id INTO claimed;
 RETURN claimed;
END $function$;
