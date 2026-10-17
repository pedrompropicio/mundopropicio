-- Isolated PG17: actual reservation/pending/trigger SQL; collector tested separately below.
CREATE TABLE public.email_send_log(template_name text,metadata jsonb,status text,company_id uuid,message_id text,created_at timestamptz DEFAULT now());
\ir ../../drizzle/migrations/0170_issue321_club_welcome_reservation.sql
\ir ../../drizzle/migrations/0171_issue321_club_welcome_reserve_fix_site_table.sql
\ir ../../drizzle/migrations/0169_issue321_crm_ingest_counters_on_success.sql
ALTER TABLE public.contacts ADD COLUMN phone_e164 text, ADD COLUMN name text,
 ADD COLUMN last_activity_at timestamptz, ADD COLUMN updated_at timestamptz,
 ADD COLUMN consent_email boolean, ADD COLUMN consent_whatsapp boolean,
 ADD COLUMN consent_email_at timestamptz, ADD COLUMN consent_whatsapp_at timestamptz,
 ADD COLUMN source text, ADD COLUMN first_seen_at timestamptz;
ALTER TABLE public.lead_capture ADD COLUMN processing_error text, ADD COLUMN processed_at timestamptz,
 ADD COLUMN consent_email boolean, ADD COLUMN consent_whatsapp boolean, ADD COLUMN event_slug text,
 ADD COLUMN utm_source text, ADD COLUMN utm_medium text, ADD COLUMN utm_campaign text, ADD COLUMN utm_content text,
 ADD COLUMN ip_inet inet, ADD COLUMN user_agent text, ADD COLUMN fbc text, ADD COLUMN fbp text,
 ADD COLUMN geo_country text, ADD COLUMN geo_city text, ADD COLUMN geo_region text;
CREATE TABLE public.leads(id uuid DEFAULT gen_random_uuid(),company_id uuid,contact_id uuid,event_id uuid,
 kind text,source text,utm_source text,utm_medium text,utm_campaign text,utm_content text,
 ip_inet inet,user_agent text,fbc text,fbp text,geo_country text,geo_city text,geo_region text,
 created_at timestamptz,meta jsonb,capi_status text,capi_block_reason text,capi_classified_at timestamptz);
\ir ../../supabase/manual/20261017_issue332_immediate.PENDENTE.sql
CREATE FUNCTION public.t332_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE TEMP TABLE base_points AS SELECT md5(coalesce(string_agg(row_to_json(p)::text,'|' ORDER BY id),'')) h FROM club_points p;
-- Use real member/processed trigger with no net schema: HTTP boundary deliberately unavailable.
-- trg_club_from_lead_capture already installed by canonical0120.
DO $$
DECLARE co uuid:='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'; s uuid; m uuid; lc uuid; r jsonb;
BEGIN
 INSERT INTO companies(id,name) VALUES(co,'Local test') ON CONFLICT DO NOTHING;
 INSERT INTO portal_sites(company_id,brand_key,domain,active) VALUES(co,'newgang','newgangfestival.pt',true) RETURNING id INTO s;
 INSERT INTO lead_capture(company_id,source,email) VALUES(co,'clube_newgang',' T332@EXAMPLE.INVALID ') RETURNING id INTO lc;
 SELECT id INTO m FROM club_members WHERE site_id=s AND email='t332@example.invalid';
 PERFORM t332_assert(m IS NOT NULL,'canonical collector creates member at insert');
 PERFORM t332_assert((SELECT processed FROM lead_capture WHERE id=lc),'processed immediately');
 PERFORM t332_assert((SELECT capi_status='blocked_no_consent' FROM leads WHERE meta->>'lead_capture_id'=lc::text),'CAPI unchanged');
 PERFORM t332_assert(club_welcome_reserve(co,s,m,'ng-welcome-'||m),'first reserve');
 PERFORM t332_assert(NOT club_welcome_reserve(co,s,m,'ng-welcome-'||m),'concurrent reserve blocked');
 PERFORM club_welcome_mark(m,'error_pre_send','session_insert_failed');
 PERFORM t332_assert(NOT club_welcome_reserve(co,s,m,'ng-welcome-'||m),'5min cooldown');
 UPDATE club_welcome_reservations SET next_attempt_at=now()-interval '1 sec' WHERE member_id=m;
 PERFORM t332_assert(club_welcome_reserve(co,s,m,'ng-welcome-'||m),'safe retry2');
 PERFORM club_welcome_mark(m,'error_pre_send','session_insert_failed');
 UPDATE club_welcome_reservations SET next_attempt_at=now()-interval '1 sec' WHERE member_id=m;
 PERFORM t332_assert(club_welcome_reserve(co,s,m,'ng-welcome-'||m),'safe retry3');
 PERFORM club_welcome_mark(m,'error_pre_send','session_insert_failed');
 UPDATE club_welcome_reservations SET next_attempt_at=now()-interval '1 sec' WHERE member_id=m;
 PERFORM t332_assert(NOT club_welcome_reserve(co,s,m,'ng-welcome-'||m),'fourth attempt blocked');
 UPDATE club_welcome_reservations SET status='unknown' WHERE member_id=m;
 PERFORM t332_assert(NOT club_welcome_reserve(co,s,m,'ng-welcome-'||m),'unknown blocked');
 INSERT INTO lead_capture(company_id,source,email) VALUES(co,'clube_newgang','t332@example.invalid');
 PERFORM t332_assert((SELECT count(*)=1 FROM club_members WHERE site_id=s AND email='t332@example.invalid'),'repeat member not duplicated');
 INSERT INTO lead_capture(company_id,source,email) VALUES(co,'portal','other@example.invalid') RETURNING id INTO lc;
 PERFORM t332_assert(NOT (SELECT processed FROM lead_capture WHERE id=lc),'other source not processed');
 INSERT INTO lead_capture(company_id,source,email) VALUES(co,'clube_newgang','') RETURNING id INTO lc;
 PERFORM t332_assert(NOT (SELECT processed FROM lead_capture WHERE id=lc),'failed ingestion persisted pending');
 -- Pending reads need a failed collector path, not a duplicate rule implementation.
 ALTER TABLE portal_sites DISABLE TRIGGER USER;
 UPDATE portal_sites SET active=false WHERE id=s;
 INSERT INTO lead_capture(company_id,source,email) VALUES(co,'clube_newgang','pending@example.invalid');
 UPDATE portal_sites SET active=true WHERE id=s;
 PERFORM t332_assert(club_pending_capture_exists(s,' PENDING@EXAMPLE.INVALID '),'pending normalized');
 UPDATE lead_capture SET created_at=now()-interval '31 minutes' WHERE email='pending@example.invalid';
 PERFORM t332_assert(NOT club_pending_capture_exists(s,'pending@example.invalid'),'pending older than30min rejected');
 PERFORM t332_assert((SELECT h FROM base_points)=(SELECT md5(coalesce(string_agg(row_to_json(p)::text,'|' ORDER BY id),'')) FROM club_points p),'points unchanged');
END $$;