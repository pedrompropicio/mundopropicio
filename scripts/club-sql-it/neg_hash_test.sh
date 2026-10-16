#!/usr/bin/env bash
# #326 — Testes determinísticos do comparador de hashes (sem base de dados).
# Positivo: snapshot local = Live → exit 0, 14/14. Negativo: 1 hash alterado num snapshot TEMPORÁRIO → exit ≠ 0.
# Negativo 2: função do âmbito em falta → exit ≠ 0. O snapshot canónico nunca é editado.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="${1:-$HERE/../../docs/testes/issue326}"; T="$(mktemp -d)"
python3 - "$HERE/live-hashes.json" "$T" <<'P'
import json,sys
live={k:v for k,v in json.load(open(sys.argv[1])).items() if not k.startswith("_")}
open(sys.argv[2]+"/local_ok.txt","w").write("".join(f"{k} {v}\n" for k,v in live.items()))
bad=dict(live); bad["club_crew_join"]="0"*32
open(sys.argv[2]+"/local_bad.txt","w").write("".join(f"{k} {v}\n" for k,v in bad.items()))
miss={k:v for k,v in live.items() if k!="club_award_fixed"}
open(sys.argv[2]+"/local_miss.txt","w").write("".join(f"{k} {v}\n" for k,v in miss.items()))
P
sha_before="$(sha256sum "$HERE/live-hashes.json" | cut -c1-64)"
run(){ python3 "$HERE/compare_hashes.py" "$HERE/live-hashes.json" "$T/$1" "$T/$1.json" > "$T/$1.out" 2>&1; echo $?; }
pos=$(run local_ok.txt); neg=$(run local_bad.txt); mis=$(run local_miss.txt)
# run.sh com pipefail: um comparador a falhar dentro de "| tee" interrompe o script.
pipe=$(bash -c 'set -euo pipefail; python3 "$0" "$1" "$2" /dev/null | tee /dev/null; echo CONTINUOU' "$HERE/compare_hashes.py" "$HERE/live-hashes.json" "$T/local_bad.txt" >/dev/null 2>&1; echo $?)
sha_after="$(sha256sum "$HERE/live-hashes.json" | cut -c1-64)"
ok=true; [ "$pos" = 0 ] && grep -q "in_scope_iguais: 14/14" "$T/local_ok.txt.out" || ok=false
[ "$neg" != 0 ] && grep -q "DIFERENTE.*" "$T/local_bad.txt.out" || ok=false
[ "$mis" != 0 ] || ok=false; [ "$pipe" != 0 ] || ok=false; [ "$sha_before" = "$sha_after" ] || ok=false
cat > "$OUT/hash-guard-results.json" <<J
{"date":"$(date -u +%FT%TZ)","positivo_exit":$pos,"positivo":"$(grep in_scope_iguais "$T/local_ok.txt.out")",
 "negativo_hash_alterado_exit":$neg,"negativo":"$(grep equivalencia_scope "$T/local_bad.txt.out")",
 "negativo_funcao_em_falta_exit":$mis,"faltou":"$(grep equivalencia_scope "$T/local_miss.txt.out")",
 "pipefail_interrompe_exit":$pipe,"snapshot_canonico_sha256_antes":"$sha_before","snapshot_canonico_sha256_depois":"$sha_after","ok":$ok}
J
rm -rf "$T"; cat "$OUT/hash-guard-results.json"; $ok
