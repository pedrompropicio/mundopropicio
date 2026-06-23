create table if not exists crm.audience_duel_runs (
  id uuid primary key default gen_random_uuid(),
  briefing jsonb not null,
  evidencia jsonb,
  prompt text not null,
  gemini_model text,
  gemini_proposal jsonb,
  gemini_error text,
  gpt_model text,
  gpt_proposal jsonb,
  gpt_error text,
  created_at timestamptz not null default now()
);

grant select, insert on crm.audience_duel_runs to service_role;

alter table crm.audience_duel_runs enable row level security;

drop policy if exists "service_role_bypass" on crm.audience_duel_runs;
create policy "service_role_bypass"
  on crm.audience_duel_runs
  for all
  to service_role
  using (true)
  with check (true);