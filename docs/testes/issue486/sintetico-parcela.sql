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
  -- O gerador está implementado; o pedido sem confirmação é recusado.
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',
      jsonb_build_object('request_key','48600000-0000-4000-8000-000000000701','expected_revision',1,'preview_hash',h,'approvals','[]'::jsonb));
    RAISE EXCEPTION 'generated_unconfirmed';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM = 'confirmation_required'; END;
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

-- C2/P8: atestação real, repetição, identidade inválida e saída de confirmed.
BEGIN;
\ir fixture.sql
CREATE TEMP TABLE source_case(source jsonb);
INSERT INTO source_case SELECT source_attestation FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501';
GRANT ALL ON source_case TO service_role;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE src jsonb; x jsonb; BEGIN
 SELECT source INTO src FROM source_case;
 x:=public.ads_invoice_source_attest_v1('48600000-0000-4000-8000-000000000501',0,src);
 ASSERT x->'identical'='true'::jsonb AND x->>'revision'='0','attestation_exact_retry';
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_source_attest_v1(%L,0,%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',jsonb_set(src,'{identity,supplier_nif}','"absent-synthetic-nif"')), 'P0422','financial_source_required');
 src:=jsonb_set(jsonb_set(src,'{sha256}',to_jsonb(repeat('b',64))),'{identity,sha256}',to_jsonb(repeat('b',64)));
 x:=public.ads_invoice_source_attest_v1('48600000-0000-4000-8000-000000000501',0,src);
 ASSERT x->'identical'='false'::jsonb AND x->>'revision'='1','new_source_increments_revision';
 UPDATE source_case SET source=src;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',1,'plan',(SELECT plan FROM ads486_fixture)));
INSERT INTO ads486_run(preview) SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',jsonb_build_object('expected_revision',2,'preview_hash',(SELECT preview->>'preview_hash' FROM ads486_run)));
SELECT public.ads_invoice_reopen_v1('48600000-0000-4000-8000-000000000501',2);
DO $$ DECLARE x jsonb; BEGIN
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation');
 ASSERT x->>'revision'='3' AND jsonb_array_length(x->'maintenance')=2,'reopen_unlock_enqueued';
 ASSERT (SELECT generation_plan FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501')=(SELECT plan FROM ads486_fixture),'reopen_preserves_plan';
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',jsonb_build_object('expected_revision',3,'preview_hash',x->>'preview_hash'));
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE src jsonb; x jsonb; BEGIN
 SELECT source INTO src FROM source_case;
 src:=jsonb_set(jsonb_set(src,'{sha256}',to_jsonb(repeat('c',64))),'{identity,sha256}',to_jsonb(repeat('c',64)));
 x:=public.ads_invoice_source_attest_v1('48600000-0000-4000-8000-000000000501',3,src);
 ASSERT x->>'revision'='4','attestation_invalidates_confirmation';
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 ASSERT (SELECT status='proposed' AND confirmed_revision IS NULL AND confirmed_preview_hash IS NULL
  AND jsonb_array_length(generation_maintenance)=4 FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501'),'source_change_unlocks_old_confirmation';
 ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice_generation_operation),'source_changes_no_finance';
END $$;
ROLLBACK;

-- C3-P8-IDENTITY: repetição/ambiguidade/remoção e perda de outside isoladas.
BEGIN;
\ir fixture.sql
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SET SESSION AUTHORIZATION authenticated;
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
 jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
RESET SESSION AUTHORIZATION;
DO $$ DECLARE kind text; h jsonb; ls jsonb; x jsonb; old_ids uuid[]; expected_preserved int; BEGIN
 SELECT header,lines INTO h,ls FROM ads486_fixture;
 old_ids:=ARRAY['48600000-0000-4000-8000-000000000601'::uuid,'48600000-0000-4000-8000-000000000602'::uuid];
 FOREACH kind IN ARRAY ARRAY['incoming_duplicate','old_duplicate','remove','change','outside_remove','outside_ambiguous'] LOOP
  BEGIN
   SELECT header,lines INTO h,ls FROM ads486_fixture;
   expected_preserved:=1;
   IF kind='incoming_duplicate' THEN
    ls:=jsonb_build_array(ls->0,jsonb_set(ls->0,'{line_no}','2')); expected_preserved:=0;
   ELSIF kind='old_duplicate' THEN
    PERFORM public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
    UPDATE public.ads_invoice_line SET raw_description='Synthetic media A',campaign_name='campaign-A' WHERE id=old_ids[2];
    PERFORM public._ads486_leave(); expected_preserved:=0;
   ELSIF kind IN ('remove','outside_remove') THEN
    ls:=jsonb_build_array(ls->1); h:=h||'{"total_amount":"20.00","lines_sum":"20.00"}'::jsonb;
   ELSIF kind='change' THEN ls:=jsonb_set(ls,'{0,raw_description}','"Changed one identity"');
   ELSE ls:=jsonb_build_array(ls->0,jsonb_set(ls->0,'{line_no}','2')); END IF;
   IF kind LIKE 'outside_%' THEN
    PERFORM public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
    UPDATE public.ads_invoice SET generation_plan=jsonb_set(generation_plan,'{allocations,0}',
     (generation_plan#>'{allocations,0}')-ARRAY['event_id','forecast_id']||'{"destination":"outside","observation":"Explicit exclusion"}'::jsonb)
     WHERE id='48600000-0000-4000-8000-000000000501';
    PERFORM public._ads486_leave();
   END IF;
   EXECUTE 'SET SESSION AUTHORIZATION authenticated';
   IF kind LIKE 'outside_%' THEN
    PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_import_v1(%L::jsonb,%L::jsonb)',h,ls),'P0409','request_conflict');
   ELSE
    x:=public.ads_invoice_import_v1(h,ls);
    ASSERT x->'identical'='false'::jsonb,'material_import_'||kind;
    ASSERT jsonb_array_length(x->'preserved_line_ids')=expected_preserved,'only_unique_identity_preserved_'||kind;
    ASSERT (x->>'ambiguous')::boolean=(kind IN ('incoming_duplicate','old_duplicate')),'ambiguity_reported_'||kind;
    ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice_line l WHERE l.id::text IN
     (SELECT jsonb_array_elements_text(x->'unresolved_line_ids')) AND
     (l.event_id IS NOT NULL OR l.event_split IS NOT NULL OR l.matched_by IS NOT NULL OR l.match_source<>'none')),'ambiguous_never_reuses_choice';
    ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice_generation_operation),'reimport_no_operation';
    ASSERT (SELECT count(*) FROM public.transactions)=1,'reimport_no_cost';
   END IF;
   EXECUTE 'RESET SESSION AUTHORIZATION';
   RAISE EXCEPTION USING ERRCODE='P0487',MESSAGE='isolated_reimport';
  EXCEPTION WHEN SQLSTATE 'P0487' THEN ASSERT SQLERRM='isolated_reimport'; END;
 END LOOP;
END $$;
ROLLBACK;
