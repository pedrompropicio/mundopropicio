BEGIN;
ALTER TABLE events ADD COLUMN id uuid;
ALTER TABLE lead_capture ADD COLUMN raw jsonb DEFAULT '{}';
INSERT INTO events(slug,company_id,id) VALUES ('newgang-festival-2027','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','407f43fc-790f-4ea7-8b2a-4162805dfb16');
INSERT INTO meta_custom_audiences VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','{"source":"newgang_clube:v2","replace":true}');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO lead_capture(email,phone,company_id,event_slug,consent_email,raw,created_at) VALUES
 (' V2@test.invalid ','351111','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now()-interval '2 days'),
 ('v2@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('v1@test.invalid','351222','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v1"}',now()),
 ('denied@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',false,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('suppressed@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('global@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('withdrawn@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now()-interval '1 day'),
 ('withdrawn@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang-festival-2027',false,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('wrong-event@test.invalid',NULL,'7c858982-6ccd-47ca-bd65-e0dd3eebf01c','other-event',true,'{"consent_text_version":"clube-newgang-v2"}',now()),
 ('wrong-company@test.invalid',NULL,'7d831e59-6e82-427b-95a0-64904aae5dd2','newgang-festival-2027',true,'{"consent_text_version":"clube-newgang-v2"}',now());
INSERT INTO suppressed_emails VALUES ('SUPPRESSED@test.invalid','7c858982-6ccd-47ca-bd65-e0dd3eebf01c'),('global@test.invalid',NULL),('v2@test.invalid','7d831e59-6e82-427b-95a0-64904aae5dd2');
DO $$ DECLARE actual jsonb; BEGIN
 SELECT jsonb_agg(to_jsonb(r) ORDER BY email) INTO actual FROM crm_meta_audience_collect_leads('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') r;
 IF actual IS DISTINCT FROM '[{"email":"v2@test.invalid","phone":"351111"}]'::jsonb THEN RAISE EXCEPTION 'Newgang eligibility/normalization/phone/suppression failed'; END IF;
 UPDATE meta_custom_audiences SET company_id='7d831e59-6e82-427b-95a0-64904aae5dd2' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 BEGIN PERFORM * FROM crm_meta_audience_collect_leads('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); RAISE EXCEPTION 'mismatch accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'source_company_mismatch' THEN RAISE; END IF; END;
 UPDATE meta_custom_audiences SET company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 PERFORM set_config('test.uid','11111111-1111-1111-1111-111111111111',true);
 PERFORM set_config('test.company','7c858982-6ccd-47ca-bd65-e0dd3eebf01c',true);
 IF (SELECT count(*) FROM crm_meta_audience_collect_leads('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) <> 1 THEN RAISE EXCEPTION 'authorized admin failed'; END IF;
 PERFORM set_config('test.company','7d831e59-6e82-427b-95a0-64904aae5dd2',true);
 BEGIN PERFORM * FROM crm_meta_audience_collect_leads('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); RAISE EXCEPTION 'tenant accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
 RAISE NOTICE 'Newgang v2 eligibility, v1/false/withdrawal/suppression/company/event, phone, admin and tenant passed';
END $$;
ROLLBACK;
