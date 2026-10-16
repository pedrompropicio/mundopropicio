#!/usr/bin/env bash
# #326 — Testes integrados de SQL real do Clube Newgang numa base PostgreSQL LOCAL e descartável.
# Uso: bash scripts/club-sql-it/run.sh [pasta_de_saida]
# Garantias: só socket Unix num diretório temporário (listen_addresses=''), sem TCP, sem extensões,
# sem schema net/cron/vault; recusa correr se houver destino remoto no ambiente. Nada toca em Live.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$ROOT/docs/testes/issue326}"
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
cleanup(){ pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc -h "$SOCK" -p "$PGPORT" -U postgres -d clubit)
initdb -D "$DATA" -U postgres -A trust --no-sync >/dev/null
pg_ctl -D "$DATA" -l "$TMP/pg.log" -w -o "-c listen_addresses='' -c unix_socket_directories='$SOCK' -p $PGPORT -c fsync=off -c max_connections=40" start >/dev/null
psql -X -q -h "$SOCK" -p "$PGPORT" -U postgres -d postgres -c "CREATE DATABASE clubit" >/dev/null

mkdir -p "$OUT"
LOG="$OUT/run.log"; : > "$LOG"
say(){ echo "$*" | tee -a "$LOG"; }
say "runtime: $(postgres --version) · socket local (sem TCP) · $(date -u +%FT%TZ)"
say "listen_addresses=$("${PSQL[@]}" -tAc "show listen_addresses")" 

# 2) Schema: stubs de borda + migrações canónicas verbatim.
"${PSQL[@]}" -f "$HERE/00_stubs.sql" >>"$LOG" 2>&1
for f in "${MIGRATIONS[@]}"; do
  say "aplicar $f sha256=$(sha256sum "$MIG/$f" | cut -c1-16)"
  "${PSQL[@]}" -f "$MIG/$f" >>"$LOG" 2>&1
done

# 3) Equivalência com Live (hashes md5 de pg_get_functiondef lidos por SELECT, sem dados pessoais).
"${PSQL[@]}" -tA -F' ' -c "SELECT p.proname, md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'club\_%' ORDER BY 1" > "$TMP/local-hashes.txt"
python3 "$HERE/compare_hashes.py" "$HERE/live-hashes.json" "$TMP/local-hashes.txt" "$OUT/equivalencia.json" | tee -a "$LOG"

# 4) Prova de egress bloqueado.
"${PSQL[@]}" -f "$HERE/05_egress.sql" 2>&1 | tee -a "$LOG"

# 5) Cenário serial com asserts.
"${PSQL[@]}" -f "$HERE/10_scenario.sql" 2>&1 | tee -a "$LOG"

# 6) Concorrência real (várias ligações + barreira por lock).
bash "$HERE/20_concurrency.sh" "${PSQL[*]}" 2>&1 | tee -a "$LOG"

say "RESULTADO: TODOS OS ASSERTS PASSARAM"
