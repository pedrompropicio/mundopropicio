#!/usr/bin/env bash
# #335 fase 2j — instala os 6 SQL inertes e aplica os 6 rollbacks (ordem inversa) num harness fiel SEM dados de encontro;
# compara uma impressão digital do catálogo (funções, triggers, policies, ACL, colunas, índices, papéis) antes/depois.
# Uso: phase2j-rollback.sh <socket-dir> <port>. LOCAL ONLY.
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$S/../../.." && pwd); D=$1; PORT=$2; M=$ROOT/supabase/manual
P=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE psql -X -q -At -h "$D" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
FP="SELECT md5(string_agg(x,E'\n' ORDER BY x)) FROM (
 SELECT 'f '||p.oid::regprocedure||' '||md5(p.prosrc)||' '||p.prosecdef||' '||coalesce((SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(p.proacl) a),'')||' '||coalesce(array_to_string(p.proconfig,','),'') x FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 UNION ALL SELECT 't '||tgrelid::regclass||' '||tgname||' '||tgenabled::text FROM pg_trigger WHERE NOT tgisinternal
 UNION ALL SELECT 'p '||tablename||' '||policyname||' '||coalesce(qual,'')||' '||coalesce(with_check,'') FROM pg_policies WHERE schemaname='public'
 UNION ALL SELECT 'a '||c.oid::regclass||' '||coalesce((SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(c.relacl) a),'') FROM pg_class c WHERE c.relnamespace='public'::regnamespace
 UNION ALL SELECT 'c '||attrelid::regclass||' '||attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND attnum>0 AND NOT attisdropped
 UNION ALL SELECT 'r '||rolname FROM pg_roles WHERE rolname LIKE 'issue335%') s;"
before=$("${P[@]}" -c "$FP")
# Ordem única (correcção D)
for f in offset_group_storage offset_core offset_approval status offset_invariants offset_balance cash_position cash_position_invariant offset_kill_switch; do "${P[@]}" -f "$M/20261021_issue335_$f.INERTE.sql" >/dev/null; done
mid=$("${P[@]}" -c "$FP")
for f in offset_kill_switch cash_position_invariant cash_position offset_balance offset_invariants status offset_approval offset_core offset_group_storage; do "${P[@]}" -f "$M/20261021_issue335_$f.ROLLBACK-INERTE.sql" >/dev/null; done
after=$("${P[@]}" -c "$FP")
echo "antes=$before instalado=$mid depois=$after"
[[ "$before" != "$mid" ]] || { echo 'FAIL instalação não mudou o catálogo'; exit 1; }
[[ "$before" == "$after" ]] || { echo 'FAIL rollback não restaura o catálogo'; exit 1; }
echo 'PASS 2j rollback completo: 6 instalações + 6 rollbacks restauram funções/triggers/policies/ACL/colunas/papéis byte a byte'
