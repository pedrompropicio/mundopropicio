-- Registo de erros do portal público (Coala Portal).
-- O browser anónimo ESCREVE e nunca LÊ — mesmo molde de lead_capture.
-- Aplicada em Live a 23/09/2026; este ficheiro existe para reconstrução.

create table if not exists public.portal_error_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  company_id  uuid,
  boundary    text,
  message     text not null,
  stack       text,
  route       text,
  url         text,
  referrer    text,
  user_agent  text,
  constraint portal_error_log_message_len check (char_length(message) <= 2000),
  constraint portal_error_log_stack_len   check (char_length(coalesce(stack, '')) <= 8000),
  constraint portal_error_log_url_len     check (char_length(coalesce(url, '')) <= 2000)
);

create index if not exists portal_error_log_created_at_idx
  on public.portal_error_log (created_at desc);

alter table public.portal_error_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_error_log'
      and policyname = 'portal_error_log_anon_insert'
  ) then
    create policy portal_error_log_anon_insert
      on public.portal_error_log for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

-- Os privilégios por omissão dão SELECT a anon/authenticated em tabelas novas.
-- Fecha-se explicitamente: escrever sim, ler não.
revoke all on public.portal_error_log from public;
grant insert on public.portal_error_log to anon, authenticated;
revoke select, update, delete, truncate, references, trigger
  on public.portal_error_log from anon, authenticated;
grant select, insert, update, delete on public.portal_error_log to service_role;