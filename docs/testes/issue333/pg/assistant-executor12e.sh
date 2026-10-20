#!/usr/bin/env bash
# #333 fase12e — prova do executor em PostgreSQL 17 descartável (socket /tmp/pg333:55433). Sem Cloud.
# Pré: bun docs/testes/issue333/pg/assistant-executor12e-gen.ts (propostas do builder do servidor em /tmp/pg333t/*.json).
set -u
P="env -i PATH=$PATH psql -h /tmp/pg333 -p 55433 -U postgres -qAt"
D=/dev-server/supabase/manual; R12=$D/20261020_issue333_assistant_review; X=$D/20261020_issue333_assistant_executor; S=/dev-server/docs/testes/issue333/pg
U1=11111111-1111-1111-1111-111111111111; C1=22222222-2222-2222-2222-222222222222; U2=33333333-3333-3333-3333-333333333333; C2=44444444-4444-4444-4444-444444444444
$P -c "DROP DATABASE IF EXISTS x12e"; $P -c "CREATE DATABASE x12e ENCODING UTF8 TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"; P="$P -d x12e"
$P -v ON_ERROR_STOP=1 -f $S/assistant-review12c-stub.sql >/dev/null; $P -v ON_ERROR_STOP=1 -f $S/assistant-executor12e-stub.sql >/dev/null
$P -v ON_ERROR_STOP=1 -f $R12.INERTE.sql >/dev/null && echo "0a review12d OK"
snap(){ $P -c "select md5(string_agg(c.relname||coalesce(c.relacl::text,''),',' order by c.relname)) from pg_class c where relnamespace='public'::regnamespace"; }
B=$(snap)
$P -v ON_ERROR_STOP=1 -f $X.INERTE.sql >/dev/null && echo "0b executor12e OK"
$P -c "update data_entry_assistant_review_settings_333 set enabled=true"
clean(){ sed 's/^psql:[^E]*ERROR: */ERROR /' | grep -v -e '^CONTEXT' -e '^SET$' -e '^PL/pgSQL' -e '^SQL statement'; }
F="public.data_entry_assistant_review_333"
J(){ cat /tmp/pg333t/$1.json; }
H(){ J $1 | python3 -c 'import json,sys;print(json.load(sys.stdin)["effects_hash"])'; }
save(){ $P -c "SET ROLE service_role; select ($F('save','$U1','$C1',$2,$3,'$(H $1)',\$j\$$(J $1)\$j\$::jsonb,null,null))->>'review_id'" 2>&1 | clean; }
authz(){ $P -c "SET ROLE service_role; select ($F('authorize','$U1','$C1','$1',$2,'$(H $3)',null,'$4','$5'))->>'authorization_id'" 2>&1 | clean; }
ex(){ $P -c "SET ROLE authenticated; SET request.jwt.claims='{\"sub\":\"${4:-$U1}\",\"company\":\"${5:-$C1}\"}'; select public.data_entry_assistant_execute_333('${3:-execute}','$1','$2')" 2>&1 | clean; }
q(){ $P -c "$1"; }
echo "1 probe:"; ex 00000000-0000-0000-0000-000000000000 a1 probe
RA=$(save pa null null); AA=$(authz $RA 1 pa '{a1,a2}' 00000000-aaaa-0000-0000-000000000001)
echo "2 gate do executor fechado:"; ex $AA a1
q "update data_entry_assistant_executor_settings_333 set enabled=true"
echo "3 service_role / anon não executam (identidade só da sessão):"
$P -c "SET ROLE service_role; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | grep -o "permission denied[^\"]*" | head -1
$P -c "SET ROLE anon; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "4 sem sessão / outro utilizador / outra empresa:"; $P -c "SET ROLE authenticated; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | clean; ex $AA a1 execute $U2 $C2; ex $AA a1 execute $U1 $C2
echo "5 a2 antes de a1 (dependência):"; ex $AA a2
echo "6 a3 não autorizada (subconjunto {a1,a2}):"; ex $AA a3
echo "7 a1 executa (writer de apuramento):"; ex $AA a1 | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r["status"],r["replayed"],r["result"]["lines"],r["result"]["sum_cents"])'
q "select number,status,document_total,(select count(*) from ticket_office_statement_lines l where l.statement_id=s.id) from ticket_office_statements s"
echo "8 replay a1 (resposta perdida → mesma execução, sem duplicar):"; ex $AA a1 | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r["status"],r["replayed"])'; q "select count(*) from ticket_office_statements"
echo "9 a2 executa confirm_ticket_office_statement real:"; ex $AA a2 | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r["status"],r["result"]["status"])'; q "select status, confirmed_by='$U1' from ticket_office_statements where number='AP-1'"
echo "10 status (recuperação só leitura):"; ex $AA a1 status | python3 -c 'import json,sys;r=json.load(sys.stdin);print([e["action_id"] for e in r["executions"]])'
echo "11 dados alterados após a1 (linha editada) → a2 recusada, nada confirmado:"
RB=$(save pa2 null null); AB=$(authz $RB 1 pa2 '{a1,a2,a4,a3}' 00000000-aaaa-0000-0000-000000000002); ex $AB a1 >/dev/null
q "update ticket_office_statement_lines set amount=amount+1 where statement_id=(select id from ticket_office_statements where number='AP-2') and position=0"
ex $AB a2; q "select status from ticket_office_statements where number='AP-2'"
echo "12 a4 só leitura; a3 aguarda modal humano (sem registo):"
q "update ticket_office_statement_lines set amount=amount-1 where statement_id=(select id from ticket_office_statements where number='AP-2') and position=0"
ex $AB a2 >/dev/null; ex $AB a4 | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r["result"]["writes"])'; ex $AB a3
q "select count(*) from data_entry_assistant_executions_333 x join data_entry_assistant_authorizations_333 a on a.id=x.authorization_id where a.id='$AB' and action_id='a3'"
echo "13 a3 depois do fecho confirmado no modal (simulado como gravação humana):"
q "insert into ticket_office_settlements(company_id,financial_account_id,event_id,settlement_date,status,net_transferred,closed_at) values ('$C1','0f000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','2026-10-12','confirmed',0,now())"
ex $AB a3 | python3 -c 'import json,sys;r=json.load(sys.stdin);print(r["status"],r["result"]["transfer_transaction_id"])'
echo "14 evento fechado depois da autorização → a1 recusada:"; RC=$(save pa4 null null); AC=$(authz $RC 1 pa4 '{a1}' 00000000-aaaa-0000-0000-000000000003); ex $AC a1; q "select count(*) from ticket_office_statements where number='AP-9'"
q "delete from ticket_office_settlements where event_id='e1000000-0000-4000-8000-000000000001'"
echo "15 duplicado criado por outro caminho após a autorização:"; RD=$(save pa5 null null); AD=$(authz $RD 1 pa5 '{a1}' 00000000-aaaa-0000-0000-000000000004)
q "insert into ticket_office_statements(company_id,financial_account_id,number,statement_date,document_total) values ('$C1','0f000000-0000-4000-8000-000000000001','ap-5','2026-10-10',1)"; ex $AD a1
echo "16 versão nova invalida a autorização anterior:"; RE=$(save pa6 null null); AE=$(authz $RE 1 pa6 '{a1}' 00000000-aaaa-0000-0000-000000000005); save pa_v2 "'$RE'" 1 >/dev/null; ex $AE a1
echo "17 hash adulterado na versão persistida:"; RF=$(save pa7 null null); AF=$(authz $RF 1 pa7 '{a1}' 00000000-aaaa-0000-0000-000000000006)
q "SET session_replication_role=replica; update data_entry_assistant_review_versions_333 set proposal=jsonb_set(proposal,'{effects,total}','1') where review_id='$RF'" >/dev/null; ex $AF a1
echo "18 resultado perdido antes do commit (crash) → nada gravado; status vazio; reexecução segura:"
RG=$(save pa3 null null); AG=$(authz $RG 1 pa3 '{a1}' 00000000-aaaa-0000-0000-000000000007)
$P -c "BEGIN; SET ROLE authenticated; SET request.jwt.claims='{\"sub\":\"$U1\",\"company\":\"$C1\"}'; select (public.data_entry_assistant_execute_333('execute','$AG','a1'))->>'status'; ROLLBACK;" 2>&1 | clean
q "select count(*) from ticket_office_statements where number='AP-3'"; ex $AG a1 status | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["executions"]))'
echo "19 concorrência (2 ligações na mesma ação):"
( $P -c "BEGIN; SET ROLE authenticated; SET request.jwt.claims='{\"sub\":\"$U1\",\"company\":\"$C1\"}'; select (public.data_entry_assistant_execute_333('execute','$AG','a1'))->>'replayed'; select pg_sleep(1.2); COMMIT;" 2>&1 | clean | sed 's/^/   A: /' ) &
sleep 0.4; ex $AG a1 | python3 -c 'import json,sys;print("   B:",json.load(sys.stdin)["replayed"])'; wait
q "select count(*) from ticket_office_statements where number='AP-3'"
echo "20 a5 liquidação (fecho confirmado com transferência a receber):"
RH=$(save pb null null); AH=$(authz $RH 1 pb '{a5}' 00000000-aaaa-0000-0000-000000000008)
ex $AH a5 | python3 -c 'import json,sys;r=json.load(sys.stdin)["result"];print(r["already_liquidated"],r["writes"])'
q "select type,status,paid_amount,payment_date from transactions where operation_key='TRF-FECHO-E2' order by type"
echo "21 replay a5 → sem segunda liquidação:"; ex $AH a5 | python3 -c 'import json,sys;print(json.load(sys.stdin)["replayed"])'; q "select count(*) from transactions"
echo "22 a5 já creditado → conferência, 0 escritas:"; RI=$(save pb3 null null); AI=$(authz $RI 1 pb3 '{a5}' 00000000-aaaa-0000-0000-000000000009)
ex $AI a5 | python3 -c 'import json,sys;r=json.load(sys.stdin)["result"];print(r["already_liquidated"],r["writes"])'
echo "23 a5 com fecho alterado após autorização (valor transferido) → recusa:"
q "update transactions set status='pending',paid_amount=0,payment_date=null where operation_key='TRF-FECHO-E2'"
RJ=$(save pb null null); AJ=$(authz $RJ 1 pb '{a5}' 00000000-aaaa-0000-0000-00000000000a)
q "update ticket_office_settlements set net_transferred=500 where event_id='e2000000-0000-4000-8000-000000000002'"; ex $AJ a5; q "select string_agg(status,',') from transactions where operation_key='TRF-FECHO-E2'"
echo "24 imutabilidade das execuções (dono):"
$P -c "update data_entry_assistant_executions_333 set result='{}'" 2>&1 | grep -o immutable_record | head -1; $P -c "delete from data_entry_assistant_executions_333" 2>&1 | grep -o immutable_record | head -1
echo "25 readback:"; $P -f $X.readback.SELECT.sql
echo "26 rollback com execuções:"; $P -f $X.ROLLBACK-INERTE.sql 2>&1 | grep -o "executions_present[a-z_]*"
$P -c "SET session_replication_role=replica; truncate data_entry_assistant_executions_333" >/dev/null
$P -v ON_ERROR_STOP=1 -f $X.ROLLBACK-INERTE.sql >/dev/null && echo "27 rollback OK"
[ "$B" = "$(snap)" ] && echo "28 esquema/ACL igual ao anterior ao executor" || echo "28 DIVERGE"
echo "29 reaplicar / deriva:"; $P -v ON_ERROR_STOP=1 -f $X.INERTE.sql >/dev/null && echo OK; $P -f $X.INERTE.sql 2>&1 | grep -o "executor_absent_objects_drift"
