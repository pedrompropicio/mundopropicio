-- #322 — testes do ledger de consentimento. Corre num único DO que termina com RAISE (rollback total).
-- Fixtures só em marketing_consent_* , leads (sem triggers de negócio além da cópia de vínculo) e redirect_log
-- (só o guarda de consentimento). Nunca lead_capture (tem triggers de Clube/email). Sem rede.
DO $t$
DECLARE
  mp uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'; coala uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  now_ms bigint := (extract(epoch from now())*1000)::bigint;
  r jsonb; r2 jsonb; tok text; tok_ng text; sub uuid; ev bigint; ev2 bigint; b jsonb; lead uuid; rl record; ok boolean;
  n_net bigint := (SELECT count(*) FROM net.http_request_queue);
BEGIN
  INSERT INTO public.marketing_consent_policies VALUES ('mp','t-v1', now()-interval '400 days', NULL, 180, now()) ON CONFLICT DO NOTHING;
  INSERT INTO public.marketing_consent_policies VALUES ('newgang','t-v1', now()-interval '400 days', NULL, 180, now()) ON CONFLICT DO NOTHING;

  -- validações fail-closed
  ASSERT public.marketing_consent_record(mp,'coala',NULL,'granted','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'scope_invalid', 'tenant errado';
  ASSERT public.marketing_consent_record(mp,'mp',NULL,'granted','analytics','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'purpose_invalid', 'só analytics';
  ASSERT public.marketing_consent_record(mp,'mp',NULL,'granted','meta_ads','desconhecida','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'policy_invalid', 'política inválida';
  ASSERT public.marketing_consent_record(mp,'mp',NULL,'maybe','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'state_invalid', 'estado desconhecido';
  ASSERT public.marketing_consent_record(mp,'mp',NULL,'granted','meta_ads','t-v1','b1',now_ms+999999,NULL,gen_random_uuid(),'o','/')->>'error' = 'seq_invalid', 'seq futuro';
  ASSERT public.marketing_consent_record(mp,'mp',repeat('a',64),'granted','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'subject_invalid', 'recibo inventado';

  -- sem prova / cookie legado (token ausente ou mal formado)
  ASSERT (public.marketing_consent_bind(mp,'mp',NULL)->>'proof')::boolean = false, 'sem token';
  ASSERT (public.marketing_consent_bind(mp,'mp','fb.1.123.abc')->>'proof')::boolean = false, 'cookie _fbc legado não é prova';

  -- grant atual
  r := public.marketing_consent_record(mp,'mp',NULL,'granted','meta_ads','t-v1','b1',now_ms-10,NULL,gen_random_uuid(),'o','/');
  ASSERT (r->>'ok')::boolean AND (r->>'marketing_allowed')::boolean, 'grant';
  tok := r->>'subject_token'; ev := (r->>'decision_id')::bigint;
  ASSERT tok ~ '^[0-9a-f]{64}$', 'token opaco';
  ASSERT NOT EXISTS (SELECT 1 FROM public.marketing_consent_subjects WHERE token_hash = tok), 'só hash guardado';
  b := public.marketing_consent_bind(mp,'mp',tok);
  ASSERT (b->>'proof')::boolean AND (b->>'event_id')::bigint = ev, 'bind grant';
  sub := (b->>'subject_id')::uuid;
  -- portal errado (MP vs Newgang, mesma empresa) e tenant errado
  ASSERT (public.marketing_consent_bind(mp,'newgang',tok)->>'proof')::boolean = false, 'MP->Newgang';
  ASSERT (public.marketing_consent_bind(coala,'coala',tok)->>'proof')::boolean = false, 'MP->Coala';
  ASSERT public.marketing_consent_record(mp,'newgang',tok,'revoked','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/')->>'error' = 'subject_invalid', 'token MP no Newgang';

  -- replay idempotente e conflito
  r2 := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',now_ms-5,NULL,'11111111-1111-1111-1111-111111111111','o','/');
  ev2 := (r2->>'decision_id')::bigint;
  ASSERT (public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',now_ms-5,NULL,'11111111-1111-1111-1111-111111111111','o','/')->>'replay')::boolean, 'replay';
  ASSERT public.marketing_consent_record(mp,'mp',tok,'revoked','meta_ads','t-v1','b1',now_ms-5,NULL,'11111111-1111-1111-1111-111111111111','o','/')->>'error' = 'idempotency_conflict', 'conflito idem';
  ASSERT public.marketing_consent_record(mp,'mp',tok,'revoked','meta_ads','t-v1','b1',now_ms-5,NULL,gen_random_uuid(),'o','/')->>'error' = 'seq_conflict', 'seq repetido';
  ASSERT (SELECT count(*) FROM public.marketing_consent_events WHERE subject_id = sub) = 2, 'replay não duplica';

  -- lead com vínculo válido (fixture em leads; rollback no fim)
  INSERT INTO public.leads (company_id, kind, source, created_at, meta, capi_status)
  VALUES (mp, 'event_interest', 't322', clock_timestamp(), '{}'::jsonb, 'blocked_no_consent') RETURNING id INTO lead;
  ASSERT (SELECT consent_event_id FROM public.leads WHERE id = lead) IS NULL, 'trigger leads limpa vínculo declarado';
  UPDATE public.leads SET consent_subject_id = sub, consent_event_id = ev2, consent_portal = 'mp' WHERE id = lead;
  ASSERT public.capi_consent_proof(lead,'ViewContent'), 'prova válida';
  ASSERT NOT public.capi_consent_proof(lead,'Purchase'), 'evento fora';
  ASSERT public.capi_lead_block_reason(lead) = 'suspended', 'CAPI continua suspensa';
  UPDATE public.leads SET consent_portal = 'newgang' WHERE id = lead;
  ASSERT NOT public.capi_consent_proof(lead,'ViewContent'), 'portal errado no lead';
  UPDATE public.leads SET consent_portal = 'mp', consent_event_id = ev2 + 999999 WHERE id = lead;
  ASSERT NOT public.capi_consent_proof(lead,'ViewContent'), 'recibo de outro vínculo';
  UPDATE public.leads SET consent_event_id = ev2 WHERE id = lead;

  -- out-of-order: grant antigo (seq menor) chega depois de revoke → não vence
  PERFORM public.marketing_consent_record(mp,'mp',tok,'revoked','meta_ads','t-v1','b1',now_ms-1,NULL,gen_random_uuid(),'o','/');
  ASSERT NOT public.capi_consent_proof(lead,'ViewContent'), 'revogação posterior bloqueia pendente';
  r := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',now_ms-3,NULL,gen_random_uuid(),'o','/');
  ASSERT (r->>'marketing_allowed')::boolean = false AND r->>'effective_state' = 'revoked', 'grant atrasado não vence revoke';
  -- regrant não retroativo
  r := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/');
  ASSERT (r->>'marketing_allowed')::boolean, 'regrant ativo';
  ASSERT NOT public.capi_consent_proof(lead,'ViewContent'), 'regrant não recupera lead antigo';

  -- append-only
  BEGIN UPDATE public.marketing_consent_events SET state='granted' WHERE subject_id = sub; ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  ASSERT ok, 'append-only';

  -- expiração: grant recebido há 200 dias com TTL 180
  r := public.marketing_consent_record(mp,'newgang',NULL,'denied','meta_ads','t-v1','b1',now_ms-100,NULL,gen_random_uuid(),'o','/');
  tok_ng := r->>'subject_token';
  INSERT INTO public.marketing_consent_events (subject_id, company_id, portal, state, purpose, policy_version, banner_version, client_seq, server_received_at, idempotency_key)
  SELECT s.id, mp, 'newgang', 'granted', 'meta_ads', 't-v1', 'b1', now_ms-50, now()-interval '200 days', gen_random_uuid()
  FROM public.marketing_consent_subjects s WHERE token_hash = encode(extensions.digest(tok_ng,'sha256'),'hex');
  ASSERT (public.marketing_consent_bind(mp,'newgang',tok_ng)->>'proof')::boolean = false, 'expirado';

  -- guarda de captura em redirect_log: sem service_role, vínculo e identificadores Meta são retirados
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO public.redirect_log (event_slug, fbc, fbp, referrer, destination_url, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
  VALUES ('t322','fb.1.1.x','fb.1.1.y','https://x.pt/?fbclid=AAA&utm_source=ig','https://bilh.pt/e?a=1&fbclid=BBB', sub, ev2, 'mp', mp)
  RETURNING * INTO rl;
  ASSERT rl.fbc IS NULL AND rl.fbp IS NULL AND rl.consent_event_id IS NULL, 'anon não forja vínculo';
  ASSERT rl.referrer = 'https://x.pt/?utm_source=ig' AND rl.destination_url = 'https://bilh.pt/e?a=1', 'URLs sanitizadas: ' || rl.referrer || ' ' || rl.destination_url;
  -- service_role com vínculo válido mantém
  r := public.marketing_consent_record(mp,'mp',NULL,'granted','meta_ads','t-v1','b1',now_ms,NULL,gen_random_uuid(),'o','/');
  b := public.marketing_consent_bind(mp,'mp',r->>'subject_token');
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.redirect_log (event_slug, fbc, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
  VALUES ('t322','fb.1.1.z',(b->>'subject_id')::uuid,(b->>'event_id')::bigint,'mp',mp) RETURNING * INTO rl;
  ASSERT rl.fbc = 'fb.1.1.z' AND rl.consent_event_id = (b->>'event_id')::bigint, 'vínculo válido mantido';
  INSERT INTO public.redirect_log (event_slug, fbc, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
  VALUES ('t322','fb.1.1.w',(b->>'subject_id')::uuid,(b->>'event_id')::bigint,'newgang',mp) RETURNING * INTO rl;
  ASSERT rl.fbc IS NULL AND rl.consent_event_id IS NULL, 'service_role com portal errado também é limpo';

  ASSERT public.capi_dispatch_allowed() = false, 'interruptor';
  ASSERT (SELECT count(*) FROM net.http_request_queue) = n_net, 'sem pedidos de rede';
  RAISE EXCEPTION 'TEST322_OK';
END $t$;
