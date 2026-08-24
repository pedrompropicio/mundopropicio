alter table public.event_zone_capacities
  add column if not exists capacity_kind text not null default 'released',
  add column if not exists source text,
  add column if not exists observed_on date not null default current_date,
  add column if not exists available integer,
  add column if not exists blocked integer,
  add column if not exists occupied integer,
  add column if not exists is_premium boolean;

alter table public.event_zone_capacities
  drop constraint if exists event_zone_capacities_kind_chk;
alter table public.event_zone_capacities
  add constraint event_zone_capacities_kind_chk
  check (capacity_kind in ('released','contracted'));

create unique index if not exists event_zone_capacities_uk
  on public.event_zone_capacities (event_id, zone_label, capacity_kind, observed_on);

create index if not exists event_zone_capacities_event_idx
  on public.event_zone_capacities (event_id, observed_on desc);

update public.event_zone_capacities
set source = coalesce(source, 'ticketline_occupation'),
    observed_on = '2026-08-23'
where source is null;