#!/usr/bin/env bash
# #333 fase12c — prova local em PostgreSQL descartável (socket /tmp/pg333:55433). Sem Cloud.
set -u
P="psql -h /tmp/pg333 -p 55433 -U postgres -qAt"
M=${M:-/dev-server/supabase/manual/20261020_issue333_assistant_review}
U1=11111111-1111-1111-1111-111111111111; C1=22222222-2222-2222-2222-222222222222; U2=33333333-3333-3333-3333-333333333333; C2=44444444-4444-4444-4444-444444444444
H1=$(printf a%.0s {1..64}); H2=$(printf b%.0s {1..64})
$P -c "DROP DATABASE IF EXISTS r12c" ; $P -c "CREATE DATABASE r12c"; P="$P -d r12c"
$P -v ON_ERROR_STOP=1 -f ${STUB:-/dev-server/docs/testes/issue333/pg/assistant-review12c-stub.sql} >/dev/null
snap(){ $P -c "select md5(string_agg(c.relname||coalesce(c.relacl::text,''),',' order by c.relname)) from pg_class c where relnamespace='public'::regnamespace"; }
B=$(snap)
$P -v ON_ERROR_STOP=1 -f $M.INERTE.sql >/dev/null && echo "apply OK"
as(){ local u=$1 c=$2 role=${4:-manager}; $P -c "SET ROLE authenticated; SET t.uid='$u'; SET t.co='$c'; SET t.role='$role'; $3" 2>&1 | sed 's/^psql:.*ERROR: */ERROR /'; }
prop(){ echo "jsonb_build_object('effects_hash','$1','company_id','$2','actions','$3'::jsonb)"; }
BLK='[{"id":"a1","blocked_reason":"x"}]'; OPEN='[{"id":"a1","blocked_reason":null},{"id":"a2","blocked_reason":null}]'
echo "1 gate fechado:"; as $U1 $C1 "select public.data_entry_assistant_review_333('save',null,null,'$H1',$(prop $H1 $C1 "$BLK"),null,null)"
$P -c "update data_entry_assistant_review_settings_333 set enabled=true"
echo "2 select direto authenticated:"; as $U1 $C1 "select count(*) from data_entry_assistant_reviews_333"
echo "3 anon execute:"; $P -c "SET ROLE anon; select public.data_entry_assistant_review_333('save',null,null,'$H1','{}',null,null)" 2>&1 | grep -o "permission denied[^\"]*" | head -1
echo "4 viewer recusado:"; as $U1 $C1 "select public.data_entry_assistant_review_333('save',null,null,'$H1',$(prop $H1 $C1 "$BLK"),null,null)" viewer
echo "5 empresa da proposta diferente:"; as $U1 $C1 "select public.data_entry_assistant_review_333('save',null,null,'$H1',$(prop $H1 $C2 "$BLK"),null,null)"
R=$(as $U1 $C1 "select public.data_entry_assistant_review_333('save',null,null,'$H1',$(prop $H1 $C1 "$BLK"),null,null)->>'review_id'"); echo "6 v1 criada"
echo "7 autorizar com ações bloqueadas:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',1,'$H1',null,'{a1}','aaaaaaaa-0000-0000-0000-000000000001')"
echo "8 outro utilizador/empresa:"; as $U2 $C2 "select public.data_entry_assistant_review_333('save','$R',1,'$H2',$(prop $H2 $C2 "$OPEN"),null,null)"
echo "9 edição -> v2:"; as $U1 $C1 "select public.data_entry_assistant_review_333('save','$R',1,'$H2',$(prop $H2 $C1 "$OPEN"),null,null)->>'version'"
echo "10 versão antiga (stale):"; as $U1 $C1 "select public.data_entry_assistant_review_333('save','$R',1,'$H1',$(prop $H1 $C1 "$OPEN"),null,null)"
echo "11 autorizar v1/hash antigo:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',1,'$H1',null,'{a1,a2}','aaaaaaaa-0000-0000-0000-000000000002')"
echo "12 subconjunto de ações:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a1}','aaaaaaaa-0000-0000-0000-000000000003')"
echo "13 duplicadas:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a1,a1,a2}','aaaaaaaa-0000-0000-0000-000000000003')"
echo "14 autorização exata:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a1,a2}','aaaaaaaa-0000-0000-0000-000000000004')->>'replayed'"
echo "15 replay igual:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a1,a2}','aaaaaaaa-0000-0000-0000-000000000004')->>'replayed'"
echo "16 replay com outra chave mesma versão:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a1,a2}','aaaaaaaa-0000-0000-0000-000000000005')"
echo "17 mesma chave, outros efeitos:"; as $U1 $C1 "select public.data_entry_assistant_review_333('authorize','$R',2,'$H2',null,'{a2,a1}','aaaaaaaa-0000-0000-0000-000000000004')"
echo "18 concorrência (2 ligações, mesma versão esperada 2):"
R3=$R
( $P -c "BEGIN; SET ROLE authenticated; SET t.uid='$U1'; SET t.co='$C1'; select public.data_entry_assistant_review_333('save','$R3',2,'$H1',$(prop $H1 $C1 "$BLK"),null,null)->>'version'; select pg_sleep(1.5); COMMIT;" 2>&1 | sed 's/^/   A: /' ) &
sleep 0.4
as $U1 $C1 "select public.data_entry_assistant_review_333('save','$R3',2,'$H2',$(prop $H2 $C1 "$BLK"),null,null)->>'version'" | sed 's/^/   B: /'
wait
echo "19 contagens:"; $P -c "select (select count(*) from data_entry_assistant_review_versions_333),(select count(*) from data_entry_assistant_authorizations_333),(select version from data_entry_assistant_reviews_333)"
echo "20 rollback com linhas:"; $P -f $M.ROLLBACK-INERTE.sql 2>&1 | grep -o "reviews_present[a-z_]*"
echo "21 readback:"; $P -f $M.readback.SELECT.sql | head -8
$P -c "truncate data_entry_assistant_authorizations_333, data_entry_assistant_review_versions_333, data_entry_assistant_reviews_333"
$P -v ON_ERROR_STOP=1 -f $M.ROLLBACK-INERTE.sql >/dev/null && echo "22 rollback OK"
[ "$B" = "$(snap)" ] && echo "23 esquema/ACL igual ao inicial" || echo "23 DIVERGE"
echo "24 reaplicar:"; $P -v ON_ERROR_STOP=1 -f $M.INERTE.sql >/dev/null && echo OK; $P -f $M.INERTE.sql 2>&1 | grep -o "reviewed_absent_objects_drift"
