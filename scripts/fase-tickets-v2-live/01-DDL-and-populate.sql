-- ============================================================================
-- FASE TICKETS V2 — BATCH 01: DDL + POPULATE
-- ============================================================================
-- Status: ✓ EXECUTADO
-- Data: 2026-05-09
--
-- Este ficheiro reproduz o estado FINAL após a Fase 1, extraído de produção
-- via pg_get_functiondef / pg_get_constraintdef / information_schema.
--
-- É IDEMPOTENTE: pode ser corrido múltiplas vezes sem efeito colateral.
-- Não inclui o populate massivo dos 282 tipos (esse foi feito uma vez por
-- via SQL on-demand; o resultado foi validado pelo teste invariant I3 da
-- suite — soma de quantities legacy = via tipos = 156.425).
--
-- O que cria:
--   1) 2 tabelas novas: event_ticket_types, event_ticket_type_zones
--   2) Coluna ticket_type_id em event_ticket_lots (FK NULLABLE)
--   3) Colunas sales_window_start/_end, campaign_label em event_ticket_lots
--   4) Coluna feature_tickets_v2 (default false) e tickets_config (jsonb)
--      em companies
--   5) total_capacity em event_ticket_zones aceita NULL (= sem limite)
--   6) Função + trigger de validação de profundidade de variantes (max 1)
--
-- Princípios:
--   - Aditivo: nenhum DROP de coluna existente.
--   - Reversível: rollback documentado no fim.
--   - RLS: pattern da casa — SELECT por auth.uid IS NOT NULL,
--          INSERT/UPDATE/DELETE por has_role(), RESTRICTIVE company_isolation.
-- ============================================================================

BEGIN;

-- ─── 1) Tabela event_ticket_types ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_ticket_types (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'single_day',
  display_order INTEGER NOT NULL DEFAULT 0,
  benefits TEXT,
  entries_per_unit INTEGER NOT NULL DEFAULT 1,
  companion_courtesy_qty INTEGER NOT NULL DEFAULT 0,
  max_total_quantity INTEGER,
  parent_ticket_type_id UUID,
  variant_kind TEXT,
  variant_label TEXT,
  sales_channel TEXT,
  sales_channel_label TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_ticket_types_pkey PRIMARY KEY (id),
  CONSTRAINT event_ticket_types_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_ticket_types_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT event_ticket_types_parent_ticket_type_id_fkey
    FOREIGN KEY (parent_ticket_type_id) REFERENCES public.event_ticket_types(id) ON DELETE SET NULL,
  CONSTRAINT event_ticket_types_kind_check
    CHECK (kind = ANY (ARRAY['single_day','multi_day_pass','package','session_ticket','custom'])),
  CONSTRAINT event_ticket_types_visibility_check
    CHECK (visibility = ANY (ARRAY['public','private','cupom_required'])),
  CONSTRAINT event_ticket_types_variant_kind_check
    CHECK (variant_kind IS NULL OR variant_kind = ANY (ARRAY['channel','package','promo','companion'])),
  CONSTRAINT event_ticket_types_entries_per_unit_check
    CHECK (entries_per_unit >= 1),
  CONSTRAINT event_ticket_types_companion_courtesy_qty_check
    CHECK (companion_courtesy_qty >= 0),
  CONSTRAINT event_ticket_types_max_total_quantity_check
    CHECK (max_total_quantity IS NULL OR max_total_quantity > 0),
  CONSTRAINT event_ticket_types_no_self_parent
    CHECK (id <> parent_ticket_type_id)
);

CREATE INDEX IF NOT EXISTS idx_event_ticket_types_event ON public.event_ticket_types (event_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_types_company ON public.event_ticket_types (company_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_types_parent
  ON public.event_ticket_types (parent_ticket_type_id) WHERE parent_ticket_type_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_ticket_types_event_name_version
  ON public.event_ticket_types (event_id, name, COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- RLS event_ticket_types
ALTER TABLE public.event_ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ticket types viewable by authenticated"
  ON public.event_ticket_types FOR SELECT TO public
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ticket types insertable by privileged roles"
  ON public.event_ticket_types FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role)
              OR has_role(auth.uid(), 'manager'::app_role)
              OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Ticket types updatable by privileged roles"
  ON public.event_ticket_types FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR has_role(auth.uid(), 'manager'::app_role)
         OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Ticket types deletable by admin or manager"
  ON public.event_ticket_types FOR DELETE TO public
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY company_isolation_event_ticket_types
  ON public.event_ticket_types AS RESTRICTIVE FOR ALL TO public
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- ─── 2) Função + trigger de validação de profundidade ─────────────────────
CREATE OR REPLACE FUNCTION public.event_ticket_types_validate_depth()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_ticket_type_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.event_ticket_types
      WHERE id = NEW.parent_ticket_type_id
        AND parent_ticket_type_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'event_ticket_types: profundidade máxima 1 (parent % já é variante)', NEW.parent_ticket_type_id;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_event_ticket_types_depth ON public.event_ticket_types;
CREATE TRIGGER trg_event_ticket_types_depth
  BEFORE INSERT OR UPDATE OF parent_ticket_type_id ON public.event_ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.event_ticket_types_validate_depth();

DROP TRIGGER IF EXISTS trg_event_ticket_types_set_company ON public.event_ticket_types;
CREATE TRIGGER trg_event_ticket_types_set_company
  BEFORE INSERT ON public.event_ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ─── 3) Tabela event_ticket_type_zones (junction) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.event_ticket_type_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ticket_type_id UUID NOT NULL,
  zone_id UUID NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  price_share NUMERIC(5,4),                         -- NULL = igual-split
  company_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_ticket_type_zones_pkey PRIMARY KEY (id),
  CONSTRAINT event_ticket_type_zones_unique UNIQUE (ticket_type_id, zone_id),
  CONSTRAINT event_ticket_type_zones_ticket_type_id_fkey
    FOREIGN KEY (ticket_type_id) REFERENCES public.event_ticket_types(id) ON DELETE CASCADE,
  CONSTRAINT event_ticket_type_zones_zone_id_fkey
    FOREIGN KEY (zone_id) REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE,
  CONSTRAINT event_ticket_type_zones_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT event_ticket_type_zones_price_share_check
    CHECK (price_share IS NULL OR (price_share > 0 AND price_share <= 1))
);

CREATE INDEX IF NOT EXISTS idx_ettz_type ON public.event_ticket_type_zones (ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_ettz_zone ON public.event_ticket_type_zones (zone_id);

-- RLS event_ticket_type_zones (mesmo pattern)
ALTER TABLE public.event_ticket_type_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Type zones viewable by authenticated"
  ON public.event_ticket_type_zones FOR SELECT TO public
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Type zones insertable by privileged roles"
  ON public.event_ticket_type_zones FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role)
              OR has_role(auth.uid(), 'manager'::app_role)
              OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Type zones updatable by privileged roles"
  ON public.event_ticket_type_zones FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR has_role(auth.uid(), 'manager'::app_role)
         OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Type zones deletable by admin or manager"
  ON public.event_ticket_type_zones FOR DELETE TO public
  USING (has_role(auth.uid(), 'admin'::app_role)
         OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY company_isolation_event_ticket_type_zones
  ON public.event_ticket_type_zones AS RESTRICTIVE FOR ALL TO public
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

DROP TRIGGER IF EXISTS trg_event_ticket_type_zones_set_company ON public.event_ticket_type_zones;
CREATE TRIGGER trg_event_ticket_type_zones_set_company
  BEFORE INSERT ON public.event_ticket_type_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ─── 4) Colunas adicionadas a event_ticket_lots ───────────────────────────
ALTER TABLE public.event_ticket_lots
  ADD COLUMN IF NOT EXISTS ticket_type_id UUID,
  ADD COLUMN IF NOT EXISTS sales_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sales_window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_ticket_lots_ticket_type_id_fkey'
  ) THEN
    ALTER TABLE public.event_ticket_lots
      ADD CONSTRAINT event_ticket_lots_ticket_type_id_fkey
      FOREIGN KEY (ticket_type_id) REFERENCES public.event_ticket_types(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_ticket_lots_ticket_type
  ON public.event_ticket_lots (ticket_type_id) WHERE ticket_type_id IS NOT NULL;

-- ─── 5) Colunas adicionadas a companies ───────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS feature_tickets_v2 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tickets_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Pré-popula sync_mode e tokens de canal — idempotente
UPDATE public.companies
SET tickets_config = jsonb_set(
  COALESCE(tickets_config, '{}'::jsonb),
  '{sync_mode}', '"log_only"', true
)
WHERE NOT (tickets_config ? 'sync_mode');

-- 18 tokens de canal pré-conhecidos
UPDATE public.companies
SET tickets_config = jsonb_set(
  COALESCE(tickets_config, '{}'::jsonb),
  '{channel_partner_tokens}',
  '["revolut","fnac","wegow","ticketline","bilheteiraonline","fever",
    "viagogo","seetickets","stubhub","everydaypass","blueticket",
    "ticketmaster","ticketswap","worten","cp","mediamarkt","el_corte_ingles",
    "loja_oficial"]'::jsonb,
  true
)
WHERE NOT (tickets_config ? 'channel_partner_tokens');

-- ─── 6) total_capacity em event_ticket_zones aceita NULL ──────────────────
ALTER TABLE public.event_ticket_zones
  ALTER COLUMN total_capacity DROP NOT NULL;

-- ─── 7) Correções específicas Coala 2026 ──────────────────────────────────
UPDATE public.event_ticket_zones
SET total_capacity = 519
WHERE id = 'fed72d2b-34ad-441b-a116-660c23c2ea11'
  AND total_capacity = 83;

UPDATE public.event_ticket_zones
SET total_capacity = NULL
WHERE id IN (
  'd128ce5f-38dd-48f0-b968-2ce05d776b54',
  '0c8ac3fc-4331-4716-bc8b-b2548d6b04cb'
)
AND total_capacity = 0;

COMMIT;

-- ============================================================================
-- POPULATE — executado em duas passadas distintas:
--
-- Passada A: Combos reais (is_combo=true E cardinality(consumes_zone_ids) >= 2)
--   Agrupados por (event_id, base_name, zone_signature ordenada) → 1 tipo por
--   grupo + junction com todas as zonas consumidas. Coala teve 2 variantes
--   reconhecidas (Revolut em Relvado e em Tenda — note: a Tenda Revolut não
--   foi linkada por divergência, ficou como tipo independente; a Relvado
--   Revolut é variante).
--
-- Passada B: Lotes simples
--   Agrupados por (event_id, base_name, zone_id) → 1 tipo por grupo +
--   junction só com a zone_id. Em colisão de nomes, compõe-se nome:
--      "{base_name} — {zone_name}" ou
--      "{base_name} — {zone_name} ({session_label})"
--
-- Regex de extracção do base_name:
--   TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
--     CASE WHEN name ~* '\s\|\s' THEN SPLIT_PART(name,'|',2) ELSE name END,
--     '\s*-\s*[Ll]ote\s*\d+\s*$', '', 'g'),
--     '\s+', ' ', 'g'))
--
-- Resultado em produção (snapshot 2026-05-09):
--   - Coala: 18 tipos (16 raiz + 2 variantes Revolut)
--   - Mundo Propício: 264 tipos
--   - Total: 282 tipos
--   - 324 lots ligados (todos com ticket_type_id NOT NULL)
--   - Soma quantities legacy = via tipos = 156.425 (invariant I3)
--
-- Validação automática: SELECT * FROM public.tickets_v2_run_all_tests();
-- ============================================================================

-- ============================================================================
-- ROLLBACK (descomentar e correr para reverter — DESTRUTIVO)
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.event_ticket_lots DROP COLUMN IF EXISTS ticket_type_id;
--   ALTER TABLE public.event_ticket_lots DROP COLUMN IF EXISTS sales_window_start;
--   ALTER TABLE public.event_ticket_lots DROP COLUMN IF EXISTS sales_window_end;
--   ALTER TABLE public.event_ticket_lots DROP COLUMN IF EXISTS campaign_label;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS feature_tickets_v2;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS tickets_config;
--   DROP TABLE IF EXISTS public.event_ticket_type_zones CASCADE;
--   DROP TABLE IF EXISTS public.event_ticket_types CASCADE;
--   DROP FUNCTION IF EXISTS public.event_ticket_types_validate_depth() CASCADE;
-- COMMIT;
