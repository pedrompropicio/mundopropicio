-- Stub local do Vault para testes (PG descartável sem supabase_vault).
-- Chave de teste fixa e sem valor real; em Live a chave é gerada dentro da base via vault.create_secret.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES('club_whatsapp_hmac_key','fixture-local-hmac-key');
