ALTER TABLE public.events
  ADD COLUMN event_nature text NULL
  CHECK (event_nature IN ('producao_propria', 'intermediacao', 'coproducao', 'parceiro_local', 'temporada'));

COMMENT ON COLUMN public.events.event_nature IS 'Natureza económica do evento (#256). Independente de management_type, que é visibilidade. producao_propria = MP produz e assume o risco; intermediacao = MP vende e recebe comissão; coproducao = risco e resultado partilhados com sócio; parceiro_local = MP é o parceiro local de um promotor externo; temporada = residência/temporada longa.';

CREATE INDEX events_company_id_event_nature_idx
  ON public.events (company_id, event_nature);