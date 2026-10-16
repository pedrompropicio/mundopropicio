#!/usr/bin/env bash
# #327 — Concorrência REAL (N ligações psql) com barreira: controlador segura ACCESS EXCLUSIVE numa tabela
# que todas as chamadas tocam e só liberta quando N backends estão à espera de lock. Uso: 70_conc327.sh "<psql...>"
set -euo pipefail
read -r -a PSQL <<< "$1"; OUT="${OUT:?}"; RES="$OUT/concurrency-results.json"; WD="$(mktemp -d)"
q(){ "${PSQL[@]}" -tA -c "$1"; }
results=()
save(){ printf '{"asserts":%s,"falhados":%s,"items":[%s]}\n' "$(printf '%s\n' "${results[@]}" | grep -c '"ok":' || true)" \
  "$(printf '%s\n' "${results[@]}" | grep -c '"ok":false' || true)" "$(IFS=,; echo "${results[*]}")" > "$RES"; }
check(){ local v; v="$(q "SELECT ($2)::text")"; results+=("{\"name\":\"$1\",\"ok\":$v}")
  [ "$v" = true ] || { echo "CONC ASSERT FALHOU: $1"; save; exit 1; }; echo "conc ok: $1"; }
race(){ local name="$1" n="$2" tbl="$3" tpl="$4" i fifo="$WD/ctl.$1"
  mkfifo "$fifo"; "${PSQL[@]}" < "$fifo" > "$WD/ctl.$name.out" 2>&1 & local ctl=$!
  exec 9> "$fifo"; echo "BEGIN; LOCK TABLE $tbl IN ACCESS EXCLUSIVE MODE; SELECT 'locked';" >&9
  until grep -q locked "$WD/ctl.$name.out" 2>/dev/null; do sleep 0.05; done
  for i in $(seq 1 "$n"); do "${PSQL[@]}" -tA -c "${tpl//\{i\}/$i}" > "$WD/$name.$i.out" 2>&1 & done
  local w=0 tries=0
  while [ "$w" -lt "$n" ]; do w="$(q "SELECT count(DISTINCT pid) FROM pg_locks WHERE NOT granted")"; tries=$((tries+1)); [ "$tries" -gt 400 ] && { echo "barreira $name: $w/$n"; exit 1; }; sleep 0.05; done
  echo "barreira $name: $w/$n à espera → soltar"; echo "COMMIT;" >&9; exec 9>&-; wait "$ctl"; wait
  local e; e="$(cat "$WD/$name".*.out | grep -c ERROR || true)"; results+=("{\"name\":\"barreira $name\",\"waiting\":$w,\"errors\":$e}")
  [ "$e" = 0 ] || { cat "$WD/$name".*.out; echo "erros em $name"; save; exit 1; }
}
S='00000000-0000-4000-8000-0000000000a2'
# Preparação (série): indicador com 8 créditos (600) e 3 indicados por confirmar; crew com 3 + 3 candidatos;
# 4 provas válidas do mesmo membro; 6 membros a 450 pontos.
q "UPDATE club_points_config SET purchase_enabled=true, purchase_lots='{EB1}' WHERE status='active' AND site_id='$S';" >/dev/null
q "DO \$\$ DECLARE r uuid; i int; c jsonb; m uuid; BEGIN
  r := t.newc('cc_ref@example.invalid');
  FOR i IN 1..8 LOOP PERFORM t.newc('cc_f'||i||'@example.invalid', t.code(r)); END LOOP;
  FOR i IN 9..11 LOOP PERFORM t.new('cc_f'||i||'@example.invalid', t.code(r)); END LOOP;
  c := club_crew_create(t.newc('cc_cw1@example.invalid'), 'Crew Corrida');
  FOR i IN 2..3 LOOP PERFORM club_crew_join(t.newc('cc_cw'||i||'@example.invalid'), c->>'code'); END LOOP;
  FOR i IN 4..7 LOOP PERFORM t.newc('cc_cw'||i||'@example.invalid'); END LOOP;
  m := t.newc('cc_buyer@example.invalid');
  FOR i IN 1..4 LOOP INSERT INTO club_purchase_evidence(company_id, site_id, event_id, member_id, source, order_ref, lot_ref, status, fingerprint)
    SELECT company_id, site_id, event_id, m, 'fever_order', 'CC-'||i, 'EB1', 'valid', 'ccfp'||i FROM club_points_config WHERE status='active' AND site_id='$S'; END LOOP;
  FOR i IN 1..6 LOOP m := t.newc('cc_lv'||i||'@example.invalid'); PERFORM t.seed(m, 350); END LOOP;
END \$\$;" >/dev/null
check "preparação: indicador com 600" "t.rp('friend_joined', t.m('cc_ref@example.invalid')) = 600"

# 1) 9.º/10.º/11.º confirmados em simultâneo (+ 2 retries do 9.º) → exatamente 2 créditos (teto 750).
race refcap 5 public.club_members "SELECT public.club_confirm_member(t.m('cc_f'||(CASE WHEN {i} <= 3 THEN 8+{i} ELSE 9 END)||'@example.invalid'))"
check "teto atómico: 750 com 10 créditos" "t.rp('friend_joined', t.m('cc_ref@example.invalid')) = 750 AND t.cnt('friend_joined', t.m('cc_ref@example.invalid')) = 10"
check "contagem real 11 (sem duplicar retries)" "(club_referral_progress(t.m('cc_ref@example.invalid'))->>'confirmed_friends')::int = 11"

# 2) 4 entradas simultâneas numa crew com 3 (max 6) → 3 entram, 1 crew_full; 100 uma vez a cada um dos 6.
race crew 4 public.club_crews "SELECT public.club_crew_join(t.m('cc_cw'||(3+{i})||'@example.invalid'), (SELECT code FROM public.club_crews WHERE name='Crew Corrida'))"
check "crew com 6 (max)" "(SELECT count(*) FROM club_crew_members cm JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew Corrida') = 6"
check "6 × 100 uma vez" "(SELECT count(*)||'/'||sum(p.points) FROM club_points p JOIN club_crew_members cm ON cm.member_id=p.member_id JOIN club_crews c ON c.id=cm.crew_id WHERE c.name='Crew Corrida' AND p.rule_key='crew_complete') = '6/600'"

# 3) 4 provas válidas do mesmo membro em simultâneo → 1 crédito de 200.
race purchase 4 public.club_purchase_evidence "SELECT public.club_award_purchase((SELECT id FROM public.club_purchase_evidence WHERE fingerprint='ccfp{i}'))"
check "compra: 1 crédito por edição" "t.cnt('promo_lot_purchase', t.m('cc_buyer@example.invalid')) = 1 AND t.rp('promo_lot_purchase', t.m('cc_buyer@example.invalid')) = 200"
q "UPDATE club_points_config SET purchase_enabled=false, purchase_lots='{}' WHERE status='active' AND site_id='$S';" >/dev/null

# 4) Cutover em corrida com créditos: 6 membros a 450 (100+350) recebem +50 enquanto corre um cutover (edição e3, mesmos níveis).
q "INSERT INTO public.events(id, company_id, name) VALUES ('00000000-0000-4000-8000-0000000000e3','00000000-0000-4000-8000-0000000000a1','Edição 3');
   INSERT INTO club_points_config(company_id, site_id, version, event_id, status, legacy_counts, join_points, referral_points, referral_cap, crew_points, purchase_points, levels)
   VALUES ('00000000-0000-4000-8000-0000000000a1','$S','e3-v1','00000000-0000-4000-8000-0000000000e3','draft',false,100,75,750,100,200,'{\"Gang\":0,\"Crew\":750,\"Goat\":3000}');
   UPDATE club_levels SET min_points = 500 WHERE site_id='$S' AND name='Crew';
   UPDATE portal_sites SET event_id = '00000000-0000-4000-8000-0000000000e3' WHERE id = '$S';" >/dev/null
race cutover 7 public.club_levels "SELECT CASE WHEN {i} = 7 THEN (public.club_points_cutover((SELECT id FROM public.club_points_config WHERE version='e3-v1'), '{\"Gang\":0,\"Crew\":500,\"Goat\":3000}'))::text ELSE public.club_award_fixed(t.m('cc_lv{i}@example.invalid'), 'guess_correct', 'race', 50)::text END FROM (SELECT count(*) FROM public.club_levels) x"
check "nenhum crédito perdido (6 × 500)" "(SELECT count(*) FROM generate_series(1,6) i WHERE t.pts(t.m('cc_lv'||i||'@example.invalid')) = 500) = 6"
check "piso só com retrato consistente (>=500 no retrato)" "NOT EXISTS (SELECT 1 FROM club_level_floors f JOIN club_points_config c ON c.id=f.config_id WHERE c.version='e3-v1' AND f.points_at_cutover < 500) AND (SELECT count(*) FROM club_level_floors f JOIN club_points_config c ON c.id=f.config_id JOIN club_members m ON m.id=f.member_id WHERE c.version='e3-v1' AND m.email LIKE 'cc_lv%' AND f.points_at_cutover <> 500) = 0"
check "cutover e3 ativo, um só ativo" "(SELECT count(*) FROM club_points_config WHERE site_id='$S' AND status='active') = 1 AND (SELECT status FROM club_points_config WHERE version='e3-v1') = 'active'"
save; rm -rf "$WD"
echo "CONC327 $(grep -o '"asserts":[0-9]*' "$RES") $(grep -o '"falhados":[0-9]*' "$RES")"
