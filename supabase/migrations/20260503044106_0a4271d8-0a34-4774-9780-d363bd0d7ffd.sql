-- 1) Estender event_ticket_lots
ALTER TABLE public.event_ticket_lots
  ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumes_zone_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS combo_description text,
  ADD COLUMN IF NOT EXISTS combo_benefits text;

CREATE INDEX IF NOT EXISTS idx_event_ticket_lots_consumes_zone_ids
  ON public.event_ticket_lots USING GIN (consumes_zone_ids);

CREATE INDEX IF NOT EXISTS idx_event_ticket_lots_is_combo
  ON public.event_ticket_lots (is_combo) WHERE is_combo = true;

COMMENT ON COLUMN public.event_ticket_lots.is_combo IS
  'Se true, este lote é um combo/passe: cada venda conta como 1 pessoa em CADA zona listada em consumes_zone_ids (uma por dia coberto).';
COMMENT ON COLUMN public.event_ticket_lots.consumes_zone_ids IS
  'Lista de event_ticket_zones.id (zonas-dia) cuja capacidade este combo abate. Vazio para lotes simples.';

-- 2) Drop tabelas combo antigas (vazias em Live; confirmado via read_query)
DROP TABLE IF EXISTS public.event_combo_pass_lots CASCADE;
DROP TABLE IF EXISTS public.event_combo_passes CASCADE;

-- 3) Remover coluna combo_pass_lot_id de ticket_sales
ALTER TABLE public.ticket_sales DROP COLUMN IF EXISTS combo_pass_lot_id;