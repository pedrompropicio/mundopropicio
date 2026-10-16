#!/usr/bin/env bash
# #328 — antes (Live) → patch local (SQL pendente) → depois → reversão. Base local descartável.
# Uso: bash scripts/club-sql-it/run328.sh [pasta_de_saida]
# Garantias: só socket Unix num diretório temporário (listen_addresses=''), sem TCP, sem extensões,
# sem schema net/cron/vault; recusa correr se houver destino remoto no ambiente. Nada toca em Live.
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true
for b in postgres initdb pg_ctl psql python3 setpriv; do
  command -v "$b" >/dev/null 2>&1 || { echo "pré-requisito em falta: $b (PostgreSQL 17 local com initdb/pg_ctl/psql, python3; nenhum serviço externo é usado)" >&2; exit 4; }
done
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$ROOT/docs/testes/issue328}"
MIG="$ROOT/drizzle/migrations"
MIGRATIONS=(0119_0119_newgang_lineup_reveals_security.sql 0120_0120_newgang_portal_sites_editions_club.sql
            0140_derp271_club_terms.sql 0141_derp272_club_missions.sql 0142_derp273_club_points_void.sql
            0143_derp274_club_crews.sql)

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

PEND="$ROOT/supabase/manual/20261016_issue328.PENDENTE.sql"; RB="$ROOT/supabase/manual/20261016_issue328.ROLLBACK.sql"
hashes(){ "${PSQL[@]}" -tA -F' ' -c "SELECT p.proname, md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'club\_%' ORDER BY 1"; }

# A) Baseline: migrações canónicas; guard #326 contra o snapshot Live ANTES de qualquer patch.
"${PSQL[@]}" -f "$HERE/00_stubs.sql" >>"$LOG" 2>&1
for f in "${MIGRATIONS[@]}"; do say "aplicar $f sha256=$(sha256sum "$MIG/$f" | cut -c1-16)"; "${PSQL[@]}" -f "$MIG/$f" >>"$LOG" 2>&1; done
hashes > "$TMP/h0.txt"
say "== A) baseline vs snapshot Live (sem patch)"
python3 "$HERE/compare_hashes.py" "$HERE/live-hashes.json" "$TMP/h0.txt" "$OUT/equivalencia-baseline.json" | tee -a "$LOG"
"${PSQL[@]}" -f "$HERE/05_egress.sql" 2>&1 | tee -a "$LOG"

# B) ANTES: reproduzir defeitos com as funções Live.
say "== B) antes (defeitos reproduzidos)"
"${PSQL[@]}" -f "$HERE/30_before328.sql" 2>&1 | tee -a "$LOG"
OUT="$OUT" bash "$HERE/25_conc328.sh" "${PSQL[*]}" before 2>&1 | tee -a "$LOG"

"${PSQL[@]}" -f "$HERE/35_snapshot328.sql" >>"$LOG" 2>&1
# C) Patch local = SQL pendente verbatim; guard de proveniência.
say "== C) carregar pendente sha256=$(sha256sum "$PEND" | cut -c1-16)"
"${PSQL[@]}" -f "$PEND" >>"$LOG" 2>&1
hashes > "$TMP/h1.txt"
"${PSQL[@]}" -tAc "SELECT json_object_agg(proname, prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('club_upsert_member','club_confirm_member','club_crew_pending')" > "$TMP/bodies.json"
python3 "$HERE/compare_patch.py" "$HERE/live-hashes.json" "$TMP/h1.txt" "$PEND" "$TMP/bodies.json" "$OUT/hashes-depois-esperado.json" | tee -a "$LOG"
say "acl club_crew_pending: $("${PSQL[@]}" -tAc "SELECT proacl::text FROM pg_proc WHERE proname='club_crew_pending'")"
say "acl club_upsert_member: $("${PSQL[@]}" -tAc "SELECT proacl::text FROM pg_proc WHERE proname='club_upsert_member'")"
"${PSQL[@]}" -f "$PEND" >>"$LOG" 2>&1; hashes > "$TMP/h1b.txt"
cmp -s "$TMP/h1.txt" "$TMP/h1b.txt" && say "pendente idempotente: 2.ª aplicação sem alterações" || { say "pendente NÃO idempotente"; exit 5; }

# D) DEPOIS: correções.
say "== D) depois"
"${PSQL[@]}" -f "$HERE/40_after328.sql" 2>&1 | tee -a "$LOG"
OUT="$OUT" bash "$HERE/25_conc328.sh" "${PSQL[*]}" after 2>&1 | tee -a "$LOG"
"${PSQL[@]}" -f "$HERE/05_egress.sql" 2>&1 | tee -a "$LOG"
"${PSQL[@]}" -tAc "SELECT json_agg(json_build_object('n',n,'phase',phase,'name',name,'ok',ok) ORDER BY n) FROM it.results" > "$OUT/serial-results.json"
say "serial: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER (WHERE ok)||'/'||count(*) FROM it.results")"

# E) Reversão: volta a 14/14 iguais ao snapshot Live; dados preservados.
say "== E) reversão sha256=$(sha256sum "$RB" | cut -c1-16)"
N0="$("${PSQL[@]}" -tAc "SELECT count(*)||'/'||coalesce(sum(points),0) FROM club_points")"
"${PSQL[@]}" -f "$RB" >>"$LOG" 2>&1; hashes > "$TMP/h2.txt"
python3 "$HERE/compare_hashes.py" "$HERE/live-hashes.json" "$TMP/h2.txt" "$OUT/equivalencia-pos-reversao.json" | tee -a "$LOG"
grep -q club_crew_pending "$TMP/h2.txt" && { say "reversão deixou club_crew_pending"; exit 6; }
[ "$N0" = "$("${PSQL[@]}" -tAc "SELECT count(*)||'/'||coalesce(sum(points),0) FROM club_points")" ] && say "reversão preserva créditos: $N0" || exit 7
say "colunas mantidas após reversão: $("${PSQL[@]}" -tAc "SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_name='club_members' AND column_name LIKE 'pending_crew%'")"
say "RESULTADO: TODOS OS ASSERTS PASSARAM"
