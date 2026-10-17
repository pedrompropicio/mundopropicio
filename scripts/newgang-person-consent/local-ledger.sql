-- Disposable PostgreSQL only; edge schemas are minimal fixtures, no egress.
CREATE SCHEMA extensions;
-- Crypto is a boundary stub only (production uses pgcrypto). Never a marketing network primitive.
CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat(md5(gen_random_uuid()::text),2),'hex') $$;
CREATE FUNCTION extensions.digest(v bytea,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat(md5(v),2),'hex') $$;
CREATE FUNCTION extensions.digest(v text,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT extensions.digest(convert_to(v,'UTF8'),algo) $$;
CREATE TABLE email_unsubscribe_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token text UNIQUE,email text,company_id uuid,used_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE suppressed_emails(id uuid DEFAULT gen_random_uuid(),email text,company_id uuid,reason text,UNIQUE(email,company_id));
CREATE TABLE marketing_consent_policies(portal text,policy_version text,valid_from timestamptz,valid_to timestamptz,ttl_days integer,PRIMARY KEY(portal,policy_version));
CREATE TABLE marketing_consent_subjects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,portal text,token_hash text UNIQUE);
CREATE TABLE marketing_consent_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,subject_id uuid REFERENCES marketing_consent_subjects(id),
 company_id uuid,portal text,state text,purpose text CHECK(purpose='meta_ads'),policy_version text,banner_version text,client_seq bigint,
 client_decided_at timestamptz,server_received_at timestamptz DEFAULT clock_timestamp(),idempotency_key uuid,origin text,path text,
 revision bigint,expected_revision bigint,UNIQUE(subject_id,idempotency_key),UNIQUE(subject_id,revision));
CREATE FUNCTION _marketing_consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append_only'; END $$;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON marketing_consent_events FOR EACH ROW EXECUTE FUNCTION _marketing_consent_append_only();
INSERT INTO marketing_consent_policies VALUES('newgang','2026-10-v1',now()-interval '1 day',null,180);
-- Load real effective() separately in the test runner, verbatim from 0175.