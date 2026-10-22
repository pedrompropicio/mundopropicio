"""#335 2n-Bloco4 (M5/M7) — locks do encontro × writers legados × triggers laterais. LOCAL ONLY (harness fiel 2h).
Barreiras: aresta observada em pg_blocking_pids; nunca sleep. Snapshot integral (count+md5 linha a linha).
Uso: phase2n-locks.py <socket> <port> <root> <out.json>"""
import concurrent.futures, hashlib, json, sys, time, uuid
from pathlib import Path
import psycopg2

sock, port, root, out = sys.argv[1:]
assert sock.startswith('/tmp/issue335phase2h.'), 'local harness only'
ROOT = Path(root)
COMPANY = '00000000-0000-0000-0000-000000000001'; SUPPLIER = '00000000-0000-0000-0000-000000000020'
ACCOUNT = '00000000-0000-0000-0000-000000000030'; UID = '00000000-0000-0000-0000-000000000010'
CONFLICT = ('55P03', 'encontro_em_conflito: operação concorrente; atualize a prévia e tente novamente')
report = {'forecast_cycle': [], 'lateral': [], 'regression': [], 'parity_md5': {}, 'account_delete': []}
fails = []

def conn(name, role='authenticated', dl=None):
    c = psycopg2.connect(host=sock, port=port, user='supabase_admin', dbname='postgres', sslmode='disable', application_name=name)
    c.autocommit = True
    with c.cursor() as q:
        q.execute("SELECT set_config('request.jwt.claim.sub',%s,false)", (UID,)); q.execute("SET statement_timeout='20s'")
        if dl: q.execute(f"SET deadlock_timeout='{dl}'")   # só harness: fixa quem detecta primeiro (simula a corrida de relógios)
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
def check(cond, label, detail=None):
    print('PASS' if cond else 'FAIL', label, '' if cond else detail)
    if not cond: fails.append((label, str(detail)))
obs = conn('i335_b4_obs', role=None)
pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
def blocked(waiter, holder):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql(obs, 'SELECT %s=ANY(pg_blocking_pids(%s))', (holder.get_backend_pid(), waiter.get_backend_pid()))[0][0]: return True
    raise AssertionError('aresta de lock esperada não observada')
def waiting(c):
    return bool(sql(obs, 'SELECT cardinality(pg_blocking_pids(%s))>0', (c.get_backend_pid(),))[0][0])
TABLES = ['transaction_offset_groups', 'transaction_offset_items', 'transaction_offsets', 'transaction_payments', 'transactions',
          'event_forecasts', 'bank_statement_lines', 'bank_line_transactions', 'card_session_loads', 'reimbursement_notes',
          'partner_aporte_mirror', 'partner_capital_moves', 'shared_cost_mirror', 'camarim_fund_moves']
def snapshot():
    return {t: sql(obs, f"SELECT count(*)||':'||coalesce(md5(string_agg(x::text,'|' ORDER BY x::text)),'-') FROM public.{t} x")[0][0] for t in TABLES}
def tx(kind, amount, **cols):
    i = str(uuid.uuid4()); base = dict(id=i, company_id=COMPANY, status='approved', type=kind, description='2n-B4 '+kind, amount=amount, iva_rate=0, date='2026-10-13', supplier_id=SUPPLIER)
    base.update(cols); k = list(base)
    sql(obs, f"INSERT INTO transactions({','.join(k)}) VALUES({','.join(['%s']*len(k))})", [base[x] for x in k]); return i
def execute(c, items, amount, req=None, fn=None):
    mv = json.dumps(dict(account_id=ACCOUNT, date='2026-10-13', amount=amount))
    return outcome(c, "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')", (req or str(uuid.uuid4()), SUPPLIER, json.dumps(items), mv))
def no_partial():
    return sql(obs, "SELECT count(*) FROM transaction_offset_groups WHERE status NOT IN ('applied','reversed')")[0][0] == 0
def groups_for(t):
    return sql(obs, "SELECT count(*) FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=%s", (t,))[0][0]

# --------------------------------------------------------------------------- paridade: funções laterais = Live
live_src = (ROOT / 'supabase/tests/issue335/live/phase2n-bloco4/live-lateral-md5.json')
live_md5 = json.loads(live_src.read_text())
for name, md5 in live_md5.items():
    local = sql(obs, "SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=%s", (name,))
    report['parity_md5'][name] = dict(live=md5, harness=local[0][0] if local else None)
    check(local and local[0][0] == md5, f'B4(e) paridade: {name} no harness com o núcleo instalado é byte-idêntica a Live (md5 {md5[:8]})', local)

# --------------------------------------------------------------------------- (b/c) ciclo linha de BP × aprovação legada
core_def = sql(obs, "SELECT pg_get_functiondef('public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text)'::regprocedure)")[0][0]
NEW_LOCK = "ORDER BY id FOR UPDATE NOWAIT;\n -- 2j (achado F1/F3)"
OLD_LOCK = "ORDER BY id FOR NO KEY UPDATE NOWAIT;\n -- 2j (achado F1/F3)"
assert core_def.count(NEW_LOCK) == 1, 'núcleo 2n-Bloco4 não instalado'
def forecast_fixture():
    ev = str(uuid.uuid4()); f = str(uuid.uuid4())
    sql(obs, "INSERT INTO events(id,company_id,budget_mode,name,date,event_nature) VALUES(%s,%s,'without_bp','2n-B4 BP','2026-10-13','producao_propria')", (ev, COMPANY))
    sql(obs, "INSERT INTO event_forecasts(id,company_id,event_id,type,description,amount,iva_rate,approved_at) VALUES(%s,%s,%s,'expense','2n-B4 linha',100,0,now())", (f, COMPANY, ev))
    inc = tx('income', 40); return ev, f, inc
def forecast_cycle(label, e_deadlock, finish='COMMIT'):
    """Sequência real de um INSERT legado de transacção com forecast_id=F: o RI_ConstraintTrigger (KEY SHARE em F)
    corre antes do AFTER trg_sync_tx_forecast_to_anchor (UPDATE em F). Tornada determinística: o KEY SHARE de L
    vem de uma linha de auditoria real (forecast_audit_log.forecast_id FK) e o INSERT legado entra depois de o
    encontro E estar observado em espera (aresta pg_blocking_pids)."""
    ev, f, inc = forecast_fixture(); before = snapshot()
    L = conn('i335_b4_L', dl='1s'); E = conn('i335_b4_E', dl=e_deadlock)
    pend = str(uuid.uuid4())
    sql(L, 'BEGIN'); sql(L, "INSERT INTO forecast_audit_log(forecast_id,changed_by,field_name,old_value,new_value,company_id) VALUES(%s,%s,'2n-B4 legado',NULL,'x',%s)", (f, UID, COMPANY))
    req = str(uuid.uuid4()); items = [dict(forecast_id=f, mode='settle'), dict(transaction_id=inc, mode='offset')]
    fe = pool.submit(execute, E, items, -60, req)
    LEG = "INSERT INTO transactions(id,company_id,status,type,description,amount,iva_rate,date,supplier_id,event_id,forecast_id) VALUES(%s,%s,'pending','expense','2n-B4 legado',10,0,'2026-10-13',%s,%s,%s)"
    args = (pend, COMPANY, SUPPLIER, ev, f)
    try:
        blocked(E, L); e_waited = True
    except AssertionError:
        e_waited = False
    if e_waited:
        fl = pool.submit(outcome, L, LEG, args); re_, rl = fe.result(30), fl.result(30)
    else:
        re_ = fe.result(30); rl = outcome(L, LEG, args)
    lfin = outcome(L, finish) if L.get_transaction_status() != psycopg2.extensions.TRANSACTION_STATUS_IDLE else ('ok', 'abortado pelo deadlock')
    L.close()
    return dict(cenario=label, encontro_esperou=e_waited, encontro=re_, legado=rl, legado_fim=lfin, req=req, items=items, f=f, inc=inc, pend=pend, E=E, before=before)
# ANTES: núcleo com o lock anterior (NO KEY UPDATE) reinstalado temporariamente na função.
sql(obs, core_def.replace(NEW_LOCK, OLD_LOCK))
for dl, who in (('30s', 'legado detecta primeiro'), ('100ms', 'encontro detecta primeiro')):
    r = forecast_cycle(f'ANTES ({who})', dl)
    r['E'].close()
    rep = {k: v for k, v in r.items() if k not in ('E', 'before', 'items')}
    report['forecast_cycle'].append(rep)
    deadlock = '40P01' in (r['legado'][0], r['encontro'][0]) or r['encontro'] == CONFLICT
    print('ANTES', who, 'encontro esperou:', r['encontro_esperou'], 'encontro:', r['encontro'], 'legado:', r['legado'])
    if who == 'legado detecta primeiro':
        check(r['encontro_esperou'] and r['legado'][0] == '40P01', 'B4(b) ANTES ciclo real: encontro espera linha de BP e o LEGADO é a vítima (40P01 cru ao utilizador)', r)
    else:
        check(r['encontro_esperou'] and r['encontro'] == CONFLICT, 'B4(b) ANTES ciclo real: com relógio inverso a vítima é o encontro (vítima depende do relógio = não determinística)', r)
sql(obs, core_def)
# DEPOIS
for dl in ('30s', '100ms'):
    r = forecast_cycle(f'DEPOIS (deadlock_timeout encontro {dl})', dl, finish='ROLLBACK')
    E = r['E']
    rep = {k: v for k, v in r.items() if k not in ('E', 'before', 'items')}
    ok = (not r['encontro_esperou']) and r['encontro'] == CONFLICT and r['legado'][0] == 'ok'
    after_fail = snapshot()
    # idempotência: repetir o MESMO request depois do fim do legado aplica; repetir outra vez devolve o mesmo resultado
    r1 = execute(E, r['items'], -60, r['req']); r2 = execute(E, r['items'], -60, r['req'])
    rep.update(repeticao=r1[0], replay_igual=(r1 == r2)); report['forecast_cycle'].append(rep)
    check(ok, f'B4(b/c) DEPOIS {dl}: encontro falha logo (sem esperar) com encontro_em_conflito; legado aprova sem deadlock', rep)
    check(r1[0] == 'ok' and r1 == r2 and groups_for(r['inc']) == 1 and no_partial(), f'B4(c) DEPOIS {dl}: repetir o mesmo request aplica 1 grupo; replay idêntico', (r1, r2))
    check(all(after_fail[t] == r['before'][t] for t in TABLES if t not in ('transactions',)) , f'B4(d) DEPOIS {dl}: recusa sem escrita (snapshot integral igual excepto a transacção pendente do legado, revertida)', after_fail)
    E.close()
# legado commita primeiro: a linha passa a ter despesa -> recusa clara, não conflito
ev, f, inc = forecast_fixture(); E = conn('i335_b4_E2')
sql(obs, "INSERT INTO transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,event_id,forecast_id) VALUES(%s,'pending','expense','2n-B4 legado',10,0,'2026-10-13',%s,%s,%s)", (COMPANY, SUPPLIER, ev, f))
r = execute(E, [dict(forecast_id=f, mode='settle'), dict(transaction_id=inc, mode='offset')], -60); E.close()
check(r == ('P0001', 'forecast_shared_no_creation'), 'B4(c) legado já confirmado na linha -> forecast_shared_no_creation (claro, sem conflito)', r)

# --------------------------------------------------------------------------- (d/e) laterais: 3 sessões
def fixture_cat(code, name, parent_code):
    pid = sql(obs, "SELECT id FROM account_categories WHERE company_id=%s AND code=%s", (COMPANY, parent_code))[0][0] if parent_code else None
    have = sql(obs, "SELECT id FROM account_categories WHERE company_id=%s AND code=%s", (COMPANY, code))
    if have: return have[0][0]
    return sql(obs, "INSERT INTO account_categories(id,company_id,code,name,type,parent_id) VALUES(gen_random_uuid(),%s,%s,%s,'expense',%s) RETURNING id", (COMPANY, code, name, pid))[0][0]
def account(kind='bank', **cols):
    i = str(uuid.uuid4()); base = dict(id=i, company_id=COMPANY, name='2n-B4 '+kind, type=kind); base.update(cols); k = list(base)
    sql(obs, f"INSERT INTO financial_accounts({','.join(k)}) VALUES({','.join(['%s']*len(k))})", [base[x] for x in k]); return i
def legacy_pay(c, t, amount, acc):
    return outcome(c, "INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id,payment_method,status) VALUES(%s,%s,'2026-10-13',%s,'transfer','paid')", (t, amount, acc))

def lat_reimbursement():
    b = tx('expense', 40, account_id=ACCOUNT); item = tx('expense', 25, account_id=ACCOUNT)
    note = sql(obs, "INSERT INTO reimbursement_notes(company_id,employee_name,payment_transaction_id,status) VALUES(%s,'2n-B4',%s,'approved') RETURNING id", (COMPANY, b))[0][0]
    sql(obs, "INSERT INTO reimbursement_note_items(reimbursement_note_id,transaction_id) VALUES(%s,%s)", (note, item))
    def effect(): return sql(obs, "SELECT (SELECT status FROM transactions WHERE id=%s),(SELECT status FROM reimbursement_notes WHERE id=%s)", (item, note))[0]
    return b, ACCOUNT, 40, effect, ('paid', 'paid'), 'unsupported_debt'
def lat_card_load():
    card = account('prepaid_card'); sess = sql(obs, "INSERT INTO card_sessions(id,company_id,card_account_id,holder_name) VALUES(gen_random_uuid(),%s,%s,'2n-B4') RETURNING id", (COMPANY, card))[0][0]
    b = tx('expense', 40, account_id=ACCOUNT)
    load = sql(obs, "INSERT INTO card_session_loads(id,company_id,session_id,source_account_id,amount,load_date,out_transaction_id) VALUES(gen_random_uuid(),%s,%s,%s,40,'2026-10-13',%s) RETURNING id", (COMPANY, sess, ACCOUNT, b))[0][0]
    def effect(): return sql(obs, "SELECT l.in_transaction_id IS NOT NULL,(SELECT t.amount::text||'/'||t.account_id::text FROM transactions t WHERE t.id=l.in_transaction_id) FROM card_session_loads l WHERE l.id=%s", (load,))[0]
    return b, ACCOUNT, 40, effect, (True, f'40/{card}'), 'unsupported_debt'
def lat_aporte():
    g10 = fixture_cat('10', 'LOCAL G10', None); fixture_cat('10.1', 'LOCAL 10.1', '10'); fixture_cat('10.1.01', 'LOCAL aporte', '10.1')
    ev = str(uuid.uuid4()); sql(obs, "INSERT INTO events(id,company_id,name,date,event_nature) VALUES(%s,%s,'2n-B4 sócio','2026-10-13','producao_propria')", (ev, COMPANY))
    partner = sql(obs, "INSERT INTO event_partners(id,company_id,event_id,supplier_id) VALUES(gen_random_uuid(),%s,%s,%s) RETURNING id", (COMPANY, ev, SUPPLIER))[0][0]
    acc = account('bank', partner_id=partner, mirror_partner_aporte=True)
    b = tx('expense', 40, account_id=acc)
    def effect(): return sql(obs, "SELECT count(*),(SELECT t.amount::text FROM partner_aporte_mirror m JOIN transactions t ON t.id=m.aporte_transaction_id WHERE m.source_transaction_id=%s) FROM partner_capital_moves c JOIN partner_aporte_mirror m ON m.aporte_transaction_id=c.transaction_id WHERE m.source_transaction_id=%s", (b, b))[0]
    return b, acc, 40, effect, (1, '40'), 'unsupported_debt'
def lat_shared_cost():
    fixture_cat('10', 'LOCAL G10', None); fixture_cat('10.12', 'LOCAL 10.12', '10'); fixture_cat('10.12.01', 'LOCAL partilhado', '10.12')
    acc2 = account('bank'); b = tx('expense', 40, account_id=ACCOUNT, shared_cost_account_id=acc2, shared_cost_counterparty_id=SUPPLIER)
    def effect(): return sql(obs, "SELECT t.amount::text,t.account_id::text FROM shared_cost_mirror m JOIN transactions t ON t.id=m.mirror_transaction_id WHERE m.source_transaction_id=%s", (b,))[0] if sql(obs, "SELECT 1 FROM shared_cost_mirror WHERE source_transaction_id=%s", (b,)) else None
    return b, ACCOUNT, 40, effect, ('40', acc2), 'unsupported_debt'
def lat_camarim():
    s, sa = sql(obs, "INSERT INTO camarim_sessions(id,title,company_id) VALUES(gen_random_uuid(),'2n-B4 camarim',%s) RETURNING id,advance_account_id", (COMPANY,))[0]
    b = tx('expense', 40, account_id=ACCOUNT, description='Camarim 2n-B4'); st = tx('income', 40, account_id=sa, supplier_id=None, description='Camarim 2n-B4')
    sql(obs, "INSERT INTO camarim_fund_moves(session_id,move_type,amount,move_date,transaction_id,company_id) VALUES(%s,'advance',40,'2026-10-13',%s,%s)", (s, b, COMPANY))
    def effect(): return sql(obs, "SELECT coalesce(sum(amount),0)::text,string_agg(created_by,',') FROM transaction_payments WHERE transaction_id=%s AND status='paid'", (st,))[0]
    return b, ACCOUNT, 40, effect, ('40', 'base #287'), 'camarim_leg_unsupported'
def lat_ticket_office():
    to = account('ticket_office'); b = tx('expense', 40, account_id=to)
    def effect(): return sql(obs, "SELECT public._ticket_office_balance_raw(%s)::text", (to,))[0]
    return b, to, 40, effect, ('-40.00',), 'unsupported_debt'

LATERAL = [('reimbursement_propagate_payment', lat_reimbursement), ('card_load_on_out_paid', lat_card_load),
           ('sync_partner_aporte_mirror', lat_aporte), ('sync_shared_cost_mirror', lat_shared_cost),
           ('camarim_sync_session_leg_payment', lat_camarim), ('_ticket_office_balance_raw', lat_ticket_office)]
for name, mk in LATERAL:
    b, acc, amt, effect, expected_effect, refusal = mk()
    other_a, other_b = tx('income', 100), tx('expense', 40)   # terceira sessão: encontro independente
    before = snapshot()
    L = conn('i335_b4_lat_L'); E = conn('i335_b4_lat_E'); O = conn('i335_b4_lat_O')
    inc = tx('income', 100)
    sql(L, 'BEGIN'); rl = legacy_pay(L, b, amt, acc)          # legado em curso: perna + triggers laterais reais, sem COMMIT
    re_ = execute(E, [dict(transaction_id=inc, mode='settle'), dict(transaction_id=b, mode='offset')], 60)
    e_waited_now = waiting(E)
    ro = execute(O, [dict(transaction_id=other_a, mode='settle'), dict(transaction_id=other_b, mode='offset')], 60)
    sql(L, 'COMMIT')
    eff = effect()
    re2 = execute(E, [dict(transaction_id=inc, mode='settle'), dict(transaction_id=b, mode='offset')], 60)
    # 2.ª variante: encontro primeiro com documento ainda aberto (antes do legado): recusa pela elegibilidade
    for c in (L, E, O): c.close()
    exp_after = ('P0001', 'no_open_debt') if name != '_ticket_office_balance_raw' else None
    row = dict(trigger=name, legado=rl[0], efeito_legado=eff, efeito_esperado=expected_effect, encontro_durante=re_, encontro_esperou=e_waited_now,
               encontro_independente=ro[0], encontro_depois=re2, grupos_doc=groups_for(b))
    report['lateral'].append(row)
    check(rl[0] == 'ok' and tuple(eff) == tuple(expected_effect), f'B4(e) {name}: caminho legado (sem encontro) completa com o efeito lateral real igual ao prosrc de Live', (rl, eff))
    check(re_ == CONFLICT and not e_waited_now, f'B4(d) {name}: encontro durante o legado em curso -> encontro_em_conflito imediato (NOWAIT, nunca espera)', re_)
    check(ro[0] == 'ok', f'B4(d) {name}: terceira sessão, encontro independente aplica em paralelo', ro)
    check(re2[0] == 'P0001' and re2[1].split(':')[0] in (refusal, 'no_open_debt', 'unsupported_debt', 'invalid_document'), f'B4(e) {name}: depois do legado, recusa clara ({re2[1].split(":")[0]})', re2)
    check(groups_for(b) == 0 and no_partial(), f'B4(d) {name}: zero grupo sobre o documento lateral; nenhum grupo parcial', groups_for(b))
    # recusa pela elegibilidade, sem legado concorrente (documento lateral ainda aberto)
    b2, acc2, amt2, effect2, _, refusal2 = mk(); inc2 = tx('income', 100); snap = snapshot()
    E = conn('i335_b4_lat_E2'); r3 = execute(E, [dict(transaction_id=inc2, mode='settle'), dict(transaction_id=b2, mode='offset')], 60); E.close()
    report['regression'].append(dict(caminho=name, recusa=r3))
    check(r3[0] == 'P0001' and r3[1].split(':')[0] == refusal2 and snapshot() == snap, f'B4(e) {name}: encontro sobre documento lateral recusado ({refusal2}), snapshot integral igual', r3)

# regressões por coluna (recusa clara) e caminho legal
legal_a, legal_b = tx('income', 100), tx('expense', 40)
E = conn('i335_b4_legal'); r = execute(E, [dict(transaction_id=legal_a, mode='settle'), dict(transaction_id=legal_b, mode='offset')], 60)
g = sql(obs, "SELECT g.id FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=%s", (legal_a,))[0][0]
rv = outcome(E, "SELECT transaction_offset_reverse(%s,%s,'2n-B4')", (g, str(uuid.uuid4()))); E.close()
report['regression'].append(dict(caminho='encontro legal (aplica + estorna)', aplica=r[0], estorna=rv[0]))
check(r[0] == 'ok' and rv[0] == 'ok', 'B4(e) caminho legal: aplica e estorna', (r, rv))
for col, setv in (('is_transitory', "is_transitory=true,transitory_reason='caucao'"), ('shared_cost_account_id', f"shared_cost_account_id='{ACCOUNT}'"),
                  ('declared_withholding_amount', 'declared_withholding_amount=1')):
    a, b = tx('income', 100), tx('expense', 40); sql(obs, f"UPDATE transactions SET {setv} WHERE id=%s", (b,)); snap = snapshot()
    E = conn('i335_b4_col'); r = execute(E, [dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')], 60); E.close()
    report['regression'].append(dict(caminho=col, recusa=r))
    check(r == ('P0001', 'unsupported_debt') and snapshot() == snap, f'B4(e) coluna {col}: recusa unsupported_debt sem escrita', r)

# --------------------------------------------------------------------------- (f) remoção concorrente da conta do movimento
for finish, expected in (('ROLLBACK', 'ok'), ('COMMIT', '23503')):
    acc = account('bank'); a, b = tx('income', 100), tx('expense', 40)
    L = conn('i335_b4_del', role=None); E = conn('i335_b4_delE')
    sql(L, 'BEGIN'); sql(L, 'DELETE FROM financial_accounts WHERE id=%s', (acc,))
    mv = json.dumps(dict(account_id=acc, date='2026-10-13', amount=60))
    fe = pool.submit(outcome, E, "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')", (str(uuid.uuid4()), SUPPLIER, json.dumps([dict(transaction_id=a, mode='settle'), dict(transaction_id=b, mode='offset')]), mv))
    blocked(E, L); sql(L, finish); r = fe.result(30); L.close(); E.close()
    report['account_delete'].append(dict(fim_remocao=finish, encontro=r))
    check(r[0] == expected and no_partial() and (groups_for(a) == (1 if expected == 'ok' else 0)), f'B4(f) remoção da conta em curso: encontro espera (sem ciclo: a remoção não espera pelo encontro); remoção {finish} -> encontro {expected}', r)

Path(out).write_text(json.dumps(report, indent=1, ensure_ascii=False, default=str))
obs.close(); print(f'B4 resumo: {len(fails)} FAIL'); sys.exit(1 if fails else 0)
