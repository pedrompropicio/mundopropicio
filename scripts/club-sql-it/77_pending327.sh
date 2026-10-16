#!/usr/bin/env bash
# #327 — Retry de convite de Crew pendente (#328) a atravessar o cutover. Barreira determinística com 2 ligações reais.
# T2 segura o bloqueio EXCLUSIVO do site (como o cutover) → T1 faz club_crew_pending(X,'retry') com vaga (a junção
# completa a Crew → motor pede o site partilhado) e X ≥ limiar (o cutover vai criar piso de X → KEY SHARE na linha de X)
# → espera até T1 estar bloqueado no advisory → T2 corre o cutover e faz COMMIT.
# NEG (corpo 0176, membro FOR UPDATE antes do site): ciclo → deadlock detetado. POS (pendente #327): sem ciclo.
set -euo pipefail
read -r -a PSQL <<< "$1"; OUT="${OUT:?}"; RES="$OUT/pending-retry-results.json"; WD="$(mktemp -d)"
q(){ "${PSQL[@]}" -tA -c "$1"; }
results=()
save(){ printf '{"asserts":%s,"falhados":%s,"items":[%s]}\n' "$(printf '%s\n' "${results[@]}" | grep -c '"ok":' || true)" \
  "$(printf '%s\n' "${results[@]}" | grep -c '"ok":false' || true)" "$(IFS=,; echo "${results[*]}")" > "$RES"; }
check(){ local v; v="$(q "SELECT ($2)::text")"; results+=("{\"name\":\"$1\",\"ok\":$v}")
  [ "$v" = true ] || { echo "PEND ASSERT FALHOU: $1"; save; exit 1; }; echo "pend ok: $1"; }
waiting(){ q "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"; }
wait_for(){ local n=0; until [ "$(waiting)" = "$1" ]; do n=$((n+1)); [ "$n" -gt 400 ] && { echo "esperava $1 à espera"; save; exit 1; }; sleep 0.05; done; }
q "SET deadlock_timeout='200ms'" >/dev/null
# setup SITE PREFIX VERSION EVENT CREWPTS: Crew com 3 confirmados + X confirmado com convite pendente (estado crew_full) e 800 pts.
setup(){ local site="$1" p="$2" ver="$3" ev="$4" cp="$5"
  q "DO \$\$ DECLARE o uuid; r jsonb; x uuid; co uuid; BEGIN
    o := t.newc('${p}_o@example.invalid', NULL, '$site'); r := club_crew_create(o, 'Crew ${p}');
    PERFORM club_crew_join(t.newc('${p}_2@example.invalid', NULL, '$site'), r->>'code');
    PERFORM club_crew_join(t.newc('${p}_3@example.invalid', NULL, '$site'), r->>'code');
    x := t.newc('${p}_x@example.invalid', NULL, '$site'); PERFORM t.seed(x, 800 - t.pts(x));
    UPDATE club_members SET pending_crew_code = r->>'code', pending_crew_status = 'crew_full', pending_crew_checked_at = now() WHERE id = x;
    SELECT company_id INTO co FROM portal_sites WHERE id = '$site';
    INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
    VALUES (co, '$site', '$ver', '$ev', 'draft', false, 100, 75, 750, $cp, 200, '{\"Gang\":0,\"Crew\":750,\"Goat\":3000}'); END \$\$;" >/dev/null; }
# race NAME SITE VERSION → saídas em $WD/{t1,t2}.NAME.out
race(){ local name="$1" site="$2" ver="$3" fifo="$WD/t2.$1"
  mkfifo "$fifo"; "${PSQL[@]}" -tA < "$fifo" > "$WD/t2.$name.out" 2>&1 & local p2=$!
  exec 9> "$fifo"
  echo "SET deadlock_timeout='200ms'; BEGIN; SELECT _club_site_lock('$site', true); SELECT 'T2HOLD';" >&9
  until grep -q T2HOLD "$WD/t2.$name.out" 2>/dev/null; do sleep 0.05; done
  "${PSQL[@]}" -tA -c "SET deadlock_timeout='200ms'" -c "SELECT club_crew_pending(t.m('${name}_x@example.invalid','$site'), 'retry')" > "$WD/t1.$name.out" 2>&1 & local p1=$!
  wait_for 1
  echo "SELECT club_points_cutover((SELECT id FROM club_points_config WHERE version='$ver'), (SELECT jsonb_object_agg(name, min_points) FROM club_levels WHERE site_id='$site')); COMMIT;" >&9
  exec 9>&-; wait "$p1" || true; wait "$p2" || true; }
A='00000000-0000-4000-8000-0000000000a2'; C='00000000-0000-4000-8000-0000000000c2'
EVA="$(q "SELECT event_id FROM portal_sites WHERE id='$A'")"; EVC="$(q "SELECT event_id FROM portal_sites WHERE id='$C'")"

# NEG: repõe SÓ aqui o corpo de 0176 (membro FOR UPDATE antes do site); depois volta ao pendente.
{ q "SELECT pg_get_functiondef('public.club_crew_pending(uuid,text)'::regprocedure)"; echo ";"; } > "$WD/new.sql"
python3 - "$PEND_OLD" > "$WD/old.sql" <<'PY'
import re, sys; s = open(sys.argv[1]).read()
m = re.search(r"CREATE OR REPLACE FUNCTION public\.club_crew_pending\(.*?\nEND \$\$;", s, re.S); print(m.group(0))
PY
"${PSQL[@]}" -f "$WD/old.sql" >/dev/null
check "NEG: corpo 0176 carregado (FOR UPDATE antes do site)" "position('_club_site_lock' in pg_get_functiondef('public.club_crew_pending(uuid,text)'::regprocedure)) = 0"
setup "$C" pn c-pend "$EVC" 80
race pn "$C" c-pend
NEGDL="$(cat "$WD/t1.pn.out" "$WD/t2.pn.out" | grep -c 'deadlock detected' || true)"
results+=("{\"name\":\"NEG: sem fix o ciclo membro→site × site→membro dá deadlock (detetado $NEGDL×)\",\"ok\":$([ "$NEGDL" -ge 1 ] && echo true || echo false)}")
[ "$NEGDL" -ge 1 ] || { cat "$WD"/t?.pn.out; echo "controlo negativo não reproduziu"; save; exit 1; }; echo "pend ok: NEG reproduz deadlock"
check "NEG: consequência visível (cutover abortado OU retry perdido em estado 'error')" "(SELECT status FROM club_points_config WHERE version='c-pend') = 'draft' OR (SELECT pending_crew_status FROM club_members WHERE id=t.m('pn_x@example.invalid','$C')) = 'error'"
"${PSQL[@]}" -f "$WD/new.sql" >/dev/null
check "POS: corpo do pendente reposto (site antes do membro, FOR NO KEY UPDATE)" "position('_club_site_lock(s, false)' in pg_get_functiondef('public.club_crew_pending(uuid,text)'::regprocedure)) > 0 AND position('FOR NO KEY UPDATE' in pg_get_functiondef('public.club_crew_pending(uuid,text)'::regprocedure)) > 0"

# POS: mesma corrida com o pendente #327.
setup "$A" pp a-pend "$EVA" 80
race pp "$A" a-pend
check "POS: sem deadlock nem erros" "$( (cat "$WD/t1.pp.out" "$WD/t2.pp.out" | grep -qE 'deadlock|ERROR') && echo false || echo true)"
check "POS: cutover concluiu (a-pend ativa, uma só ativa)" "(SELECT status FROM club_points_config WHERE version='a-pend') = 'active' AND (SELECT count(*) FROM club_points_config WHERE site_id='$A' AND status='active') = 1"
X="t.m('pp_x@example.invalid','$A')"
check "POS: piso de X criado 1× com o retrato ANTES do retry (800, Crew)" "(SELECT count(*)||':'||max(points_at_cutover)||':'||max(level_name) FROM club_level_floors f JOIN club_points_config c ON c.id=f.config_id WHERE c.version='a-pend' AND f.member_id=$X) = '1:800:Crew'"
check "POS: retry concluído depois do cutover (convite limpo, Crew com 4)" "(SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL FROM club_members WHERE id=$X) AND (SELECT count(*) FROM club_crew_members cm JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew pp') = 4"
check "POS: crew_complete 1× por membro com o valor da config nova (4×80)" "(SELECT count(*)||'/'||sum(p.points)||'/'||count(DISTINCT p.member_id) FROM club_points p JOIN club_crew_members cm ON cm.member_id=p.member_id JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew pp' AND p.rule_key='crew_complete') = '4/320/4'"
q "SELECT club_crew_pending($X, 'retry')" >/dev/null
check "POS: 2.º retry idempotente (sem crédito/piso duplicado)" "(SELECT count(*) FROM club_points WHERE member_id=$X AND rule_key='crew_complete') = 1 AND (SELECT count(*) FROM club_level_floors WHERE member_id=$X) = 1"
# Auditoria estática: nenhum entrypoint do motor segura FOR UPDATE de club_members antes do bloqueio do site.
check "AUDIT: funções do Clube sem 'club_members ... FOR UPDATE' (só FOR NO KEY UPDATE após o site)" "NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'club\_%' OR proname LIKE '\_club%') AND prosrc ~* 'from\s+club_members[^;]*for\s+update')"
check "AUDIT: confirm/crew_pending/award_purchase/purchase_revoke pedem o site antes da linha" "(SELECT bool_and(position('_club_site_lock' in prosrc) > 0 AND position('_club_site_lock' in prosrc) < greatest(position('FOR NO KEY UPDATE' in prosrc), position('FOR UPDATE' in prosrc))) FROM pg_proc WHERE proname IN ('club_confirm_member','club_crew_pending','club_award_purchase','club_purchase_revoke'))"
save; rm -rf "$WD"
echo "PEND327 $(grep -o '"asserts":[0-9]*' "$RES") $(grep -o '"falhados":[0-9]*' "$RES")"
