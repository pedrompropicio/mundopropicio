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
# mk <novo> <origem> <python sobre p>: variante adulterada/alterada com hash recalculado pelo _de333_canon do próprio SQL.
mk(){ TJ=$(J $2 | python3 -c "import json,sys;p=json.load(sys.stdin);$3;print(json.dumps(p))")
  TH=$($P -c "select encode(sha256(convert_to(public._de333_canon(jsonb_build_object('effects',(\$j\$$TJ\$j\$::jsonb)->'effects','actions',(\$j\$$TJ\$j\$::jsonb)->'actions')),'UTF8')),'hex')")
  echo "$TJ" | python3 -c "import json,sys;p=json.load(sys.stdin);p['effects_hash']='$TH';print(json.dumps(p))" > /tmp/pg12ft/$1.json; }
# tx <sql adulteração> <auth> <ação>: adultera e executa NA MESMA transação, depois ROLLBACK (estado reposto; a recusa é a prova).
tx(){ $P -c "BEGIN; $1; SET ROLE authenticated; $(claims) select public.data_entry_assistant_execute_333('execute','$2','$3'); ROLLBACK;" 2>&1 | clean | grep -v '^UPDATE\|^DELETE' | grep -o 'ERROR.*\|^{.*' ; }
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
echo "24b 12g — a2 compara cabeçalho e linhas completas (mesma contagem/soma não basta):"
mk pj pb "p['effects']['number']='AP-2T'"; RJ=$(save pj null null); AJ=$(authz $RJ 1 pj '{a1,a2}' 00000000-aaaa-0000-0000-0000000000b1); ok $AJ a1
SJ="(select (result->>'statement_id')::uuid from data_entry_assistant_executions_333 where authorization_id='$AJ' and action_id='a1')"
echo "  valores trocados entre linhas (contagem e soma iguais):"; tx "update ticket_office_statement_lines set amount=case position when 0 then -42.05 else 877 end where statement_id=$SJ" $AJ a2
echo "  tipo de linha alterado:"; tx "update ticket_office_statement_lines set line_type='ticketline_invoice' where statement_id=$SJ and position=0" $AJ a2
echo "  evento da linha alterado:"; tx "update ticket_office_statement_lines set event_id='e0000000-0000-4000-8000-000000000009' where statement_id=$SJ and position=0" $AJ a2
echo "  descrição alterada:"; tx "update ticket_office_statement_lines set description='Outra' where statement_id=$SJ and position=0" $AJ a2
echo "  valor de linha NULL (coluna permite):"; tx "update ticket_office_statement_lines set amount=NULL where statement_id=$SJ and position=1" $AJ a2
echo "  linha extra de valor 0 (soma igual):"; tx "insert into ticket_office_statement_lines(statement_id,company_id,line_type,position,description,amount,event_id) select $SJ,'$C1','ticketline_invoice',2,'x',0,'e0000000-0000-4000-8000-000000000002'" $AJ a2
echo "  data do apuramento alterada:"; tx "update ticket_office_statements set statement_date='2026-10-11' where id=$SJ" $AJ a2
echo "  bilheteira do apuramento alterada:"; tx "update ticket_office_statements set financial_account_id='$B1' where id=$SJ" $AJ a2
echo "  total do documento NULL (coluna permite):"; tx "update ticket_office_statements set document_total=NULL where id=$SJ" $AJ a2
echo "  estado após recusas (draft, 0 execuções a2):"; q "select status from ticket_office_statements where id=$SJ"; q "select count(*) from data_entry_assistant_executions_333 where authorization_id='$AJ' and action_id='a2'"
echo "  sem adulteração → confirma:"; ok $AJ a2
echo "24c 12g — efeitos JSON sem chaves (hash recalculado) → recusa sem efeitos:"
mk pk pb "p['effects']['number']='AP-2K'; del p['effects']['total']"; RK=$(save pk null null); AK=$(authz $RK 1 pk '{a1}' 00000000-aaaa-0000-0000-0000000000b2); echo "  a1 sem total:"; ex $AK a1
mk pk2 pb "p['effects']['number']='AP-2L'; del p['effects']['lines'][0]['amount_cents']"; RK2=$(save pk2 null null); AK2=$(authz $RK2 1 pk2 '{a1}' 00000000-aaaa-0000-0000-0000000000b3); echo "  a1 linha sem cêntimos:"; ex $AK2 a1
q "select count(*) from ticket_office_statements where number in ('AP-2K','AP-2L')"
echo "  plano de fecho sem cada chave (_de333_closing_check chamado pelo executor em a4/a3):"
CJ=$(J pb | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["effects"]["closing"]))')
for k in gross_cents deductions_cents net_cents event_right_cents office event transfer_account settlement_date deductions; do
  printf "   sem %s: " $k; $P -c "BEGIN; select public._de333_closing_check((\$j\$$CJ\$j\$::jsonb) - '$k', '$C1'); ROLLBACK;" 2>&1 | grep -o '#333: [a-z_]*\|invalid input[^\"]*' | head -1; done
printf "   dedução sem gross_cents: "; $P -c "BEGIN; select public._de333_closing_check(jsonb_set(\$j\$$CJ\$j\$::jsonb,'{deductions,0}',((\$j\$$CJ\$j\$::jsonb)->'deductions'->0)-'gross_cents'), '$C1'); ROLLBACK;" 2>&1 | grep -o '#333: [a-z_]*' | head -1
printf "   net_cents null: "; $P -c "BEGIN; select public._de333_closing_check(jsonb_set(\$j\$$CJ\$j\$::jsonb,'{net_cents}','null'), '$C1'); ROLLBACK;" 2>&1 | grep -o '#333: [a-z_]*' | head -1
printf "   controlo (plano completo): "; $P -c "BEGIN; select public._de333_closing_check(\$j\$$CJ\$j\$::jsonb, '$C1'); ROLLBACK;" 2>&1 | grep -v '^BEGIN\|^ROLLBACK'
for k in amount_cents date account; do mk pl_$k pi "p['effects']['number']='AP-S9$k'; del p['effects']['settlement']['$k']"; RL=$(save pl_$k null null)
  AL=$(authz $RL 1 pl_$k '{a5}' 00000000-aaaa-0000-0000-0000000$(printf %05d $RANDOM)); printf "   a5 evidência sem %s: " $k; ex $AL a5; done
echo "24d 12g — pernas TRF-FECHO com campos NULL/divergentes (E8, adulteração+execução na mesma transação, ROLLBACK):"
q "update transactions set account_id='$B1' where event_id='e0000000-0000-4000-8000-000000000008' and operation_key like 'TRF-FECHO-%' and type='income'" >/dev/null
W="event_id='e0000000-0000-4000-8000-000000000008' and operation_key like 'TRF-FECHO-%' and type='income'"
for col in company_id event_id account_id amount currency exclude_from_result status paid_amount iva_rate payment_method; do
  printf "   %s NULL: " $col; tx "update transactions set $col=NULL where $W" $AH a5 | head -1; done
printf "   exclude_from_result false: "; tx "update transactions set exclude_from_result=false where $W" $AH a5 | head -1
printf "   currency BRL: "; tx "update transactions set currency='BRL' where $W" $AH a5 | head -1
printf "   bilheteira inativa agora: "; tx "update financial_accounts set is_active=false where id='$O1'" $AH a5 | head -1
printf "   conta de destino inativa agora: "; tx "update financial_accounts set is_active=false where id='$B1'" $AH a5 | head -1
printf "   controlo (sem adulteração, ROLLBACK): "; tx "select 1" $AH a5 | head -1
legs 8; q "select count(*) from data_entry_assistant_executions_333 where authorization_id='$AH'"
echo "24e 12g — já creditado mas divergente da evidência autorizada → nunca 'conferido':"
mk pm pi "p['effects']['number']='AP-S9M'; p['effects']['settlement']['date']='2026-10-17'"; RM=$(save pm null null); AM=$(authz $RM 1 pm '{a5}' 00000000-aaaa-0000-0000-0000000000b4)
printf "   evidência 17/10 vs crédito 16/10: "; ex $AM a5
mk pn pi "p['effects']['number']='AP-S9N'"; RN=$(save pn null null); AN=$(authz $RN 1 pn '{a5}' 00000000-aaaa-0000-0000-0000000000b5)
P9="transaction_id in (select id from transactions where event_id='e0000000-0000-4000-8000-000000000009' and operation_key like 'TRF-FECHO-%' and type='income')"
printf "   pagamento da perna noutra data: "; tx "update transaction_payments set payment_date='2026-10-14' where $P9" $AN a5 | head -1
printf "   pagamento da perna noutra conta: "; tx "update transaction_payments set account_id='$B2' where $P9" $AN a5 | head -1
printf "   pagamento da perna sem conta (NULL): "; tx "update transaction_payments set account_id=NULL where $P9" $AN a5 | head -1
printf "   pagamento da perna estornado: "; tx "update transaction_payments set reversed_at=now() where $P9" $AN a5 | head -1
printf "   pagamento duplicado na perna: "; tx "insert into transaction_payments(transaction_id,amount,payment_date,account_id,status,company_id,created_by) select transaction_id,0.01,payment_date,account_id,'planned',company_id,'local' from transaction_payments where $P9" $AN a5 | head -1
printf "   controlo exato (ROLLBACK): "; tx "select 1" $AN a5 | head -1
legs 9; q "select count(*) from data_entry_assistant_executions_333 where authorization_id in ('$AM','$AN')"
echo "24f 12h — concorrência real (2 ligações): nova versão da revisão vs executor:"
mk pq pb "p['effects']['number']='AP-2Q'"; RQ=$(save pq null null); AQ=$(authz $RQ 1 pq '{a1}' 00000000-aaaa-0000-0000-0000000000c1)
mk pq2 pb "p['effects']['number']='AP-2R'"
( $P -c "BEGIN; SET ROLE service_role; select ($F('save','$U1','$C1','$RQ',1,'$(H pq2)',\$j\$$(J pq2)\$j\$::jsonb,null,null))->>'version'; select pg_sleep(3); COMMIT;" 2>&1 | clean | sed 's/^/   A(save v2): /' ) &
sleep 1; ex $AQ a1 | sed 's/^/   B(executor v1): /'; wait
q "select count(*) from ticket_office_statements where number='AP-2Q'"
echo "24g 12h — concorrência real: linha nova (FK statement_id real do Cloud) vs a2:"
q "alter table ticket_office_statement_lines add constraint ticket_office_statement_lines_statement_id_fkey foreign key (statement_id) references ticket_office_statements(id) on delete cascade" 2>&1 | grep -v '^ALTER'
mk ps pb "p['effects']['number']='AP-2S'"; RS=$(save ps null null); AS=$(authz $RS 1 ps '{a1,a2}' 00000000-aaaa-0000-0000-0000000000c2); ok $AS a1 >/dev/null
SS="(select (result->>'statement_id')::uuid from data_entry_assistant_executions_333 where authorization_id='$AS' and action_id='a1')"
echo "  ordem 1: INSERT de linha por outro caminho em curso (não confirmado) → a2 espera pelo lock e depois recusa:"
( $P -c "BEGIN; insert into ticket_office_statement_lines(statement_id,company_id,line_type,position,description,amount,event_id) select $SS,'$C1','ticketline_invoice',9,'concorrente',0,'e0000000-0000-4000-8000-000000000002'; select pg_sleep(3); COMMIT;" 2>&1 | clean | grep -v INSERT | sed 's/^/   B(insert): /' ) &
sleep 1; ex $AS a2 | sed 's/^/   A(a2): /'; wait; q "select status, (select count(*) from ticket_office_statement_lines where statement_id=s.id) from ticket_office_statements s where id=$SS"
q "delete from ticket_office_statement_lines where description='concorrente'" >/dev/null
mk pt pb "p['effects']['number']='AP-2T2'"; RT2=$(save pt null null); AT2=$(authz $RT2 1 pt '{a1,a2}' 00000000-aaaa-0000-0000-0000000000c3); ok $AT2 a1 >/dev/null
ST="(select (result->>'statement_id')::uuid from data_entry_assistant_executions_333 where authorization_id='$AT2' and action_id='a1')"
echo "  ordem 2: a2 em curso (lock FOR UPDATE no cabeçalho) → INSERT concorrente espera; depois corre contra apuramento já confirmado:"
( $P -c "BEGIN; SET ROLE authenticated; $(claims) select (public.data_entry_assistant_execute_333('execute','$AT2','a2'))->'result'->>'status'; select pg_sleep(3); COMMIT;" 2>&1 | clean | sed 's/^/   A(a2): /' ) &
sleep 1; $P -c "insert into ticket_office_statement_lines(statement_id,company_id,line_type,position,description,amount,event_id) select $ST,'$C1','ticketline_invoice',9,'concorrente',0,'e0000000-0000-4000-8000-000000000002'" 2>&1 | clean | sed 's/^/   B(insert): /'; wait
q "select status, (select count(*) from ticket_office_statement_lines where statement_id=s.id) from ticket_office_statements s where id=$ST"
echo "25 imutabilidade das execuções (dono):"
$P -c "update data_entry_assistant_executions_333 set result='{}'" 2>&1 | grep -o "immutable_record" | head -1; $P -c "delete from data_entry_assistant_executions_333" 2>&1 | grep -o "immutable_record" | head -1
echo "26 readback (ACL/defaultACL/SECDEF):"
$P -f $X.readback.SELECT.sql 2>&1 | grep -v '^$'
echo "27 rollback do executor com execuções → recusa (retenção):"; $P -f $X.ROLLBACK-INERTE.sql 2>&1 | grep -o "executions_present_retain_before_rollback" | head -1
$P -c "alter table data_entry_assistant_executions_333 disable trigger de333_exec_immutable; delete from data_entry_assistant_executions_333; alter table data_entry_assistant_executions_333 enable trigger de333_exec_immutable"
$P -v ON_ERROR_STOP=1 -f $X.ROLLBACK-INERTE.sql >/dev/null && echo "28 rollback executor OK"
[ "$(snap)" = "$B2SNAP" ] && echo "29 esquema/ACL igual ao anterior ao executor"
$P -v ON_ERROR_STOP=1 -f $X.INERTE.sql >/dev/null && echo "30 reaplicar OK"; $P -f $X.INERTE.sql 2>&1 | grep -o "executor_absent_objects_drift" | head -1
