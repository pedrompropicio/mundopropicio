-- PROPOSTA INERTE. Não aplicar sem OK explícito do Pedro.
-- Aplicação futura exclusivamente pelo mecanismo oficial de migrações.
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.song_link_event_claim(jsonb)'::regprocedure)) <> '0fa7ff7255cf58ace770d21abfabe2e1' THEN
  RAISE EXCEPTION 'canonical claim source changed' USING ERRCODE='55000';
 END IF;
END $$;
ALTER TABLE public.song_link_events ADD COLUMN arrival_event_id text;
ALTER TABLE public.song_link_events ADD CONSTRAINT song_link_choice_arrival_check
 CHECK (arrival_event_id IS NULL OR (event='choice' AND destination IS NOT NULL
 AND arrival_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
CREATE UNIQUE INDEX song_link_choice_arrival_destination_uidx
 ON public.song_link_events(link_id,arrival_event_id,destination)
 WHERE event='choice' AND arrival_event_id IS NOT NULL;
-- No historical backfill; old choices remain unlinked and unchanged.
-- This wrapper leaves the canonical claim body, owner and ACL untouched.
CREATE FUNCTION public.song_link_choice_claim(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.song_link_events; l public.song_links; claimed uuid;
 aid text := lower(p_payload->>'arrival_event_id');
 dest text := p_payload->>'destination';
BEGIN
 IF p_payload->>'event' IS DISTINCT FROM 'choice'
 OR p_payload->>'origin' IS DISTINCT FROM 'browser'
 OR aid IS NULL OR aid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR dest IS NULL OR dest='' OR length(dest)>60
 OR (p_payload->>'event_id') IS NULL
 OR (p_payload->>'event_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'invalid_choice' USING ERRCODE='22023';
 END IF;
 SELECT * INTO l FROM public.song_links WHERE id=(p_payload->>'link_id')::uuid AND active;
 IF NOT FOUND OR NOT (l.destinations ? dest) OR
 NOT (nullif(l.destinations->dest->>'app','') IS NOT NULL OR nullif(l.destinations->dest->>'web','') IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_destination' USING ERRCODE='22023';
 END IF;
 SELECT * INTO a FROM public.song_link_events
 WHERE event_id=aid AND event='arrival' AND origin='ssr' AND link_id=l.id
 AND company_id IS NOT DISTINCT FROM l.company_id
 AND created_at>clock_timestamp()-interval '2 hours' AND created_at<=clock_timestamp()
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR a.created_at<=clock_timestamp()-interval '2 hours' THEN
  RAISE EXCEPTION 'invalid_arrival' USING ERRCODE='42501';
 END IF;
 -- Re-check age after acquiring the row lock; concurrent requests serialize here.
 IF EXISTS (SELECT 1 FROM public.song_link_events WHERE link_id=l.id
 AND arrival_event_id=aid AND event='choice' AND destination=dest) THEN RETURN NULL; END IF;
 -- Identity always from server-resolved link/arrival, never from client fields.
 claimed := public.song_link_event_claim(p_payload || jsonb_build_object(
  'link_id',l.id,'company_id',l.company_id,'artist_id',l.artist_id,'song_id',l.song_id,
  'utm_source',a.utm_source,'utm_medium',a.utm_medium,'utm_campaign',a.utm_campaign,
  'utm_content',a.utm_content,'utm_term',a.utm_term));
 IF claimed IS NOT NULL THEN
  UPDATE public.song_link_events SET arrival_event_id=aid WHERE id=claimed;
 END IF;
 RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION public.song_link_choice_claim(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_choice_claim(jsonb) TO service_role;
