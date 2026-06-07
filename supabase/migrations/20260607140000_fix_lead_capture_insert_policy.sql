-- ============================================================
-- Fix RLS INSERT em public.lead_capture (06/06/26)
--
-- Bug: policy actual lead_capture_anon_insert só aceita role anon,
-- pelo que visitantes autenticados (role authenticated) falhavam o
-- INSERT — a policy não match e RLS denegava.
--
-- Fix: substituir por policy unificada lead_capture_public_insert
-- para anon, authenticated. Sem alterar mais nada.
-- ============================================================

DROP POLICY IF EXISTS "lead_capture_anon_insert" ON public.lead_capture;

CREATE POLICY "lead_capture_public_insert" ON public.lead_capture
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
