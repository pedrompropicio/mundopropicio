-- Cenários numéricos dos contratos de cachê (PG local descartável, depois de stub.sql + migração).
\set ON_ERROR_STOP 1
SET t.uid = '00000000-0000-0000-0000-0000000000a1';
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-0000000000a1','pedro@test');
INSERT INTO public.user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin');
INSERT INTO public.account_categories VALUES ('00000000-0000-0000-0000-00000000ca01','2.1.01','00000000-0000-0000-0000-0000000000c1');
INSERT INTO public.suppliers VALUES
 ('00000000-0000-0000-0000-00000000a000','ARTISTA','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-00000000a0a7','MINISTERIO DAS FINANCAS - IRS','00000000-0000-0000-0000-0000000000c1');

CREATE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF c IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', msg; END IF; RAISE NOTICE 'ok — %', msg; END $$;
CREATE FUNCTION pg_temp.fails(sql text, expect text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
    IF position(expect in SQLERRM) > 0 THEN RAISE NOTICE 'ok — recusado: %', expect; RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: erro inesperado %', SQLERRM; END;
  RAISE EXCEPTION 'FALHOU: devia recusar (%)', expect;
END $$;
-- cria turnê: pai + cidades com linha cache_module
CREATE FUNCTION pg_temp.tour(p_root uuid, p_caps numeric[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE i int; e uuid; cfg uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.events VALUES (p_root, 'Root', '2026-01-01', NULL, '00000000-0000-0000-0000-0000000000c1');
  INSERT INTO public.event_cache_configs VALUES (cfg, p_root, '00000000-0000-0000-0000-00000000a000');
  IF array_length(p_caps,1) = 1 THEN
    INSERT INTO public.event_forecasts VALUES (gen_random_uuid(), p_root, p_caps[1], 'cache_module', cfg, NULL);
    RETURN;
  END IF;
  FOR i IN 1..array_length(p_caps,1) LOOP
    e := gen_random_uuid();
    INSERT INTO public.events VALUES (e, 'Cidade'||i, ('2026-02-0'||i)::date, p_root, '00000000-0000-0000-0000-0000000000c1');
    INSERT INTO public.event_forecasts VALUES (gen_random_uuid(), e, p_caps[i], 'cache_module', cfg, NULL);
  END LOOP;
END $$;
CREATE FUNCTION pg_temp.city(p_root uuid, n int) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.events WHERE parent_event_id=p_root AND name='Cidade'||n $$;
CREATE FUNCTION pg_temp.city_sum(p_contract uuid, p_event uuid, p_role text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(amount),0) FROM public.transactions WHERE cache_contract_id=p_contract AND event_id=p_event AND cache_role=p_role $$;
CREATE FUNCTION pg_temp.legacy(p_event uuid, p_amount numeric) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.transactions(description,type,amount,iva_rate,event_id,category_id,forecast_id,supplier_id,date,status,company_id)
  SELECT 'Adiantamento legado','expense',p_amount,0,p_event,'00000000-0000-0000-0000-00000000ca01',f.id,'00000000-0000-0000-0000-00000000a000','2026-01-10','paid','00000000-0000-0000-0000-0000000000c1'
    FROM public.event_forecasts f WHERE f.event_id=p_event RETURNING id $$;

-- ================= Cenário 1: Lisboa 20k / Porto 10k
SELECT pg_temp.tour('00000000-0000-0000-0000-000000000100', ARRAY[20000,10000]);
SELECT pg_temp.legacy(pg_temp.city('00000000-0000-0000-0000-000000000100',1), 5000) AS adv1 \gset
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000',
  12000, false, NULL, NULL, '2026-03-01', '{}', 'Co-produção', 'k1') AS c1 \gset
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000',
  18000, true, 25, '2026-04-20', '2026-03-01', ARRAY[:'adv1']::uuid[], 'Artístico', 'k2') AS c2 \gset
SELECT pg_temp.ok(pg_temp.city_sum(:'c1', pg_temp.city('00000000-0000-0000-0000-000000000100',1), 'artist_balance') = 8000, 'C1 Lisboa 8000');
SELECT pg_temp.ok(pg_temp.city_sum(:'c1', pg_temp.city('00000000-0000-0000-0000-000000000100',2), 'artist_balance') = 4000, 'C1 Porto 4000');
SELECT pg_temp.ok(pg_temp.city_sum(:'c2', pg_temp.city('00000000-0000-0000-0000-000000000100',1), 'withholding') = 3000, 'C2 retenção Lisboa 3000');
SELECT pg_temp.ok(pg_temp.city_sum(:'c2', pg_temp.city('00000000-0000-0000-0000-000000000100',2), 'withholding') = 1500, 'C2 retenção Porto 1500');
SELECT pg_temp.ok(pg_temp.city_sum(:'c2', pg_temp.city('00000000-0000-0000-0000-000000000100',1), 'artist_balance') = 4000, 'C2 saldo Lisboa 4000');
SELECT pg_temp.ok(pg_temp.city_sum(:'c2', pg_temp.city('00000000-0000-0000-0000-000000000100',2), 'artist_balance') = 4500, 'C2 saldo Porto 4500');
SELECT pg_temp.ok((SELECT amount FROM public.transactions WHERE id=(SELECT artist_mother_id FROM public.cache_payment_contracts WHERE id=:'c2')) = 8500, 'C2 mãe saldo 8500');
SELECT pg_temp.ok((SELECT amount FROM public.transactions WHERE id=(SELECT withholding_mother_id FROM public.cache_payment_contracts WHERE id=:'c2')) = 4500, 'C2 mãe retenção 4500');
SELECT pg_temp.ok((SELECT sum(amount) FROM public.transactions WHERE event_id=pg_temp.city('00000000-0000-0000-0000-000000000100',1)) = 20000, 'Total Lisboa 20000');
SELECT pg_temp.ok((SELECT sum(amount) FROM public.transactions WHERE event_id=pg_temp.city('00000000-0000-0000-0000-000000000100',2)) = 10000, 'Total Porto 10000');
SELECT pg_temp.ok((SELECT bool_and(event_id IS NULL AND forecast_id IS NULL) FROM public.transactions WHERE parent_transaction_id IS NULL AND cache_role IN ('artist_balance','withholding')), 'mães sem evento/linha');
SELECT pg_temp.ok((SELECT count(*) FROM (SELECT parent_transaction_id, sum(split_percentage) s FROM public.transactions WHERE parent_transaction_id IS NOT NULL GROUP BY 1) z WHERE s <> 100) = 0, 'split_percentage soma 100');
SELECT pg_temp.ok((SELECT supplier_id FROM public.transactions WHERE cache_role='withholding' AND parent_transaction_id IS NULL LIMIT 1) = '00000000-0000-0000-0000-00000000a0a7', 'retenção vai para AT da empresa');
-- replay idempotente
SELECT pg_temp.ok(public.create_cache_payment_contract('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000',
  18000, true, 25, '2026-04-20', '2026-03-01', ARRAY[:'adv1']::uuid[], 'Artístico', 'k2') = :'c2'::uuid, 'replay devolve o mesmo contrato');
-- teto esgotado
SELECT pg_temp.fails($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1, false, NULL, NULL, NULL, '{}', NULL, NULL)$$, 'teto_excedido');
-- adiantamento livre recusado sem restante por contratar
SELECT pg_temp.fails($$SELECT public.create_cache_advance('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000',NULL, 100, NULL)$$, 'sem_restante_por_contratar');
-- pós-fecho: adiantamento 2000 no contrato 1 (saldos 8000/4000) -> 1333.33 / 666.67
SELECT public.add_cache_contract_advance(:'c1', 2000, '2026-02-15', NULL, 'a1') AS pa \gset
SELECT pg_temp.ok(pg_temp.city_sum(:'c1', pg_temp.city('00000000-0000-0000-0000-000000000100',1), 'advance') = 1333.33, 'pós-fecho Lisboa 1333.33');
SELECT pg_temp.ok(pg_temp.city_sum(:'c1', pg_temp.city('00000000-0000-0000-0000-000000000100',2), 'advance') = 666.67, 'pós-fecho Porto 666.67');
SELECT pg_temp.ok((SELECT amount FROM public.transactions WHERE id=(SELECT artist_mother_id FROM public.cache_payment_contracts WHERE id=:'c1')) = 10000, 'saldo C1 reduz para 10000');
SELECT pg_temp.ok((SELECT gross FROM public.cache_payment_contracts WHERE id=:'c1') = 12000, 'bruto C1 inalterado');
SELECT pg_temp.ok((SELECT sum(amount) FROM public.transactions WHERE event_id=pg_temp.city('00000000-0000-0000-0000-000000000100',1)) = 20000, 'Total Lisboa preservado');
SELECT pg_temp.fails(format($$SELECT public.add_cache_contract_advance(%L, 13000, NULL)$$, :'c1'), 'acima_do_saldo');
SELECT pg_temp.fails($$SELECT public.add_cache_contract_advance(NULL, 100, NULL)$$, 'contrato_inexistente');
-- contrato já pago: recusa adiantamento e cancelamento
UPDATE public.transactions SET paid_amount = amount, status='paid' WHERE id=(SELECT artist_mother_id FROM public.cache_payment_contracts WHERE id=:'c2');
SELECT pg_temp.fails(format($$SELECT public.add_cache_contract_advance(%L, 100, NULL)$$, :'c2'), 'acima_do_saldo');
SELECT pg_temp.fails(format($$SELECT public.cancel_cache_payment_breakdown(%L)$$, :'c2'), 'contrato_com_pagamento');
SELECT pg_temp.fails(format($$SELECT public.update_cache_payment_contract(%L, '00000000-0000-0000-0000-00000000a000', 18000, false, NULL, NULL, NULL)$$, :'c2'), 'contrato_com_pagamento');
-- reutilização de adiantamento já ligado
SELECT pg_temp.fails(format($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1, false, NULL, NULL, NULL, ARRAY[%L]::uuid[])$$, :'adv1'), 'adiantamento_ja_associado');
-- invariantes
SELECT pg_temp.ok((SELECT bool_and(current_count = 0) FROM public._run_invariant_checks_cache_contracts()), 'invariantes cache conformes');

-- cancelar contrato 1 (sem pagamento na mãe): vai para o Lixo, adiantamento pós-fecho desassociado
SELECT public.cancel_cache_payment_breakdown(:'c1', 'teste');
SELECT pg_temp.ok((SELECT cancelled_at IS NOT NULL FROM public.cache_payment_contracts WHERE id=:'c1'), 'C1 cancelado');
SELECT pg_temp.ok((SELECT count(*) FROM public.trash WHERE entity_type='transaction') = 1, 'mãe C1 no Lixo com filhas');
SELECT pg_temp.ok((SELECT count(*) FROM public.transactions WHERE cache_contract_id=:'c1') = 0, 'nada ligado a C1');
SELECT pg_temp.ok((SELECT cache_contract_id IS NULL FROM public.transactions WHERE id=:'pa'), 'adiantamento pós-fecho fica livre');

-- ================= Cenário 2: Lisboa adiantamento 10k -> saldo -1000 recusado
SELECT pg_temp.tour('00000000-0000-0000-0000-000000000200', ARRAY[20000,10000]);
SELECT pg_temp.legacy(pg_temp.city('00000000-0000-0000-0000-000000000200',1), 10000) AS adv2 \gset
SELECT pg_temp.fails(format($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 18000, true, 25, '2026-04-20', NULL, ARRAY[%L]::uuid[])$$, :'adv2'), 'saldo_negativo');
SELECT pg_temp.fails($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 18000, NULL, NULL, NULL, NULL)$$, 'retencao_sem_resposta');
SELECT pg_temp.fails($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, true, 25, NULL, NULL)$$, 'vencimento_retencao_obrigatorio');
-- 5.º contrato recusado
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, false, NULL, NULL, NULL);
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, false, NULL, NULL, NULL);
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, false, NULL, NULL, NULL);
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, false, NULL, NULL, NULL) AS c24 \gset
SELECT pg_temp.fails($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 1000, false, NULL, NULL, NULL)$$, 'limite_contratos');
-- alterar = cancelar + recriar atómico
SELECT public.update_cache_payment_contract(:'c24', '00000000-0000-0000-0000-00000000a000', 2000, true, 25, '2026-05-01', NULL) AS c24b \gset
SELECT pg_temp.ok((SELECT replaced_by FROM public.cache_payment_contracts WHERE id=:'c24') = :'c24b'::uuid, 'alterar substitui o contrato');
SELECT pg_temp.ok((SELECT withholding_amount FROM public.cache_payment_contracts WHERE id=:'c24b') = 500, 'novo contrato com retenção 500');

-- ================= Cenário 3: 3 cidades 20k/10k/5k, contrato 30k 25%
SELECT pg_temp.tour('00000000-0000-0000-0000-000000000300', ARRAY[20000,10000,5000]);
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 30000, true, 25, '2026-04-20', NULL) AS c3 \gset
SELECT pg_temp.ok((SELECT array_agg(quota ORDER BY cap DESC) FROM public.cache_payment_contract_cities WHERE contract_id=:'c3') = ARRAY[17142.86,8571.43,4285.71]::numeric[], 'quotas 17142.86/8571.43/4285.71');
SELECT pg_temp.ok((SELECT array_agg(withholding ORDER BY cap DESC) FROM public.cache_payment_contract_cities WHERE contract_id=:'c3') = ARRAY[4285.71,2142.86,1071.43]::numeric[], 'retenções 4285.71/2142.86/1071.43');
SELECT pg_temp.ok((SELECT array_agg(artist_balance ORDER BY cap DESC) FROM public.cache_payment_contract_cities WHERE contract_id=:'c3') = ARRAY[12857.15,6428.57,3214.28]::numeric[], 'saldos 12857.15/6428.57/3214.28');
SELECT pg_temp.ok((SELECT sum(quota) FROM public.cache_payment_contract_cities WHERE contract_id=:'c3') = 30000, 'soma quotas 30000');

-- ================= Cenário 4: evento simples 10k, adiantamento livre + contrato com retenção
SELECT pg_temp.tour('00000000-0000-0000-0000-000000000400', ARRAY[10000]);
SELECT public.create_cache_advance('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-00000000a000',NULL, 2000, '2026-01-20', NULL, 'adv4') AS adv4 \gset
SELECT pg_temp.ok(public.create_cache_advance('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-00000000a000',NULL, 2000, '2026-01-20', NULL, 'adv4') = :'adv4'::uuid, 'replay adiantamento');
SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 10000, true, 25, '2026-04-20', NULL, ARRAY[:'adv4']::uuid[]) AS c4 \gset
SELECT pg_temp.ok(pg_temp.city_sum(:'c4', '00000000-0000-0000-0000-000000000400', 'artist_balance') = 5500, 'simples: saldo 10000-2500-2000 = 5500');
SELECT pg_temp.ok(pg_temp.city_sum(:'c4', '00000000-0000-0000-0000-000000000400', 'withholding') = 2500, 'simples: retenção 2500');
SELECT pg_temp.ok((SELECT bool_and(current_count = 0) FROM public._run_invariant_checks_cache_contracts()), 'invariantes finais conformes');

-- ================= Atomicidade: falha da 2.ª mãe (fornecedor AT em falta) não deixa nada
SELECT pg_temp.tour('00000000-0000-0000-0000-000000000500', ARRAY[10000]);
DELETE FROM public.suppliers WHERE name='MINISTERIO DAS FINANCAS - IRS';
SELECT pg_temp.fails($$SELECT public.create_cache_payment_contract('00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-00000000a000','00000000-0000-0000-0000-00000000a000', 10000, true, 25, '2026-04-20', NULL)$$, 'fornecedor_at_em_falta');
SELECT pg_temp.ok((SELECT count(*) FROM public.cache_payment_contracts WHERE root_event_id='00000000-0000-0000-0000-000000000500') = 0
  AND (SELECT count(*) FROM public.transactions WHERE cache_root_event_id='00000000-0000-0000-0000-000000000500') = 0, 'atomicidade: nada gravado');
-- sem permissão
SET t.uid = '00000000-0000-0000-0000-0000000000ff';
SELECT pg_temp.fails($$SELECT public.create_cache_advance('00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-00000000a000',NULL, 1, NULL)$$, 'permission_denied');
\echo TODOS_OS_CENARIOS_OK
