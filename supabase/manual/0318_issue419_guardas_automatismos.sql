-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim, depois da 0298.
-- Issue #419, E2b. Autorização 6621058216; origem 6552106170 / 6552125838.
-- Só G1–G4. Sem DML, validação retroactiva ou alteração dos automatismos existentes.
-- Escritas aninhadas nos triggers AFTER têm pg_trigger_depth() >= 2.

CREATE OR REPLACE FUNCTION public.guard_automatism_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_old_code text;
  v_old_g1 boolean := false;
  v_old_g2 boolean := false;
  v_old_g3 boolean := false;
BEGIN
  IF pg_trigger_depth() <> 1 OR NEW.type IS DISTINCT FROM 'income' THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_code FROM public.account_categories WHERE id = NEW.category_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT code INTO v_old_code FROM public.account_categories WHERE id = OLD.category_id;
    v_old_g1 := COALESCE(OLD.type = 'income' AND v_old_code = '10.1.01' AND EXISTS (
      SELECT 1 FROM public.financial_accounts WHERE id = OLD.account_id AND mirror_partner_aporte
    ), false);
    v_old_g2 := COALESCE(OLD.type = 'income' AND v_old_code = '10.12.01', false);
    v_old_g3 := COALESCE(OLD.type = 'income' AND OLD.transitory_reason = 'carga_cartao', false);
  END IF;

  IF v_code = '10.1.01' AND NOT v_old_g1 AND EXISTS (
    SELECT 1 FROM public.financial_accounts WHERE id = NEW.account_id AND mirror_partner_aporte
  ) THEN
    RAISE EXCEPTION 'Conta-espelho: o aporte é criado sozinho pela despesa paga. Lance só a despesa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '10.12.01' AND NOT v_old_g2 THEN
    RAISE EXCEPTION 'O adiantamento por conta de terceiros é criado pela despesa paga com custo partilhado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.transitory_reason = 'carga_cartao' AND NOT v_old_g3 THEN
    RAISE EXCEPTION 'A entrada da carga no cartão é criada sozinha quando a saída fica paga. Lance a carga pela sessão de cartão.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_automatism_rows() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.guard_automatism_rows() IS
  '#419 G1–G3: recusa novas receitas manuais duplicadoras; preserva casos existentes e escritas de triggers AFTER.';

CREATE TRIGGER zz_guard_automatism_rows
  BEFORE INSERT OR UPDATE OF type, category_id, account_id, transitory_reason ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_automatism_rows();
COMMENT ON TRIGGER zz_guard_automatism_rows ON public.transactions IS
  '#419 G1–G3: só entrada num caso protegido a profundidade 1, sem validação retroactiva.';

CREATE OR REPLACE FUNCTION public.guard_manual_compensation_leg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  -- INVOKER é intencional: RPCs SECDEF escrevem como dono; a API directa usa estes três roles.
  -- offset_group_id é opcional no catálogo: ler apenas pela representação JSON.
  IF NEW.payment_method = 'compensation'
     AND NEW.offset_id IS NULL
     AND (to_jsonb(NEW)->>'offset_group_id') IS NULL
     AND pg_trigger_depth() = 1
     AND current_user IN ('authenticated', 'anon', 'service_role')
  THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.payment_method = 'compensation'
         AND OLD.offset_id IS NULL
         AND (to_jsonb(OLD)->>'offset_group_id') IS NULL
      THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'A compensação faz-se pelo assistente de encontro de contas (#337).'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_manual_compensation_leg() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.guard_manual_compensation_leg() IS
  '#419 G4: INVOKER recusa novas compensações directas sem ligação; preserva legado, triggers AFTER e RPCs SECDEF.';

CREATE TRIGGER zz_guard_manual_compensation_leg
  BEFORE INSERT OR UPDATE OF payment_method, offset_id ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_manual_compensation_leg();
COMMENT ON TRIGGER zz_guard_manual_compensation_leg ON public.transaction_payments IS
  '#419 G4: API directa sem offset_id/offset_group_id; sem validação retroactiva.';
