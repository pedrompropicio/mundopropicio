#!/usr/bin/env bash
# #333 fase12d — prova local em PostgreSQL descartável (socket /tmp/pg333:55433). Sem Cloud.
# Propostas P1/P2 geradas pelo código do servidor (buildTicketlineProposal) em /tmp/pg333t/p{1,2}.json.
set -u
P="env -i PATH=$PATH psql -h /tmp/pg333 -p 55433 -U postgres -qAt"
M=${M:-/dev-server/supabase/manual/20261020_issue333_assistant_review}
U1=11111111-1111-1111-1111-111111111111; C1=22222222-2222-2222-2222-222222222222; U2=33333333-3333-3333-3333-333333333333; C2=44444444-4444-4444-4444-444444444444
UB=55555555-5555-5555-5555-555555555555; CI=66666666-6666-6666-6666-666666666666
P1=$(cat /tmp/pg333t/p1.json); P2=$(cat /tmp/pg333t/p2.json)
H1=$(echo "$P1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["effects_hash"])'); H2=$(echo "$P2" | python3 -c 'import json,sys;print(json.load(sys.stdin)["effects_hash"])')
$P -c "DROP DATABASE IF EXISTS r12d"; $P -c "CREATE DATABASE r12d ENCODING UTF8 TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'"; P="$P -d r12d"
$P -v ON_ERROR_STOP=1 -f ${STUB:-/dev-server/docs/testes/issue333/pg/assistant-review12c-stub.sql} >/dev/null
snap(){ $P -c "select md5(string_agg(c.relname||coalesce(c.relacl::text,''),',' order by c.relname)) from pg_class c where relnamespace='public'::regnamespace"; }
B=$(snap)
$P -v ON_ERROR_STOP=1 -f $M.INERTE.sql >/dev/null && echo "apply OK"
sr(){ $P -c "SET ROLE service_role; $1" 2>&1 | sed 's/^psql:[^E]*ERROR: */ERROR /' | grep -v '^CONTEXT'; }
F="public.data_entry_assistant_review_333"
save(){ echo "$F('save','$1','$2',$3,$4,'$5',\$j\$$6\$j\$::jsonb,null,null)"; }
authz(){ echo "$F('authorize','$1','$2','$3',$4,'$5',null,'$6','$7')"; }
echo "1 probe com gate fechado:"; sr "select $F('probe',null,null,null,null,null,null,null,null)"
echo "2 gate fechado:"; sr "select $(save $U1 $C1 null null $H1 "$P1")"
$P -c "update data_entry_assistant_review_settings_333 set enabled=true"
echo "3 authenticated execute (cliente direto):"; $P -c "SET ROLE authenticated; select $(save $U1 $C1 null null $H1 "$P1")" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "4 sandbox_exec_x execute (default ACL):"; $P -c "SET ROLE sandbox_exec_x; select $F('probe',null,null,null,null,null,null,null,null)" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "5 service_role escrita direta:"; $P -c "SET ROLE service_role; insert into data_entry_assistant_reviews_333(owner_id,company_id,version,effects_hash) values ('$U1','$C1',1,'$H1')" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "6 sandbox_exec select:"; $P -c "SET ROLE sandbox_exec; select count(*) from data_entry_assistant_reviews_333" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "7 viewer / banido / empresa inativa / outra empresa na proposta:"
sr "select $(save $U2 $C2 null null $H1 "$P1")"; sr "select $(save $UB $C1 null null $H1 "$P1")"; sr "select $(save $U1 $CI null null $H1 "$P1")"; sr "select $(save $U1 $C2 null null $H1 "$P1")"
echo "8 hash do cliente divergente do conteúdo:"; sr "select $(save $U1 $C1 null null $H2 "$(echo "$P1" | python3 -c 'import json,sys;p=json.load(sys.stdin);p["effects_hash"]="'$H2'";print(json.dumps(p))')")"
echo "9 conteúdo adulterado (mesmo hash):"; sr "select $(save $U1 $C1 null null $H1 "$(echo "$P1" | python3 -c 'import json,sys;p=json.load(sys.stdin);p["effects"]["total"]=1;print(json.dumps(p))')")"
R=$(sr "select ($(save $U1 $C1 null null $H1 "$P1"))->>'review_id'"); echo "10 v1 (hash do servidor TS = hash SQL): ${#R}"
echo "11 autorizar dependência omitida (a2 sem a1):"; sr "select $(authz $U1 $C1 $R 1 $H1 '{a2}' aaaaaaaa-0000-0000-0000-000000000001)"
echo "12 autorizar a5 bloqueada:"; sr "select $(authz $U1 $C1 $R 1 $H1 '{a1,a2,a3,a4,a5}' aaaaaaaa-0000-0000-0000-000000000001)"
echo "13 duplicadas / vazio:"; sr "select $(authz $U1 $C1 $R 1 $H1 '{a1,a1}' aaaaaaaa-0000-0000-0000-000000000001)"; sr "select $(authz $U1 $C1 $R 1 $H1 '{}' aaaaaaaa-0000-0000-0000-000000000001)"
echo "14 outro utilizador:"; sr "select $(authz $UB $C1 $R 1 $H1 '{a1}' aaaaaaaa-0000-0000-0000-000000000001)"
echo "15 edição -> v2:"; sr "select ($(save $U1 $C1 "'$R'" 1 $H2 "$P2"))->>'version'"
echo "16 autorizar v1 (stale):"; sr "select $(authz $U1 $C1 $R 1 $H1 '{a1}' aaaaaaaa-0000-0000-0000-000000000002)"
echo "17 subconjunto admissível {a1,a2}:"; sr "select ($(authz $U1 $C1 $R 2 $H2 '{a1,a2}' aaaaaaaa-0000-0000-0000-000000000003))->>'replayed'"
echo "18 replay igual:"; sr "select ($(authz $U1 $C1 $R 2 $H2 '{a1,a2}' aaaaaaaa-0000-0000-0000-000000000003))->>'replayed'"
echo "19 outra chave mesma versão:"; sr "select $(authz $U1 $C1 $R 2 $H2 '{a1}' aaaaaaaa-0000-0000-0000-000000000004)"
echo "20 mesma chave outros efeitos:"; sr "select $(authz $U1 $C1 $R 2 $H2 '{a1}' aaaaaaaa-0000-0000-0000-000000000003)"
echo "21 imutabilidade (dono postgres):"
$P -c "update data_entry_assistant_review_versions_333 set proposal='{}'" 2>&1 | grep -o "immutable_record" | head -1
$P -c "delete from data_entry_assistant_authorizations_333" 2>&1 | grep -o "immutable_record" | head -1
$P -c "truncate data_entry_assistant_authorizations_333 cascade" 2>&1 | grep -o "immutable_record" | head -1
echo "22 concorrência (2 ligações, versão esperada 2):"
( $P -c "BEGIN; SET ROLE service_role; select ($(save $U1 $C1 "'$R'" 2 $H1 "$P1"))->>'version'; select pg_sleep(1.5); COMMIT;" 2>&1 | sed 's/^/   A: /' ) &
sleep 0.4
sr "select ($(save $U1 $C1 "'$R'" 2 $H2 "$P2"))->>'version'" | sed 's/^/   B: /'
wait
echo "23 contagens versões|autorizações|versão:"; $P -c "select (select count(*) from data_entry_assistant_review_versions_333),(select count(*) from data_entry_assistant_authorizations_333),(select version from data_entry_assistant_reviews_333)"
echo "24 rollback com linhas:"; $P -f $M.ROLLBACK-INERTE.sql 2>&1 | grep -o "reviews_present[a-z_]*"
echo "25 readback:"; $P -f $M.readback.SELECT.sql
$P -c "SET session_replication_role=replica; truncate data_entry_assistant_authorizations_333, data_entry_assistant_review_versions_333, data_entry_assistant_reviews_333"
$P -v ON_ERROR_STOP=1 -f $M.ROLLBACK-INERTE.sql >/dev/null && echo "26 rollback OK"
[ "$B" = "$(snap)" ] && echo "27 esquema/ACL igual ao inicial" || echo "27 DIVERGE"
echo "28 reaplicar:"; $P -v ON_ERROR_STOP=1 -f $M.INERTE.sql >/dev/null && echo OK; $P -f $M.INERTE.sql 2>&1 | grep -o "reviewed_absent_objects_drift"
