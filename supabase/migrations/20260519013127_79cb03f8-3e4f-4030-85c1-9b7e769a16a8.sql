
-- Patch 2A.2: M:N etapa assignees
CREATE TABLE IF NOT EXISTS public.operacao_etapa_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  etapa_id uuid NOT NULL REFERENCES public.operacao_etapas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL DEFAULT 'helper' CHECK (role IN ('owner','helper')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_profile_id uuid REFERENCES public.profiles(id),
  UNIQUE (etapa_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_op_etapa_assignees_etapa ON public.operacao_etapa_assignees(etapa_id);
CREATE INDEX IF NOT EXISTS idx_op_etapa_assignees_profile ON public.operacao_etapa_assignees(profile_id);

ALTER TABLE public.operacao_etapa_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacao_etapa_assignees FORCE ROW LEVEL SECURITY;

-- RESTRICTIVE tenant isolation
CREATE POLICY company_isolation_operacao_etapa_assignees
ON public.operacao_etapa_assignees
AS RESTRICTIVE
TO authenticated
USING (company_id = public.current_company_id() OR public.is_platform_admin())
WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin());

-- PERMISSIVE select
CREATE POLICY op_etapa_assignees_select
ON public.operacao_etapa_assignees
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin()
  OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_operacao'))
);

-- PERMISSIVE write (insert/update/delete) — admin/manage perm OR current_lead of frente
CREATE POLICY op_etapa_assignees_insert
ON public.operacao_etapa_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'manage_operacao_etapas')
  OR EXISTS (
    SELECT 1 FROM public.operacao_etapas e
    JOIN public.operacao_frentes f ON f.id = e.frente_id
    WHERE e.id = operacao_etapa_assignees.etapa_id
      AND f.current_lead_id = auth.uid()
  )
);

CREATE POLICY op_etapa_assignees_update
ON public.operacao_etapa_assignees
FOR UPDATE
TO authenticated
USING (
  public.has_permission(auth.uid(), 'manage_operacao_etapas')
  OR EXISTS (
    SELECT 1 FROM public.operacao_etapas e
    JOIN public.operacao_frentes f ON f.id = e.frente_id
    WHERE e.id = operacao_etapa_assignees.etapa_id
      AND f.current_lead_id = auth.uid()
  )
)
WITH CHECK (
  public.has_permission(auth.uid(), 'manage_operacao_etapas')
  OR EXISTS (
    SELECT 1 FROM public.operacao_etapas e
    JOIN public.operacao_frentes f ON f.id = e.frente_id
    WHERE e.id = operacao_etapa_assignees.etapa_id
      AND f.current_lead_id = auth.uid()
  )
);

CREATE POLICY op_etapa_assignees_delete
ON public.operacao_etapa_assignees
FOR DELETE
TO authenticated
USING (
  public.has_permission(auth.uid(), 'manage_operacao_etapas')
  OR EXISTS (
    SELECT 1 FROM public.operacao_etapas e
    JOIN public.operacao_frentes f ON f.id = e.frente_id
    WHERE e.id = operacao_etapa_assignees.etapa_id
      AND f.current_lead_id = auth.uid()
  )
);

-- Audit trigger
CREATE TRIGGER audit_operacao_etapa_assignees_changes
AFTER INSERT OR UPDATE OR DELETE ON public.operacao_etapa_assignees
FOR EACH ROW EXECUTE FUNCTION public.log_table_change();
