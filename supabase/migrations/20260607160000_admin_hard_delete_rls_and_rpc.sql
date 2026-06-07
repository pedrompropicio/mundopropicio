-- ============================================================
-- Hard delete RGPD para admins — lead_capture, leads, contacts (07/06/26)
--
-- Adiciona:
--   - PERMISSIVE DELETE policies para admin/platform_admin nas 3 tabelas
--     (multi-tenant via RESTRICTIVE company_isolation_* já existente em
--     contacts e leads; lead_capture não tem company_id e fica restrito a
--     admin role apenas).
--   - GRANT DELETE para authenticated nas 3 tabelas (necessário para
--     policies passarem em PostgREST).
--   - REVOKE defensivo de grants soltos em lead_capture: DELETE, UPDATE,
--     TRUNCATE, REFERENCES de anon. Mantém INSERT (portal precisa) e
--     SELECT (não estava concedido a anon, mas idempotente).
--   - RPC SECURITY DEFINER crm_rgpd_erase_contact(uuid): apagamento
--     definitivo RGPD-completo do contacto + leads referenciados +
--     lead_capture com mesmo email.
--
-- NÃO mexe em INSERT do portal, client_event_id, pixel/CAPI, trigger
-- VIP welcome email, ou auth.
-- ============================================================

-- ── 1. PERMISSIVE DELETE policies ─────────────────────────────────────

-- contacts: admin/platform_admin podem APAGAR — company_isolation
-- RESTRICTIVE (já existe) garante scope multi-tenant via
-- row_belongs_to_current_company(company_id).
DROP POLICY IF EXISTS contacts_admin_delete ON public.contacts;
CREATE POLICY contacts_admin_delete ON public.contacts
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- leads: idem (RESTRICTIVE company_isolation_leads aplica-se)
DROP POLICY IF EXISTS leads_admin_delete ON public.leads;
CREATE POLICY leads_admin_delete ON public.leads
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- lead_capture: sem company_id na schema. Acesso restrito a admin/
-- platform_admin (na prática single-tenant MP). Multi-tenant futuro
-- precisará de adicionar company_id à tabela e migrar o resto.
DROP POLICY IF EXISTS lead_capture_admin_delete ON public.lead_capture;
CREATE POLICY lead_capture_admin_delete ON public.lead_capture
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ── 2. GRANTs ─────────────────────────────────────────────────────────

GRANT DELETE ON public.contacts TO authenticated;
GRANT DELETE ON public.leads TO authenticated;
GRANT DELETE ON public.lead_capture TO authenticated;

-- ── 3. REVOKE defensivo de anon em lead_capture ───────────────────────
-- Mantém INSERT (portal anon precisa) e SELECT (nunca foi concedido).
-- REVOKE no-op em grants inexistentes — operação segura.

REVOKE DELETE     ON public.lead_capture FROM anon;
REVOKE UPDATE     ON public.lead_capture FROM anon;
REVOKE TRUNCATE   ON public.lead_capture FROM anon;
REVOKE REFERENCES ON public.lead_capture FROM anon;

-- ── 4. RPC RGPD erase contact ─────────────────────────────────────────
-- Hard delete completo: contacto + leads referenciados + lead_capture
-- com mesmo email (case-insensitive). Tudo em transação implícita do
-- function call. Authorization check explícito (defesa em profundidade
-- além das RLS policies — service_role context bypassa RLS).
--
-- Erros padronizados:
--   P0001 auth_required        : caller anónimo
--   P0002 contact_not_found    : id inexistente
--   P0003 not_authorized       : role insuficiente
--   P0004 company_mismatch     : contacto noutra empresa

CREATE OR REPLACE FUNCTION public.crm_rgpd_erase_contact(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_company uuid;
  v_email text;
  v_email_hash text;
  v_lead_count int := 0;
  v_lc_count int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Lookup do contacto + scope da empresa
  SELECT company_id, email, email_hash_sha256
    INTO v_company, v_email, v_email_hash
  FROM public.contacts
  WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2) Autorização: platform_admin OU admin da empresa do contacto
  IF NOT (
    public.is_platform_admin(v_caller)
    OR public.has_role(v_caller, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0003';
  END IF;

  -- 3) Scope multi-tenant: contacto tem de pertencer à empresa do caller
  --    (platform_admin bypass)
  IF NOT public.is_platform_admin(v_caller)
     AND NOT public.row_belongs_to_current_company(v_company) THEN
    RAISE EXCEPTION 'company_mismatch' USING ERRCODE = 'P0004';
  END IF;

  -- 4) Erasure cascade — ordem: leads → lead_capture → contact

  -- 4a) Leads que referenciam este contacto (RGPD: sem rasto residual)
  WITH d AS (
    DELETE FROM public.leads WHERE contact_id = p_contact_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_lead_count FROM d;

  -- 4b) Lead_capture com mesmo email (case-insensitive, trim).
  --     lead_capture é single-tenant na prática (MP); não scoped por empresa.
  IF v_email IS NOT NULL AND btrim(v_email) <> '' THEN
    WITH d AS (
      DELETE FROM public.lead_capture
       WHERE lower(btrim(email)) = lower(btrim(v_email))
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_lc_count FROM d;
  END IF;

  -- 4c) O contacto em si
  DELETE FROM public.contacts WHERE id = p_contact_id;

  RETURN jsonb_build_object(
    'contact_id',           p_contact_id,
    'email_hash_sha256',    v_email_hash,
    'leads_deleted',        v_lead_count,
    'lead_captures_deleted', v_lc_count,
    'erased_by',            v_caller,
    'erased_at',            now()
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.crm_rgpd_erase_contact(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_rgpd_erase_contact(uuid) TO authenticated;

COMMENT ON FUNCTION public.crm_rgpd_erase_contact(uuid) IS
  'RGPD Article 17 erasure: hard-delete do contacto, leads referenciados e lead_capture com mesmo email. Authorization: platform_admin OU admin da empresa do contacto. Devolve jsonb com email_hash_sha256 (sem PII bruta) para auditoria opcional pelo caller.';
