CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('admin','marketing_manager');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'')='true' $$;
CREATE FUNCTION public.row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1::text=coalesce(current_setting('test.company',true),'') $$;
CREATE TABLE meta_custom_audiences(id uuid,company_id uuid,filters jsonb);
CREATE TABLE events(slug text,company_id uuid);
CREATE TABLE lead_capture(id uuid DEFAULT gen_random_uuid(),email text,phone text,name text,company_id uuid,event_slug text,source text,consent_email boolean,consent_whatsapp boolean,created_at timestamptz DEFAULT now());
CREATE TABLE coala_list_consents(id uuid DEFAULT gen_random_uuid(),company_id uuid,email text,marketing_opt_in boolean,created_at timestamptz DEFAULT now());
CREATE TABLE suppressed_emails(email text,company_id uuid);
CREATE TABLE invite_members(email text);
CREATE VIEW coala_list_members AS SELECT email FROM lead_capture WHERE company_id='7d831e59-6e82-427b-95a0-64904aae5dd2' AND source IS DISTINCT FROM 'diag_test' UNION SELECT email FROM invite_members;
SELECT set_config('test.uid','11111111-1111-1111-1111-111111111111',false),set_config('test.admin','true',false),set_config('test.company','7d831e59-6e82-427b-95a0-64904aae5dd2',false),set_config('request.jwt.claims','{"role":"authenticated"}',false);
INSERT INTO events VALUES ('event1','7d831e59-6e82-427b-95a0-64904aae5dd2'),('event2','7d831e59-6e82-427b-95a0-64904aae5dd2'),('other','22222222-2222-2222-2222-222222222222');
INSERT INTO lead_capture(email,phone,company_id,event_slug,source,consent_email,consent_whatsapp,created_at) VALUES
 ('yes@test.invalid','351111','7d831e59-6e82-427b-95a0-64904aae5dd2','event1','form',true,false,now()-interval '2 days'),
 ('yes@test.invalid',null,'7d831e59-6e82-427b-95a0-64904aae5dd2','event1','form',false,false,now()),
 ('no@test.invalid',null,'7d831e59-6e82-427b-95a0-64904aae5dd2','event1','invite',true,true,now()),
 ('suppressed@test.invalid',null,'7d831e59-6e82-427b-95a0-64904aae5dd2','event2','form',true,false,now()-interval '20 days'),
 ('fallback@test.invalid','351222','7d831e59-6e82-427b-95a0-64904aae5dd2','event2','form',true,true,now()),
 ('stale@test.invalid',null,'7d831e59-6e82-427b-95a0-64904aae5dd2',null,'form',true,false,now()-interval '1 day'),
 ('stale@test.invalid',null,'7d831e59-6e82-427b-95a0-64904aae5dd2',null,'form',false,false,now()),
 ('other@test.invalid','999','22222222-2222-2222-2222-222222222222','other','form',true,true,now());
INSERT INTO coala_list_consents(company_id,email,marketing_opt_in,created_at) VALUES
 ('7d831e59-6e82-427b-95a0-64904aae5dd2','yes@test.invalid',false,now()-interval '1 day'),
 ('7d831e59-6e82-427b-95a0-64904aae5dd2','yes@test.invalid',true,now()),
 ('7d831e59-6e82-427b-95a0-64904aae5dd2','no@test.invalid',false,now());
INSERT INTO suppressed_emails VALUES ('SUPPRESSED@test.invalid',null),('fallback@test.invalid','22222222-2222-2222-2222-222222222222');
INSERT INTO invite_members VALUES ('missing@test.invalid');
CREATE TABLE expected(filter jsonb,result jsonb);
