#!/usr/bin/env bash
# #327 — Cutover × créditos: barreira determinística em 2 fases com ligações reais.
# T1 abre transação e credita (segura o bloqueio partilhado do site) → T2 pede o cutover (fica à espera) →
# T3 pede um crédito (fica atrás do cutover) → COMMIT de T1 → ordem linearizável T1 < cutover < T3.
# Casos: A) sem config → config; B) config ativa antiga → nova (teto e Crew); C) controlo negativo sem bloqueio.
set -euo pipefail
read -r -a PSQL <<< "$1"; OUT="${OUT:?}"; RES="$OUT/epoch-results.json"; WD="$(mktemp -d)"
q(){ "${PSQL[@]}" -tA -c "$1"; }
results=()
save(){ printf '{"asserts":%s,"falhados":%s,"items":[%s]}\n' "$(printf '%s\n' "${results[@]}" | grep -c '"ok":' || true)" \
  "$(printf '%s\n' "${results[@]}" | grep -c '"ok":false' || true)" "$(IFS=,; echo "${results[*]}")" > "$RES"; }
check(){ local v; v="$(q "SELECT ($2)::text")"; results+=("{\"name\":\"$1\",\"ok\":$v}")
  [ "$v" = true ] || { echo "EPOCH ASSERT FALHOU: $1"; save; exit 1; }; echo "epoch ok: $1"; }
waiting(){ q "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"; }
wait_for(){ local want="$1" n=0; until [ "$(waiting)" = "$want" ]; do n=$((n+1)); [ "$n" -gt 400 ] && { echo "esperava $want à espera, há $(waiting)"; save; exit 1; }; sleep 0.05; done; }
# phase NAME CUTOVER_SQL T1_SQL T3_SQL EXPECT_BLOCK(1|0)
phase(){
  local name="$1" cut="$2" t1="$3" t3="$4" block="$5" fifo="$WD/t1.$1"
  mkfifo "$fifo"; "${PSQL[@]}" < "$fifo" > "$WD/t1.$name.out" 2>&1 & local p1=$!
  exec 9> "$fifo"
  echo "BEGIN; $t1; SELECT 'T1HOLD';" >&9
  until grep -q T1HOLD "$WD/t1.$name.out" 2>/dev/null; do sleep 0.05; done
  "${PSQL[@]}" -tA -c "$cut" > "$WD/t2.$name.out" 2>&1 & local p2=$!
  if [ "$block" = 1 ]; then
    wait_for 1
    "${PSQL[@]}" -tA -c "$t3" > "$WD/t3.$name.out" 2>&1 & local p3=$!
    wait_for 2
    kill -0 "$p2" 2>/dev/null && kill -0 "$p3" 2>/dev/null || { echo "T2/T3 deviam estar bloqueados"; save; exit 1; }
    results+=("{\"name\":\"$name: cutover e T3 bloqueados enquanto T1 aberto\",\"ok\":true}"); echo "epoch ok: $name: 2 à espera com T1 aberto"
    echo "COMMIT;" >&9; exec 9>&-; wait "$p1"; wait "$p2"; wait "$p3"
  else
    local n=0; while kill -0 "$p2" 2>/dev/null; do n=$((n+1)); [ "$n" -gt 200 ] && break; sleep 0.05; done
    local done_before=false; kill -0 "$p2" 2>/dev/null || done_before=true
    results+=("{\"name\":\"$name: SEM bloqueio o cutover termina com T1 aberto (fuga detetada)\",\"ok\":$done_before}")
    [ "$done_before" = true ] || { echo "controlo negativo não reproduziu"; save; exit 1; }; echo "epoch ok: $name: controlo negativo reproduz a corrida"
    echo "COMMIT;" >&9; exec 9>&-; wait "$p1"; wait "$p2" || true
    "${PSQL[@]}" -tA -c "$t3" > "$WD/t3.$name.out" 2>&1
  fi
  local e; e="$(cat "$WD"/t?."$name".out | grep -c ERROR || true)"
  [ "$e" = 0 ] || { cat "$WD"/t?."$name".out; echo "erros em $name"; save; exit 1; }
}
A='00000000-0000-4000-8000-0000000000a2'; B='00000000-0000-4000-8000-0000000000b2'; C='00000000-0000-4000-8000-0000000000c2'

# A) Site B2 sem config (indicação 150) → config 75. R tem 400 antes; f1 em T1 (antes), f2 em T3 (depois).
q "DO \$\$ DECLARE r uuid; BEGIN r := t.newc('ep_ra@example.invalid', NULL, '$B'); PERFORM t.seed(r, 300);
  PERFORM t.new('ep_fa1@example.invalid', t.code(r), '$B'); PERFORM t.new('ep_fa2@example.invalid', t.code(r), '$B');
  INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
  VALUES ('00000000-0000-4000-8000-0000000000a1','$B','b2-v1','00000000-0000-4000-8000-0000000000e9','draft',false,100,75,750,100,200,'{\"Gang\":0,\"Crew\":750,\"Goat\":3000}'); END \$\$;" >/dev/null
phase A "SELECT club_points_cutover((SELECT id FROM club_points_config WHERE version='b2-v1'), '{\"Gang\":0,\"Crew\":500,\"Goat\":1500}')" \
  "SELECT club_confirm_member(t.m('ep_fa1@example.invalid','$B'))" "SELECT club_confirm_member(t.m('ep_fa2@example.invalid','$B'))" 1
RA="t.m('ep_ra@example.invalid','$B')"
check "A: T1 (antes) pagou 150 da regra antiga" "(SELECT points FROM club_points WHERE member_id=$RA AND rule_key='friend_joined' AND ref_id=t.m('ep_fa1@example.invalid','$B')::text) = 150"
check "A: T3 (depois) pagou 75 da config nova" "(SELECT points FROM club_points WHERE member_id=$RA AND rule_key='friend_joined' AND ref_id=t.m('ep_fa2@example.invalid','$B')::text) = 75"
check "A: piso = retrato com o crédito de T1 (550 → Crew)" "(SELECT level_name||':'||points_at_cutover FROM club_level_floors f JOIN club_points_config c ON c.id=f.config_id WHERE c.version='b2-v1' AND f.member_id=$RA) = 'Crew:550'"
check "A: total 625 e nível canónico Crew protegido" "(SELECT points||':'||level_name||':'||protected FROM club_member_level($RA)) = '625:Crew:true'"

# B) Site A2: config e3-v1 ativa (75/100) → e3-v2 da MESMA edição (50/90, valores só de fixture para distinguir épocas).
#    Indicador com 700 nesta edição: T1 (antiga, 75) excede o teto → 0; T3 (nova, 50) cabe → 750. Crew X completa em T1 (100), Crew Y em T3 (90).
q "DO \$\$ DECLARE r uuid; x jsonb; y jsonb; i int; BEGIN
  r := t.newc('ep_rb@example.invalid');
  INSERT INTO club_points(company_id, member_id, rule_key, points, ref_id, event_id) VALUES ('00000000-0000-4000-8000-0000000000a1', r, 'friend_joined', 700, 'fixture_cap', '00000000-0000-4000-8000-0000000000e3');
  PERFORM t.new('ep_fb1@example.invalid', t.code(r)); PERFORM t.new('ep_fb2@example.invalid', t.code(r));
  x := club_crew_create(t.newc('ep_x1@example.invalid'), 'Crew Epoca X'); y := club_crew_create(t.newc('ep_y1@example.invalid'), 'Crew Epoca Y');
  FOR i IN 2..3 LOOP PERFORM club_crew_join(t.newc('ep_x'||i||'@example.invalid'), x->>'code'); PERFORM club_crew_join(t.newc('ep_y'||i||'@example.invalid'), y->>'code'); END LOOP;
  PERFORM t.newc('ep_x4@example.invalid'); PERFORM t.newc('ep_y4@example.invalid');
  INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
  VALUES ('00000000-0000-4000-8000-0000000000a1','$A','e3-v2','00000000-0000-4000-8000-0000000000e3','draft',false,100,50,750,90,200,'{\"Gang\":0,\"Crew\":750,\"Goat\":3000}'); END \$\$;" >/dev/null
check "B: config antiga ativa é e3-v1 (75/100)" "(SELECT version||':'||referral_points||':'||crew_points FROM club_points_config WHERE site_id='$A' AND status='active') = 'e3-v1:75:100'"
phase B "SELECT club_points_cutover((SELECT id FROM club_points_config WHERE version='e3-v2'), '{\"Gang\":0,\"Crew\":750,\"Goat\":3000}')" \
  "SELECT club_confirm_member(t.m('ep_fb1@example.invalid')), club_crew_join(t.m('ep_x4@example.invalid'), (SELECT code FROM club_crews WHERE name='Crew Epoca X'))" \
  "SELECT club_confirm_member(t.m('ep_fb2@example.invalid')), club_crew_join(t.m('ep_y4@example.invalid'), (SELECT code FROM club_crews WHERE name='Crew Epoca Y'))" 1
RB="t.m('ep_rb@example.invalid')"
check "B: T1 (antiga 75) recusado pelo teto (700+75>750)" "NOT EXISTS (SELECT 1 FROM club_points WHERE member_id=$RB AND rule_key='friend_joined' AND ref_id=t.m('ep_fb1@example.invalid')::text)"
check "B: T3 (nova 50) cabe: 750 exatos na edição" "(SELECT sum(points) FROM club_points WHERE member_id=$RB AND rule_key='friend_joined' AND event_id='00000000-0000-4000-8000-0000000000e3') = 750"
check "B: contagem real regista os 2 indicados" "(SELECT count(*) FROM club_referral_events WHERE member_id=$RB) = 2"
check "B: Crew X (T1) 4×100 da config antiga" "(SELECT count(*)||'/'||sum(p.points) FROM club_points p JOIN club_crew_members cm ON cm.member_id=p.member_id JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew Epoca X' AND p.rule_key='crew_complete') = '4/400'"
check "B: Crew Y (T3) 4×90 da config nova" "(SELECT count(*)||'/'||sum(p.points) FROM club_points p JOIN club_crew_members cm ON cm.member_id=p.member_id JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew Epoca Y' AND p.rule_key='crew_complete') = '4/360'"
check "B: e3-v1 retirada, e3-v2 ativa (uma só)" "(SELECT string_agg(version||':'||status, ',' ORDER BY version) FROM club_points_config WHERE site_id='$A' AND version LIKE 'e3-%') = 'e3-v1:retired,e3-v2:active' AND (SELECT count(*) FROM club_points_config WHERE site_id='$A' AND status='active') = 1"

# C) Controlo negativo: sem o bloqueio de site (função trocada SÓ aqui), o cutover não espera por T1.
q "SELECT pg_get_functiondef('public._club_site_lock(uuid,boolean)'::regprocedure)" > "$WD/lock.sql"
q "CREATE OR REPLACE FUNCTION public._club_site_lock(p_site uuid, p_exclusive boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS \$\$ BEGIN RETURN; END \$\$;" >/dev/null
q "DO \$\$ DECLARE r uuid; BEGIN r := t.newc('ep_rc@example.invalid', NULL, '$C');
  PERFORM t.new('ep_fc1@example.invalid', t.code(r), '$C'); PERFORM t.new('ep_fc2@example.invalid', t.code(r), '$C');
  INSERT INTO club_points_config(company_id, site_id, version, event_id, status, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
  VALUES ('00000000-0000-4000-8000-0000000000c1','$C','b-v2','00000000-0000-4000-8000-0000000000ec','draft',100,60,750,100,200,'{\"Gang\":0,\"Crew\":750,\"Goat\":3000}'); END \$\$;" >/dev/null
phase C "SELECT club_points_cutover((SELECT id FROM club_points_config WHERE version='b-v2'), '{\"Gang\":0,\"Crew\":750,\"Goat\":3000}')" \
  "SELECT club_confirm_member(t.m('ep_fc1@example.invalid','$C'))" "SELECT club_confirm_member(t.m('ep_fc2@example.invalid','$C'))" 0
check "C: sem bloqueio, T1 grava valor da config antiga DEPOIS de a nova estar ativa (anomalia esperada)" "(SELECT points FROM club_points WHERE member_id=t.m('ep_rc@example.invalid','$C') AND rule_key='friend_joined' AND ref_id=t.m('ep_fc1@example.invalid','$C')::text) = 75"
"${PSQL[@]}" -f "$WD/lock.sql" >/dev/null
check "C: bloqueio reposto (corpo original)" "position('pg_advisory_xact_lock_shared' in pg_get_functiondef('public._club_site_lock(uuid,boolean)'::regprocedure)) > 0"
save; rm -rf "$WD"
echo "EPOCH327 $(grep -o '"asserts":[0-9]*' "$RES") $(grep -o '"falhados":[0-9]*' "$RES")"
