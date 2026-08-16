alter table public.fever_sync_config
  add column if not exists client_version text;
comment on column public.fever_sync_config.client_version is
  'Header X-Client-Version enviado à API Fever. NULL = usa o default do código. Atualizado automaticamente pelo auto-bump quando a Fever responde 412 MIN_VERSION_REQUIREMENT.';

alter table public.fever_sync_runs
  add column if not exists client_version_used text;
comment on column public.fever_sync_runs.client_version_used is
  'Versão de cliente que a Fever aceitou nesta corrida. Permite ver quando o auto-bump atuou.';

update public.fever_sync_config
   set client_version = 'w.13.0.0'
 where client_version is null;