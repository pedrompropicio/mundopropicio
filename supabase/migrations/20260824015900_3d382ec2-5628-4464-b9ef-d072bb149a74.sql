-- Permitir histórico de lotação por zona: a chave nova é
-- (event_id, zone_label, capacity_kind, observed_on). A restrição antiga
-- UNIQUE (event_id, zone_label) impedia duas leituras da mesma zona em
-- datas diferentes.
alter table public.event_zone_capacities
  drop constraint if exists event_zone_capacities_event_id_zone_label_key;
