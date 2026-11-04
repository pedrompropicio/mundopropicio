-- 0315 — Issue #403: país do fornecedor legível e omissão herdada da empresa.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização 6618994825; decisão literal 6619324661 (Pedro, 04/11/2026).
-- Ordem: prova §1–2 → migração → backfill manual (§5) → Publish.
-- Prova: docs/testes/issue403/prova-janela.sql (executada pelo 0 na janela).
-- Rollback: supabase/manual/rollback_0315_issue403_supplier_country_comentado.sql
-- Só DDL: não corrige países existentes; NOT NULL, CHECK e RLS mantêm-se.
BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'country'
  ) THEN
    RAISE EXCEPTION '0315: suppliers.country e companies.country são pré-condições';
  END IF;
  IF has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') THEN
    RAISE EXCEPTION '0315: IBAN legível directamente; conferir ACL antes de aplicar';
  END IF;
END;
$preflight$;

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
  -- Último recurso legado: só quando a empresa não fornece país.
  IF NEW.country IS NULL THEN
    NEW.country := 'PT';
  END IF;
  RETURN NEW;
END;
$function$;

-- Função apenas de trigger, sem invocação directa pelo cliente.
REVOKE ALL ON FUNCTION public.suppliers_default_country() FROM PUBLIC, anon, authenticated;
-- Depois de set_company_id_trigger / trg_set_company_id (ordem alfabética).
DROP TRIGGER IF EXISTS zz_suppliers_default_country ON public.suppliers;
CREATE TRIGGER zz_suppliers_default_country
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_default_country();

COMMIT;
