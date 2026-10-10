ALTER TABLE public.song_link_events ADD COLUMN origin text NOT NULL DEFAULT 'browser';
ALTER TABLE public.song_link_events ADD CONSTRAINT song_link_events_origin_check CHECK (origin IN ('browser','ssr'));
CREATE UNIQUE INDEX song_link_events_event_id_event_recent_uidx ON public.song_link_events(event_id,event) WHERE event_id IS NOT NULL AND created_at >= '2026-10-10 00:00+00'::timestamptz;
ALTER TABLE public.song_link_diag DROP CONSTRAINT song_link_diag_kind_check;
ALTER TABLE public.song_link_diag ADD CONSTRAINT song_link_diag_kind_check CHECK (kind IN ('shown','tap_button','tap_other','hidden','visible','pagehide','redirect','prefetch'));
-- Atomic claim before external delivery. Historical duplicates remain untouched.
CREATE OR REPLACE FUNCTION public.song_link_event_claim(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.song_link_events; claimed uuid;
BEGIN
 r := jsonb_populate_record(NULL::public.song_link_events,p_payload);
 INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,mode,destination,opened,event_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,ttclid,country,region,city,device,os,in_app_browser,ip_hash,origin,capi_status,tiktok_status)
 VALUES(r.link_id,r.company_id,r.artist_id,r.song_id,r.event,r.mode,r.destination,r.opened,r.event_id,r.utm_source,r.utm_medium,r.utm_campaign,r.utm_content,r.utm_term,r.fbclid,r.ttclid,r.country,r.region,r.city,r.device,r.os,r.in_app_browser,r.ip_hash,r.origin,'pendente','pendente')
 ON CONFLICT (event_id,event) WHERE event_id IS NOT NULL AND created_at >= '2026-10-10 00:00+00'::timestamptz DO NOTHING
 RETURNING id INTO claimed;
 RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION public.song_link_event_claim(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_event_claim(jsonb) TO service_role;