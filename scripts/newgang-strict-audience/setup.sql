-- Disposable PostgreSQL fixtures, never used in Live.
ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS event_slug text;
ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS consent_email boolean;
ALTER TABLE lead_capture ADD COLUMN IF NOT EXISTS consent_whatsapp boolean;
CREATE TABLE meta_custom_audiences(id uuid PRIMARY KEY,company_id uuid,filters jsonb);
CREATE TABLE coala_list_consents(id uuid DEFAULT gen_random_uuid(),company_id uuid,email text,marketing_opt_in boolean,created_at timestamptz DEFAULT now());
CREATE VIEW coala_list_members AS SELECT email FROM lead_capture WHERE company_id='7d831e59-6e82-427b-95a0-64904aae5dd2';
-- Fixture portal is updated to the canonical domain only for this strict collector test.
UPDATE portal_sites SET domain='legacy-fixture.invalid' WHERE domain='newgangfestival.pt';
UPDATE portal_sites SET domain='newgangfestival.pt' WHERE id='33333333-0000-4000-8000-000000000001';
INSERT INTO meta_custom_audiences VALUES('33200000-0000-4000-8000-000000000010','7c858982-6ccd-47ca-bd65-e0dd3eebf01c','{"source":"newgang_clube:v2","replace":true}');
CREATE FUNCTION t.listck(n text,b boolean) RETURNS void LANGUAGE sql AS $$ SELECT t.ok('332list',n,b) $$;
SET request.jwt.claims='{"role":"service_role"}';
