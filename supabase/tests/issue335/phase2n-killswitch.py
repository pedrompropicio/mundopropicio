"""#335 2n-Bloco3 (M4) — kill-switch em dois níveis, emergência concorrente, reactivação/ACL e estados de origem.
LOCAL ONLY (harness fiel 2h, PG 17.6, postgres NOSUPERUSER, triggers reais).
Barreiras: aresta de lock observada em pg_blocking_pids (wait_event Lock/advisory); nunca sleep temporal.
Cada cenário afirma UM resultado exacto; nenhum erro tolerado; snapshot integral (md5 do conteúdo completo,
linha a linha) das tabelas de grupo/itens/offsets/pernas/documentos/linhas bancárias antes e depois.
Uso: phase2n-killswitch.py <socket> <port> <root> <out.json>"""
import concurrent.futures, json, sys, time, uuid
from pathlib import Path
import psycopg2

sock, port, root, out = sys.argv[1:]
assert sock.startswith('/tmp/issue335phase2h.'), 'local harness only'
ROOT = Path(root); M = ROOT / 'supabase/manual'; BEFORE = ROOT / 'supabase/tests/issue335/live/phase2n-bloco3/before'
COMPANY = '00000000-0000-0000-0000-000000000001'; SUPPLIER = '00000000-0000-0000-0000-000000000020'
ACCOUNT = '00000000-0000-0000-0000-000000000030'; UID = '00000000-0000-0000-0000-000000000010'
STATEMENT = '00000000-0000-0000-0000-000000000040'
OFF = ('P0001', 'encontro_desativado')
report = {'origin_matrix_before': [], 'origin_matrix_after': [], 'paths': [], 'concurrency': [], 'acl': {}}
fails = []

def conn(user, name):
    c = psycopg2.connect(host=sock, port=port, user=user, dbname='postgres', sslmode='disable', application_name=name)
    c.autocommit = True
    return c
def sql(c, q, a=None):
    with c.cursor() as cur:
        cur.execute(q, a); return cur.fetchall() if cur.description else []
def outcome(c, q, a=None):
    try: return ('ok', sql(c, q, a))
    except psycopg2.Error as e:
        if c.get_transaction_status() == psycopg2.extensions.TRANSACTION_STATUS_INERROR: sql(c, 'ROLLBACK')
        return (e.pgcode, e.diag.message_primary)
def check(cond, label, detail=None):
    if cond: print('PASS', label)
    else: print('FAIL', label, detail); fails.append((label, detail))

obs = conn('supabase_admin', 'i335_b3_obs')        # observador/fixtures (administrador do harness)
ops = conn('postgres', 'i335_b3_ops')              # operador dos scripts: postgres NOSUPERUSER
assert sql(ops, 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user')[0][0] is False
S = [conn('supabase_admin', f'i335_b3_s{i}') for i in range(4)]
for c in S:
    sql(c, "SELECT set_config('request.jwt.claim.sub',%s,false)", (UID,)); sql(c, "SET statement_timeout='15s'"); sql(c, 'SET ROLE authenticated')
pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)

def script(name, before=False):
    return ((BEFORE if before else M) / f'20261021_issue335_{name}.sql').read_text()
KS, KSR = 'offset_kill_switch.INERTE', 'offset_kill_switch.ROLLBACK-INERTE'
EM, EMR = 'emergency.INERTE', 'emergency.ROLLBACK-INERTE'
RE, RER = 'reactivation.INERTE', 'reactivation.ROLLBACK-INERTE'
STATES = {'N0': (True, True), 'N1': (False, True), 'N2': (False, False), 'invalido': (True, False)}
def state():
    rows = sql(obs, 'SELECT enabled,reverse_enabled FROM transaction_offset_control')
    if len(rows) != 1: return f'linhas={len(rows)}'
    return {v: k for k, v in STATES.items()}[tuple(rows[0])]
def set_state(name):
    sql(obs, 'DELETE FROM transaction_offset_control')
    if name != 'ausente':
        e, r = STATES[name]; sql(obs, 'INSERT INTO transaction_offset_control(singleton,enabled,reverse_enabled) VALUES(true,%s,%s)', (e, r))

TABLES = ['transaction_offset_groups', 'transaction_offset_items', 'transaction_offsets', 'transaction_payments',
          'transactions', 'bank_statement_lines', 'bank_line_transactions']
def snapshot(exclude_tx=()):
    """md5 por tabela do conteúdo integral (todas as colunas). exclude_tx: documentos cujo efeito é o esperado
    e verificado à parte; as suas linhas (e grupos/itens/pernas/linhas bancárias ligadas) são excluídas."""
    ex = list(exclude_tx) or ['00000000-0000-0000-0000-000000000000']
    groups = [r[0] for r in sql(obs, 'SELECT DISTINCT group_id FROM transaction_offset_items WHERE transaction_id=ANY(%s::uuid[])', (ex,))] or ex
    where = {
        'transaction_offset_groups': 'NOT (id=ANY(%(g)s::uuid[]))',
        'transaction_offset_items': 'NOT (group_id=ANY(%(g)s::uuid[]))',
        'transaction_offsets': 'NOT (payable_transaction_id=ANY(%(t)s::uuid[]) OR receivable_transaction_id=ANY(%(t)s::uuid[]))',
        'transaction_payments': 'NOT (transaction_id=ANY(%(t)s::uuid[]))',
        'transactions': 'NOT (id=ANY(%(t)s::uuid[]))',
        'bank_statement_lines': 'NOT (coalesce(offset_group_id::text,\'\')=ANY(%(g)s::text[]))',
        'bank_line_transactions': 'NOT (transaction_id=ANY(%(t)s::uuid[]))'}
    res = {}
    for t in TABLES:
        res[t] = sql(obs, f'SELECT count(*)||\':\'||coalesce(md5(string_agg(x::text,\'|\' ORDER BY x::text)),\'-\') FROM public.{t} x WHERE {where[t]}', {'g': groups, 't': ex})[0][0]
    return res
cols = {r[0] for r in sql(obs, "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='transaction_offsets'")}
assert {'payable_transaction_id', 'receivable_transaction_id'} <= cols, cols

def fixture():
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    for i, k, v in ((a, 'income', 100), (b, 'expense', 40)):
        sql(obs, "INSERT INTO transactions(id,company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(%s,%s,'approved',%s,'2n-B3',%s,0,'2026-10-13',%s)", (i, COMPANY, k, v, SUPPLIER))
    return a, b
def call_exec(a, b, req=None):
    items = json.dumps([dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')])
    mv = json.dumps(dict(account_id=ACCOUNT, date='2026-10-13', amount=60))
    return "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')", (req or str(uuid.uuid4()), SUPPLIER, items, mv)
def call_cmd(a, b):
    cmd = json.dumps(dict(op='execute', request_id=str(uuid.uuid4()), supplier_id=SUPPLIER, items=[dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')],
                          movement=dict(account_id=ACCOUNT, date='2026-10-13', amount=60), date='2026-10-13', note=None))
    return 'INSERT INTO issue335_commands(command) VALUES(%s::jsonb) RETURNING result', (cmd,)
def bank_line(amount=60):
    line = str(uuid.uuid4())
    sql(obs, "INSERT INTO bank_statement_lines(statement_id,line_hash,id,company_id,financial_account_id,amount,booking_date) VALUES(%s,md5(%s),%s,%s,%s,%s,'2026-10-13')", (STATEMENT, line, line, COMPANY, ACCOUNT, amount))
    return line
def call_bank(a, b, line):
    items = json.dumps([dict(transaction_id=a, mode='settle', request_id=str(uuid.uuid4()), supplier_id=SUPPLIER), dict(transaction_id=b, mode='offset')])
    return 'SELECT reconcile_bank_line(%s,%s::jsonb)', (line, items)
def call_rev(g):
    return "SELECT transaction_offset_reverse(%s,%s,'2n-B3 estorno')", (g, str(uuid.uuid4()))
def applied_group(a):
    r = sql(obs, "SELECT g.id FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=%s AND g.status='applied'", (a,))
    return r[0][0] if r else None
def make_group():
    a, b = fixture(); r = outcome(S[0], *call_exec(a, b)); assert r[0] == 'ok', r
    return a, b, applied_group(a)
def group_ok(a, b, status):
    """Grupo completo e coerente: estado, 2 itens, pernas pagas (aplicado) ou todas revertidas (estornado)."""
    g = sql(obs, 'SELECT g.id,g.status,(SELECT count(*) FROM transaction_offset_items WHERE group_id=g.id) FROM transaction_offset_groups g JOIN transaction_offset_items i ON i.group_id=g.id WHERE i.transaction_id=%s', (a,))
    legs = sql(obs, "SELECT status,count(*) FROM transaction_payments WHERE transaction_id=ANY(%s::uuid[]) GROUP BY 1 ORDER BY 1", ([a, b],))
    return g, legs
def no_partial():
    return sql(obs, "SELECT count(*) FROM transaction_offset_groups WHERE status NOT IN ('applied','reversed')")[0][0] == 0
def blocked(waiter, holder):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql(obs, 'SELECT %s=ANY(pg_blocking_pids(%s))', (holder, waiter))[0][0]: return True
    raise AssertionError(f'aresta de lock esperada não observada {waiter}<-{holder}')
def wait_kind(pid):
    return sql(obs, 'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=%s', (pid,))[0]
def run_script(c, name, before=False):
    return outcome(c, script(name, before))

set_state('N0')
# ---------------------------------------------------------------- (d) matriz estado de origem × script
EXPECT = {  # destino esperado DEPOIS; 'R' = recusa estado_origem_inesperado sem escrita
    KS: {'N0': 'N1', 'N1': 'N1', 'N2': 'R', 'invalido': 'R', 'ausente': 'R'},
    KSR: {'N0': 'N0', 'N1': 'N0', 'N2': 'R', 'invalido': 'R', 'ausente': 'R'},
    EM: {'N0': 'N2', 'N1': 'N2', 'N2': 'N2', 'invalido': 'R', 'ausente': 'R'},
    EMR: {'N0': 'R', 'N1': 'N1', 'N2': 'N1', 'invalido': 'R', 'ausente': 'R'},
    RE: {'N0': 'N0', 'N1': 'N0', 'N2': 'N0', 'invalido': 'R', 'ausente': 'R'},
    RER: {'N0': 'N2', 'N1': 'R', 'N2': 'N2', 'invalido': 'R', 'ausente': 'R'}}
ORIGINS = ['N0', 'N1', 'N2', 'invalido', 'ausente']
before_unsafe = 0
for sc in EXPECT:
    for o in ORIGINS:
        for before in (True, False):
            set_state(o); r = run_script(ops, sc, before); st = state()
            if before:
                ok_expected = EXPECT[sc][o]
                unsafe = (ok_expected == 'R' and (r[0] == 'ok')) or (ok_expected != 'R' and st != ok_expected)
                before_unsafe += unsafe
                report['origin_matrix_before'].append(dict(script=sc, origem=o, resultado=r[0] if r[0] == 'ok' else r[1], estado_final=st, defeito=bool(unsafe)))
            else:
                exp = EXPECT[sc][o]
                if exp == 'R':
                    good = r[0] == 'P0001' and r[1].startswith('estado_origem_inesperado') and st == (o if o != 'ausente' else 'linhas=0')
                else:
                    good = r[0] == 'ok' and st == exp
                report['origin_matrix_after'].append(dict(script=sc, origem=o, esperado=exp, obtido=('ok' if r[0] == 'ok' else r[1]), estado_final=st, pass_=good))
                check(good, f'B3(d) DEPOIS {sc} origem={o} esperado={exp}', (r, st))
check(before_unsafe > 0, f'B3(d) ANTES: scripts sem guarda sobrescrevem/aceitam origem inesperada em {before_unsafe} casos (defeito reproduzido)')
set_state('N0')

# ---------------------------------------------------------------- (a) erro claro por nível e por caminho
for level, setup in (('N1', [KS]), ('N2', [KS, EM])):
    set_state('N0'); a, b, g = make_group()
    for s in setup: assert run_script(ops, s)[0] == 'ok'
    snap = snapshot([a, b])
    c, d = fixture(); line = bank_line()
    paths = {'transaction_offset_execute': outcome(S[1], *call_exec(c, d)),
             'issue335_commands (INSERT na view)': outcome(S[1], *call_cmd(c, d)),
             "reconcile_bank_line mode 'offset'": outcome(S[1], *call_bank(c, d, line))}
    for p, r in paths.items():
        report['paths'].append(dict(nivel=level, caminho=p, esperado='encontro_desativado', obtido=r))
        check(r == OFF, f'B3(a) {level} {p} -> encontro_desativado', r)
    rv = outcome(S[1], *call_rev(g))
    exp = 'ok' if level == 'N1' else OFF
    report['paths'].append(dict(nivel=level, caminho='transaction_offset_reverse (grupo existente)', esperado=exp, obtido=rv))
    if level == 'N1':
        check(rv[0] == 'ok' and group_ok(a, b, 'reversed')[0][0][1] == 'reversed', 'B3(a) N1 estorno de grupo existente disponível', rv)
    else:
        check(rv == OFF and group_ok(a, b, 'applied')[0][0][1] == 'applied', 'B3(a) N2 estorno -> encontro_desativado, grupo intacto', rv)
    check(snapshot([a, b]) == snap, f'B3(a) {level}: nenhuma escrita fora do grupo esperado (snapshot integral)')
    # caminho legado (não gerido) intacto: reconcile settle simples continua a funcionar, por desenho.
    e, _ = fixture(); l2 = bank_line(100)
    leg = outcome(S[1], 'SELECT reconcile_bank_line(%s,%s::jsonb)', (l2, json.dumps([dict(transaction_id=e, mode='settle', amount=100)])))
    report['paths'].append(dict(nivel=level, caminho='reconcile_bank_line settle legado', esperado='ok (fora do âmbito do kill-switch)', obtido=leg[0]))
    check(leg[0] == 'ok', f'B3(a) {level} conciliação legada não gerida inalterada', leg)
set_state('N0')

# ---------------------------------------------------------------- (b) emergência concorrente
def scen(name, expected, obtained, ok, snap_ok):
    report['concurrency'].append(dict(cenario=name, esperado=expected, obtido=obtained, snapshot_integral_ok=snap_ok, pass_=ok and snap_ok))
    check(ok and snap_ok, f'B3(b) {name}', obtained)

def inflight_vs(level_script, final_state, label):
    set_state('N0'); a, b = fixture(); c, d = fixture(); snap = snapshot([a, b])
    s_in, s_new = S[0], S[2]
    sql(s_in, 'BEGIN'); r = outcome(s_in, *call_exec(a, b)); assert r[0] == 'ok', r
    k = pool.submit(run_script, ops, level_script)
    blocked(ops.get_backend_pid(), s_in.get_backend_pid())
    wk = wait_kind(ops.get_backend_pid())
    n = pool.submit(outcome, s_new, *call_exec(c, d))
    blocked(s_new.get_backend_pid(), ops.get_backend_pid())     # novo pedido fica na fila atrás do fecho
    sql(s_in, 'COMMIT')
    rk, rn = k.result(15), n.result(15)
    g, legs = group_ok(a, b, 'applied')
    ok = rk[0] == 'ok' and rn == OFF and state() == final_state and g and g[0][1] == 'applied' and g[0][2] == 2 and legs == [('paid', 3)] and no_partial()
    scen(label, f'drena: em voo aplica completo; fecho conclui ({final_state}); novo -> encontro_desativado',
         dict(fecho=rk[0], espera=wk, novo=rn, grupo=g, pernas=legs, estado=state()), ok, snapshot([a, b]) == snap)
    # variante: o próprio em voo aborta -> zero escrita
    set_state('N0'); a, b = fixture(); snap = snapshot()
    sql(s_in, 'BEGIN'); assert outcome(s_in, *call_exec(a, b))[0] == 'ok'
    k = pool.submit(run_script, ops, level_script); blocked(ops.get_backend_pid(), s_in.get_backend_pid())
    sql(s_in, 'ROLLBACK'); rk = k.result(15)
    scen(label + ' (em voo aborta)', 'zero grupo/pernas; fecho conclui', dict(fecho=rk[0], estado=state()),
         rk[0] == 'ok' and state() == final_state and applied_group(a) is None and no_partial(), snapshot() == snap)
inflight_vs(KS, 'N1', '(i) encontro em voo x nível 1')
inflight_vs(EM, 'N2', '(ii) encontro em voo x nível 2')

# (iii) estorno em voo x nível 2
set_state('N0'); a, b, g = make_group(); c, d, g2 = make_group(); snap = snapshot([a, b])
s_in, s_new = S[0], S[2]
sql(s_in, 'BEGIN'); r = outcome(s_in, *call_rev(g)); assert r[0] == 'ok', r
k = pool.submit(run_script, ops, EM); blocked(ops.get_backend_pid(), s_in.get_backend_pid())
n = pool.submit(outcome, s_new, *call_rev(g2)); blocked(s_new.get_backend_pid(), ops.get_backend_pid())
sql(s_in, 'COMMIT'); rk, rn = k.result(15), n.result(15)
gg, legs = group_ok(a, b, 'reversed'); g2s = group_ok(c, d, 'applied')
ok = rk[0] == 'ok' and rn == OFF and state() == 'N2' and gg[0][1] == 'reversed' and ('paid', 3) not in legs and g2s[0][0][1] == 'applied' and g2s[1] == [('paid', 3)] and no_partial()
scen('(iii) estorno em voo x nível 2', 'estorno em voo conclui completo; N2; segundo estorno -> encontro_desativado; outro grupo intacto',
     dict(fecho=rk[0], segundo=rn, grupo=gg, pernas=legs, outro=g2s, estado=state()), ok, snapshot([a, b]) == snap)
set_state('N0'); a, b, g = make_group(); snap = snapshot()
sql(s_in, 'BEGIN'); assert outcome(s_in, *call_rev(g))[0] == 'ok'
k = pool.submit(run_script, ops, EM); blocked(ops.get_backend_pid(), s_in.get_backend_pid())
sql(s_in, 'ROLLBACK'); rk = k.result(15)
scen('(iii) estorno em voo aborta x nível 2', 'grupo continua applied byte-idêntico; N2', dict(fecho=rk[0], estado=state()),
     rk[0] == 'ok' and state() == 'N2' and applied_group(a) == g and no_partial(), snapshot() == snap)

# (iv) dois activadores em simultâneo (barreira: detentor do fence exclusivo)
def two_activators(first, second, expect_first, expect_second, final, label, origin='N0'):
    set_state(origin); snap = snapshot()
    gate = S[3]; sql(gate, 'RESET ROLE'); sql(gate, 'BEGIN'); sql(gate, 'SELECT pg_advisory_xact_lock(335,1)')
    o2 = conn('postgres', 'i335_b3_ops2')
    f1 = pool.submit(run_script, ops, first); blocked(ops.get_backend_pid(), gate.get_backend_pid())
    f2 = pool.submit(run_script, o2, second); blocked(o2.get_backend_pid(), gate.get_backend_pid())
    blocked(o2.get_backend_pid(), ops.get_backend_pid())   # ordem de fila determinística: first à frente de second
    sql(gate, 'COMMIT'); sql(gate, 'SET ROLE authenticated')
    r1, r2 = f1.result(15), f2.result(15); o2.close()
    got = (r1[0] if r1[0] == 'ok' else r1[1].split(':')[0], r2[0] if r2[0] == 'ok' else r2[1].split(':')[0], state())
    scen(label, (expect_first, expect_second, final), got, got == (expect_first, expect_second, final), snapshot() == snap)
two_activators(KS, KS, 'ok', 'ok', 'N1', '(iv) dois níveis 1 em simultâneo (segundo idempotente)')
two_activators(KS, EM, 'ok', 'ok', 'N2', '(iv) nível 1 depois nível 2')
two_activators(EM, KS, 'ok', 'estado_origem_inesperado', 'N2', '(iv) nível 2 depois nível 1 (recusado, fica N2)')
two_activators(EM, EM, 'ok', 'ok', 'N2', '(iv) dois níveis 2 em simultâneo')

# (v) activação durante reactivação
def during_reactivation(origin, act, finish, final, expect_act, label):
    set_state(origin); snap = snapshot()
    body = script(RE).replace('BEGIN;', '', 1).replace('COMMIT;', '')
    holder = conn('postgres', 'i335_b3_holder'); sql(holder, 'BEGIN'); sql(holder, body)
    f = pool.submit(run_script, ops, act); blocked(ops.get_backend_pid(), holder.get_backend_pid())
    sql(holder, finish); holder.close(); r = f.result(15)
    got = (r[0] if r[0] == 'ok' else r[1].split(':')[0], state())
    scen(label, (expect_act, final), got, got == (expect_act, final) and no_partial(), snapshot() == snap)
during_reactivation('N2', KS, 'COMMIT', 'N1', 'ok', '(v) nível 1 durante reactivação N2->N0 (commit): N0->N1')
during_reactivation('N1', EM, 'COMMIT', 'N2', 'ok', '(v) nível 2 durante reactivação N1->N0 (commit): N0->N2')
during_reactivation('N2', KS, 'ROLLBACK', 'N2', 'estado_origem_inesperado', '(v) nível 1 durante reactivação abortada: origem N2 recusada, fica N2')
set_state('N0')

# ---------------------------------------------------------------- (c) reactivação: ACL exacta
ACL_Q = """SELECT jsonb_object_agg(k,v) FROM (
 SELECT 'f:'||p.oid::regprocedure::text k, coalesce(p.proacl::text,'NULL') v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 UNION ALL SELECT 'r:'||c.oid::regclass::text, coalesce(c.relacl::text,'NULL') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 UNION ALL SELECT 'c:'||a.attrelid::regclass::text||'.'||a.attname, a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attacl IS NOT NULL
 UNION ALL SELECT 'm:'||r.rolname||'>'||m.rolname, g.admin_option::text||g.inherit_option::text||g.set_option::text FROM pg_auth_members g JOIN pg_roles r ON r.oid=g.roleid JOIN pg_roles m ON m.oid=g.member) s"""
def acl(): return sql(obs, ACL_Q)[0][0]
live = json.loads((ROOT / 'supabase/tests/issue335/live/phase2n-bloco3/live-acl.json').read_text())
for origin_path, scripts in (('N1', [KS]), ('N2', [KS, EM])):
    set_state('N0'); base = acl()
    for s in scripts: assert run_script(ops, s)[0] == 'ok'
    during = acl()
    assert run_script(ops, RE)[0] == 'ok'; after = acl()
    d_during = {k: (base.get(k), during.get(k)) for k in base.keys() | during.keys() if base.get(k) != during.get(k)}
    d_after = {k: (base.get(k), after.get(k)) for k in base.keys() | after.keys() if base.get(k) != after.get(k)}
    live_diff = {k: (v, after.get(k)) for k, v in live.items() if after.get(k) != v}
    live_diff_install = {k: (v, base.get(k)) for k, v in live.items() if base.get(k) != v}   # deltas do core (instalação), não dos níveis
    report['acl'][f'reactivar_de_{origin_path}'] = dict(objetos=len(after), diferencas_durante_nivel=d_during, diferencas_pos_reactivacao=d_after,
        diferencas_vs_live_pos_reactivacao=live_diff, diferencas_vs_live_pos_instalacao=live_diff_install, estado=state())
    check(not d_during and not d_after and state() == 'N0', f'B3(c) reactivar de {origin_path}: ACL integral ({len(after)} entradas) igual antes/durante/depois, diferenças={{}}', (d_during, d_after))
    check(live_diff == live_diff_install, f'B3(c) reactivar de {origin_path}: {len(live)} objectos Live — níveis/reactivação acrescentam diferenças={{}} (deltas só de instalação: {sorted(live_diff_install)})', (live_diff, live_diff_install))

Path(out).write_text(json.dumps(report, indent=1, ensure_ascii=False, default=str))
for c in S + [obs, ops]: c.close()
print(f'B3 resumo: {len(fails)} FAIL')
sys.exit(1 if fails else 0)
