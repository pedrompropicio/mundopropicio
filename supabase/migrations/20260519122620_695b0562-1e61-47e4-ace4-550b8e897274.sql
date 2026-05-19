-- ============================================
-- OP-0: operacao_etapa_suppliers (M:N)
-- ============================================

CREATE TABLE IF NOT EXISTS public.operacao_etapa_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.operacao_etapas(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('principal','secundario')) DEFAULT 'principal',

  decided_amount numeric(12,2),
  iva_rate int,

  contact_name text,
  contact_phone text,
  contact_role text,
  contact_email text,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (etapa_id, supplier_id)
);

ALTER TABLE public.operacao_etapa_suppliers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_oes_etapa ON public.operacao_etapa_suppliers(etapa_id);
CREATE INDEX IF NOT EXISTS idx_oes_supplier ON public.operacao_etapa_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_oes_company ON public.operacao_etapa_suppliers(company_id);

-- ============================================
-- Trigger: auto-fill company_id + updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.autofill_oes_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.operacao_etapas WHERE id = NEW.etapa_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_oes_company ON public.operacao_etapa_suppliers;
CREATE TRIGGER trg_autofill_oes_company
  BEFORE INSERT OR UPDATE ON public.operacao_etapa_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.autofill_oes_company();

-- ============================================
-- Trigger: sync etapas.supplier_id with principal
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_etapa_principal_supplier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'principal' THEN
      UPDATE public.operacao_etapas SET supplier_id = NULL WHERE id = OLD.etapa_id;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.role = 'principal' THEN
    UPDATE public.operacao_etapas SET supplier_id = NEW.supplier_id WHERE id = NEW.etapa_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_etapa_principal_supplier ON public.operacao_etapa_suppliers;
CREATE TRIGGER trg_sync_etapa_principal_supplier
  AFTER INSERT OR UPDATE OR DELETE ON public.operacao_etapa_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.sync_etapa_principal_supplier();

-- ============================================
-- RLS
-- ============================================

DROP POLICY IF EXISTS "OES — SELECT" ON public.operacao_etapa_suppliers;
CREATE POLICY "OES — SELECT" ON public.operacao_etapa_suppliers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'view_operacao')
    OR EXISTS (
      SELECT 1 FROM public.operacao_etapas e
      JOIN public.operacao_frentes f ON f.id = e.frente_id
      WHERE e.id = operacao_etapa_suppliers.etapa_id
        AND public.can_view_event_operacao(f.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "OES — Write" ON public.operacao_etapa_suppliers;
CREATE POLICY "OES — Write" ON public.operacao_etapa_suppliers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage_operacao_etapa(etapa_id, auth.uid()))
  WITH CHECK (public.can_manage_operacao_etapa(etapa_id, auth.uid()));

DROP POLICY IF EXISTS "OES — tenant isolation" ON public.operacao_etapa_suppliers;
CREATE POLICY "OES — tenant isolation" ON public.operacao_etapa_suppliers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR company_id = public.current_company_id()
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR company_id = public.current_company_id()
  );

-- ============================================
-- Backfill: etapas existentes com supplier_id → linha principal
-- ============================================
INSERT INTO public.operacao_etapa_suppliers (etapa_id, supplier_id, company_id, role, created_at)
SELECT e.id, e.supplier_id, e.company_id, 'principal', now()
FROM public.operacao_etapas e
WHERE e.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.operacao_etapa_suppliers oes
    WHERE oes.etapa_id = e.id AND oes.supplier_id = e.supplier_id
  );

-- ============================================
-- Fix permissão: viewer com open_chamado precisa de view_operacao
-- ============================================
INSERT INTO public.role_permissions (role, permission)
VALUES ('viewer', 'view_operacao')
ON CONFLICT (role, permission) DO NOTHING;