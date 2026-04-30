DO $mig$
DECLARE
  v_l4_remain int;
  v_bp_count int;
  v_tx_count int;
BEGIN
  -- 1) Criar 10.8 Estrutura (L2) por empresa
  INSERT INTO account_categories (id, code, name, type, parent_id, company_id, is_active, event_required)
  SELECT gen_random_uuid(), '10.8', 'Estrutura', 'expense',
         (SELECT id FROM account_categories WHERE code='10' AND company_id=c.id),
         c.id, true, true
  FROM companies c
  WHERE EXISTS (SELECT 1 FROM account_categories WHERE code='10' AND company_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM account_categories WHERE code='10.8' AND company_id=c.id);

  -- 2) Criar 10.9 Tecnologia (L2) por empresa
  INSERT INTO account_categories (id, code, name, type, parent_id, company_id, is_active, event_required)
  SELECT gen_random_uuid(), '10.9', 'Tecnologia', 'expense',
         (SELECT id FROM account_categories WHERE code='10' AND company_id=c.id),
         c.id, true, true
  FROM companies c
  WHERE EXISTS (SELECT 1 FROM account_categories WHERE code='10' AND company_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM account_categories WHERE code='10.9' AND company_id=c.id);

  -- 3) Renomear 10.7
  UPDATE account_categories SET name = 'Serviços' WHERE code = '10.7';

  -- 4) Fase 1: codes temporários nas folhas L4 (evitar colisão de unique)
  UPDATE account_categories SET code = 'TMP_10.7.01' WHERE code = '10.7.01.01';
  UPDATE account_categories SET code = 'TMP_10.7.02' WHERE code = '10.7.01.02';
  UPDATE account_categories SET code = 'TMP_10.7.03' WHERE code = '10.7.01.03';
  UPDATE account_categories SET code = 'TMP_10.8.01' WHERE code = '10.7.02.01';
  UPDATE account_categories SET code = 'TMP_10.8.02' WHERE code = '10.7.02.02';
  UPDATE account_categories SET code = 'TMP_10.8.03' WHERE code = '10.7.02.03';
  UPDATE account_categories SET code = 'TMP_10.9.01' WHERE code = '10.7.03.01';
  UPDATE account_categories SET code = 'TMP_10.9.02' WHERE code = '10.7.03.02';
  UPDATE account_categories SET code = 'TMP_10.9.03' WHERE code = '10.7.03.03';

  -- 5) Re-rotar TX/BP eventualmente vinculados aos antigos L3-grupo (defensivo)
  UPDATE transactions t
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.7.01' AND company_id=t.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.01');
  UPDATE event_forecasts f
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.7.01' AND company_id=f.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.01');
  UPDATE transactions t
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.8.01' AND company_id=t.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.02');
  UPDATE event_forecasts f
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.8.01' AND company_id=f.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.02');
  UPDATE transactions t
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.9.01' AND company_id=t.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.03');
  UPDATE event_forecasts f
  SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.9.01' AND company_id=f.company_id)
  WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.03');

  -- 6) Re-parentar as folhas (por empresa)
  UPDATE account_categories ac
  SET parent_id = (SELECT id FROM account_categories WHERE code='10.7' AND company_id=ac.company_id)
  WHERE code IN ('TMP_10.7.01', 'TMP_10.7.02', 'TMP_10.7.03');
  UPDATE account_categories ac
  SET parent_id = (SELECT id FROM account_categories WHERE code='10.8' AND company_id=ac.company_id)
  WHERE code IN ('TMP_10.8.01', 'TMP_10.8.02', 'TMP_10.8.03');
  UPDATE account_categories ac
  SET parent_id = (SELECT id FROM account_categories WHERE code='10.9' AND company_id=ac.company_id)
  WHERE code IN ('TMP_10.9.01', 'TMP_10.9.02', 'TMP_10.9.03');

  -- 7) Eliminar antigos L3-grupo
  DELETE FROM account_categories WHERE code IN ('10.7.01', '10.7.02', '10.7.03');

  -- 8) Fase 2: remover prefixo TMP_
  UPDATE account_categories SET code = REPLACE(code, 'TMP_', '')
  WHERE code LIKE 'TMP\_%' ESCAPE '\';

  -- 9) Auditoria
  SELECT COUNT(*) INTO v_l4_remain FROM account_categories
  WHERE (length(code)-length(replace(code,'.',''))) + 1 = 4;

  SELECT COUNT(*) INTO v_bp_count FROM event_forecasts f
  JOIN account_categories c ON c.id=f.category_id WHERE c.code ~ '^10\.[7-9]';

  SELECT COUNT(*) INTO v_tx_count FROM transactions t
  JOIN account_categories c ON c.id=t.category_id WHERE c.code ~ '^10\.[7-9]';

  IF v_l4_remain > 0 THEN
    RAISE EXCEPTION 'Aplanamento falhou: ainda existem % linhas L4', v_l4_remain;
  END IF;

  RAISE NOTICE 'OK — L4 remanescentes: %, BP em 10.7-9: %, TX em 10.7-9: %',
    v_l4_remain, v_bp_count, v_tx_count;
END
$mig$;