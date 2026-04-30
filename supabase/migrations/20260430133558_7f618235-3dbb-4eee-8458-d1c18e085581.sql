-- Cria L2 "2.10 Merchandising" e 3 L3 (CMV, Pessoal Loja, Logística & Estrutura)
-- Migra forecasts da antiga 2.6.09 para a nova 2.10.01 e desativa a 2.6.09.
-- Multi-tenant: aplica-se a todas as empresas que tenham a categoria L2 raiz "2 Custos do Evento".

DO $$
DECLARE
  v_company RECORD;
  v_parent_id UUID;
  v_old_269_id UUID;
  v_new_l2_id UUID;
  v_new_cmv_id UUID;
  v_new_pessoal_id UUID;
  v_new_log_id UUID;
BEGIN
  FOR v_company IN
    SELECT DISTINCT company_id FROM public.account_categories
    WHERE code = '2' AND type = 'expense' AND parent_id IS NULL
  LOOP
    -- 1. Localiza o pai L1 "2 Custos do Evento" desta empresa
    SELECT id INTO v_parent_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id
      AND code = '2' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF v_parent_id IS NULL THEN
      CONTINUE;
    END IF;

    -- 2. Cria L2 "2.10 Merchandising" se ainda não existir
    SELECT id INTO v_new_l2_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id AND code = '2.10';

    IF v_new_l2_id IS NULL THEN
      INSERT INTO public.account_categories (company_id, code, name, type, parent_id, is_active, event_required, allocate_to_active_event)
      VALUES (v_company.company_id, '2.10', 'Merchandising', 'expense', v_parent_id, true, true, false)
      RETURNING id INTO v_new_l2_id;
    END IF;

    -- 3. Cria L3 "2.10.01 CMV Merchandising"
    SELECT id INTO v_new_cmv_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id AND code = '2.10.01';

    IF v_new_cmv_id IS NULL THEN
      INSERT INTO public.account_categories (company_id, code, name, type, parent_id, is_active, event_required, allocate_to_active_event)
      VALUES (v_company.company_id, '2.10.01', 'CMV Merchandising', 'expense', v_new_l2_id, true, true, false)
      RETURNING id INTO v_new_cmv_id;
    END IF;

    -- 4. Cria L3 "2.10.02 Pessoal Loja Merch"
    SELECT id INTO v_new_pessoal_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id AND code = '2.10.02';

    IF v_new_pessoal_id IS NULL THEN
      INSERT INTO public.account_categories (company_id, code, name, type, parent_id, is_active, event_required, allocate_to_active_event)
      VALUES (v_company.company_id, '2.10.02', 'Pessoal Loja Merch', 'expense', v_new_l2_id, true, true, false);
    END IF;

    -- 5. Cria L3 "2.10.03 Logística & Estrutura Merch"
    SELECT id INTO v_new_log_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id AND code = '2.10.03';

    IF v_new_log_id IS NULL THEN
      INSERT INTO public.account_categories (company_id, code, name, type, parent_id, is_active, event_required, allocate_to_active_event)
      VALUES (v_company.company_id, '2.10.03', 'Logística & Estrutura Merch', 'expense', v_new_l2_id, true, true, false);
    END IF;

    -- 6. Migra forecasts da antiga 2.6.09 para a nova 2.10.01 (CMV)
    SELECT id INTO v_old_269_id
    FROM public.account_categories
    WHERE company_id = v_company.company_id AND code = '2.6.09';

    IF v_old_269_id IS NOT NULL AND v_new_cmv_id IS NOT NULL THEN
      UPDATE public.event_forecasts
      SET category_id = v_new_cmv_id
      WHERE category_id = v_old_269_id;

      -- Migra também eventuais transactions (deve ser zero, mas por segurança)
      UPDATE public.transactions
      SET category_id = v_new_cmv_id
      WHERE category_id = v_old_269_id;

      -- Desativa a 2.6.09 (não apaga, preserva histórico/audit)
      UPDATE public.account_categories
      SET is_active = false
      WHERE id = v_old_269_id;
    END IF;
  END LOOP;
END $$;