alter table public.fever_sync_config
  add column if not exists ingest_secret text not null default gen_random_uuid()::text;
comment on column public.fever_sync_config.ingest_secret is
  'Segredo do bookmarklet de ingestão via browser. Enviado no header x-ingest-secret para a função fever-ingest-browser. Rotacionável.';

update public.fever_sync_config set client_version = 'w.12.1.0' where client_version = 'w.13.0.0';