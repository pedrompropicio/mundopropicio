#!/usr/bin/env bash
# #326 — Concorrência REAL: N ligações PostgreSQL independentes (processos psql) contra a base local.
# Barreira determinística: o controlador segura LOCK ACCESS EXCLUSIVE em club_members; todas as funções
# testadas começam por ler club_members, por isso cada worker fica bloqueado na 1.ª instrução. Só se
# solta a barreira depois de pg_locks mostrar os N workers à espera; depois correm em simultâneo.
set -euo pipefail
read -r -a PSQL <<< "$1"
OUT="${OUT:?}"; RES="$OUT/concurrency-results.json"; WD="$(mktemp -d)"
q(){ "${PSQL[@]}" -tA -c "$1"; }
results=()
check(){ # nome condição_sql
  local v; v="$(q "SELECT ($2)::text")"
  results+=("{\"name\":\"$1\",\"ok\":$v}")
  if [ "$v" != "true" ]; then echo "CONC ASSERT FALHOU: $1"; printf '[%s]\n' "$(IFS=,; echo "${results[*]}")" > "$RES"; exit 1; fi
  echo "conc ok: $1"
}
race(){ # nome N sql_por_worker(usa {i})
  local name="$1" n="$2" tpl="$3" i; local fifo="$WD/ctl.$name"
  mkfifo "$fifo"
  "${PSQL[@]}" < "$fifo" > "$WD/ctl.$name.out" 2>&1 & local ctl=$!
  exec 9> "$fifo"
  echo "BEGIN; LOCK TABLE public.club_members IN ACCESS EXCLUSIVE MODE; SELECT 'locked';" >&9
  until grep -q locked "$WD/ctl.$name.out" 2>/dev/null; do sleep 0.05; done
  for i in $(seq 1 "$n"); do
    "${PSQL[@]}" -tA -c "${tpl//\{i\}/$i}" > "$WD/$name.$i.out" 2>&1 &
  done
  local w=0 tries=0
  while [ "$w" -lt "$n" ]; do
    w="$(q "SELECT count(*) FROM pg_locks l WHERE NOT l.granted AND l.relation = 'public.club_members'::regclass")"
    tries=$((tries+1)); [ "$tries" -gt 400 ] && { echo "barreira: só $w/$n à espera"; exit 1; }
    sleep 0.05
  done
  echo "barreira $name: $w/$n workers bloqueados → soltar"
  echo "COMMIT;" >&9; exec 9>&-; wait "$ctl"
  wait
  results+=("{\"name\":\"barreira $name\",\"ok\":true,\"waiting\":$w}")
}

# Fixtures próprias (site 2), sintéticas.
"${PSQL[@]}" <<'SQL'
INSERT INTO public.portal_sites(id, company_id, domain, brand_key, active)
VALUES ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a1','ng2.example.invalid','newgang2',true);
INSERT INTO public.club_point_rules(company_id, site_id, rule_key, points, min_members, max_members) VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','join_confirmed',100,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','friend_joined',150,NULL,NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','crew_complete',200,4,6);
CREATE FUNCTION it.n2(p text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE m uuid; BEGIN
  m := public.club_upsert_member('00000000-0000-4000-8000-0000000000b2', p, NULL, NULL, NULL, NULL, 'formulario');
  PERFORM public.club_confirm_member(m); RETURN m; END $$;
CREATE TABLE it.kv (k text PRIMARY KEY, v text);
DO $$ DECLARE r jsonb; o uuid; BEGIN
  -- Crew L (última vaga): 5 membros confirmados.
  o := it.n2('l0@example.invalid'); r := public.club_crew_create(o, 'Last Slot');
  INSERT INTO it.kv VALUES ('L_crew', r->>'id'), ('L_code', r->>'code');
  FOR i IN 1..4 LOOP PERFORM public.club_crew_join(it.n2('l'||i||'@example.invalid'), r->>'code'); END LOOP;
  FOR i IN 1..6 LOOP INSERT INTO it.kv VALUES ('L_cand'||i, it.n2('lc'||i||'@example.invalid')::text); END LOOP;
  -- Crew Q (4.º confirmado em corrida): 3 membros.
  o := it.n2('q0@example.invalid'); r := public.club_crew_create(o, 'Quarto Gang');
  INSERT INTO it.kv VALUES ('Q_crew', r->>'id'), ('Q_code', r->>'code');
  FOR i IN 1..2 LOOP PERFORM public.club_crew_join(it.n2('q'||i||'@example.invalid'), r->>'code'); END LOOP;
  FOR i IN 1..3 LOOP INSERT INTO it.kv VALUES ('Q_cand'||i, it.n2('qc'||i||'@example.invalid')::text); END LOOP;
  -- Confirmações simultâneas (retries) de um indicado.
  o := it.n2('ref@example.invalid');
  INSERT INTO it.kv VALUES ('R_ref', o::text);
  INSERT INTO it.kv VALUES ('R_new', public.club_upsert_member('00000000-0000-4000-8000-0000000000b2','retry@example.invalid',NULL,NULL,NULL,
    (SELECT referral_code FROM public.club_members WHERE id=o),'formulario')::text);
END $$;
SQL
kv(){ q "SELECT v FROM it.kv WHERE k='$1'"; }
LC="$(kv L_code)"; LCREW="$(kv L_crew)"; QC="$(kv Q_code)"; QCREW="$(kv Q_crew)"; RREF="$(kv R_ref)"; RNEW="$(kv R_new)"

# C1 — última vaga: 6 candidatos para 1 lugar.
race lastslot 6 "SELECT public.club_crew_join((SELECT v::uuid FROM it.kv WHERE k='L_cand{i}'), '$LC')"
ok_n="$(cat "$WD"/lastslot.*.out | grep -c crew_id || true)"; full_n="$(cat "$WD"/lastslot.*.out | grep -c crew_full || true)"
echo "lastslot: entraram=$ok_n crew_full=$full_n"
check "C1 última vaga: exatamente 1 entra" "$ok_n = 1 AND $full_n = 5"
check "C1 crew fica com 6" "(SELECT count(*) FROM public.club_crew_members WHERE crew_id='$LCREW') = 6"
check "C1 bónus exatamente 6 (uma vez cada)" "(SELECT count(*) FROM public.club_points WHERE rule_key='crew_complete' AND ref_id='$LCREW') = 6"

# C2 — 3 entradas simultâneas numa crew com 3 (4.º confirmado em corrida).
race quarto 3 "SELECT public.club_crew_join((SELECT v::uuid FROM it.kv WHERE k='Q_cand{i}'), '$QC')"
check "C2 três entram" "(SELECT count(*) FROM public.club_crew_members WHERE crew_id='$QCREW') = 6"
check "C2 completa uma vez" "(SELECT completed_at IS NOT NULL FROM public.club_crews WHERE id='$QCREW')"
check "C2 bónus 6 linhas, sem duplicados" "(SELECT count(*) FROM public.club_points WHERE rule_key='crew_complete' AND ref_id='$QCREW') = 6"

# C3 — 8 confirmações simultâneas do mesmo indicado.
race retries 8 "SELECT public.club_confirm_member('$RNEW')"
errs="$(cat "$WD"/retries.*.out | grep -ci error || true)"
check "C3 sem erros nas 8 confirmações" "$errs = 0"
check "C3 join_confirmed 1×" "(SELECT count(*) FROM public.club_points WHERE member_id='$RNEW' AND rule_key='join_confirmed') = 1"
check "C3 friend_joined 1× ao convidador" "(SELECT count(*) FROM public.club_points WHERE member_id='$RREF' AND rule_key='friend_joined') = 1"

# C4 — 8 inscrições simultâneas do MESMO email novo (caracteriza a regra atual).
race signup 8 "SELECT public.club_upsert_member('00000000-0000-4000-8000-0000000000b2','dup@example.invalid',NULL,NULL,NULL,NULL,'formulario')"
uv="$(cat "$WD"/signup.*.out | grep -c "duplicate key" || true)"
echo "signup: unique_violation em $uv de 8 ligações"
check "C4 um só membro para o email" "(SELECT count(*) FROM public.club_members WHERE lower(email)='dup@example.invalid') = 1"
results+=("{\"name\":\"C4 caracterização: chamadas concorrentes que recebem unique_violation\",\"ok\":true,\"unique_violation\":$uv,\"of\":8}")

check "invariante: nenhuma crew > 6" "NOT EXISTS (SELECT 1 FROM public.club_crew_members GROUP BY crew_id HAVING count(*) > 6)"
check "invariante: sem pontos duplicados" "NOT EXISTS (SELECT 1 FROM public.club_points GROUP BY member_id, rule_key, ref_id HAVING count(*) > 1)"
printf '[%s]\n' "$(IFS=,; echo "${results[*]}")" > "$RES"
echo "CONCURRENCY_RESULT $(grep -o '"ok":true' "$RES" | wc -l) ok"
rm -rf "$WD"
