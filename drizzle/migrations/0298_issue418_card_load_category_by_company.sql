-- 0298 — Issue #418 (Lote B, #435): rubrica da carga de cartão por empresa.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Definição anterior copiada de Live por SELECT pg_get_functiondef.
-- Altera apenas a procura da rubrica 10.3 e recusa a carga se faltar nessa empresa.
-- CREATE OR REPLACE preserva o owner e a ACL existentes; SECURITY DEFINER e search_path inalterados.

-- ROLLBACK COMENTADO — definição anterior completa; não executar nesta preparação.
-- CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_load  public.card_session_loads%ROWTYPE;
--   v_sess  public.card_sessions%ROWTYPE;
--   v_src_name TEXT;
--   v_card_name TEXT;
--   v_cat_id UUID;
--   v_in_id UUID;
-- BEGIN
--   IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
--     RETURN NEW;
--   END IF;
-- 
--   SELECT * INTO v_load
--   FROM public.card_session_loads
--   WHERE out_transaction_id = NEW.id
--     AND in_transaction_id IS NULL
--   LIMIT 1;
--   IF NOT FOUND THEN
--     RETURN NEW;
--   END IF;
-- 
--   SELECT * INTO v_sess FROM public.card_sessions WHERE id = v_load.session_id;
--   IF NOT FOUND THEN RETURN NEW; END IF;
-- 
--   SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = v_load.source_account_id;
--   SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;
--   SELECT id   INTO v_cat_id    FROM public.account_categories  WHERE code = '10.3' LIMIT 1;
-- 
--   INSERT INTO public.transactions (
--     company_id, type, description, amount, iva_rate, date,
--     status, paid_amount, payment_date,
--     is_transitory, transitory_reason, exclude_from_result, category_id, account_id
--   ) VALUES (
--     NEW.company_id, 'income',
--     'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
--     v_load.amount, 0, v_load.load_date,
--     'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
--     TRUE, 'carga_cartao', TRUE, v_cat_id, v_sess.card_account_id
--   ) RETURNING id INTO v_in_id;
-- 
--   UPDATE public.card_session_loads
--      SET in_transaction_id = v_in_id
--    WHERE id = v_load.id;
-- 
--   RETURN NEW;
-- END;
-- $function$;

-- ALTERAÇÃO PREPARADA — não aplicada.
CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  public.card_session_loads%ROWTYPE;
  v_sess  public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_in_id UUID;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_load
  FROM public.card_session_loads
  WHERE out_transaction_id = NEW.id
    AND in_transaction_id IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = v_load.session_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = v_load.source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;
  SELECT id INTO v_cat_id FROM public.account_categories WHERE code = '10.3' AND company_id = NEW.company_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carga de cartão: rubrica 10.3 não existe na empresa %', NEW.company_id;
  END IF;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date,
    status, paid_amount, payment_date,
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    NEW.company_id, 'income',
    'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
    v_load.amount, 0, v_load.load_date,
    'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
    TRUE, 'carga_cartao', TRUE, v_cat_id, v_sess.card_account_id
  ) RETURNING id INTO v_in_id;

  UPDATE public.card_session_loads
     SET in_transaction_id = v_in_id
   WHERE id = v_load.id;

  RETURN NEW;
END;
$function$;
