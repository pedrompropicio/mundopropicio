#!/usr/bin/env bash
# #333 fase12f — prova do executor com funções, constraints e TRIGGERS REAIS do projeto (canon12f-base.sql) em PG descartável.
# Socket /tmp/pg12f:55434 (setpriv UID 1000). Pré: bun docs/testes/issue333/pg/canon12f-gen.ts → /tmp/pg12ft/*.json. Sem Cloud.
set -u
P0="psql -h /tmp/pg12f -p 55434 -U postgres -qAt"
D=/dev-server/supabase/manual; R=$D/20261020_issue333_assistant_review; X=$D/20261020_issue333_assistant_executor; S=/dev-server/docs/testes/issue333/pg
U1=11111111-1111-1111-1111-111111111111; C1=22222222-2222-2222-2222-222222222222; U2=33333333-3333-3333-3333-333333333333; U3=77777777-7777-7777-7777-777777777777
O1=0f000000-0000-4000-8000-000000000001; B1=0b000000-0000-4000-8000-000000000001; B2=0b000000-0000-4000-8000-000000000002
$P0 -c "DROP DATABASE IF EXISTS x12f" 2>/dev/null; $P0 -c "CREATE DATABASE x12f ENCODING UTF8 TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"; P="$P0 -d x12f"
for f in canon12f-base canon12f-seed canon12f-scenario; do $P -v ON_ERROR_STOP=1 -f $S/$f.sql >/dev/null || { echo "FALHA $f"; exit 1; }; done
echo "0 base canónica: $($P -c "select count(*) from pg_trigger where not tgisinternal") triggers reais, $($P -c "select count(*) from pg_proc where pronamespace='public'::regnamespace") funções"
snap(){ $P -c "select md5(string_agg(c.relname||coalesce(c.relacl::text,''),',' order by c.relname)) from pg_class c where relnamespace='public'::regnamespace"; }
B=$(snap)
$P -v ON_ERROR_STOP=1 -f $R.INERTE.sql >/dev/null && echo "0a review 12f OK"
B2SNAP=$(snap)
$P -v ON_ERROR_STOP=1 -f $X.INERTE.sql >/dev/null && echo "0b executor 12f OK"
clean(){ sed 's/^psql:[^E]*ERROR: */ERROR /' | grep -v -e '^CONTEXT' -e '^SET$' -e '^PL/pgSQL' -e '^SQL statement' -e '^BEGIN$' -e '^ROLLBACK$'; }
F="public.data_entry_assistant_review_333"
J(){ cat /tmp/pg12ft/$1.json; }
H(){ J $1 | python3 -c 'import json,sys;print(json.load(sys.stdin)["effects_hash"])'; }
save(){ $P -c "SET ROLE service_role; select ($F('save','$U1','$C1',$2,$3,'$(H $1)',\$j\$$(J $1)\$j\$::jsonb,null,null))->>'review_id'" 2>&1 | clean; }
authz(){ $P -c "SET ROLE service_role; select ($F('authorize','$U1','$C1','$1',$2,'$(H $3)',null,'$4','$5'))->>'authorization_id'" 2>&1 | clean; }
claims(){ echo "SET request.jwt.claims='{\"sub\":\"${1:-$U1}\",\"role\":\"authenticated\",\"email\":\"local@test\"}';"; }
ex(){ $P -c "SET ROLE authenticated; $(claims ${4:-$U1}) select public.data_entry_assistant_execute_333('${3:-execute}','$1','$2')" 2>&1 | clean; }
ok(){ ex $1 $2 | python3 -c 'import json,sys
t=sys.stdin.read()
try: r=json.loads(t); print(r["status"], "replay" if r["replayed"] else "novo", json.dumps({k:v for k,v in r["result"].items() if k in ("writes","net_cents","deductions","already_liquidated","payments","lines","status")}, sort_keys=True))
except Exception: print(t.strip())'; }
q(){ $P -c "$1"; }
modal(){ $P -c "SET ROLE authenticated; $(claims) select (save_ticket_office_settlement(NULL,'{\"financial_account_id\":\"$O1\",\"event_id\":\"e0000000-0000-4000-8000-00000000000$1\",\"settlement_date\":\"2026-10-15\",\"gross_revenue\":1000,\"total_deductions\":123,\"net_calculated\":877,\"net_transferred\":0,\"venue_retained_amount\":0,\"venue_invoice_remainder_paid\":false,\"venue_invoice_remainder_amount\":0}'::jsonb,true,'[{\"id\":\"d0000000-0000-4000-8000-00000000000$1\",\"paid_amount\":123}]'::jsonb,'{\"amount\":877,\"to_account_id\":\"$B1\",\"credited\":false}'::jsonb,'r','m','u1'))->>'settlement_id' is not null" 2>&1 | clean; }
legs(){ q "select t.type||':'||t.status||':'||t.paid_amount||':'||coalesce(t.payment_date::text,'-')||':'||(t.account_id='$O1')::text||':pag='||(select count(*) from transaction_payments p where p.transaction_id=t.id)||':'||coalesce((select string_agg(p.status||'/'||p.amount||'/'||p.payment_date||'/'||(p.account_id=t.account_id)::text||'/'||p.payment_method,',') from transaction_payments p where p.transaction_id=t.id),'') from transactions t where t.event_id='e0000000-0000-4000-8000-00000000000$1' and t.operation_key like 'TRF-FECHO-%' order by t.type"; }
open_scope(){ q "insert into data_entry_assistant_scope_333(owner_id,company_id,expires_at) values ('$U1','$C1',now()+interval '30 minutes') on conflict (owner_id,company_id) do update set expires_at=excluded.expires_at, created_at=now()"; }

echo "1 probe (esquema 12f):"; ex 00000000-0000-0000-0000-000000000000 a1 probe
q "update data_entry_assistant_review_settings_333 set enabled=true"
echo "2 revisão sem âmbito nominal → recusa no SQL:"; save pa null null
open_scope
RA=$(save pa null null); AA=$(authz $RA 1 pa '{a1,a2,a4,a3,a5}' 00000000-aaaa-0000-0000-000000000001)
echo "3 gate do executor fechado:"; ex $AA a1
q "update data_entry_assistant_executor_settings_333 set enabled=true"
echo "4 âmbito expirado / removido → recusa no RPC (não só no servidor):"
q "update data_entry_assistant_scope_333 set created_at=now()-interval '1 hour', expires_at=now()-interval '1 second'"; ex $AA a1
q "delete from data_entry_assistant_scope_333"; ex $AA a1; open_scope
echo "5 service_role / anon sem EXECUTE:"
$P -c "SET ROLE service_role; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | grep -o "permission denied[^\"]*" | head -1
$P -c "SET ROLE anon; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "6 viewer da empresa (context) / manager de outra empresa (sem âmbito) / sem sessão:"; ex $AA a1 execute $U3; ex $AA a1 execute $U2; $P -c "SET ROLE authenticated; select public.data_entry_assistant_execute_333('execute','$AA','a1')" 2>&1 | clean
echo "7 a3 antes de a4 (dependência):"; ex $AA a3
echo "8 fluxo integral E1 — a1 apuramento, a2 confirmar, a4 conferir deduções (0 escritas), a3 fecho pelo RPC do modal:"
ok $AA a1; ok $AA a2; ok $AA a4; ok $AA a3
q "select 'fecho', status, gross_revenue, total_deductions, net_calculated, net_transferred, transfer_account_id='$B1', settlement_date from ticket_office_settlements where event_id='e0000000-0000-4000-8000-000000000001'"
q "select 'dedução', status, paid_amount, payment_date, account_id='$O1', settlement_id is not null, (select count(*)||'/'||sum(amount)||'/'||min(created_by) from transaction_payments p where p.transaction_id=t.id) from transactions t where id='d0000000-0000-4000-8000-000000000001'"
legs 1
echo "9 replay a3 (resposta perdida → mesmo resultado, 1 fecho):"; ok $AA a3; q "select count(*) from ticket_office_settlements where event_id='e0000000-0000-4000-8000-000000000001'"
echo "10 a5 liquidação (evidência humana = plano: conta B1, 877,00 €, 16/10): triggers reais materializam 1 pagamento por perna:"; ok $AA a5; legs 1
echo "11 replay a5 → sem pagamentos novos:"; ok $AA a5; q "select count(*) from transaction_payments p join transactions t on t.id=p.transaction_id where t.operation_key like 'TRF-FECHO-%' and t.event_id='e0000000-0000-4000-8000-000000000001'"
echo "12 evidência com valor diferente do plano → proposta marca a5 bloqueada; autorização que a inclua é recusada (actions_blocked). Recusa na execução: ver 23a:"
RX=$(save pa_diff null null); authz $RX 1 pa_diff '{a1,a2,a4,a3,a5}' 00000000-aaaa-0000-0000-0000000000aa
echo "13 E2 dados alterados após autorização (dedução editada / venda nova) → a4 recusa, nada escrito:"
RB=$(save pb null null); AB=$(authz $RB 1 pb '{a1,a2,a4,a3}' 00000000-aaaa-0000-0000-000000000002); ok $AB a1 >/dev/null; ok $AB a2 >/dev/null
q "update transactions set amount=110 where id='d0000000-0000-4000-8000-000000000002'"; ex $AB a4
q "update transactions set amount=100 where id='d0000000-0000-4000-8000-000000000002'"
q "insert into ticket_sales(zone_id,quantity,unit_price,total_value,financial_account_id,company_id) values ('a0000000-0000-4000-8000-000000000002',1,10,10,'$O1','$C1')"; ex $AB a4
q "select count(*) from ticket_office_settlements where event_id='e0000000-0000-4000-8000-000000000002'"
echo "14 nova versão da revisão revoga a autorização anterior:"
q "delete from ticket_sales where total_value=10 and zone_id='a0000000-0000-4000-8000-000000000002'"
save pb "'$RB'" 1 >/dev/null; ex $AB a4
echo "15 E3 fechado no modal por outro caminho depois da autorização → a1 recusada:"
RC=$(save pc null null); AC=$(authz $RC 1 pc '{a1,a2,a4,a3}' 00000000-aaaa-0000-0000-000000000003); modal 3; ex $AC a1
echo "16 hash adulterado na versão persistida:"
q "alter table data_entry_assistant_review_versions_333 disable trigger de333_versions_immutable; update data_entry_assistant_review_versions_333 set proposal=jsonb_set(proposal,'{effects,closing,net_cents}','1') where review_id='$RC'; alter table data_entry_assistant_review_versions_333 enable trigger de333_versions_immutable"; ex $AC a1
echo "17 contrato de ações é do servidor (dependência a3→a4 removida, hash recalculado): recusa:"
TJ=$(J pd | python3 -c 'import json,sys;p=json.load(sys.stdin);[a.update(depends_on=[]) for a in p["actions"] if a["id"]=="a3"];print(json.dumps(p))')
TH=$($P -c "select encode(sha256(convert_to(public._de333_canon(jsonb_build_object('effects',(\$j\$$TJ\$j\$::jsonb)->'effects','actions',(\$j\$$TJ\$j\$::jsonb)->'actions')),'UTF8')),'hex')")
TJ=$(echo "$TJ" | python3 -c "import json,sys;p=json.load(sys.stdin);p['effects_hash']='$TH';print(json.dumps(p))")
RT=$($P -c "SET ROLE service_role; select ($F('save','$U1','$C1',null,null,'$TH',\$j\$$TJ\$j\$::jsonb,null,null))->>'review_id'" 2>&1 | clean)
AT=$($P -c "SET ROLE service_role; select ($F('authorize','$U1','$C1','$RT',1,'$TH',null,'{a1,a2,a3}','00000000-aaaa-0000-0000-00000000000f'))->>'authorization_id'" 2>&1 | clean); ex $AT a1
echo "18 E4 concorrência (2 ligações no mesmo a3) → 1 fecho, 1 execução:"
RD=$(save pd null null); AD=$(authz $RD 1 pd '{a1,a2,a4,a3,a5}' 00000000-aaaa-0000-0000-000000000004); ok $AD a1 >/dev/null; ok $AD a2 >/dev/null; ok $AD a4 >/dev/null
(ok $AD a3 | sed 's/^/   A: /') & (ok $AD a3 | sed 's/^/   B: /') & wait
q "select count(*) from ticket_office_settlements where event_id='e0000000-0000-4000-8000-000000000004'"; q "select count(*) from data_entry_assistant_executions_333 where authorization_id='$AD' and action_id='a3'"
echo "19 E5 estado parcial (pagamento planeado numa perna) → a5 recusa, não adivinha:"
RE=$(save pe null null); AE=$(authz $RE 1 pe '{a1,a2,a4,a3,a5}' 00000000-aaaa-0000-0000-000000000005); for a in a1 a2 a4 a3; do ok $AE $a >/dev/null; done
q "insert into transaction_payments(transaction_id,amount,payment_date,account_id,status,company_id,created_by) select id,100,'2026-10-16',account_id,'planned',company_id,'local' from transactions where event_id='e0000000-0000-4000-8000-000000000005' and operation_key like 'TRF-FECHO-%' and type='income'"
ex $AE a5; legs 5
echo "20 E6 resultado perdido antes do commit (crash) → nada gravado; reexecução segura:"
RF=$(save pf null null); AF=$(authz $RF 1 pf '{a1,a2,a4,a3,a5}' 00000000-aaaa-0000-0000-000000000006); for a in a1 a2 a4 a3; do ok $AF $a >/dev/null; done
$P -c "BEGIN; SET ROLE authenticated; $(claims) select (public.data_entry_assistant_execute_333('execute','$AF','a5'))->>'status'; ROLLBACK;" 2>&1 | clean
legs 6; q "select count(*) from data_entry_assistant_executions_333 where authorization_id='$AF' and action_id='a5'"
ok $AF a5; legs 6
echo "21 outra revisão/autorização para o mesmo fecho já liquidado → conferência, 0 escritas, sem pagamento duplicado:"
RF2=$(save pf2 null null); AF2=$(authz $RF2 1 pf2 '{a5}' 00000000-aaaa-0000-0000-000000000016); ok $AF2 a5; legs 6
echo "22 E7 fecho confirmado no modal (a receber) + evidência humana → a5 liquida com os triggers reais:"
modal 7 >/dev/null; RG=$(save pg null null); AG=$(authz $RG 1 pg '{a5}' 00000000-aaaa-0000-0000-000000000007); ok $AG a5; legs 7
echo "23 E8 par TRF-FECHO adulterado (perna de entrada noutra conta) → recusa:"
modal 8 >/dev/null; RH=$(save ph null null); AH=$(authz $RH 1 ph '{a5}' 00000000-aaaa-0000-0000-000000000008)
echo "23a fecho canónico alterado após autorização (líquido 876 ≠ evidência 877) → a5 recusa na execução, nada pago:"
q "update ticket_office_settlements set net_transferred=876 where event_id='e0000000-0000-4000-8000-000000000008'" >/dev/null; ex $AH a5; legs 8
q "update ticket_office_settlements set net_transferred=877 where event_id='e0000000-0000-4000-8000-000000000008'" >/dev/null
echo "23b perna de entrada noutra conta:"
q "update transactions set account_id='$B2' where event_id='e0000000-0000-4000-8000-000000000008' and operation_key like 'TRF-FECHO-%' and type='income'"; ex $AH a5; legs 8
echo "24 E9 já creditado no painel → conferência, 0 escritas:"
modal 9 >/dev/null; $P -c "SET ROLE authenticated; $(claims) update transactions set status='paid', payment_date='2026-10-16', paid_amount=amount where event_id='e0000000-0000-4000-8000-000000000009' and operation_key like 'TRF-FECHO-%'" >/dev/null
RI=$(save pi null null); AI=$(authz $RI 1 pi '{a5}' 00000000-aaaa-0000-0000-000000000009); ok $AI a5; legs 9
echo "25 imutabilidade das execuções (dono):"
$P -c "update data_entry_assistant_executions_333 set result='{}'" 2>&1 | grep -o "immutable_record" | head -1; $P -c "delete from data_entry_assistant_executions_333" 2>&1 | grep -o "immutable_record" | head -1
echo "26 readback (ACL/defaultACL/SECDEF):"
$P -f $X.readback.SELECT.sql 2>&1 | grep -v '^$'
echo "27 rollback do executor com execuções → recusa (retenção):"; $P -f $X.ROLLBACK-INERTE.sql 2>&1 | grep -o "executions_present_retain_before_rollback" | head -1
$P -c "alter table data_entry_assistant_executions_333 disable trigger de333_exec_immutable; delete from data_entry_assistant_executions_333; alter table data_entry_assistant_executions_333 enable trigger de333_exec_immutable"
$P -v ON_ERROR_STOP=1 -f $X.ROLLBACK-INERTE.sql >/dev/null && echo "28 rollback executor OK"
[ "$(snap)" = "$B2SNAP" ] && echo "29 esquema/ACL igual ao anterior ao executor"
$P -v ON_ERROR_STOP=1 -f $X.INERTE.sql >/dev/null && echo "30 reaplicar OK"; $P -f $X.INERTE.sql 2>&1 | grep -o "executor_absent_objects_drift" | head -1
