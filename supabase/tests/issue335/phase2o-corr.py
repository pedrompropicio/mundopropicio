#!/usr/bin/env python3
"""#335 correcção inerte — testes fail-first A, B, C, E, F, G. LOCAL ONLY.
Uso: phase2o-corr.py <socket> <port> <manual_dir> <out.json>
Corre sobre um catálogo fiel com refdata+fixtures e SEM candidatos (phase2o-baseline.sh).
<manual_dir> = supabase/manual (corrigido) ou uma extracção do commit anterior (fora do repo).
Cada asserção falhada é FAIL (exit 1); nunca é aviso."""
import json, sys, pathlib, uuid
import psycopg2

sock, port, M, outp = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]), sys.argv[4]
ADMIN, VIEWER = '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011'
SUP, ACC = '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030'
res = []

def conn(user):
    c = psycopg2.connect(host=sock, port=port, user=user, dbname='postgres', sslmode='disable'); c.autocommit = True; return c
P, A = conn('postgres'), conn('supabase_admin')
assert P.cursor() and True

def text(n): return (M / f'20261021_issue335_{n}.sql').read_text()
def body(n): return '\n'.join(l for l in text(n).split('\n') if l.strip() not in ('BEGIN;', 'COMMIT;'))
def install(n):
    with P.cursor() as q: q.execute(text(n + '.INERTE'))
def fp():
    with A.cursor() as q:
        q.execute("""SELECT md5(coalesce((SELECT string_agg(p.oid::regprocedure::text||md5(pg_get_functiondef(p.oid)),',' ORDER BY 1)
          FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),'')
          ||coalesce((SELECT string_agg(polname||polrelid::regclass::text,',' ORDER BY 1) FROM pg_policy),'')
          ||coalesce((SELECT string_agg(relname,',' ORDER BY 1) FROM pg_class WHERE relnamespace='public'::regnamespace),''))""")
        return q.fetchone()[0]
def check(name, ok, detail):
    res.append({'test': name, 'result': 'PASS' if ok else 'FAIL', 'detail': detail}); print(('PASS ' if ok else 'FAIL ') + name + ' :: ' + detail)
def refuse(name, sql_text, expect, user='postgres'):
    """Executa dentro de transacção e desfaz sempre; exige a recusa esperada e catálogo intacto."""
    c = P if user == 'postgres' else A; before = fp(); err = None
    c.autocommit = False
    try:
        with c.cursor() as q: q.execute(sql_text)
    except Exception as e: err = str(e).strip().split('\n')[0]
    c.rollback(); c.autocommit = True
    check(name, err is not None and expect in err and fp() == before, f'esperado "{expect}"; obtido {err!r}; catálogo intacto={fp()==before}')
def as_user(uid, sql_text, commit=False):
    P.autocommit = False
    try:
        with P.cursor() as q:
            q.execute("SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',%s,true)", (uid,))
            q.execute(sql_text); r = q.fetchall() if q.description else None
        (P.commit if commit else P.rollback)(); return r, None
    except Exception as e:
        P.rollback(); return None, str(e).strip().split('\n')[0]
    finally: P.autocommit = True

PAIR = f"""WITH a AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
   VALUES(public.current_company_id(),'approved','income','2o A+',100,0,'2026-10-13','{SUP}') RETURNING id),
 b AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
   VALUES(public.current_company_id(),'approved','expense','2o A-',40,0,'2026-10-13','{SUP}') RETURNING id)
SELECT public.transaction_offset_execute(gen_random_uuid(),'{SUP}',
 jsonb_build_array(jsonb_build_object('transaction_id',a.id,'mode','settle'),jsonb_build_object('transaction_id',b.id,'mode','offset')),
 '{{"account_id":"{ACC}","date":"2026-10-13","amount":60}}','2026-10-13') FROM a,b"""
def a_case(name, expect):
    r, e = as_user(ADMIN, PAIR)
    check(name, e is not None and expect in e, f'esperado "{expect}"; obtido {e!r}')

# ---- B: pré-verificação explícita (catálogo sem storage/core)
for n in ['offset_approval', 'status', 'cash_position']:
    refuse(f'B {n} sem storage', body(n + '.INERTE'), 'installation_order: storage_required')
install('offset_group_storage')
refuse('B offset_approval sem core', body('offset_approval.INERTE'), 'installation_order: core_required')
install('offset_core'); install('offset_approval'); install('status')
# ---- A: núcleo exige saldo e posição de caixa candidatos
a_case('A execute sem offset_balance', 'installation_order: balance_candidate_required')
install('offset_invariants'); install('offset_balance')
a_case('A execute sem cash_position', 'installation_order: cash_position_candidate_required')
install('cash_position')
a_case('A execute sem cash_position_invariant', 'installation_order: cash_position_invariant_candidate_required')
install('cash_position_invariant')
r, e = as_user(ADMIN, PAIR); check('A execute com todos os candidatos', e is None, f'erro={e!r}')
install('restore'); install('cash_watch')
# ---- C: rollback fora de ordem / parcial (sem grupos)
refuse('C approval.ROLLBACK com status instalado', body('offset_approval.ROLLBACK-INERTE'), 'rollback_order: status_first')
refuse('C cash_position.ROLLBACK com invariante instalado', body('cash_position.ROLLBACK-INERTE'), 'rollback_order: cash_position_invariant_first')
refuse('C offset_balance.ROLLBACK com cash_watch instalado', body('offset_balance.ROLLBACK-INERTE'), 'rollback_order: cash_watch_first')
refuse('G parcial: retirados até core, balance mantido; storage.ROLLBACK com consumidores',
       '\n'.join(body(n + '.ROLLBACK-INERTE') for n in ['cash_watch', 'restore', 'cash_position_invariant', 'cash_position', 'status', 'offset_approval', 'offset_invariants', 'offset_core'])
       + '\n' + body('offset_group_storage.ROLLBACK-INERTE'), 'rollback_order: consumers_installed')
# ---- E: adopção de par legado (cash_order 12 e 3, movimento -100, pagável com débito 150)
E0 = f"""WITH p2 AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
  VALUES(public.current_company_id(),'approved','expense','2o E P2',150,0,'2026-10-13','{SUP}') RETURNING id),
 p1 AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
  VALUES(public.current_company_id(),'approved','expense','2o E P1',80,0,'2026-10-13','{SUP}') RETURNING id),
 r1 AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
  VALUES(public.current_company_id(),'approved','income','2o E R1',120,0,'2026-10-13','{SUP}') RETURNING id),
 r2 AS (INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
  VALUES(public.current_company_id(),'approved','income','2o E R2',10,0,'2026-10-13','{SUP}') RETURNING id)
SELECT p2.id::text,p1.id::text,r1.id::text,r2.id::text,public.current_company_id()::text FROM p1,p2,r1,r2"""
ids, e0 = as_user(ADMIN, E0, commit=True)
p2, p1, r1, r2, co = ids[0]
lo = str(uuid.uuid4())
with A.cursor() as q:  # par legado pré-existente (dados históricos), criado fora do fluxo gerido
    q.execute("SET session_replication_role=replica; INSERT INTO public.transaction_offsets(id,company_id,receivable_transaction_id,payable_transaction_id,amount,created_by,created_at) VALUES(%s,%s,%s,%s,50,%s,now()); SET session_replication_role=origin", (lo, co, r1, p2, ADMIN))
E = f"""SELECT public.transaction_offset_execute(gen_random_uuid(),'{SUP}',
 jsonb_build_array(jsonb_build_object('transaction_id','{p2}','mode','settle','cash_order',3),
  jsonb_build_object('transaction_id','{p1}','mode','settle','cash_order',12),
  jsonb_build_object('transaction_id','{r1}','mode','offset'),jsonb_build_object('transaction_id','{r2}','mode','offset')),
 '{{"account_id":"{ACC}","date":"2026-10-13","amount":-100}}','2026-10-13')->>'group_id', '{lo}', '{r1}'"""
r, e = as_user(ADMIN, E, commit=True)
check('E par legado 50 adoptado (P2 ordem 3: dinheiro 100, compensação 50)', e is None, f'erro={e!r}')
gid = r[0][0] if r else None
if not gid:  # E recusado (estado anterior): F e G precisam de um grupo real, criado pelo core sem par legado
    rr, ee = as_user(ADMIN, PAIR, commit=True)
    check('G/F grupo real alternativo criado pelo core', ee is None, f'erro={ee!r}')
    if rr:
        gid = rr[0][0]['group_id']
        with A.cursor() as q:
            q.execute("SELECT transaction_id::text FROM public.transaction_offset_items WHERE group_id=%s AND type='income'", (gid,)); conf = q.fetchone()[0]
        r = [(gid, None, conf)]
        ncount = 2
else: ncount = 4
if gid and r[0][1]:
    with A.cursor() as q:
        q.execute("SELECT offset_group_id::text FROM public.transaction_offsets WHERE id=%s", (r[0][1],)); og = q.fetchone()[0]
        q.execute("SELECT cash_order,cash_amount,compensation_amount FROM public.transaction_offset_items WHERE group_id=%s ORDER BY cash_order,type", (gid,)); its = q.fetchall()
    check('E par ligado ao grupo e alocação por ordem inteira', og == gid and [(int(a), float(b), float(c)) for a, b, c in its if a in (3, 12)] == [(3, 100.0, 50.0), (12, 0.0, 80.0)], f'offset_group={og} itens={its}')
if gid:
    # ---- F: leitura de itens/grupos com documento confidencial
    with A.cursor() as q:
        q.execute("SET session_replication_role=replica; UPDATE public.transactions SET is_confidential=true WHERE id=%s; SET session_replication_role=origin", (r[0][2],))
    ri, ei = as_user(VIEWER, f"SELECT count(*) FROM public.transaction_offset_items WHERE group_id='{gid}' AND transaction_id='{r[0][2]}'")
    rg, eg = as_user(VIEWER, f"SELECT count(*) FROM public.transaction_offset_groups WHERE id='{gid}'")
    check('F staff sem can_see_confidential não lê item confidencial', ei is None and ri[0][0] == 0, f'itens={ri} erro={ei!r}')
    check('F staff sem can_see_confidential não lê grupo com item confidencial', eg is None and rg[0][0] == 0, f'grupos={rg} erro={eg!r}')
    ri, ei = as_user(ADMIN, f"SELECT count(*) FROM public.transaction_offset_items WHERE group_id='{gid}'")
    rg, eg = as_user(ADMIN, f"SELECT count(*) FROM public.transaction_offset_groups WHERE id='{gid}'")
    check('F com permissão lê itens e grupo', ei is None and eg is None and ri[0][0] == ncount and rg[0][0] == 1, f'itens={ri} grupos={rg}')
    ri, ei = as_user(VIEWER, f"SELECT count(*) FROM public.transaction_offset_items WHERE group_id='{gid}'")
    check('F staff sem permissão continua a ler itens não confidenciais', ei is None and ri[0][0] == ncount - 1, f'itens={ri} erro={ei!r}')
# ---- G: rollback com grupos vivos (grupo real criado pelo core em E)
for n in ['offset_approval', 'cash_position', 'cash_position_invariant', 'status', 'offset_balance', 'offset_core', 'offset_group_storage']:
    refuse(f'G {n}.ROLLBACK com grupos vivos', body(n + '.ROLLBACK-INERTE'), 'groups_exist_keep_guards')
fails = [x for x in res if x['result'] != 'PASS']
pathlib.Path(outp).write_text(json.dumps({'manual_dir': str(M), 'results': res, 'fails': len(fails)}, indent=1, ensure_ascii=False))
print(f'TOTAL {len(res)} PASS {len(res)-len(fails)} FAIL {len(fails)}')
sys.exit(1 if fails else 0)
