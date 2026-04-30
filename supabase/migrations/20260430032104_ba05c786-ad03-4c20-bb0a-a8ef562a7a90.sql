-- Aplanamento 10.7.* (L4 → L3) — variante A2; com re-routing de TX órfãs nos antigos L3-grupo

-- 1) Criar 10.8 Estrutura por empresa
INSERT INTO account_categories (id, code, name, type, parent_id, company_id, is_active, event_required)
SELECT gen_random_uuid(), '10.8', 'Estrutura', 'expense',
       (SELECT id FROM account_categories WHERE code='10' AND company_id=c.id),
       c.id, true, true
FROM companies c
WHERE EXISTS (SELECT 1 FROM account_categories WHERE code='10' AND company_id=c.id)
  AND NOT EXISTS (SELECT 1 FROM account_categories WHERE code='10.8' AND company_id=c.id);

-- 2) Criar 10.9 Tecnologia por empresa
INSERT INTO account_categories (id, code, name, type, parent_id, company_id, is_active, event_required)
SELECT gen_random_uuid(), '10.9', 'Tecnologia', 'expense',
       (SELECT id FROM account_categories WHERE code='10' AND company_id=c.id),
       c.id, true, true
FROM companies c
WHERE EXISTS (SELECT 1 FROM account_categories WHERE code='10' AND company_id=c.id)
  AND NOT EXISTS (SELECT 1 FROM account_categories WHERE code='10.9' AND company_id=c.id);

-- 3) Renomear 10.7
UPDATE account_categories SET name = 'Serviços' WHERE code = '10.7';

-- 4) Fase 1: codes temporários nas folhas L4
UPDATE account_categories SET code = 'TMP_10.7.01' WHERE code = '10.7.01.01';
UPDATE account_categories SET code = 'TMP_10.7.02' WHERE code = '10.7.01.02';
UPDATE account_categories SET code = 'TMP_10.7.03' WHERE code = '10.7.01.03';
UPDATE account_categories SET code = 'TMP_10.8.01' WHERE code = '10.7.02.01';
UPDATE account_categories SET code = 'TMP_10.8.02' WHERE code = '10.7.02.02';
UPDATE account_categories SET code = 'TMP_10.8.03' WHERE code = '10.7.02.03';
UPDATE account_categories SET code = 'TMP_10.9.01' WHERE code = '10.7.03.01';
UPDATE account_categories SET code = 'TMP_10.9.02' WHERE code = '10.7.03.02';
UPDATE account_categories SET code = 'TMP_10.9.03' WHERE code = '10.7.03.03';

-- 5) Re-rotar quaisquer dados vinculados aos antigos L3-grupo para a 1ª folha do novo grupo correspondente
-- 10.7.01 (Serviços antigo) → folha TMP_10.7.01 (Contabilidade)
UPDATE transactions t
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.7.01' AND company_id=t.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.01');

UPDATE event_forecasts f
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.7.01' AND company_id=f.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.01');

-- 10.7.02 (Estrutura antigo) → folha TMP_10.8.01 (Aluguer)
UPDATE transactions t
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.8.01' AND company_id=t.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.02');

UPDATE event_forecasts f
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.8.01' AND company_id=f.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.02');

-- 10.7.03 (Tecnologia antigo) → folha TMP_10.9.01 (Softwares)
UPDATE transactions t
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.9.01' AND company_id=t.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.03');

UPDATE event_forecasts f
SET category_id = (SELECT id FROM account_categories WHERE code='TMP_10.9.01' AND company_id=f.company_id)
WHERE category_id IN (SELECT id FROM account_categories WHERE code='10.7.03');

-- 6) Re-parentar as folhas
UPDATE account_categories ac
SET parent_id = (SELECT id FROM account_categories WHERE code='10.7' AND company_id=ac.company_id)
WHERE code IN ('TMP_10.7.01', 'TMP_10.7.02', 'TMP_10.7.03');

UPDATE account_categories ac
SET parent_id = (SELECT id FROM account_categories WHERE code='10.8' AND company_id=ac.company_id)
WHERE code IN ('TMP_10.8.01', 'TMP_10.8.02', 'TMP_10.8.03');

UPDATE account_categories ac
SET parent_id = (SELECT id FROM account_categories WHERE code='10.9' AND company_id=ac.company_id)
WHERE code IN ('TMP_10.9.01', 'TMP_10.9.02', 'TMP_10.9.03');

-- 7) Eliminar antigos L3-grupo (agora sem dependências)
DELETE FROM account_categories WHERE code IN ('10.7.01', '10.7.02', '10.7.03');

-- 8) Fase 2: remover prefixo TMP_
UPDATE account_categories SET code = REPLACE(code, 'TMP_', '')
WHERE code LIKE 'TMP\_%' ESCAPE '\';