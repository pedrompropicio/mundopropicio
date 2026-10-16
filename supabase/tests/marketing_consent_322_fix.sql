-- #322 correção ERP — testes do modelo corrigido (revisão do servidor, recibo por decisão, política vigente, sanitização).
-- Um único DO que termina SEMPRE em RAISE EXCEPTION 'TEST322FIX_OK' (rollback total).
-- Fixtures só em marketing_consent_* e redirect_log (único trigger: guarda de consentimento). Nunca lead_capture/leads. Sem rede.
DO $t$
DECLARE
  mp uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  tok text := encode(extensions.gen_random_bytes(32), 'hex');
  tok2 text := encode(extensions.gen_random_bytes(32), 'hex');
  tok3 text := encode(extensions.gen_random_bytes(32), 'hex');
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid();
  r jsonb; rr jsonb; b jsonb; r1 text; r2 text; sub uuid; ev1 bigint; ev2 bigint; ce uuid := gen_random_uuid(); x record;
  n_net bigint := (SELECT count(*) FROM net.http_request_queue);
BEGIN
  INSERT INTO public.marketing_consent_policies VALUES ('mp','t-v1', now()-interval '1 day', NULL, 180, now()) ON CONFLICT DO NOTHING;
  INSERT INTO public.marketing_consent_policies VALUES ('mp','t-ret', now()-interval '1 day', NULL, 180, now()) ON CONFLICT DO NOTHING;

  -- sanitização (bug reproduzido na verificação)
  ASSERT public.marketing_strip_meta_params('https://x.invalid/?fbclid=A&fbp=B&_fbc=C&id=7') = 'https://x.invalid/?id=7', 'consecutivos';
  ASSERT public.marketing_strip_meta_params('https://x.invalid/p?%5Ffbc=1&FBCLID=2&%66bp=3&utm_source=ig#k=1&fbclid=9') = 'https://x.invalid/p?utm_source=ig#k=1', 'percent-encoded/maiúsculas/fragmento';
  ASSERT public.marketing_strip_meta_params('https://x.invalid/?fbclid=1') = 'https://x.invalid/', 'só meta';
  ASSERT public.marketing_strip_meta_params('olá? a=b&&c') = 'olá? a=b&&c', 'texto sem ids intacto';
  ASSERT public.marketing_strip_meta_json('{"landing_url":"https://a.pt/?fbclid=1&x=2","referrer":"https://g.pt/?_fbp=1","n":{"fbc":"z","arr":["https://q.pt/?fbp=1&id=3"]},"form":"ok"}')
       = '{"landing_url":"https://a.pt/?x=2","referrer":"https://g.pt/","n":{"arr":["https://q.pt/?id=3"]},"form":"ok"}'::jsonb, 'raw aninhado';

  -- token obrigatório (servidor nunca cria sujeito sem token); grant exige expected_revision
  ASSERT public.marketing_consent_record(mp,'mp',NULL,'granted','meta_ads','t-v1','b1',1,NULL,i1,'o','/',0)->>'error' = 'subject_invalid', 'sem token';
  ASSERT public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',1,NULL,i1,'o','/',NULL)->>'error' = 'expected_revision_required', 'sem revisão';

  -- 1.ª decisão (bootstrap) + retry com a mesma idempotency_key => mesmo sujeito e mesma decisão
  r := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',100,NULL,i1,'o','/',0);
  ASSERT (r->>'ok')::boolean AND (r->>'marketing_allowed')::boolean AND (r->>'revision')::int = 1, 'grant inicial';
  ev1 := (r->>'decision_id')::bigint; r1 := r->>'consent_receipt';
  rr := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',100,NULL,i1,'o','/',0);
  ASSERT (rr->>'replay')::boolean AND (rr->>'decision_id')::bigint = ev1 AND rr->>'consent_receipt' = r1, 'retry idempotente';
  -- outra aba com o mesmo token e outra chave: não cria 2.º grant (precondição causal)
  ASSERT public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',101,NULL,gen_random_uuid(),'o','/',0)->>'error' = 'revision_conflict', 'aba concorrente';
  ASSERT (SELECT count(*) FROM public.marketing_consent_subjects s JOIN public.marketing_consent_events e ON e.subject_id = s.id
          WHERE s.token_hash = encode(extensions.digest(tok,'sha256'),'hex')) = 1, 'um sujeito, uma decisão';

  -- recibo por decisão
  b := public.marketing_consent_bind(mp,'mp',tok,r1);
  ASSERT (b->>'proof')::boolean AND (b->>'event_id')::bigint = ev1, 'bind recibo exato';
  sub := (b->>'subject_id')::uuid;
  ASSERT public.marketing_consent_bind(mp,'mp',tok,NULL)->>'reason' = 'no_receipt', 'só token não basta';
  ASSERT public.marketing_consent_bind(mp,'mp',tok, ev1||'.1.'||repeat('a',64))->>'reason' = 'receipt_invalid', 'recibo inventado';
  ASSERT public.marketing_consent_bind(mp,'mp',tok2,r1)->>'reason' = 'subject_invalid', 'recibo com outro token';
  ASSERT public.marketing_consent_bind(mp,'newgang',tok,r1)->>'reason' = 'subject_invalid', 'MP->Newgang';
  ASSERT public.marketing_consent_record(mp,'newgang',tok,'revoked','meta_ads','t-v1','b1',1,NULL,gen_random_uuid(),'o','/',NULL)->>'error' = 'subject_invalid', 'token MP no Newgang';

  -- interação capturada com prova (service_role) antes da revogação
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.redirect_log (event_slug, fbc, client_event_id, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
    VALUES ('t322fix', 'fb.1.1.x', ce, sub, ev1, 'mp', mp);
  SELECT * INTO x FROM public.redirect_log WHERE client_event_id = ce;
  ASSERT x.consent_event_id = ev1 AND x.fbc IS NOT NULL, 'vínculo persistido';

  -- revoke com client_seq MENOR (aba atrasada / relógio para trás) vence na mesma: ordem = revisão do servidor
  r := public.marketing_consent_record(mp,'mp',tok,'revoked','meta_ads','t-v1','b1',1,NULL,i2,'o','/',NULL);
  ASSERT (r->>'ok')::boolean AND NOT (r->>'marketing_allowed')::boolean AND r->>'effective_state' = 'revoked' AND r->'consent_receipt' = 'null'::jsonb, 'revoke nunca allowed';
  ASSERT public.marketing_consent_bind(mp,'mp',tok,r1)->>'reason' = 'superseded', 'recibo antigo morto';
  ASSERT NOT public.marketing_consent_binding_valid(sub, ev1, mp, 'mp', x.created_at), 'revogação bloqueia pendente';
  -- retry do grant antigo (mesma chave) depois do revoke: replay sem efeito
  rr := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',100,NULL,i1,'o','/',0);
  ASSERT (rr->>'replay')::boolean AND NOT (rr->>'marketing_allowed')::boolean AND rr->'consent_receipt' = 'null'::jsonb, 'replay grant após revoke';
  -- grant atrasado com chave nova, seq futuro e revisão antiga: recusado
  ASSERT public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',9999999999999,NULL,gen_random_uuid(),'o','/',1)->>'error' = 'revision_conflict', 'grant obsoleto';
  ASSERT (SELECT state FROM public.marketing_consent_effective(sub, clock_timestamp())) = 'revoked', 'continua revogado';

  -- novo grant explícito (revisão atual): não recupera interação antiga; recibo antigo não é trocado
  r := public.marketing_consent_record(mp,'mp',tok,'granted','meta_ads','t-v1','b1',2,NULL,gen_random_uuid(),'o','/',2);
  ASSERT (r->>'marketing_allowed')::boolean, 'regrant';
  ev2 := (r->>'decision_id')::bigint; r2 := r->>'consent_receipt';
  ASSERT NOT public.marketing_consent_binding_valid(sub, ev1, mp, 'mp', x.created_at), 'sem retroatividade';
  ASSERT public.marketing_consent_bind(mp,'mp',tok,r1)->>'reason' = 'superseded', 'recibo antigo não sobe para grant novo';
  ASSERT (public.marketing_consent_bind(mp,'mp',tok,r2)->>'proof')::boolean, 'recibo novo';
  -- retry da mesma interação (mesmo client_event_id) com o vínculo novo: não reinterpreta
  INSERT INTO public.redirect_log (event_slug, client_event_id, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
    VALUES ('t322fix', ce, sub, ev2, 'mp', mp);
  ASSERT (SELECT count(*) FROM public.redirect_log WHERE client_event_id = ce AND consent_event_id = ev2) = 0, 'retry não reinterpreta';

  -- inserção sem service_role: vínculo e ids Meta retirados, URLs limpas por parâmetro
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO public.redirect_log (event_slug, fbc, fbp, referrer, destination_url, consent_subject_id, consent_event_id, consent_portal, consent_company_id)
    VALUES ('t322fix-anon', 'a', 'b', 'https://r.pt/?fbclid=1&fbp=2&q=1', 'https://d.pt/?%5Ffbc=1&id=9', sub, ev2, 'mp', mp);
  SELECT * INTO x FROM public.redirect_log WHERE event_slug = 't322fix-anon';
  ASSERT x.consent_event_id IS NULL AND x.fbc IS NULL AND x.fbp IS NULL AND x.referrer = 'https://r.pt/?q=1' AND x.destination_url = 'https://d.pt/?id=9', 'anon não forja';

  -- política retirada depois do grant: deixa de valer agora (captura e envio)
  r := public.marketing_consent_record(mp,'mp',tok3,'granted','meta_ads','t-ret','b1',1,NULL,gen_random_uuid(),'o','/',0);
  ASSERT (r->>'marketing_allowed')::boolean, 'grant política t-ret';
  UPDATE public.marketing_consent_policies SET valid_to = clock_timestamp() WHERE portal = 'mp' AND policy_version = 't-ret';
  PERFORM pg_sleep(0.01);
  ASSERT public.marketing_consent_bind(mp,'mp',tok3,r->>'consent_receipt')->>'reason' = 'expired_or_policy', 'política retirada';
  ASSERT public.marketing_consent_record(mp,'mp',tok3,'granted','meta_ads','t-ret','b1',2,NULL,gen_random_uuid(),'o','/',1)->>'error' = 'policy_invalid', 'grant política retirada';
  -- deny/revoke aceites mesmo com política retirada e sem revisão
  ASSERT (public.marketing_consent_record(mp,'mp',tok3,'denied','meta_ads','t-ret','b1',3,NULL,gen_random_uuid(),'o','/',NULL)->>'ok')::boolean, 'deny conservador';

  ASSERT NOT public.capi_dispatch_allowed(), 'CAPI suspensa';
  ASSERT (SELECT count(*) FROM net.http_request_queue) = n_net, 'zero pedidos de rede';
  RAISE EXCEPTION 'TEST322FIX_OK';
END $t$;
