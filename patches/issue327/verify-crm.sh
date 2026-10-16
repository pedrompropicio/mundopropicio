#!/usr/bin/env bash
# #327 — Verifica o patch INERTE do CRM (CrewsSection) numa worktree temporária: aplica, tsgo do projeto e vitest
# do teste novo. Originais comparados por checksum antes/depois. Uso: bash patches/issue327/verify-crm.sh [saida.json]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
OUT="${1:-$ROOT/docs/testes/issue327/crm-patch-results.json}"; PATCH="$ROOT/patches/issue327/crm-crews-section.patch"
F=src/pages/crm-admin/sites/CrewsSection.tsx
before="$(sha256sum "$F" | cut -c1-64)"
WT="$(mktemp -d /tmp/crm327wt.XXXXXX)"; trap 'rm -rf "$WT"' EXIT
git archive HEAD src tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts vitest.config.ts package.json components.json tailwind.config.ts postcss.config.js | tar -x -C "$WT"
ln -s "$ROOT/node_modules" "$WT/node_modules"
( cd "$WT" && patch -p1 --dry-run < "$PATCH" >/dev/null && patch -p1 < "$PATCH" >/dev/null )
tsc_out="$(cd "$WT" && npx tsgo -p tsconfig.app.json --noEmit 2>&1)" && tsc=0 || tsc=$?
vt_out="$(cd "$WT" && npx vitest run src/lib/__tests__/club-crew-rule-source.test.ts 2>&1)" && vt=0 || vt=$?
passed="$(echo "$vt_out" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | head -1)"
writes="$(grep -c 'crewRuleWrite(src, cfg)' "$WT/$F")"
after="$(sha256sum "$F" | cut -c1-64)"
cat > "$OUT" <<J
{"patch_sha256":"$(sha256sum "$PATCH" | cut -c1-64)","patch_applies_to_HEAD":true,"head":"$(git rev-parse HEAD)",
 "original_sha_antes":"$before","original_sha_depois":"$after","original_inalterado":$([ "$before" = "$after" ] && echo true || echo false),
 "tsgo_exit":$tsc,"vitest_exit":$vt,"vitest_passed":${passed:-0},"gravacao_via_crewRuleWrite":$writes}
J
echo "$tsc_out" | tail -5; echo "$vt_out" | tail -8; cat "$OUT"
[ "$before" = "$after" ] && [ "$tsc" = 0 ] && [ "$vt" = 0 ] && [ "$writes" = 1 ]
