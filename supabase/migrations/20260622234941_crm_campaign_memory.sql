-- MP Audience — memória de campanhas: tabelas de output do job de destilação.
-- Guardam campanhas Meta já maduras (ou provisórias) ao nível de campanha e de
-- adset, para servirem de contexto/limites ao gerador de estratégia.
-- Segue o padrão RLS/GRANTs das restantes tabelas crm (ver
-- crm.campaign_diagnosis_360 e crm.meta_campaign_diagnoses): service_role_bypass
-- + tenant_isolation_select por current_company_id().

create table if not exists crm.campaign_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_id uuid,
  external_campaign_id text not null,
  campaign_name text,
  artist text,
  market_scope text not null,
  market_country text,
  currency text,
  days_before_event int,
  objective text,
  structure text,
  n_adsets int,
  spend_cents bigint,
  revenue_cents bigint,
  purchases bigint,
  roas numeric,
  roas_source text not null default 'meta',
  verdict text,
  diagnosis_class text,
  is_provisional boolean not null default false,
  matured_at timestamptz,
  distilled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_memory_uq unique (company_id, external_campaign_id),
  constraint campaign_memory_market_scope_chk check (market_scope in ('PT','BR')),
  constraint campaign_memory_roas_source_chk check (roas_source in ('meta','ticketline_reconciled')),
  constraint campaign_memory_verdict_chk check (verdict is null or verdict in ('positivo','neutro','fraco')),
  constraint campaign_memory_structure_chk check (structure is null or structure in ('ABO','CBO'))
);

create table if not exists crm.campaign_memory_element (
  id uuid primary key default gen_random_uuid(),
  campaign_memory_id uuid not null references crm.campaign_memory(id) on delete cascade,
  external_adset_id text not null,
  adset_name text,
  audience_archetype text,
  audience_key text,
  optimization_goal text,
  daily_budget_cents bigint,
  spend_cents bigint,
  revenue_cents bigint,
  roas numeric,
  verdict text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_memory_element_uq unique (campaign_memory_id, external_adset_id),
  constraint campaign_memory_element_archetype_chk check (audience_archetype is null or audience_archetype in ('advantage_plus','interesse','lookalike','retargeting','broad')),
  constraint campaign_memory_element_verdict_chk check (verdict is null or verdict in ('positivo','neutro','fraco'))
);

create index if not exists idx_campaign_memory_scope on crm.campaign_memory (market_scope);
create index if not exists idx_campaign_memory_company on crm.campaign_memory (company_id);
create index if not exists idx_campaign_memory_event on crm.campaign_memory (event_id);
create index if not exists idx_campaign_memory_verdict on crm.campaign_memory (verdict);
create index if not exists idx_cme_parent on crm.campaign_memory_element (campaign_memory_id);
create index if not exists idx_cme_archetype on crm.campaign_memory_element (audience_archetype);

alter table crm.campaign_memory enable row level security;
alter table crm.campaign_memory_element enable row level security;

drop policy if exists service_role_bypass on crm.campaign_memory;
drop policy if exists tenant_isolation_select on crm.campaign_memory;
drop policy if exists service_role_bypass on crm.campaign_memory_element;
drop policy if exists tenant_isolation_select on crm.campaign_memory_element;

create policy service_role_bypass on crm.campaign_memory
  as permissive for all to service_role using (true) with check (true);
create policy tenant_isolation_select on crm.campaign_memory
  for select to authenticated using (company_id = current_company_id());

create policy service_role_bypass on crm.campaign_memory_element
  as permissive for all to service_role using (true) with check (true);
create policy tenant_isolation_select on crm.campaign_memory_element
  for select to authenticated using (
    exists (
      select 1 from crm.campaign_memory cm
      where cm.id = campaign_memory_element.campaign_memory_id
        and cm.company_id = current_company_id()
    )
  );

grant usage on schema crm to service_role, authenticated;
grant select on crm.campaign_memory to authenticated;
grant select on crm.campaign_memory_element to authenticated;
grant all on crm.campaign_memory to service_role;
grant all on crm.campaign_memory_element to service_role;
