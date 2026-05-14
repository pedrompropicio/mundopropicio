-- Funnel Test 360 — Fase 2: source-of-truth de URLs de bilheteira em events.
--
-- Adiciona `ticketing_url` (URL da landing page para o evento na bilheteira)
-- + `ticketing_provider` (id do preset associado: ticketline, blueticket, etc.).
-- O frontend Funnel Test 360 vai listar eventos da plataforma e auto-popular
-- o URL alvo quando um evento é selecionado.
--
-- Backwards-compatible: ambos os campos são nullable; rows existentes
-- mantêm-se inalteradas. Eventos sem ticketing_url aparecem disabled no
-- dropdown com tooltip "URL de bilheteira não configurada".
--
-- CHECK constraint nos providers conhecidos para evitar typos. Manter
-- alinhado com PROVIDERS_KNOWN em presets/index.ts.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticketing_url text,
  ADD COLUMN IF NOT EXISTS ticketing_provider text;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_ticketing_provider_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_ticketing_provider_check
  CHECK (
    ticketing_provider IS NULL
    OR ticketing_provider IN (
      'ticketline',
      'blueticket',
      'bol',
      'see_tickets',
      'fnac_tickets',
      'eventbrite',
      'ingresse',
      'sympla',
      'other'
    )
  );

COMMENT ON COLUMN public.events.ticketing_url IS
  'URL da landing/checkout do evento na bilheteira (ex: https://www.ticketline.pt/evento/.../sessao/...). NULL = não configurado.';

COMMENT ON COLUMN public.events.ticketing_provider IS
  'ID do preset Funnel Test 360 (ticketline/blueticket/etc.). Constraint alinhado com PROVIDERS_KNOWN.';

CREATE INDEX IF NOT EXISTS idx_events_ticketing_provider
  ON public.events (ticketing_provider)
  WHERE ticketing_provider IS NOT NULL;
