#!/usr/bin/env bash
# #328 — Verifica o patch INERTE da edge newgang-portal sem tocar no código deployável.
# 1) checksum dos originais; 2) extrai HEAD para worktree temporária; 3) aplica o patch;
# 4) deno check (tipos) + deno test --deny-net; 5) checksum dos originais de novo (têm de ser iguais).
# Uso: bash patches/issue328/verify.sh [ficheiro_json_saida]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
OUT="${1:-$ROOT/docs/testes/issue328/edge-patch-results.json}"
PATCH="$ROOT/patches/issue328/newgang-portal.patch"
FN="supabase/functions/newgang-portal"
before="$(cd "$FN" && sha256sum *.ts | sha256sum | cut -c1-64)"
WT="$(mktemp -d /tmp/ng328wt.XXXXXX)"; trap 'rm -rf "$WT"' EXIT
for f in $(git ls-tree -r --name-only HEAD "$FN" supabase/functions/_shared); do mkdir -p "$WT/$(dirname "$f")"; git show "HEAD:$f" > "$WT/$f"; done
head_vs_tree="$(cd "$WT/$FN" && sha256sum *.ts | sha256sum | cut -c1-64)"
( cd "$WT" && patch -p1 --dry-run < "$PATCH" >/dev/null && patch -p1 < "$PATCH" >/dev/null )
cp "$ROOT/patches/issue328/pending_test.ts" "$WT/$FN/"
check_out="$(cd "$WT/$FN" && deno check index.ts pending.ts 2>&1)" && check=0 || check=$?
test_out="$(cd "$WT/$FN" && deno test --deny-net --deny-env --deny-run --deny-write pending_test.ts 2>&1)" && tst=0 || tst=$?
passed="$(echo "$test_out" | grep -oE '[0-9]+ passed' | head -1 | cut -d' ' -f1)"; failed="$(echo "$test_out" | grep -oE '[0-9]+ failed' | head -1 | cut -d' ' -f1)"
after="$(cd "$FN" && sha256sum *.ts | sha256sum | cut -c1-64)"
wiring="$(grep -c 'crewPendingAction\|mePendingCrew\|memberByEmail' "$WT/$FN/index.ts")"
ilike_req="$(awk '/case "request_access"/,/case "session"/' "$WT/$FN/index.ts" | grep -c ilike || true)"
cat > "$OUT" <<EOF
{"patch_sha256":"$(sha256sum "$PATCH" | cut -c1-64)","patch_applies_to_HEAD":true,
 "originais_sha_agregado_antes":"$before","originais_sha_agregado_depois":"$after","originais_inalterados":$([ "$before" = "$after" ] && echo true || echo false),
 "HEAD_igual_arvore_local":$([ "$head_vs_tree" = "$before" ] && echo true || echo false),
 "deno_check_exit":$check,"deno_test_exit":$tst,"deno_test_passed":${passed:-0},"deno_test_failed":${failed:-0},
 "permissoes_teste":"--deny-net --deny-env --deny-run --deny-write","wiring_refs_index":$wiring,"ilike_em_request_access":$ilike_req,
 "deno":"$(deno --version | head -1)"}
EOF
echo "$check_out" | tail -3; echo "$test_out" | tail -15; cat "$OUT"
[ "$before" = "$after" ] && [ "$check" = 0 ] && [ "$tst" = 0 ] && [ "$ilike_req" = 0 ]
