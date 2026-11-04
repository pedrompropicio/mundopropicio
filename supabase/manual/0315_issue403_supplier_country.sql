-- 0315 — Issue #403 E2b: país cadastral do fornecedor.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Ordem: prova §1–2 → migração → backfill manual (§5) → Publish.
-- Rollback: supabase/manual/rollback_0315_issue403_supplier_country_comentado.sql
-- Sem DML. NOT NULL, CHECK e políticas RLS existentes mantêm-se.

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'country'
  ) THEN
    RAISE EXCEPTION '0315: suppliers.country e companies.country são obrigatórios';
  END IF;
  IF has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') THEN
    RAISE EXCEPTION '0315: authenticated não pode ter SELECT em suppliers.iban';
  END IF;
END;
$precondition$;

GRANT SELECT (country) ON public.suppliers TO authenticated;
ALTER TABLE public.suppliers ALTER COLUMN country DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.suppliers_default_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.country IS NULL THEN
    NEW.country := (SELECT upper(c.country) FROM public.companies c WHERE c.id = NEW.company_id);
  END IF;
  -- Último recurso para empresa sem país: compatibilidade com o valor anterior.
  IF NEW.country IS NULL THEN NEW.country := 'PT'; END IF;
  RETURN NEW;
END;
$function$;
-- Função exclusiva do trigger; nenhum chamador RPC precisa de EXECUTE.
REVOKE ALL ON FUNCTION public.suppliers_default_country() FROM PUBLIC, anon, authenticated;

-- Ordem alfabética posterior a set_company_id_trigger: resolve primeiro a empresa.
DROP TRIGGER IF EXISTS suppliers_default_country_trigger ON public.suppliers;
CREATE TRIGGER suppliers_default_country_trigger
BEFORE INSERT ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.suppliers_default_country();
