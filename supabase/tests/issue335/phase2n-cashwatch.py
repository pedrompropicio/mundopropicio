"""#335 2n-Bloco5 (M6) — vigia independente de dinheiro, união de contas, matriz as-of e corrupção. LOCAL ONLY (harness fiel 2h).
ANTES = vigia anterior (issue335_balance_invariant_count da offset_balance + issue335_invariant_counts) e guarda anterior do núcleo;
DEPOIS = candidato cash_watch + guarda 2n-Bloco5 do núcleo. Corrupções em BEGIN/ROLLBACK com session_replication_role=replica.
Uso: phase2n-cashwatch.py <socket> <port> <root> <out.json>"""
import json, sys, uuid
from pathlib import Path
import psycopg2

sock, port, root, out = sys.argv[1:]
assert sock.startswith('/tmp/issue335phase2h.'), 'local harness only'
ROOT = Path(root); MAN = ROOT / 'supabase/manual'
COMPANY = '00000000-0000-0000-0000-000000000001'; SUPPLIER = '00000000-0000-0000-0000-000000000020'
ACCOUNT = '00000000-0000-0000-0000-000000000030'; UID = '00000000-0000-0000-0000-000000000010'
STATEMENT = '00000000-0000-0000-0000-000000000040'
report = {'fp_estado_acumulado': {}, 'contas': [], 'asof': [], 'corrupcao': [], 'legitimos': [], 'independencia': {}}
fails = []
def check(cond, label, detail=None):
    print('PASS' if cond else 'FAIL', label, '' if cond else detail)
    if not cond: fails.append((label, str(detail)))
def conn(role='authenticated'):
    c = psycopg2.connect(host=sock, port=port, user='supabase_admin', dbname='postgres', sslmode='disable', application_name='i335_b5')
    c.autocommit = True
    with c.cursor() as q:
        q.execute("SELECT set_config('request.jwt.claim.sub',%s,false)", (UID,)); q.execute("SET statement_timeout='20s'")
        if role: q.execute(f'SET ROLE {role}')
    return c
def sql(c, q, a=None):
    with c.cursor() as cur:
        cur.execute(q, a); return cur.fetchall() if cur.description else []
def outcome(c, q, a=None):
    try: return ('ok', sql(c, q, a))
    except psycopg2.Error as e:
        if c.get_transaction_status() == psycopg2.extensions.TRANSACTION_STATUS_INERROR: sql(c, 'ROLLBACK')
        return (e.pgcode, e.diag.message_primary)
obs = conn(None); E = conn()
pg = psycopg2.connect(host=sock, port=port, user='postgres', dbname='postgres', sslmode='disable'); pg.autocommit = True
assert not sql(pg, 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user')[0][0]
def run_file(n): sql(pg, (MAN / f'20261021_issue335_{n}.sql').read_text())
TABLES = ['transaction_offset_groups', 'transaction_offset_items', 'transaction_offsets', 'transaction_payments', 'transactions',
          'bank_statement_lines', 'bank_line_transactions', 'financial_accounts']
def snapshot():
    return {t: sql(obs, f"SELECT count(*)||':'||coalesce(md5(string_agg(x::text,'|' ORDER BY x::text)),'-') FROM public.{t} x")[0][0] for t in TABLES}
def acct(name, init=0, init_date=None):
    a = str(uuid.uuid4())
    sql(obs, "INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,initial_balance_date) VALUES(%s,%s,%s,'bank',%s,%s)", (a, COMPANY, '2n-B5 '+name, init, init_date)); return a
def tx(kind, amount, **cols):
    i = str(uuid.uuid4()); base = dict(id=i, company_id=COMPANY, status='approved', type=kind, description='2n-B5 '+kind, amount=amount, iva_rate=0, date='2026-10-13', supplier_id=SUPPLIER)
    base.update(cols); k = list(base)
    sql(obs, f"INSERT INTO transactions({','.join(k)}) VALUES({','.join(['%s']*len(k))})", [base[x] for x in k]); return i
def leg(t, amount, account, method='transfer', date='2026-10-05'):
    sql(obs, "INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,created_by) VALUES(%s,%s,%s,%s,%s,%s,'paid',%s)", (t, COMPANY, amount, date, account, method, UID))
def execute(items, amount, account=ACCOUNT, date='2026-10-13'):
    mv = json.dumps(dict(account_id=account, date=date, amount=amount)) if amount else None
    r = outcome(E, "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,%s)", (str(uuid.uuid4()), SUPPLIER, json.dumps(items), mv, date))
    return (r[0], r[1][0][0]['group_id']) if r[0] == 'ok' else r
def bank_line(amount, account=ACCOUNT, booking='2026-10-13', value=None):
    line = str(uuid.uuid4())
    sql(obs, "INSERT INTO bank_statement_lines(statement_id,line_hash,id,company_id,financial_account_id,amount,booking_date,value_date) VALUES(%s,md5(%s),%s,%s,%s,%s,%s,%s)", (STATEMENT, line, line, COMPANY, account, amount, booking, value))
    return line
def via_bank(line, a, b):
    items = json.dumps([dict(transaction_id=a, mode='settle', request_id=str(uuid.uuid4()), supplier_id=SUPPLIER), dict(transaction_id=b, mode='offset')])
    r = outcome(E, 'SELECT reconcile_bank_line(%s,%s::jsonb)', (line, items))
    if r[0] != 'ok': return r
    return ('ok', sql(obs, 'SELECT offset_group_id FROM bank_statement_lines WHERE id=%s', (line,))[0][0])
def reverse(g): return outcome(E, "SELECT transaction_offset_reverse(%s,%s,'2n-B5')", (g, str(uuid.uuid4())))
def bal(a, d=None): return sql(obs, 'SELECT _account_true_balance_asof_raw(%s,%s)', (a, d))[0][0]
def old_watch():
    return dict(saldo=sql(obs, 'SELECT issue335_balance_invariant_count()')[0][0], **{n: c for n, c in sql(obs, 'SELECT * FROM issue335_invariant_counts()')})
def new_watch(): return {n: c for n, c in sql(obs, 'SELECT * FROM issue335_cash_watch()')}
def watch_installed(): return sql(obs, "SELECT to_regprocedure('public.issue335_cash_watch()') IS NOT NULL")[0][0]

assert sql(obs, "SELECT position('issue335-status-v2l' in pg_get_functiondef('public._derive_paid_amount(uuid)'::regprocedure))>0")[0][0], 'status candidate required'
assert sql(obs, "SELECT enabled AND reverse_enabled FROM transaction_offset_control")[0][0], 'kill-switch must be off'
if watch_installed(): run_file('cash_watch.ROLLBACK-INERTE')
OLD_BODY = sql(obs, "SELECT md5(prosrc) FROM pg_proc WHERE proname='issue335_balance_invariant_count'")[0][0]

# ----------------------------------------------------------------- (a) independência: texto e dependências do vigia
run_file('cash_watch.INERTE')
src = sql(obs, "SELECT prosrc FROM pg_proc WHERE proname='issue335_cash_watch'")[0][0]
banned = ['paid_amount', 'initial_balance', '_account_true_balance', 'managed', 'get_event_cash_position']
import re
report['independencia'] = {b: bool(re.search(r'(?<!prior_)\b' + re.escape(b), src)) for b in banned}
check(not any(report['independencia'].values()), 'B5(a) vigia não lê paid_amount/initial_balance/managed nem chama funções de saldo', report['independencia'])
balsrc = sql(obs, "SELECT prosrc FROM pg_proc WHERE proname='issue335_balance_invariant_count'")[0][0]
check('issue335_cash_watch()' in balsrc and '_account_true_balance' not in balsrc, 'B5(a) invariante encontro_saldo_dinheiro_divergente passa a ser a soma do vigia', balsrc)
acl = sql(obs, "SELECT has_function_privilege('authenticated','issue335_cash_watch()','EXECUTE'), has_function_privilege('anon','issue335_cash_watch()','EXECUTE'), has_function_privilege('service_role','issue335_cash_watch()','EXECUTE')")[0]
check(acl == (False, False, True), 'B5(a) ACL do vigia: só service_role', acl)
reg = sql(obs, "SELECT count(*) FROM _run_invariant_checks_extra() WHERE name='encontro_saldo_dinheiro_divergente'")[0][0]
check(reg == 1, 'B5(a) vigia exposto pelo registo _run_invariant_checks_extra', reg)
# falso positivo zero sobre todo o estado acumulado pela suite (encontros aplicados/estornados/bancários/adoptados)
report['fp_estado_acumulado'] = dict(grupos=sql(obs, 'SELECT status,count(*) FROM transaction_offset_groups GROUP BY 1 ORDER BY 1'),
                                     adoptados=sql(obs, 'SELECT count(*) FROM transaction_offsets WHERE offset_group_id IS NOT NULL')[0][0], vigia=new_watch())
check(sum(report['fp_estado_acumulado']['vigia'].values()) == 0, 'B5(d) zero falsos positivos no estado acumulado da suite', report['fp_estado_acumulado'])
run_file('cash_watch.ROLLBACK-INERTE')
check(sql(obs, "SELECT md5(prosrc) FROM pg_proc WHERE proname='issue335_balance_invariant_count'")[0][0] == OLD_BODY and not watch_installed(), 'B5 rollback do vigia repõe o corpo anterior byte a byte')

# ----------------------------------------------------------------- (b) união das contas: ANTES (guarda 2k) × DEPOIS (2n-Bloco5)
core_def = sql(obs, "SELECT pg_get_functiondef('public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text)'::regprocedure)")[0][0]
NEW_G = """AND p.reversed_at IS NULL AND (
     (p.payment_method IS DISTINCT FROM 'compensation' AND (p.account_id IS NULL OR p.account_id IS DISTINCT FROM t.account_id))
     OR (p.payment_method='compensation' AND (t.account_id IS NOT NULL OR p.account_id IS NOT NULL))))
   OR (amount<>0 AND t.type=(CASE WHEN amount<0 THEN 'expense' ELSE 'income' END) AND t.account_id IS NOT NULL AND t.account_id IS DISTINCT FROM acc) THEN"""
OLD_G = """AND p.reversed_at IS NULL AND p.payment_method IS DISTINCT FROM 'compensation'
    AND (p.account_id IS NULL OR p.account_id IS DISTINCT FROM t.account_id)) THEN"""
assert core_def.count(NEW_G) == 1, 'núcleo 2n-Bloco5 não instalado'
ACC2 = acct('conta X')
def contas_case(name):
    """Devolve (items, amount, conta_afectada) de um caso de contas novo."""
    if name == 'B1 compensação legada sem ligação, documento com conta X':
        b = tx('expense', 40, account_id=ACC2); leg(b, 10, None, 'compensation'); a = tx('income', 100)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 70, ACC2
    if name == 'B2 documento com conta X, dinheiro novo na conta do grupo Y':
        a = tx('income', 100, account_id=ACC2); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 60, ACC2
    if name == 'B3 perna legada em dinheiro sem conta (2k)':
        a = tx('income', 100); leg(a, 20, None); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 40, ACCOUNT
    if name == 'B4 perna legada em conta diferente do documento (2k)':
        a = tx('income', 100, account_id=ACCOUNT); leg(a, 20, ACC2); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 40, ACC2
    if name == 'L1 legítimo: documento com conta = conta do grupo, perna legada nessa conta':
        a = tx('income', 100, account_id=ACCOUNT); leg(a, 20, ACCOUNT); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 40, ACCOUNT
    if name == 'L2 legítimo: documentos sem conta, sem pernas':
        a = tx('income', 100); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 60, ACCOUNT
    if name == 'L3 legítimo: compensação pura, documento offset com conta X (sem dinheiro novo)':
        a = tx('income', 40, account_id=ACC2); b = tx('expense', 40)
        return [dict(transaction_id=a, mode='offset'), dict(transaction_id=b, mode='offset')], 0, ACC2
CASES = ['B1 compensação legada sem ligação, documento com conta X', 'B2 documento com conta X, dinheiro novo na conta do grupo Y',
         'B3 perna legada em dinheiro sem conta (2k)', 'B4 perna legada em conta diferente do documento (2k)',
         'L1 legítimo: documento com conta = conta do grupo, perna legada nessa conta', 'L2 legítimo: documentos sem conta, sem pernas',
         'L3 legítimo: compensação pura, documento offset com conta X (sem dinheiro novo)']
EXPECT = {'ANTES': ['ok', 'ok', 'P0001', 'P0001', 'ok', 'ok', 'ok'], 'DEPOIS': ['P0001', 'P0001', 'P0001', 'P0001', 'ok', 'ok', 'ok']}
for phase in ('ANTES', 'DEPOIS'):
    sql(obs, core_def.replace(NEW_G, OLD_G) if phase == 'ANTES' else core_def)
    for name, exp in zip(CASES, EXPECT[phase]):
        items, amount, affected = contas_case(name)
        b0 = bal(affected); s0 = snapshot(); r = execute(items, amount); b1 = bal(affected)
        row = dict(fase=phase, caso=name, esperado=exp, obtido=r[0], erro=None if r[0] == 'ok' else r[1], saldo_conta_antes=str(b0), saldo_conta_depois=str(b1))
        if r[0] == 'ok':
            run_file('cash_watch.INERTE'); row['vigia_novo'] = new_watch(); run_file('cash_watch.ROLLBACK-INERTE')
            row['grupo'] = r[1]
        else:
            row['snapshot_igual'] = (snapshot() == s0)
        report['contas'].append(row)
        if r[0] == 'ok' and name[:2] in ('B1', 'B2'):  # estorno real imediato: não contamina os casos seguintes
            rv = reverse(r[1]); row['estorno'] = rv[0]; check(rv[0] == 'ok', f'B5(b) estorno do grupo {phase} {name[:2]} aceite', rv)
        ok = r[0] == exp and (r[0] == 'ok' or (row['snapshot_igual'] and 'cash_account_inconsistent' in r[1]))
        if name.startswith('B1') and r[0] == 'ok': ok = ok and b1 != b0  # ANTES: activação reinterpreta o saldo da conta X sem dinheiro
        if name.startswith('B2') and r[0] == 'ok': ok = ok and row['vigia_novo']['vigia_contas_uniao'] > 0
        if name.startswith('L'): ok = ok and b1 - b0 == (amount if affected == ACCOUNT else 0) and sum(row['vigia_novo'].values()) == 0
        check(ok, f'B5(b) {phase} {name}: esperado {exp}', row)
run_file('cash_watch.INERTE')
check(sum(new_watch().values()) == 0, 'B5(b) após estorno dos grupos ANTES o vigia volta a zero', new_watch())

# ----------------------------------------------------------------- (c) matriz as-of
ACC3 = acct('as-of', 1000, '2026-09-30')
ldoc = tx('income', 200, account_id=ACC3); leg(ldoc, 200, ACC3, date='2026-10-05')
a = tx('income', 100); b = tx('expense', 40)
line = bank_line(60, ACC3, booking='2026-10-14', value='2026-10-13')
r = via_bank(line, a, b); check(r[0] == 'ok', 'B5(c) encontro bancário com data-valor 13/10 e lançamento 14/10', r); g3 = r[1]
ACC4 = acct('as-of corte posterior', 500, '2026-10-20')
a4 = tx('income', 100); b4 = tx('expense', 40); r4 = execute([dict(transaction_id=a4, mode='settle'), dict(transaction_id=b4, mode='offset')], 60, ACC4)
check(r4[0] == 'ok', 'B5(c) encontro sem linha de banco numa conta com corte 20/10', r4)
def asof_rows(stage, rows):
    for acc, label, d, exp in rows:
        got = bal(acc, d); report['asof'].append(dict(fase=stage, conta=label, data=d or 'sem data (actual)', esperado=str(exp), obtido=str(got)))
        check(got == exp, f'B5(c) as-of {stage} {label} {d}: {exp}', got)
from decimal import Decimal as D
asof_rows('aplicado', [(ACC3, 'banco (corte 30/09)', '2026-09-30', D('1000')), (ACC3, 'banco', '2026-10-04', D('1000')),
                       (ACC3, 'banco', '2026-10-05', D('1200')), (ACC3, 'banco', '2026-10-12', D('1200')),
                       (ACC3, 'banco (data-valor = data do pagamento)', '2026-10-13', D('1260')), (ACC3, 'banco (data de lançamento)', '2026-10-14', D('1260')),
                       (ACC3, 'banco (fim de mês)', '2026-10-31', D('1260')), (ACC3, 'banco', None, D('1260')),
                       (ACC4, 'conta com corte 20/10 (perna anterior ao corte já no saldo inicial)', '2026-10-13', D('500')),
                       (ACC4, 'conta com corte 20/10', '2026-10-31', D('500'))])
w = new_watch(); report['asof'].append(dict(fase='aplicado', vigia=w))
check(sum(w.values()) == 0, 'B5(c) vigia por conta e data-valor sem falso positivo (lançamento ≠ valor; conta com corte)', w)
lt = sql(obs, "SELECT count(*) FROM bank_statement_lines b JOIN transaction_payments p ON p.offset_group_id=b.offset_group_id AND p.payment_method='transfer' WHERE b.id=%s AND p.payment_date<>b.booking_date", (line,))[0][0]
check(lt == 1, 'B5(c) a perna fica datada pela data-valor (não pela de lançamento): o vigia agrupa por coalesce(valor, lançamento)', lt)
rv = reverse(g3); check(rv[0] == 'ok', 'B5(c) estorno do encontro bancário', rv)
asof_rows('estornado', [(ACC3, 'banco', '2026-10-12', D('1200')), (ACC3, 'banco (perna reversed deixa de contar)', '2026-10-13', D('1200')),
                        (ACC3, 'banco (fim de mês)', '2026-10-31', D('1200')), (ACC3, 'banco', None, D('1200'))])
w = new_watch(); report['asof'].append(dict(fase='estornado', vigia=w))
check(sum(w.values()) == 0, 'B5(c) vigia após estorno sem falso positivo', w)

# ----------------------------------------------------------------- (d) corrupção
def fresh_bank_group():
    a = tx('income', 100); b = tx('expense', 40); c = tx('expense', 15)
    ln = bank_line(60); r = via_bank(ln, a, b); assert r[0] == 'ok', r
    return dict(a=a, b=b, c=c, line=ln, g=r[1])
CORR = {
 'perna alterada (valor da perna em dinheiro)': "UPDATE transaction_payments SET amount=50 WHERE offset_group_id=%(g)s AND payment_method='transfer'",
 'conta trocada (perna em dinheiro noutra conta)': "UPDATE transaction_payments SET account_id=%(acc2)s WHERE offset_group_id=%(g)s AND payment_method='transfer'",
 'conta trocada (perna em dinheiro sem conta)': "UPDATE transaction_payments SET account_id=NULL WHERE offset_group_id=%(g)s AND payment_method='transfer'",
 'conta do documento trocada depois do encontro': "UPDATE transactions SET account_id=%(acc2)s WHERE id=%(a)s",
 'perna apagada (dinheiro)': "DELETE FROM transaction_payments WHERE offset_group_id=%(g)s AND payment_method='transfer'",
 'perna apagada (compensação: item/offset sem perna)': "DELETE FROM transaction_payments WHERE offset_group_id=%(g)s AND payment_method='compensation' AND transaction_id=%(b)s",
 'offset adoptado sem perna no grupo': "INSERT INTO transaction_offsets(company_id,receivable_transaction_id,payable_transaction_id,amount,offset_group_id) VALUES(%(co)s,%(a)s,%(c)s,15,%(g)s)",
 'perna sem offset (dinheiro num item só de compensação)': "INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,offset_group_id,offset_item_id) SELECT %(b)s,%(co)s,10,'2026-10-13',%(acc)s,'transfer','paid',%(g)s,id FROM transaction_offset_items WHERE group_id=%(g)s AND transaction_id=%(b)s",
 'perna estornada com grupo aplicado': "UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE offset_group_id=%(g)s AND payment_method='compensation' AND transaction_id=%(b)s",
 'extracto divergente (valor da linha)': "UPDATE bank_statement_lines SET amount=70 WHERE id=%(line)s",
 'extracto divergente (data da linha)': "UPDATE bank_statement_lines SET booking_date='2026-10-14' WHERE id=%(line)s",
 'extracto divergente (ligação ao documento errado)': "UPDATE bank_line_transactions SET transaction_id=%(c)s WHERE line_id=%(line)s",
 'soma dupla (perna legada igual na mesma conta e data)': "INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status) VALUES(%(a)s,%(co)s,60,'2026-10-13',%(acc)s,'transfer','paid')",
 'soma dupla (segunda linha de extracto do mesmo movimento)': "INSERT INTO bank_statement_lines(statement_id,line_hash,company_id,financial_account_id,amount,booking_date,status,offset_group_id) VALUES(%(st)s,md5(%(g)s::text||'dup'),%(co)s,%(acc)s,60,'2026-10-13','matched',%(g)s)",
}
def corrupt(name, stmt, measure):
    f = fresh_bank_group(); args = dict(f, acc=ACCOUNT, acc2=ACC2, co=COMPANY, st=STATEMENT)
    base = measure(); s0 = snapshot()
    sql(obs, 'BEGIN'); sql(obs, 'SET LOCAL session_replication_role=replica')
    try:
        sql(obs, stmt, args); got = measure()
    except psycopg2.Error as e:
        got = dict(base, impedido_pela_base=e.pgcode)
    sql(obs, 'ROLLBACK')
    check(snapshot() == s0, f'B5(d) corrupção revertida sem resto: {name}')
    return base, got
for phase in ('ANTES', 'DEPOIS'):
    if phase == 'ANTES': run_file('cash_watch.ROLLBACK-INERTE')
    else: run_file('cash_watch.INERTE')
    m = old_watch if phase == 'ANTES' else new_watch
    for name, stmt in CORR.items():
        base, got = corrupt(name, stmt, m)
        det = {k: v for k, v in got.items() if v != base.get(k)}
        report['corrupcao'].append(dict(fase=phase, corrupcao=name, base=base, detectado_por=det,
                                        vigia_saldo_detecta=(phase == 'ANTES' and got['saldo'] != base['saldo']) if phase == 'ANTES' else None))
        if 'impedido_pela_base' in got:
            check(got['impedido_pela_base'] == '23505', f'B5(d) {phase} impedido pela base (índice único issue335_bank_group): {name}', got)
        elif phase == 'DEPOIS':
            check(sum(base.values()) == 0 and det, f'B5(d) DEPOIS detecta: {name}', det)
ant = [r for r in report['corrupcao'] if r['fase'] == 'ANTES']
check(not any(r['vigia_saldo_detecta'] for r in ant), 'B5(d) ANTES: o vigia de saldo (cópia da fórmula) não detecta nenhuma corrupção', [r['corrupcao'] for r in ant if r['vigia_saldo_detecta']])
report['antes_resumo'] = dict(total=len(ant), detectadas_por_alguma_vigia_antiga=sum(1 for r in ant if r['detectado_por']),
                              nao_detectadas=[r['corrupcao'] for r in ant if not r['detectado_por'] or set(r['detectado_por'])=={'impedido_pela_base'}])
report['antes_resumo']['detectadas_ignorando_impedidas'] = sum(1 for r in ant if r['detectado_por'] and 'impedido_pela_base' not in r['detectado_por'])
check(report['antes_resumo']['nao_detectadas'], 'B5(d) ANTES: há corrupções que nenhuma vigia antiga detecta', report['antes_resumo'])

# ----------------------------------------------------------------- legítimos adicionais (zero falso positivo DEPOIS)
leg_cases = []
f1 = fresh_bank_group(); leg_cases.append('encontro bancário aplicado')
a = tx('income', 100); b = tx('expense', 40); r = execute([dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 60); assert r[0] == 'ok', r
a2 = tx('income', 50); b2 = tx('expense', 20); r2 = execute([dict(transaction_id=a2, mode='settle'), dict(transaction_id=b2, mode='offset')], 30); assert r2[0] == 'ok', r2
leg_cases.append('dois encontros sem linha de banco, mesma conta e mesmo dia')
a = tx('income', 40); b = tx('expense', 40); r = execute([dict(transaction_id=a, mode='offset'), dict(transaction_id=b, mode='offset')], 0); assert r[0] == 'ok', r
leg_cases.append('compensação pura (movimento 0)')
a = tx('expense', 100); b = tx('income', 30); r = execute([dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], -70); assert r[0] == 'ok', r
leg_cases.append('saída de dinheiro (movimento negativo)')
rv = reverse(r[1]); assert rv[0] == 'ok', rv
r = execute([dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], -70); assert r[0] == 'ok', r
leg_cases.append('estornado e reaplicado (mesmos documentos)')
w = new_watch(); report['legitimos'] = dict(casos=leg_cases, vigia=w)
check(sum(w.values()) == 0, 'B5(d) DEPOIS zero falsos positivos nos casos legítimos', w)

Path(out).write_text(json.dumps(report, indent=1, ensure_ascii=False, default=str))
print('RESUMO', len(fails), 'falhas')
sys.exit(1 if fails else 0)
