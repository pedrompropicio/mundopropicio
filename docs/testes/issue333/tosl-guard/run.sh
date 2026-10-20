#!/usr/bin/env bash
set -euo pipefail
[[ "${ISSUE333_LOCAL_PROOF:-}" == 1 ]] || { echo 'ISSUE333_LOCAL_PROOF=1 required'; exit 1; }
ROOT=$(realpath "$(dirname "$0")/../../../..")
DIR=/tmp/issue333-guard-pg
[[ ! -e "$DIR" ]] || { echo 'Local socket directory already exists; inspect before rerun.'; exit 1; }
python3 -c 'import psycopg2'
mkdir -p "$DIR"
if [[ $(id -u) == 0 ]]; then
  chown 1000:1000 "$DIR"
  RUN=(setpriv --reuid=1000 --regid=1000 --clear-groups)
else
  RUN=()
fi
cleanup(){ "${RUN[@]}" pg_ctl -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"; }
"${RUN[@]}" initdb -D "$DIR/data" -U postgres -A trust --no-locale -E UTF8 > "$DIR/init.log"
trap cleanup EXIT
"${RUN[@]}" pg_ctl -D "$DIR/data" -l "$DIR/server.log" -o "-k $DIR -p 55439 -h ''" start
python3 "$ROOT/docs/testes/issue333/tosl-guard/concurrency.py"