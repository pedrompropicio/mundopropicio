-- #332 imediato: DDL apenas, sem backfill/envios; cron existente preservado.
ALTER TABLE public.club_welcome_reservations
 ADD COLUMN attempt_count integer NOT NULL DEFAULT 1,
 ADD COLUMN next_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.club_welcome_reserve(p_company_id uuid, p_site_id uuid, p_member_id uuid, p_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF p_message_id IS DISTINCT FROM ('ng-welcome-'||p_member_id::text) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_members m JOIN public.portal_sites s ON s.id=m.site_id
      WHERE m.id=p_member_id AND m.site_id=p_site_id AND s.company_id=p_company_id) THEN RETURN false; END IF;
  -- Histórico sem reserva = legado; resultados que chegaram ao provedor nunca são repetidos.
  IF EXISTS (SELECT 1 FROM public.email_send_log WHERE template_name='newgang_club_welcome'
      AND metadata->>'member_id'=p_member_id::text
      AND (status IS DISTINCT FROM 'pending' OR NOT EXISTS (
        SELECT 1 FROM public.club_welcome_reservations WHERE member_id=p_member_id))) THEN
    INSERT INTO public.club_welcome_reservations(member_id,site_id,company_id,message_id,status)
    VALUES(p_member_id,p_site_id,p_company_id,p_message_id,'legacy_sent') ON CONFLICT DO NOTHING;
    RETURN false;
  END IF;
  INSERT INTO public.club_welcome_reservations AS r(member_id,site_id,company_id,message_id)
    VALUES(p_member_id,p_site_id,p_company_id,p_message_id)
  ON CONFLICT(member_id) DO UPDATE SET status='reserved',attempt_count=r.attempt_count+1,
    next_attempt_at=NULL,updated_at=clock_timestamp()
  WHERE r.status='error_pre_send' AND r.attempt_count<3
    AND r.site_id=p_site_id AND r.company_id=p_company_id AND r.message_id=p_message_id
    AND coalesce(r.next_attempt_at,r.updated_at+interval '5 minutes')<=clock_timestamp()
  RETURNING true INTO v_ok;
  RETURN coalesce(v_ok,false);
END $$;

CREATE OR REPLACE FUNCTION public.club_welcome_mark(p_member_id uuid,p_status text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_status NOT IN ('enqueued','error_pre_send','unknown') OR p_status IS NULL THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE public.club_welcome_reservations SET status=p_status,error=left(p_error,300),updated_at=clock_timestamp(),
    next_attempt_at=CASE WHEN p_status='error_pre_send' AND attempt_count<3 THEN clock_timestamp()+interval '5 minutes' END
  WHERE member_id=p_member_id AND (status='reserved' OR (status='unknown' AND p_status='enqueued'));
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n>0;
END $$;
REVOKE ALL ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.club_welcome_mark(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.club_welcome_reserve(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.club_welcome_mark(uuid,text,text) TO service_role;
COMMENT ON TABLE public.club_welcome_reservations IS '#332: 1 welcome/membro; até3 tentativas comprovadamente pré-fila, intervalo5min; unknown nunca repetido automaticamente.';

CREATE FUNCTION public._club332_ingest_immediate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;
BEGIN
  -- Isolamento: só a linha recém-inserida; collector/processed triggers são os existentes.
  BEGIN
    r:=public.crm_ingest_lead_captures(1,ARRAY[NEW.id]);
    RAISE LOG 'club332_immediate capture=% processed=% errors=%',NEW.id,r->>'processed',r->>'errors';
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    RAISE WARNING 'club332_immediate capture=% state=%',NEW.id,SQLSTATE;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._club332_ingest_immediate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_club332_ingest_immediate AFTER INSERT ON public.lead_capture
 FOR EACH ROW WHEN (NEW.source='clube_newgang' AND NEW.processed=false)
 EXECUTE FUNCTION public._club332_ingest_immediate();

CREATE FUNCTION public.club_pending_capture_exists(p_site_id uuid,p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.lead_capture lc JOIN public.portal_sites s ON s.company_id=lc.company_id
  WHERE s.id=p_site_id AND s.brand_key='newgang' AND s.active
    AND lc.source='clube_newgang' AND lc.processed=false
    AND lower(btrim(lc.email))=lower(btrim(p_email))
    AND lc.created_at>=now()-interval '30 minutes' AND lc.created_at<=now())
$$;
REVOKE ALL ON FUNCTION public.club_pending_capture_exists(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.club_pending_capture_exists(uuid,text) TO service_role;