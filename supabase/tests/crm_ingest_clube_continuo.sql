-- #321 (0168) — clube_newgang no consumidor contínuo, dados SINTÉTICOS (@example.invalid).
-- session_replication_role=replica: nenhum trigger corre (sem membro novo, sem
-- notify_member, sem email). Tudo revertido por RAISE final. Esperado: "TEST321C_OK ...".
SET LOCAL session_replication_role = replica;
DO $t$
DECLARE
  MP uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  site uuid; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  o uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  r1 jsonb; r2 jsonb; v int; net0 bigint; net1 bigint; cid uuid; mem0 int; mem1 int;
BEGIN
  SELECT count(*) INTO net0 FROM net.http_request_queue;
  SELECT id INTO site FROM portal_sites WHERE brand_key='newgang' AND active AND company_id=MP ORDER BY created_at LIMIT 1;
  IF site IS NULL THEN RAISE EXCEPTION 'FAIL sem site Newgang'; END IF;
  -- contacto existente com recusa (tem de ficar intacto) e membro já existente (já com confirmação)
  INSERT INTO contacts(company_id,email,consent_email,source) VALUES (MP,'t321c-a@example.invalid',false,'import_x') RETURNING id INTO cid;
  INSERT INTO club_members(company_id,site_id,email,member_no,referral_code,source)
    VALUES (MP,site,'t321c-a@example.invalid',999001,'T321CA1','formulario');
  SELECT count(*) INTO mem0 FROM club_members;
  INSERT INTO lead_capture(id,company_id,email,consent_email,source,created_at) VALUES
   (a,MP,'T321C-A@example.invalid',true,'clube_newgang', now()-interval '3 min'),
   (b,MP,'t321c-a@example.invalid',true,'clube_newgang', now()-interval '2 min'),  -- mesma pessoa no lote
   (c,MP,'t321c-nomember@example.invalid',true,'clube_newgang', now()-interval '1 min');
  -- 1000+ fora de âmbito antigos não podem impedir o lote (starvation)
  INSERT INTO lead_capture(id,company_id,email,source,created_at)
    SELECT gen_random_uuid(),MP,'t321c-o'||g||'@example.invalid','fonte_x',now()-interval '30 days' FROM generate_series(1,1200) g;
  INSERT INTO lead_capture(id,company_id,email,source,created_at) VALUES (o,MP,'t321c-oo@example.invalid','fonte_x',now()-interval '40 days');

  r1 := crm_ingest_lead_captures(2);
  -- lote de 2: a (processado, contacto existente) + c (sem membro -> erro); b adiado
  IF (r1->>'clube_processed')::int <> 1 OR (r1->>'errors')::int <> 1 OR (r1->>'clube_deferred_same_email')::int <> 0 THEN
    -- b pode entrar no lote antes de c pela ordem; aceitar a ordem a,b
    IF NOT ((r1->>'clube_processed')::int = 1 AND (r1->>'clube_deferred_same_email')::int = 1) THEN
      RAISE EXCEPTION 'FAIL r1 %', r1; END IF;
  END IF;
  IF (r1->>'quarantine')::int < 1000 THEN RAISE EXCEPTION 'FAIL fora de âmbito não marcado à parte %', r1; END IF;
  SELECT count(*) INTO v FROM lead_capture WHERE id=a AND processed; IF v<>1 THEN RAISE EXCEPTION 'FAIL a não processado'; END IF;
  SELECT count(*) INTO v FROM lead_capture WHERE id=b AND processed; IF v<>0 THEN RAISE EXCEPTION 'FAIL mesma pessoa processada 2x no lote'; END IF;
  SELECT count(*) INTO v FROM contacts WHERE id=cid AND consent_email=false AND consent_email_at IS NULL AND source='import_x';
  IF v<>1 THEN RAISE EXCEPTION 'FAIL consentimento/origem alterado'; END IF;
  SELECT count(*) INTO v FROM leads WHERE meta->>'lead_capture_id'=a::text AND capi_status='blocked_no_consent' AND capi_sent_at IS NULL;
  IF v<>1 THEN RAISE EXCEPTION 'FAIL lead clube não bloqueado CAPI'; END IF;
  SELECT count(*) INTO v FROM lead_capture WHERE id=o AND processed=false; IF v<>1 THEN RAISE EXCEPTION 'FAIL fora de âmbito alterado'; END IF;

  r2 := crm_ingest_lead_captures(50);
  SELECT count(*) INTO v FROM lead_capture WHERE id=b AND processed; IF v<>1 THEN RAISE EXCEPTION 'FAIL b não processado na corrida seguinte %', r2; END IF;
  SELECT count(*) INTO v FROM lead_capture WHERE id=c AND processed=false AND processing_error LIKE 'clube#321:%';
  IF v<>1 THEN RAISE EXCEPTION 'FAIL erro clube sem rasto ou processed'; END IF;
  SELECT count(*) INTO v FROM contacts WHERE lower(email)='t321c-nomember@example.invalid';
  IF v<>0 THEN RAISE EXCEPTION 'FAIL contacto gravado apesar do erro'; END IF;
  SELECT count(*) INTO v FROM contacts WHERE company_id=MP AND lower(email)='t321c-a@example.invalid';
  IF v<>1 THEN RAISE EXCEPTION 'FAIL contacto duplicado'; END IF;
  SELECT count(*) INTO mem1 FROM club_members;
  IF mem1<>mem0 THEN RAISE EXCEPTION 'FAIL membro criado/duplicado'; END IF;
  SELECT count(*) INTO net1 FROM net.http_request_queue;
  IF net1<>net0 THEN RAISE EXCEPTION 'FAIL rede'; END IF;
  IF capi_dispatch_allowed() THEN RAISE EXCEPTION 'FAIL CAPI não suspensa'; END IF;
  RAISE EXCEPTION 'TEST321C_OK r1=% r2=% net=%->%', r1, r2, net0, net1;
END $t$;
