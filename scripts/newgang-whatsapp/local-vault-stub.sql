-- Stub local para testes (PG descartável): chave HMAC de teste em app_secrets (sem valor real)
-- e stub de extensions.hmac (o harness local só instala plpgsql; Live tem pgcrypto real).
-- Em Live a chave é gerada dentro da base via gen_random_bytes e nunca exibida.
INSERT INTO public.app_secrets(name,value,description)
 SELECT 'club_whatsapp_hmac_key','fixture-local-hmac-key','stub local de teste'
 WHERE NOT EXISTS (SELECT 1 FROM public.app_secrets WHERE name='club_whatsapp_hmac_key');
CREATE OR REPLACE FUNCTION extensions.hmac(v bytea,k bytea,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat(md5(k::text||v::text),2),'hex') $$;
CREATE OR REPLACE FUNCTION extensions.hmac(v text,k text,algo text) RETURNS bytea LANGUAGE sql AS $$ SELECT extensions.hmac(convert_to(v,'UTF8'),convert_to(k,'UTF8'),algo) $$;
SELECT t.ok('332w','stub hmac present', extensions.hmac('a','b','sha256') IS NOT NULL);
