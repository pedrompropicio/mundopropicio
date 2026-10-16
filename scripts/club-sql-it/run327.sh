#!/usr/bin/env bash
# #327 — baseline Live (pós-0176) → patch local #327 → cutover → reversão. Base local descartável.
# Uso: bash scripts/club-sql-it/run327.sh [pasta_de_saida]
# Garantias: só socket Unix num diretório temporário (listen_addresses=''), sem TCP, sem extensões,
# sem schema net/cron/vault; recusa correr se houver destino remoto no ambiente. Nada toca em Live.
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true
for b in postgres initdb pg_ctl psql python3 setpriv; do
  command -v "$b" >/dev/null 2>&1 || { echo "pré-requisito em falta: $b (PostgreSQL 17 local com initdb/pg_ctl/psql, python3; nenhum serviço externo é usado)" >&2; exit 4; }
done
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$ROOT/docs/testes/issue327}"
MIG="$ROOT/drizzle/migrations"
MIGRATIONS=(0119_0119_newgang_lineup_reveals_security.sql 0120_0120_newgang_portal_sites_editions_club.sql
            0140_derp271_club_terms.sql 0141_derp272_club_missions.sql 0142_derp273_club_points_void.sql
            0143_derp274_club_crews.sql 0144_derp275_club_wallet_passes.sql 0176_issue328_club_identity_crew_pending.sql)

# 1) Guarda anti-remoto: limpa credenciais herdadas; falha se algo pedir host remoto.
for v in DATABASE_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY POSTGRES_URL; do
  if [ -n "${!v:-}" ]; then echo "guard: $v presente no ambiente → removido (valor não impresso)"; unset "$v"; fi
done
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSERVICEFILE PGPASSFILE PGSSLMODE || true
TMP="$(mktemp -d /tmp/club-sql-it.XXXXXX)"
SOCK="$TMP/sock"; DATA="$TMP/data"; mkdir -p "$SOCK"
export PGHOST="$SOCK" PGPORT=54326 PGUSER=postgres PGDATABASE=clubit
case "$PGHOST" in /tmp/club-sql-it.*) ;; *) echo "guard: PGHOST não-local, abortar"; exit 2;; esac
cleanup(){ "${AS[@]}" "$TMP/pg/bin/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }

AS=()
if [ "$(id -u)" = 0 ]; then AS=(setpriv --reuid=1000 --regid=1000 --clear-groups); chown -R 1000:1000 "$TMP"; fi
trap cleanup EXIT
# Instalação privada: só plpgsql disponível (sem dblink/postgres_fdw/qualquer extensão), para que nenhuma
# função da base consiga abrir ligações de rede. Binários originais ficam intactos.
SRC="$(dirname "$(dirname "$(readlink -f "$(command -v postgres)")")")"
PGP="$TMP/pg"; mkdir -p "$PGP/bin" "$PGP/share" "$PGP/lib"
cp "$SRC/bin/postgres" "$SRC/bin/initdb" "$SRC/bin/pg_ctl" "$PGP/bin/"
cp -r "$SRC/share/postgresql" "$PGP/share/"
find "$PGP/share/postgresql/extension" -type f ! -name 'plpgsql*' -delete
cp -r "$SRC/lib/." "$PGP/lib/"; rm -f "$PGP/lib/dblink.so" "$PGP/lib/postgres_fdw.so"
[ "$(id -u)" = 0 ] && chown -R 1000:1000 "$TMP"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc -h "$SOCK" -p "$PGPORT" -U postgres -d clubit)
"${AS[@]}" "$PGP/bin/initdb" -D "$DATA" -U postgres -A trust --no-sync >/dev/null
"${AS[@]}" "$PGP/bin/pg_ctl" -D "$DATA" -l "$TMP/pg.log" -w -o "-c listen_addresses='' -c unix_socket_directories='$SOCK' -p $PGPORT -c fsync=off -c max_connections=40" start >/dev/null
psql -X -q -h "$SOCK" -p "$PGPORT" -U postgres -d postgres -c "CREATE DATABASE clubit" >/dev/null

mkdir -p "$OUT"
LOG="$OUT/run-log.txt"; : > "$LOG"
say(){ echo "$*" | tee -a "$LOG"; }
say "runtime: $("$PGP/bin/postgres" --version) · socket local (sem TCP) · $(date -u +%FT%TZ)"
say "listen_addresses=$("${PSQL[@]}" -tAc "show listen_addresses")" 

PEND="$ROOT/supabase/manual/20261016_issue327.PENDENTE.sql"; RB="$ROOT/supabase/manual/20261016_issue327.ROLLBACK.sql"
LIVE="$HERE/live-hashes-327.json"
hashes(){ "${PSQL[@]}" -tA -F' ' -c "SELECT p.proname, md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'club\_%' OR p.proname LIKE '\_club\_%') ORDER BY 1"; }
CHANGED="'club_award','club_award_fixed','club_confirm_member','club_ranking','club_wallet_due'"

# A) Baseline = migrações do repo até 0176; guard contra o snapshot Live pós-0176 ANTES do patch.
"${PSQL[@]}" -f "$HERE/00_stubs.sql" >>"$LOG" 2>&1
for f in "${MIGRATIONS[@]}"; do say "aplicar $f sha256=$(sha256sum "$MIG/$f" | cut -c1-16)"; "${PSQL[@]}" -f "$MIG/$f" >>"$LOG" 2>&1; done
hashes > "$TMP/h0.txt"
say "== A) baseline vs Live pós-0176 (sem patch)"
python3 "$HERE/compare327.py" base "$LIVE" "$TMP/h0.txt" "$OUT/equivalencia-baseline.json" | tee -a "$LOG"
ACL0="$("${PSQL[@]}" -tAc "SELECT string_agg(proname||'='||coalesce(proacl::text,'default'), ' ' ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ($CHANGED)")"; say "acl baseline: $ACL0"
python3 - "$LIVE" "$ACL0" <<'PY' | tee -a "$LOG"
import json, sys
live = json.load(open(sys.argv[1]))["_acl_live_map"]; loc = dict(x.split("=", 1) for x in sys.argv[2].split())
def roles(a): return sorted({p.split("=")[0] or "PUBLIC" for p in a.strip("{}").split(",") if p}) if a != "default" else ["default"]
for f in sorted(live):
    if f not in loc: continue
    l, r = roles(loc[f]), sorted(live[f]); print(f"acl vs Live {f}: local={','.join(l)} live={','.join(r)} -> {'IGUAL' if l == r else 'DRIFT (conhecido; não declarado igual)'}")
PY
"${PSQL[@]}" -f "$HERE/05_egress.sql" 2>&1 | tee -a "$LOG"
if [ "${GEN_ROLLBACK:-0}" = 1 ]; then
  { echo "-- #327 — REVERSÃO (ficheiro inerte, NÃO APLICADA). Gerada das funções do baseline local, cujo md5 = Live pós-0176."
    echo "-- Repõe as 5 funções alteradas verbatim, remove as funções novas, repõe limiares e as 4 regras visíveis de antes do"
    echo "-- 1.º cutover e retira configs. NÃO apaga créditos, pisos, provas, contagens nem colunas (ficam DEPRECATED)."
    cat "$HERE/rollback327_head.sql"
    "${PSQL[@]}" -tA -c "SELECT string_agg(pg_get_functiondef(p.oid) || ';', E'\n' ORDER BY proname) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN ($CHANGED)"
    cat "$HERE/rollback327_tail.sql"; } > "$RB"
  say "rollback gerado: $(sha256sum "$RB" | cut -c1-16)"
fi

# B) Legado criado com as funções Live.
say "== B) legado (funções Live)"
"${PSQL[@]}" -f "$HERE/50_legacy327.sql" 2>&1 | tee -a "$LOG"

# C) Patch local = pendente verbatim; proveniência; 2.ª aplicação idempotente.
say "== C) carregar pendente sha256=$(sha256sum "$PEND" | cut -c1-16)"
"${PSQL[@]}" -f "$PEND" >>"$LOG" 2>&1
hashes > "$TMP/h1.txt"
"${PSQL[@]}" -tAc "SELECT json_object_agg(proname, prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'club\_%' OR proname LIKE '\_club\_%')" > "$TMP/bodies.json"
python3 "$HERE/compare327.py" patch "$LIVE" "$TMP/h1.txt" "$OUT/hashes-depois-esperado.json" "$PEND" "$TMP/bodies.json" | tee -a "$LOG"
say "acl _club_award_core: $("${PSQL[@]}" -tAc "SELECT proacl::text FROM pg_proc WHERE proname='_club_award_core'")"
say "acl club_award_purchase: $("${PSQL[@]}" -tAc "SELECT proacl::text FROM pg_proc WHERE proname='club_award_purchase'")"
say "acl club_ranking: $("${PSQL[@]}" -tAc "SELECT proacl::text FROM pg_proc WHERE proname='club_ranking'")"
"${PSQL[@]}" -f "$PEND" >>"$LOG" 2>&1; hashes > "$TMP/h1b.txt"
cmp -s "$TMP/h1.txt" "$TMP/h1b.txt" && say "pendente idempotente: 2.ª aplicação sem alterações" || { say "pendente NÃO idempotente"; exit 5; }

# D) Depois: cenário série + concorrência real.
say "== D) depois"
"${PSQL[@]}" -f "$HERE/60_after327.sql" 2>&1 | tee -a "$LOG"
"${PSQL[@]}" -f "$HERE/65_rls327.sql" 2>&1 | tee -a "$LOG"
OUT="$OUT" bash "$HERE/70_conc327.sh" "${PSQL[*]}" 2>&1 | tee -a "$LOG"
OUT="$OUT" bash "$HERE/75_epoch327.sh" "${PSQL[*]}" 2>&1 | tee -a "$LOG"
"${PSQL[@]}" -f "$HERE/05_egress.sql" 2>&1 | tee -a "$LOG"
"${PSQL[@]}" -tAc "SELECT json_agg(json_build_object('n',n,'phase',phase,'name',name,'ok',ok) ORDER BY n) FROM t.results" > "$OUT/serial-results.json"
say "serial: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER (WHERE ok)||'/'||count(*) FROM t.results")"

# E) Reversão: funções = Live; créditos e histórico preservados; limiares anteriores ao 1.º cutover.
say "== E) reversão sha256=$(sha256sum "$RB" | cut -c1-16)"
N0="$("${PSQL[@]}" -tAc "SELECT count(*)||'/'||sum(points) FROM club_points")"
# Ordem: API revertida primeiro. Consumidor antigo (soma + club_levels, sem RPC) funciona com o patch SQL ainda aplicado:
OLDLV="$("${PSQL[@]}" -tAc "SELECT (SELECT name FROM club_levels l WHERE l.site_id=m.site_id AND l.min_points <= (SELECT coalesce(sum(points),0) FROM club_points WHERE member_id=m.id) ORDER BY min_points DESC LIMIT 1) FROM club_members m WHERE email='lv1500@example.invalid' AND site_id='00000000-0000-4000-8000-0000000000a2'")"
say "consumidor antigo (sem RPC) com SQL #327 ainda aplicado: nível=$OLDLV"
# Guarda: reversão aborta (nada muda) se alguém descesse de nível — controlo negativo com um membro cujos pontos caem abaixo do piso.
"${PSQL[@]}" -tAc "INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id) SELECT company_id, id, 'seed_fixture', -1400, 'rb_neg' FROM club_members WHERE email='lv1500@example.invalid' AND site_id='00000000-0000-4000-8000-0000000000a2'" >/dev/null
if "${PSQL[@]}" -f "$RB" >>"$LOG" 2>&1; then say "ERRO: reversão devia abortar"; exit 10; fi
[ -n "$("${PSQL[@]}" -tAc "SELECT to_regprocedure('public.club_member_level(uuid)')")" ] && say "reversão abortou com descida de nível; nada mudou (funções novas presentes)" || exit 11
"${PSQL[@]}" -tAc "DELETE FROM club_points WHERE ref_id='rb_neg' AND rule_key='seed_fixture'" >/dev/null
"${PSQL[@]}" -f "$RB" >>"$LOG" 2>&1; hashes > "$TMP/h2.txt"
python3 "$HERE/compare327.py" base "$LIVE" "$TMP/h2.txt" "$OUT/equivalencia-pos-reversao.json" | tee -a "$LOG"
[ "$N0" = "$("${PSQL[@]}" -tAc "SELECT count(*)||'/'||sum(points) FROM club_points")" ] && say "reversão preserva créditos: $N0" || exit 7
[ "$ACL0" = "$("${PSQL[@]}" -tAc "SELECT string_agg(proname||'='||coalesce(proacl::text,'default'), ' ' ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ($CHANGED)")" ] && say "ACL das 5 funções = baseline" || { say "ACL diferente"; exit 9; }
say "níveis após reversão: $("${PSQL[@]}" -tAc "SELECT jsonb_object_agg(name,min_points) FROM club_levels WHERE site_id='00000000-0000-4000-8000-0000000000a2'")"
[ "$("${PSQL[@]}" -tAc "SELECT jsonb_object_agg(name,min_points) = '{\"Gang\":0,\"Crew\":500,\"Goat\":1500}' FROM club_levels WHERE site_id='00000000-0000-4000-8000-0000000000a2'")" = t ] || exit 8
say "regras visíveis após reversão: $("${PSQL[@]}" -tAc "SELECT string_agg(rule_key||':'||points, ',' ORDER BY rule_key) FROM club_point_rules WHERE site_id='00000000-0000-4000-8000-0000000000a2'")"
[ "$("${PSQL[@]}" -tAc "SELECT (SELECT md5(string_agg(site_id||rule_key||points||active, ',' ORDER BY site_id, rule_key)) FROM club_point_rules WHERE site_id IN ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b2')) = (SELECT v FROM t.snap WHERE k='rules')")" = t ] && say "regras A2/B2 = pré-patch" || exit 12
[ "$("${PSQL[@]}" -tAc "SELECT pts||'/'||min_m||'/'||max_m FROM club_crew_cfg('00000000-0000-4000-8000-0000000000a2')")" = "200/4/6" ] && say "crew_cfg após reversão: 200/4/6" || exit 13
say "configs ativas após reversão: $("${PSQL[@]}" -tAc "SELECT count(*) FROM club_points_config WHERE status='active'")"
say "pisos/provas/contagens/retrato preservados: $("${PSQL[@]}" -tAc "SELECT (SELECT count(*) FROM club_level_floors)||'/'||(SELECT count(*) FROM club_purchase_evidence)||'/'||(SELECT count(*) FROM club_referral_events)||'/'||(SELECT count(*) FROM club_legacy_consumption)")"
# Pós-reversão: motor antigo volta (150 por indicação) e reconfirmação não duplica inscrição.
"${PSQL[@]}" -tAc "DO \$\$ DECLARE a uuid; b uuid; BEGIN a := t.newc('rb1@example.invalid'); b := t.newc('rb2@example.invalid', t.code(a));
  PERFORM t.ok('reversao','motor antigo: indicação 150', t.rp('friend_joined', a) = 150);
  PERFORM club_confirm_member(t.m('novo1@example.invalid'));
  PERFORM t.ok('reversao','reconfirmação pós-reversão não duplica inscrição', t.cnt('join_confirmed', t.m('novo1@example.invalid')) = 1); END \$\$;" | tee -a "$LOG"
say "RESULTADO: TODOS OS ASSERTS PASSARAM"
