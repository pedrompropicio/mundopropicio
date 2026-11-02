-- ROTEIRO SINTÉTICO PREPARADO, NÃO EXECUTADO; fora da suíte automática.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$
DECLARE x jsonb; y jsonb; p jsonb; h text; before_invoice jsonb; before_lines jsonb; header jsonb; lines jsonb; result jsonb;
BEGIN
  ASSERT session_user = 'authenticated' AND current_user = 'authenticated','actor_identity';
  SELECT f.plan,f.header,f.lines INTO p,header,lines FROM ads486_fixture f;
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
    jsonb_build_object('expected_revision',0,'plan',p));
  ASSERT x->>'revision' = '1','revision_increment';
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT x->'blockers' = '[]'::jsonb,'preview_blockers';
  ASSERT x->'totals' = '{"children":"40.00","outside":"0.00","invoice":"40.00"}'::jsonb,'exact_totals';
  ASSERT jsonb_array_length(x->'effects') = 1,'one_aggregate_raise';
  ASSERT x->'effects'->0->>'kind' = 'raise' AND x->'effects'->0->>'before' = '100.00'
    AND x->'effects'->0->>'delta' = '10.00' AND x->'effects'->0->>'after' = '110.00','100_70_20_20';
  ASSERT x->'line_budgets'->0->>'committed' = '70.00','pending_is_commitment';
  ASSERT x->'category_budgets'->0->>'after' = '0.00','category_after_effect';
  h := x->>'preview_hash';
  ASSERT h ~ '^[0-9a-f]{64}$','sha256';
  y := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT x = y,'repeat_preview_is_identical';
  SELECT to_jsonb(i) INTO before_invoice FROM public.ads_invoice i WHERE id = '48600000-0000-4000-8000-000000000501';
  SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) INTO before_lines FROM public.ads_invoice_line l WHERE invoice_id = '48600000-0000-4000-8000-000000000501';
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
      jsonb_build_object('expected_revision',0,'plan',p));
    RAISE EXCEPTION 'missing_revision_conflict';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM = 'revision_conflict'; END;
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
      jsonb_build_object('expected_revision',1,'plan',jsonb_set(p,'{allocations,0,amount}','"20.001"')));
    RAISE EXCEPTION 'accepted_fractional_cent';
  EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM = 'invalid_plan'; END;
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
      jsonb_build_object('expected_revision',1,'plan',jsonb_set(p,'{allocations,0,event_id}','"48600000-0000-4000-8000-000000000203"')));
    RAISE EXCEPTION 'accepted_foreign_event';
  EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM = 'invalid_plan'; END;
  -- Parcela segura: generate falha, sem falsa operação ou custo. Não é prova
  -- de idempotência financeira: essa aceitação continua expressamente pendente.
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',
      jsonb_build_object('request_key','48600000-0000-4000-8000-000000000701','expected_revision',1,'preview_hash',h,'approvals','[]'::jsonb));
    RAISE EXCEPTION 'partial_contract_generated_money';
  EXCEPTION WHEN feature_not_supported THEN ASSERT SQLERRM = 'contract_unavailable'; END;
  ASSERT before_invoice = (SELECT to_jsonb(i) FROM public.ads_invoice i WHERE id = '48600000-0000-4000-8000-000000000501'),'failures_rollback_invoice';
  -- line_no muda; a identidade e todas as escolhas continuam iguais.
  lines := jsonb_set(jsonb_set(lines,'{0,line_no}','2'),'{1,line_no}','1');
  result := public.ads_invoice_import_v1(header,lines);
  ASSERT result->'identical' = 'true'::jsonb,'identical_import';
  ASSERT before_lines = (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.ads_invoice_line l WHERE invoice_id = '48600000-0000-4000-8000-000000000501'),'identical_preserves_exact_rows';
  ASSERT before_invoice = (SELECT to_jsonb(i) FROM public.ads_invoice i WHERE id = '48600000-0000-4000-8000-000000000501'),'identical_preserves_exact_invoice';
  -- Mesmo total; alteração material na descrição invalida uma identidade.
  lines := jsonb_set(lines,'{1,raw_description}','"Synthetic media B changed"');
  result := public.ads_invoice_import_v1(header,lines);
  ASSERT result->'identical' = 'false'::jsonb AND result->>'status' = 'proposed','changed_import';
  ASSERT jsonb_array_length(result->'preserved_line_ids') = 1 AND jsonb_array_length(result->'unresolved_line_ids') = 1,'unique_match_only';
  y := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT y->>'preview_hash' <> h AND jsonb_array_length(y->'blockers') > 0,'changed_source_invalidates_hash';
  ASSERT (SELECT pending_lines FROM public.ads_invoice_pending_counts(ARRAY['48600000-0000-4000-8000-000000000501'::uuid])) = 1,'single_pending_source';
  -- Trocar a sessão pelo actor B não devolve nem sequer operação vazia de A.
  PERFORM set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000102',true);
  PERFORM set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000102","role":"authenticated"}',true);
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation');
    RAISE EXCEPTION 'tenant_leak';
  EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM = 'forbidden'; END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.transactions) = 1,'no_financial_side_effect';
  ASSERT NOT EXISTS (SELECT 1 FROM public.ads_invoice_generation_operation),'no_partial_operation';
  ASSERT (SELECT amount = 100 AND baseline_amount = 100 FROM public.event_forecasts WHERE id = '48600000-0000-4000-8000-000000000301'),'budget_untouched';
END $$;
ROLLBACK;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM public.companies WHERE slug LIKE 'issue486-%'),'fixture_rolled_back'; END $$;
