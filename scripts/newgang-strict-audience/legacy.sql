-- Legacy email history is evidence of email only, never a Meta grant.
ALTER TABLE club_member_email_consents DROP CONSTRAINT club_member_email_consents_version_check;
ALTER TABLE club_member_email_consents ADD CONSTRAINT club_member_email_consents_version_check CHECK(version IN ('email-v3','clube-newgang-v2','legacy-sem-versao'));
INSERT INTO club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key)
 VALUES('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','clube-newgang-v2','granted','club_session','33200000-0000-4000-8000-000000000040');
SELECT t.listck('explicit v2 email never grants Meta',NOT EXISTS(SELECT 1 FROM t.collect()));
INSERT INTO club_member_email_consents(member_id,site_id,company_id,version,decision,origin,idempotency_key)
 VALUES('33333333-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','legacy-sem-versao','granted','club_session','33200000-0000-4000-8000-000000000041');
SELECT t.listck('explicit unversioned email never grants Meta',NOT EXISTS(SELECT 1 FROM t.collect()));
DO $$ BEGIN
 BEGIN INSERT INTO club_members(site_id,company_id,email,first_name,referral_code,member_no,source)
 VALUES('33333333-0000-4000-8000-000000000001','7c858982-6ccd-47ca-bd65-e0dd3eebf01c',' MEMBER@EXAMPLE.INVALID ','Fixture','DUP332',99,'formulario'); RAISE EXCEPTION 'accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM t.listck('duplicate normalized email same site denied',true);
END $$;
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads"],"idempotency_key":"33200000-0000-4000-8000-000000000042"}');
INSERT INTO email_unsubscribe_tokens(token,email,company_id) VALUES('list-unsubscribe-fixture','member@example.invalid','7c858982-6ccd-47ca-bd65-e0dd3eebf01c');
SELECT email_unsubscribe_atomic('list-unsubscribe-fixture');
SELECT t.listck('unsubscribe email AND ads keeps strict list empty',NOT EXISTS(SELECT 1 FROM t.collect()) AND t.consent()#>>'{email,state}'='revoked' AND t.consent()#>>'{ads,meta_ads,state}'='revoked');
SELECT t.pref('{"channel":"ads","version":"anuncios-v1","granted":true,"platforms":["meta_ads"],"idempotency_key":"33200000-0000-4000-8000-000000000043"}');
SELECT t.listck('new ads optin never removes suppression',NOT EXISTS(SELECT 1 FROM t.collect()) AND EXISTS(SELECT 1 FROM suppressed_emails WHERE email='member@example.invalid' AND company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'));
