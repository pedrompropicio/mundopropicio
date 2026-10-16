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
CANON="$ROOT/scripts/club-sql-it"
OUT="${1:-/tmp/issue330/sql}"
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

"${PSQL[@]}" -f "$CANON/00_stubs.sql" >>"$LOG" 2>&1
for f in "${MIGRATIONS[@]}"; do "${PSQL[@]}" -f "$MIG/$f" >>"$LOG" 2>&1; done
"${PSQL[@]}" -f "$CANON/06_acl_parity_live.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$CANON/50_legacy327.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$ROOT/supabase/manual/20261016_issue327.PENDENTE.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$CANON/05_egress.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "${CLUB330_SQL:-$ROOT/supabase/manual/20261016_issue330.PENDENTE.sql}" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$HERE/scenario.sql" >>"$LOG" 2>&1
bash "$HERE/concurrency.sh" "${PSQL[*]}" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$ROOT/supabase/manual/20261016_issue330.ROLLBACK.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$HERE/after-rollback.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -f "$CANON/05_egress.sql" >>"$LOG" 2>&1
"${PSQL[@]}" -tAc "SELECT json_agg(json_build_object('name',name,'ok',ok) ORDER BY n) FROM t.results WHERE phase='330'" > "$OUT/results.json"
say "ASSERTS: $("${PSQL[@]}" -tAc "SELECT count(*) FILTER(WHERE ok)||'/'||count(*) FROM t.results WHERE phase='330'")"
say "RESULTADO #330: OK"
