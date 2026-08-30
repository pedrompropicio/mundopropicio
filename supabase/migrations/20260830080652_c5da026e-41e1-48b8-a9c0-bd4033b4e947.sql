-- 1) Remover o trigger duplicado, só onde existe duplicação real.
--    O bloco é auto-limitado: se houver só um trigger na tabela, não mexe.
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabela
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc  p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname = 'set_company_id_on_insert'
     GROUP BY c.relname
    HAVING count(*) > 1
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_company_id_trigger ON public.%I', r.tabela);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Triggers duplicados removidos em % tabelas', n;
END $$;

-- 2) Remover as duas funções de L2 sem trigger.
DROP FUNCTION IF EXISTS public.enforce_tx_category_l2_match();
DROP FUNCTION IF EXISTS public.enforce_forecast_tx_link_l2_match();