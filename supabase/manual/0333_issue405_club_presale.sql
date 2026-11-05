-- #405 R2 — Reforço da pré-venda Newgang 27. PREPARADA, NÃO APLICADA (aplicação pelo 0 · Cowork).
-- Destino canónico: drizzle/migrations/0333_issue405_club_presale.sql (cópia byte a byte; o agente não consegue gravar nesse caminho).
-- Sem seed: dados carregados depois por INSERT. Só service_role (RLS activa, sem políticas).

CREATE TABLE public.club_presale_codes (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  code text NOT NULL CHECK (code IN ('NEWGANG27A', 'NEWGANG27B')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.club_presale_exclusions (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.club_presale_reservations (
  member_id uuid PRIMARY KEY,
  message_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'reserved',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.club_presale_codes, public.club_presale_exclusions, public.club_presale_reservations FROM anon, authenticated;
GRANT ALL ON public.club_presale_codes, public.club_presale_exclusions, public.club_presale_reservations TO service_role;

ALTER TABLE public.club_presale_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_presale_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_presale_reservations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.club_presale_codes IS '#405 Código individual da pré-venda NG27 por e-mail normalizado (minúsculas).';
COMMENT ON TABLE public.club_presale_exclusions IS '#405 E-mails excluídos do reforço da pré-venda NG27.';
COMMENT ON TABLE public.club_presale_reservations IS '#405 Reserva atómica única por membro do reforço NG27 (message_id ng-reforco-<memberId>).';

-- ROLLBACK (comentado; só com autorização):
-- DROP TABLE public.club_presale_reservations;
-- DROP TABLE public.club_presale_exclusions;
-- DROP TABLE public.club_presale_codes;
