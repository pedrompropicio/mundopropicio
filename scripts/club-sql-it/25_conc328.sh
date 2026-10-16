#!/usr/bin/env bash
# #328 — Concorrência REAL (N ligações psql). Uso: 25_conc328.sh "<psql...>" before|after
# Barreira: controlador segura LOCK ACCESS EXCLUSIVE em club_members; liberta só quando N backends
# estão à espera de QUALQUER lock (club_members ou advisory do email, introduzido pelo patch).
set -euo pipefail
read -r -a PSQL <<< "$1"; PHASE="$2"
OUT="${OUT:?}"; RES="$OUT/concurrency-$PHASE.json"; WD="$(mktemp -d)"
q(){ "${PSQL[@]}" -tA -c "$1"; }
results=()
save(){ local a b f; a=$(printf '%s\n' "${results[@]}" | grep -c '"ok":' || true); f=$(printf '%s\n' "${results[@]}" | grep -c '"ok":false' || true)
  b=$(printf '%s\n' "${results[@]}" | grep -c '"name":"barreira' || true)
  printf '{"phase":"%s","asserts":%s,"asserts_falhados":%s,"barreiras":%s,"items":[%s]}\n' "$PHASE" "$a" "$f" "$b" "$(IFS=,; echo "${results[*]}")" > "$RES"; }
check(){ local v; v="$(q "SELECT ($2)::text")"; results+=("{\"phase\":\"$PHASE\",\"name\":\"$1\",\"ok\":$v}")
  if [ "$v" != "true" ]; then echo "CONC ASSERT FALHOU [$PHASE]: $1"; save; exit 1; fi; echo "conc $PHASE ok: $1"; }
race(){ local name="$1" n="$2" tpl="$3" i fifo="$WD/ctl.$1"
  mkfifo "$fifo"; "${PSQL[@]}" < "$fifo" > "$WD/ctl.$name.out" 2>&1 & local ctl=$!
  exec 9> "$fifo"
  echo "BEGIN; LOCK TABLE public.club_members IN ACCESS EXCLUSIVE MODE; SELECT 'locked';" >&9
  until grep -q locked "$WD/ctl.$name.out" 2>/dev/null; do sleep 0.05; done
  for i in $(seq 1 "$n"); do "${PSQL[@]}" -tA -c "${tpl//\{i\}/$i}" > "$WD/$name.$i.out" 2>&1 & done
  local w=0 tries=0
  while [ "$w" -lt "$n" ]; do
    w="$(q "SELECT count(DISTINCT pid) FROM pg_locks WHERE NOT granted")"
    tries=$((tries+1)); [ "$tries" -gt 400 ] && { echo "barreira: só $w/$n"; exit 1; }; sleep 0.05
  done
  echo "barreira $name: $w/$n à espera → soltar"; echo "COMMIT;" >&9; exec 9>&-; wait "$ctl"; wait
  local errs; errs="$(cat "$WD/$name".*.out | grep -c ERROR || true)"
  results+=("{\"phase\":\"$PHASE\",\"name\":\"barreira $name\",\"waiting\":$w,\"errors\":$errs}")
  echo "$errs" > "$WD/$name.errs"
}
errs(){ cat "$WD/$1.errs"; }
SITE="'00000000-0000-4000-8000-0000000000a2'"

# C4 — 8 inscrições simultâneas do mesmo email (variações de caixa/espaços).
race "email_$PHASE" 8 "SELECT public.club_upsert_member($SITE, ' Corrida.$PHASE@Example.invalid ', 'W{i}', '+3519000003{i}', NULL, NULL, 'formulario')"
E="$(errs "email_$PHASE")"
check "1 membro para o email" "(SELECT count(*) FROM public.club_members WHERE lower(trim(email))='corrida.$PHASE@example.invalid') = 1"
if [ "$PHASE" = before ]; then
  check "DEFEITO 1 reproduzido: ligações com unique_violation ($E/8)" "$E > 0 AND $(cat "$WD"/email_$PHASE.*.out | grep -c unique || true) = $E"
  save; rm -rf "$WD"; exit 0
fi
check "0 erros nas 8 ligações" "$E = 0"
check "todas devolvem o mesmo id" "$(cat "$WD"/email_after.*.out | sort -u | grep -c . ) = 1"
race "confirm_after" 8 "SELECT public.club_confirm_member(id) FROM public.club_members WHERE lower(email)='corrida.after@example.invalid'"
check "8 confirmações simultâneas: 0 erros" "$(errs confirm_after) = 0"
check "join_confirmed único" "(SELECT count(*) FROM public.club_points p JOIN public.club_members m ON m.id=p.member_id WHERE m.email='corrida.after@example.invalid' AND p.rule_key='join_confirmed') = 1"

# Última vaga com códigos pendentes: crew com 5 confirmados; 6 candidatos por confirmar com o código.
"${PSQL[@]}" -q <<'SQL'
DO $$ DECLARE o uuid; r jsonb; BEGIN
  o := it.newc('lv0@example.invalid'); r := public.club_crew_create(o, 'Ultima Vaga');
  INSERT INTO it.kv VALUES ('LV_crew', r->>'id');
  FOR i IN 1..4 LOOP PERFORM public.club_crew_join(it.newc('lv'||i||'@example.invalid'), r->>'code'); END LOOP;
  FOR i IN 1..6 LOOP o := it.new('lvc'||i||'@example.invalid'); UPDATE public.club_members SET pending_crew_code = r->>'code' WHERE id = o; END LOOP;
END $$;
SQL
race "ultima_vaga" 6 "SELECT public.club_confirm_member(id) FROM public.club_members WHERE email='lvc{i}@example.invalid'"
LV="(SELECT v::uuid FROM it.kv WHERE k='LV_crew')"
check "ultima vaga: 0 erros" "$(errs ultima_vaga) = 0"
check "6 candidatos confirmados, +100 cada uma vez" "(SELECT count(*) FROM public.club_members m WHERE m.email LIKE 'lvc_@example.invalid' AND m.confirmed_at IS NOT NULL AND (SELECT count(*) FROM public.club_points p WHERE p.member_id=m.id AND p.rule_key='join_confirmed')=1) = 6"
q "SELECT 'dbg crew='||(SELECT count(*) FROM public.club_crew_members WHERE crew_id=$LV)||' st='||(SELECT string_agg(coalesce(pending_crew_status,'-'),',') FROM public.club_members WHERE email LIKE 'lvc_@example.invalid')"
check "crew = 6 (max respeitado)" "(SELECT count(*) FROM public.club_crew_members WHERE crew_id=$LV) = 6"
check "1 entrou e foi limpo" "(SELECT count(*) FROM public.club_members m JOIN public.club_crew_members c ON c.member_id=m.id WHERE m.email LIKE 'lvc_@example.invalid' AND m.pending_crew_code IS NULL AND m.pending_crew_status IS NULL) = 1"
check "5 ficam crew_full com código preservado" "(SELECT count(*) FROM public.club_members WHERE email LIKE 'lvc_@example.invalid' AND pending_crew_status='crew_full' AND pending_crew_code IS NOT NULL) = 5"
race "ultima_vaga_repete" 6 "SELECT public.club_confirm_member(id) FROM public.club_members WHERE email='lvc{i}@example.invalid'"
check "reconfirmação simultânea: sem novas tentativas/duplicados" "$(errs ultima_vaga_repete) = 0 AND (SELECT count(*) FROM public.club_points p JOIN public.club_members m ON m.id=p.member_id WHERE m.email LIKE 'lvc_@example.invalid' AND p.rule_key='join_confirmed') = 6 AND (SELECT count(*) FROM public.club_members WHERE email LIKE 'lvc_@example.invalid' AND pending_crew_status='crew_full') = 5"

# Revisão 2 — retry/status/dismiss vs confirmação em simultâneo no mesmo membro (1 vaga livre).
"${PSQL[@]}" -q <<'SQL'
DO $$ DECLARE o uuid; r jsonb; h uuid; BEGIN
  o := it.newc('rs0@example.invalid'); r := public.club_crew_create(o, 'Retry Status');
  FOR i IN 1..4 LOOP PERFORM public.club_crew_join(it.newc('rs'||i||'@example.invalid'), r->>'code'); END LOOP;
  h := it.newc('rsm@example.invalid');
  UPDATE public.club_members SET pending_crew_code=r->>'code', pending_crew_status='crew_full', pending_crew_checked_at=now() WHERE id=h;
  INSERT INTO it.kv VALUES ('RS_crew', r->>'id'), ('RS_pts', (SELECT coalesce(sum(points),0)::text FROM public.club_points)), ('RS_sess', (SELECT count(*)::text FROM public.club_member_sessions));
END $$;
SQL
OPS=(retry retry retry status status confirm confirm retry)
TPL="SELECT CASE WHEN '{i}' IN ('6','7') THEN (public.club_confirm_member(id))::text ELSE public.club_crew_pending(id, (ARRAY['retry','retry','retry','status','status','x','x','retry'])[{i}])::text END FROM public.club_members WHERE email='rsm@example.invalid'"
race "retry_status" 8 "$TPL"
RS="(SELECT v::uuid FROM it.kv WHERE k='RS_crew')"
check "retry/status/confirm: 0 erros" "$(errs retry_status) = 0"
check "membro entra exatamente uma vez" "(SELECT count(*) FROM public.club_crew_members WHERE member_id=(SELECT id FROM public.club_members WHERE email='rsm@example.invalid')) = 1"
check "crew = 6 (max respeitado)" "(SELECT count(*) FROM public.club_crew_members WHERE crew_id=$RS) = 6"
check "pendência limpa" "(SELECT pending_crew_code IS NULL AND pending_crew_status IS NULL FROM public.club_members WHERE email='rsm@example.invalid')"
check "pontos: só os da crew (sem join/friend duplicados; crew_complete 1x por membro)" "(SELECT count(*) FROM public.club_points p JOIN public.club_members m ON m.id=p.member_id WHERE m.email LIKE 'rs%@example.invalid' AND p.rule_key='join_confirmed') = 6 AND NOT EXISTS (SELECT 1 FROM public.club_points WHERE rule_key='crew_complete' GROUP BY member_id, source_ref HAVING count(*)>1)"
check "sessões inalteradas" "(SELECT count(*)::text FROM public.club_member_sessions) = (SELECT v FROM it.kv WHERE k='RS_sess')"
save; rm -rf "$WD"
