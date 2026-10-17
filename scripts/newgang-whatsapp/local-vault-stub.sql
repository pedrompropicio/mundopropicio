-- Stub local do Vault para testes (PG descartável sem supabase_vault).
-- Chave de teste fixa e sem valor real; em Live a chave é gerada dentro da base via vault.create_secret.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES('club_whatsapp_hmac_key','fixture-local-hmac-key');
-- Stub de extensions.hmac (o harness local só instala plpgsql; Live tem pgcrypto real).
-- Determinístico e com 64 hex chars, como o HMAC-SHA256 real; sem valor criptográfico.
CREATE OR REPLACE FUNCTION extensions.hmac(v bytea,k bytea,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat(md5(k::text||v::text),2),'hex') $$;
CREATE OR REPLACE FUNCTION extensions.hmac(v text,k text,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT extensions.hmac(convert_to(v,'UTF8'),convert_to(k,'UTF8'),algo) $$;
SELECT t.ok('332w','stub hmac present', extensions.hmac('a','b','sha256') IS NOT NULL);
