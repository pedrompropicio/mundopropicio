-- Fase 1 — Fundação RLS partner (helpers + índices). Não altera policies.

-- 1. Helper principal: acesso por evento (com Master→Splits)
CREATE OR REPLACE FUNCTION public.user_has_event_access(p_user_id uuid, p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND p_event_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.partner_event_access pea
      WHERE pea.user_id = p_user_id
        AND pea.event_id = p_event_id
        AND pea.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.partner_event_access pea ON pea.event_id = e.parent_event_id
      WHERE e.id = p_event_id
        AND pea.user_id = p_user_id
        AND pea.is_active = true
    )
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_event_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_event_access(uuid, uuid) TO authenticated;

-- 2. Helper auxiliar: ligação user → supplier (via email)
--    Caminho confirmado em Live: suppliers tem coluna `email`; profiles tem `email`.
--    NÃO existe suppliers.user_id nem suppliers.partner_user_id.
--    Fragilidade: depende de match exato de email (case-sensitive em igualdade simples;
--    usamos lower() para mitigar). Fase 2 deve assumir 1 supplier por email.
CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.profiles p
  JOIN public.suppliers s
    ON lower(s.email) = lower(p.email)
  WHERE p.id = p_user_id
    AND p.email IS NOT NULL
    AND s.email IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.user_supplier_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_supplier_id(uuid) TO authenticated;

-- 3. Índice parcial para o hot path do helper user_has_event_access
--    (já existe UNIQUE em (user_id,event_id), mas sem filtro is_active)
CREATE INDEX IF NOT EXISTS idx_partner_event_access_user_event_active
  ON public.partner_event_access (user_id, event_id)
  WHERE is_active = true;

-- Demais índices verificados já existentes (não recriar):
--   idx_events_parent_id, idx_etz_event_id, idx_etl_zone_id, idx_ts_zone_id
