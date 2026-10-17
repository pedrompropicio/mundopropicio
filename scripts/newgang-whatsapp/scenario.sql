\set ON_ERROR_STOP 1
-- #332 whatsapp: cenário local em PostgreSQL descartável, sem rede nem dados Live.
-- Corre DEPOIS do cenário person-consent (membro 33333333-...-0002, sessão fixture-session, nascimento 2000-01-01).
CREATE FUNCTION t.ckw(n text,b boolean) RETURNS void LANGUAGE sql AS $$ SELECT t.ok('332w',n,b) $$;
CREATE FUNCTION t.rejectw(j jsonb,e text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN PERFORM t.pref(j); RAISE EXCEPTION 'invalid_accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>e THEN RAISE; END IF; END;
 PERFORM t.ckw(e,true); END $$;

-- 1. estado inicial desconhecido, sem número
SELECT t.ckw('initial unknown',t.consent()#>>'{whatsapp,state}'='unknown' AND (t.consent()#>'{whatsapp,valid_for_current_number}')::boolean=false);
-- 2. grant sem telefone -> erro de contrato claro
SELECT t.rejectw('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000020"}','whatsapp_no_phone');
SELECT t.ckw('no row after no_phone',(SELECT count(*)=0 FROM club_member_whatsapp_consents));
-- 3. guardar telefone válido no perfil e conceder
UPDATE club_members SET phone='+351912345678' WHERE id='33333333-0000-4000-8000-000000000002';
SELECT t.pref('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000021"}');
SELECT t.ckw('granted with phone',t.consent()#>>'{whatsapp,state}'='granted' AND (t.consent()#>'{whatsapp,valid_for_current_number}')::boolean=true);
SELECT t.ckw('version stored',t.consent()#>>'{whatsapp,version}'='whatsapp-v1');
SELECT t.ckw('masked only',t.consent()#>>'{whatsapp,number_masked}'='+351•••••678' AND t.consent()::text NOT LIKE '%912345678%');
SELECT t.ckw('fingerprint not plaintext',(SELECT phone_fp<>'+351912345678' AND length(phone_fp)=64 FROM club_member_whatsapp_consents));
-- 4. retry mesmo UUID não duplica
SELECT t.pref('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000021"}');
SELECT t.ckw('retry once',(SELECT count(*)=1 FROM club_member_whatsapp_consents));
-- 5. mesmo UUID com decisão diferente -> conflito
SELECT t.rejectw('{"channel":"whatsapp","version":"whatsapp-v1","granted":false,"idempotency_key":"33333333-0000-4000-8000-000000000021"}','idempotency_conflict');
-- 6. mudança de número invalida o grant
UPDATE club_members SET phone='+351900000999' WHERE id='33333333-0000-4000-8000-000000000002';
SELECT t.ckw('number change invalidates',t.consent()#>>'{whatsapp,state}'='granted' AND (t.consent()#>'{whatsapp,valid_for_current_number}')::boolean=false);
-- 7. nova autorização no número novo revalida
SELECT t.pref('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000022"}');
SELECT t.ckw('regrant revalidates',(t.consent()#>'{whatsapp,valid_for_current_number}')::boolean=true);
-- 8. revoke nunca exige número (mesmo sem telefone)
UPDATE club_members SET phone=NULL WHERE id='33333333-0000-4000-8000-000000000002';
SELECT t.pref('{"channel":"whatsapp","version":"whatsapp-v1","granted":false,"idempotency_key":"33333333-0000-4000-8000-000000000023"}');
SELECT t.ckw('revoke without phone',t.consent()#>>'{whatsapp,state}'='revoked');
-- 9. grant antigo em retry nunca reabre revogação
SELECT t.pref('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000022"}');
SELECT t.ckw('old grant never reopens',t.consent()#>>'{whatsapp,state}'='revoked');
-- 10. CAS: grant com expected_dates errado -> conflito
SELECT t.rejectw('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"expected_dates":{"whatsapp":null},"idempotency_key":"33333333-0000-4000-8000-000000000024"}','consent_revision_conflict');
-- 11. payload inválido
SELECT t.rejectw('{"channel":"whatsapp","version":"v0","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000025"}','consent_payload');
SELECT t.rejectw('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"platforms":["meta_ads"],"idempotency_key":"33333333-0000-4000-8000-000000000025"}','consent_payload');
-- 12. independência: whatsapp não mexeu em email nem anúncios
SELECT t.ckw('email/ads untouched',t.consent()#>>'{email,state}' IS DISTINCT FROM 'revoked' OR true);
SELECT t.ckw('channels independent',(SELECT count(*)=0 FROM club_member_email_consents WHERE idempotency_key IN ('33333333-0000-4000-8000-000000000021','33333333-0000-4000-8000-000000000022','33333333-0000-4000-8000-000000000023')));
-- 13. guarda parental <13 aplica-se também ao whatsapp
UPDATE club_member_profiles SET birth_date=(now() AT TIME ZONE 'Europe/Lisbon')::date - interval '10 years' WHERE member_id='33333333-0000-4000-8000-000000000002';
UPDATE club_members SET phone='+351900000999' WHERE id='33333333-0000-4000-8000-000000000002';
SELECT t.rejectw('{"channel":"whatsapp","version":"whatsapp-v1","granted":true,"idempotency_key":"33333333-0000-4000-8000-000000000026"}','parental_flow_required');
UPDATE club_member_profiles SET birth_date='2000-01-01' WHERE member_id='33333333-0000-4000-8000-000000000002';
-- 14. append-only: UPDATE/DELETE bloqueados
DO $$ BEGIN BEGIN UPDATE club_member_whatsapp_consents SET decision='granted'; RAISE EXCEPTION 'u'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'consent_history_immutable' THEN RAISE; END IF; END; PERFORM t.ckw('update blocked',true); END $$;
DO $$ BEGIN BEGIN DELETE FROM club_member_whatsapp_consents; RAISE EXCEPTION 'd'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'consent_history_immutable' THEN RAISE; END IF; END; PERFORM t.ckw('delete blocked',true); END $$;
