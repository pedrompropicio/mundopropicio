-- #321 — teste de crm_ingest_lead_captures com dados SINTÉTICOS (@example.invalid).
-- Corre num único DO que termina SEMPRE em RAISE EXCEPTION -> tudo revertido.
-- session_replication_role=replica desliga os triggers de INSERT de lead_capture
-- (emails VIP/convite) durante o teste; nada fica gravado nem sai para a rede.
-- Resultado esperado: erro "TEST321_OK ..." ; qualquer outra mensagem = falha.
SET LOCAL session_replication_role = replica;
DO $t$
DECLARE
  MP uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  CO uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  ids uuid[]; r1 jsonb; r2 jsonb; r3 jsonb;
  net0 bigint; net1 bigint; c_exist uuid; c_x uuid; v int; s text;
BEGIN
  SELECT count(*) INTO net0 FROM net.http_request_queue;
  -- contacto pré-existente com recusa de email (não pode virar aceite)
  INSERT INTO contacts(company_id,email,consent_email,source) VALUES (MP,'t321-exist@example.invalid',false,'import_x') RETURNING id INTO c_exist;
  -- dois contactos distintos para gerar ambiguidade
  INSERT INTO contacts(company_id,email,source) VALUES (MP,'t321-amb@example.invalid','import_x');
  INSERT INTO contacts(company_id,phone_e164,source) VALUES (MP,'+351900000321','import_x') RETURNING id INTO c_x;

  INSERT INTO lead_capture(id,company_id,email,consent_email,source,event_slug,created_at) VALUES
   (a,MP,'T321-New@Example.invalid ',true,'vip_event_page','t321-slug', now()-interval '2 days'),
   (b,MP,'t321-exist@example.invalid',true,'sticky_cta',NULL, now()-interval '1 day'),
   (c,CO,'t321-inv@example.invalid',true,'coala_early_bird_invite',NULL, now()),
   (d,MP,'t321-club@example.invalid',false,'clube_newgang',NULL, now()),
   (e,gen_random_uuid(),'t321-unk@example.invalid',true,'portal',NULL, now()),
   (f,MP,'t321-amb@example.invalid',true,'portal',NULL, now()),
   (g,CO,'t321-new@example.invalid',true,'coala_hero_email',NULL, now());
  UPDATE lead_capture SET phone='+351900000321' WHERE id=f;
  ids := ARRAY[a,b,c,d,e,f,g];

  r1 := crm_ingest_lead_captures(50, ids);
  IF (r1->>'processed')::int <> 4 OR (r1->>'contacts_new')::int <> 3 OR (r1->>'leads_new')::int <> 3
     OR (r1->>'invite_no_interaction')::int <> 1 OR (r1->>'quarantine')::int <> 3 OR (r1->>'errors')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL contagens 1ª corrida: %', r1; END IF;

  -- consentimento existente preservado (recusa não promovida), origem preservada
  SELECT count(*) INTO v FROM contacts WHERE id=c_exist AND consent_email=false AND consent_email_at IS NULL AND source='import_x';
  IF v<>1 THEN RAISE EXCEPTION 'FAIL consentimento/origem do contacto existente alterado'; END IF;
  -- tenant: mesmo email em MP e Coala = contactos separados
  SELECT count(*) INTO v FROM contacts WHERE lower(email)='t321-new@example.invalid';
  IF v<>2 THEN RAISE EXCEPTION 'FAIL isolamento por empresa (%)', v; END IF;
  -- timestamps originais e consentimento novo datado na captura
  SELECT count(*) INTO v FROM contacts x JOIN lead_capture l ON l.id=a
   WHERE x.company_id=MP AND x.email='t321-new@example.invalid' AND x.first_seen_at=l.created_at AND x.consent_email_at=l.created_at;
  IF v<>1 THEN RAISE EXCEPTION 'FAIL timestamps originais'; END IF;
  -- leads novos: ligação rastreável e NÃO elegíveis CAPI
  SELECT count(*) INTO v FROM leads WHERE meta->>'lead_capture_id' IN (a::text,b::text,g::text)
    AND capi_status='blocked_no_consent' AND capi_sent_at IS NULL AND kind<>'redirect_click';
  IF v<>3 THEN RAISE EXCEPTION 'FAIL leads bloqueados CAPI (%)', v; END IF;
  SELECT count(*) INTO v FROM leads WHERE meta->>'lead_capture_id' IN (a::text,b::text,g::text)
    AND (capi_status IS NULL OR capi_status='retry');
  IF v<>0 THEN RAISE EXCEPTION 'FAIL lead elegível para a fila CAPI'; END IF;
  -- convite: sem interação
  SELECT count(*) INTO v FROM leads WHERE meta->>'lead_capture_id'=c::text;
  IF v<>0 THEN RAISE EXCEPTION 'FAIL convite gerou interação'; END IF;
  -- clube / empresa desconhecida / ambíguo: não processados, com motivo
  SELECT count(*) INTO v FROM lead_capture WHERE id IN (d,e,f) AND processed=false AND processing_error LIKE 'quarantine#321:%';
  IF v<>3 THEN RAISE EXCEPTION 'FAIL quarentena (%)', v; END IF;
  SELECT count(*) INTO v FROM contacts WHERE email IN ('t321-club@example.invalid','t321-unk@example.invalid');
  IF v<>0 THEN RAISE EXCEPTION 'FAIL contacto criado fora do âmbito'; END IF;

  -- rerun idempotente
  r2 := crm_ingest_lead_captures(50, ids);
  IF (r2->>'processed')::int <> 0 OR (r2->>'contacts_new')::int <> 0 OR (r2->>'leads_new')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL rerun não idempotente: %', r2; END IF;

  -- retry: resolvida a ambiguidade (telefone do contacto removido no teste), o item recupera
  UPDATE contacts SET phone_e164=NULL WHERE id=c_x;
  r3 := crm_ingest_lead_captures(50, ARRAY[f]);
  IF (r3->>'processed')::int <> 1 OR (r3->>'contacts_new')::int <> 0 THEN RAISE EXCEPTION 'FAIL retry: %', r3; END IF;
  SELECT processing_error INTO s FROM lead_capture WHERE id=f AND processed;
  IF s IS NOT NULL THEN RAISE EXCEPTION 'FAIL erro não limpo após retry'; END IF;

  -- duplicados por empresa
  SELECT count(*) INTO v FROM (SELECT company_id, lower(btrim(email)) FROM contacts WHERE email IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) z;
  IF v<>0 THEN RAISE EXCEPTION 'FAIL duplicados'; END IF;

  SELECT count(*) INTO net1 FROM net.http_request_queue;
  IF net1<>net0 THEN RAISE EXCEPTION 'FAIL pedido de rede criado (% -> %)', net0, net1; END IF;
  IF capi_dispatch_allowed() THEN RAISE EXCEPTION 'FAIL CAPI não suspensa'; END IF;

  RAISE EXCEPTION 'TEST321_OK r1=% r2=% r3=% net=%->%', r1, r2, r3, net0, net1;
END $t$;
