"""#335 2n-Bloco2b (M3) LOCAL ONLY. Faithful harness (PG 17.6, postgres NOSUPERUSER, real triggers).
Run by phase2h-suite.sh after phase2l (approval+status candidates installed).
Every step commits in its own transaction so updated_at really changes; the comparison rule
is the documented one (all columns, single exception transactions.updated_at; prior legs
byte-identical; new legs of the group must be reversed; per-document and per-account net of
paid legs equal). Negative tests prove other column changes are detected.
No hosted access, no TS, no trigger disabling, no manual paid_amount UPDATE.
"""
import hashlib
import json
import sys
from pathlib import Path
from uuid import uuid4

import psycopg2

socket, port, root, output = sys.argv[1:]
assert socket.startswith('/tmp/issue335phase2h.'), 'faithful local socket required'
root = Path(root)
rows = []
company = '00000000-0000-0000-0000-000000000001'
supplier = '00000000-0000-0000-0000-000000000020'
account = '00000000-0000-0000-0000-000000000030'
admin_uid = '00000000-0000-0000-0000-000000000010'
ALLOWED_DOC_DIFF = {'updated_at'}
c = psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable')
c.autocommit = True


def run(statement, args=None):
    with c.cursor() as q:
        q.execute(statement, args)
        return q.fetchall() if q.description else q.rowcount


def identity():
    run('SET SESSION AUTHORIZATION postgres')
    run("SELECT set_config('request.jwt.claim.sub','',false)")
    assert run('SELECT current_user,session_user,rolsuper FROM pg_roles WHERE rolname=current_user') == [('postgres', 'postgres', False)]


def h(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), default=str).encode()).hexdigest()


def snapshot(ids):
    tx = run('SELECT to_jsonb(t) FROM transactions t WHERE id=ANY(%s::uuid[]) ORDER BY id', (ids,))
    legs = run('SELECT to_jsonb(p) FROM transaction_payments p WHERE transaction_id=ANY(%s::uuid[]) ORDER BY id', (ids,))
    data = {'documents': [r[0] for r in tx], 'payments': [r[0] for r in legs]}
    return {'hash': h(data), 'per_document_hash': {d['id']: h(d) for d in data['documents']}, 'data': data}


def in_tx(fn, subject=None):
    """One committed transaction; optional authenticated identity. Returns outcome dict."""
    run('BEGIN')
    try:
        if subject is not None:
            run("SELECT set_config('request.jwt.claim.sub',%s,true)", (subject,))
            run('SET LOCAL ROLE authenticated')
        result = fn()
        run('COMMIT')
        return {'outcome': 'ok', 'result': result}
    except psycopg2.Error as e:
        run('ROLLBACK')
        return {'outcome': e.pgcode, 'message': e.diag.message_primary}


def compare(before, after, group=None, expected_new=0):
    """Documented 2b rule. Returns the list of violations (empty = exact restoration)."""
    v = []
    bd = {d['id']: d for d in before['data']['documents']}
    ad = {d['id']: d for d in after['data']['documents']}
    if set(bd) != set(ad):
        v.append('document_set')
    for i in bd:
        for k in sorted(set(bd[i]) | set(ad.get(i, {}))):
            if k not in ALLOWED_DOC_DIFF and bd[i].get(k) != ad.get(i, {}).get(k):
                v.append(f'doc:{i}:{k}')
    bp = {p['id']: p for p in before['data']['payments']}
    ap = {p['id']: p for p in after['data']['payments']}
    for i, p in bp.items():
        if ap.get(i) != p:
            v.append(f'prior_leg_changed:{i}')
    new = [p for i, p in ap.items() if i not in bp]
    if len(new) != expected_new:
        v.append(f'new_leg_count:{len(new)}!={expected_new}')
    for p in new:
        if p.get('offset_group_id') != group or p.get('status') != 'reversed' or p.get('reversed_at') is None:
            v.append(f'new_leg_not_reversed_group:{p["id"]}')

    def net(rows, key):
        out = {}
        for p in rows:
            if p['status'] == 'paid':
                out[str(p.get(key))] = round(out.get(str(p.get(key)), 0) + float(p['amount']), 2)
        return out
    for key in ('transaction_id', 'account_id'):
        if net(before['data']['payments'], key) != net(after['data']['payments'], key):
            v.append(f'net_by_{key}')
    return v


def tx_insert(kind, status, amount, ev=None, paid_amount=0, extra=''):
    cols = 'company_id,type,description,status,amount,iva_rate,date,due_date,supplier_id,account_id,event_id,paid_amount' + extra
    return str(run(f"""INSERT INTO transactions({cols}) VALUES(%s,%s,'LOCAL 2n-2b fixture',%s,%s,0,'2026-10-01','2026-10-20',%s,%s,%s,%s) RETURNING id""",
                   (company, kind, status, amount, supplier, account if kind == 'income' else None, ev, paid_amount))[0][0])


def leg(tx, amount):
    return str(run("INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status) VALUES(%s,%s,%s,'2026-10-05',%s,'transfer','paid') RETURNING id",
                   (tx, company, amount, account))[0][0])


def fixture(kind_case):
    """Real paths only: INSERT + legs (sync/derive triggers) + Live reverse_payment for partially_paid."""
    def build():
        ev = None
        if kind_case == 'e':
            ev = str(run("INSERT INTO events(company_id,name,date,event_nature,budget_mode) VALUES(%s,'LOCAL 2n-2b historical','2026-10-13','producao_propria','with_bp') RETURNING id", (company,))[0][0])
        inc = tx_insert('income', 'approved', 100)
        exp = tx_insert('expense', 'approved', 40, ev)
        if kind_case in ('b', 'mixed'):
            leg(inc, 20)
            second = leg(inc, 30)
            run("SELECT set_config('request.jwt.claim.sub',%s,true)", (admin_uid,))
            run("SELECT reverse_payment(%s,'cash_refund','LOCAL 2n-2b real partial path')", (second,))
            run("SELECT set_config('request.jwt.claim.sub','',true)")
        if kind_case == 'd':
            leg(inc, 100)
        if kind_case == 'f':
            run("UPDATE transactions SET status='pending' WHERE id=%s", (inc,))
        return [inc, exp]
    r = in_tx(build)
    assert r['outcome'] == 'ok', r
    return r['result']


def execute(ids, value):
    items = [{'transaction_id': ids[0], 'mode': 'settle'}, {'transaction_id': ids[1], 'mode': 'offset'}]
    movement = {'account_id': account, 'date': '2026-10-13', 'amount': value}
    return in_tx(lambda: run('SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,%s)',
                             (str(uuid4()), supplier, json.dumps(items), json.dumps(movement), '2026-10-13'))[0][0], admin_uid)


def reverse(group, request=None, reason='LOCAL 2n-2b reverse'):
    return in_tx(lambda: run('SELECT transaction_offset_reverse(%s,%s,%s)', (group, request or str(uuid4()), reason))[0][0], admin_uid)


identity()
assert run('SELECT version()')[0][0].startswith('PostgreSQL 17.6 ')
approval_marker = run("SELECT position('issue335-approval-v2l' in pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure))>0")[0][0]
status_marker = run("SELECT position('issue335-status-v2l' in pg_get_functiondef('_derive_paid_amount(uuid)'::regprocedure))>0")[0][0]
assert approval_marker and status_marker, 'approval+status candidates must be installed (phase2l)'
core_text = (root / 'supabase/manual/20261021_issue335_offset_core.INERTE.sql').read_text()
assert core_text.count("approval_candidate_required") == 2
original_approval = run("SELECT pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure)")[0][0]
appr_rb = (root / 'supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql').read_text()
legacy_approval = appr_rb[appr_rb.index('CREATE OR REPLACE FUNCTION'):appr_rb.rindex('COMMIT;')]

# ---------- Passo 3: cases a, b, e, mixed (apply + exact reverse) and d/f refusals ----------
for name, kc, value, expect_status in [
    ('a approved', 'a', 60, {'income': 'approved', 'expense': 'approved'}),
    ('b partially_paid real path (reverse_payment)', 'b', 40, {'income': 'partially_paid', 'expense': 'approved'}),
    ('e historical expense without BP', 'e', 60, {'income': 'approved', 'expense': 'approved'}),
    ('mixed partially_paid income + approved expense', 'mixed', 40, {'income': 'partially_paid', 'expense': 'approved'}),
    ('d paid', 'd', 60, None),
    ('f pending', 'f', 60, None),
]:
    ids = fixture(kc)
    before = snapshot(ids)
    row = {'case': name, 'before_hash': before['hash']}
    if expect_status:
        got = {d['type']: d['status'] for d in before['data']['documents']}
        assert got == expect_status, (name, got)
        if kc in ('b', 'mixed'):
            inc = [d for d in before['data']['documents'] if d['type'] == 'income'][0]
            assert float(inc['paid_amount']) == 20 and len(before['data']['payments']) == 2, 'real partial fixture'
    applied = execute(ids, value)
    row['applied'] = {k: v for k, v in applied.items() if k != 'result'}
    if expect_status is None:
        assert applied['outcome'] == 'P0001' and applied['message'] == 'invalid_document', applied
        assert snapshot(ids)['hash'] == before['hash']
        row['result'] = 'refused; full snapshot hash identical'
        rows.append(row)
        continue
    assert applied['outcome'] == 'ok', (name, applied)
    group = applied['result']['group_id']
    during = snapshot(ids)
    assert all(d['status'] == 'paid' and d['paid_amount'] == d['amount'] for d in during['data']['documents'])
    new_legs = len([p for p in during['data']['payments'] if p.get('offset_group_id') == group])
    first = run('SELECT id FROM transaction_payments WHERE offset_group_id=%s ORDER BY id LIMIT 1', (group,))[0][0]
    partial = in_tx(lambda: run("UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE id=%s", (str(first),)), admin_uid)
    assert partial['outcome'] != 'ok' or partial['result'] == 0, partial
    assert snapshot(ids)['hash'] == during['hash']
    req = str(uuid4())
    rev = reverse(group, req)
    assert rev['outcome'] == 'ok', (name, rev)
    after = snapshot(ids)
    violations = compare(before, after, group, new_legs)
    assert violations == [], (name, violations)
    changed = sorted({k for b, a in zip(before['data']['documents'], after['data']['documents']) for k in b if b[k] != a[k]})
    assert set(changed) <= ALLOWED_DOC_DIFF and 'updated_at' in changed, (name, changed)
    same = reverse(group, req)
    other = reverse(group)
    assert same['outcome'] == 'ok' and other['outcome'] == 'P0001' and other['message'] == 'already_reversed'
    assert snapshot(ids)['hash'] == after['hash'], 'replay changed rows'
    # Negative tests: any other column / prior leg / extra paid leg must be detected.
    neg = {}
    run('BEGIN')
    run("UPDATE transactions SET specification=coalesce(specification,'')||' tamper' WHERE id=%s", (ids[0],))
    neg['doc_column'] = compare(before, snapshot(ids), group, new_legs)
    run('ROLLBACK')
    run('BEGIN')
    if before['data']['payments']:
        run("UPDATE transaction_payments SET notes=coalesce(notes,'')||' tamper' WHERE id=%s", (before['data']['payments'][0]['id'],))
        neg['prior_leg'] = compare(before, snapshot(ids), group, new_legs)
    run('ROLLBACK')
    run('BEGIN')
    run("SAVEPOINT s")
    leg(ids[1], 1)
    neg['extra_paid_leg'] = compare(before, snapshot(ids), group, new_legs)
    run('ROLLBACK')
    assert any(x.endswith(':specification') for x in neg['doc_column']), neg
    assert 'prior_leg' not in neg or any(x.startswith('prior_leg_changed') for x in neg['prior_leg']), neg
    assert any(x.startswith('new_leg_count') for x in neg['extra_paid_leg']) and 'net_by_transaction_id' in neg['extra_paid_leg'], neg
    assert snapshot(ids)['hash'] == after['hash']
    row.update(during_hash=during['hash'], after_hash=after['hash'], new_reversed_legs=new_legs,
               changed_columns=changed, violations=violations, partial_attempt=partial.get('outcome'),
               replay={'same': same['outcome'], 'other': other.get('message')}, negative_detected=neg,
               restored_status={d['type']: d['status'] for d in after['data']['documents']})
    rows.append(row)

# ---------- Passo 2: case c (partially_paid with only legacy value, no legs) ----------
c_rows = {}
# c1 real non-exempt INSERT path: the Live materializer creates a leg and derives approved.
ids = in_tx(lambda: [tx_insert('income', 'partially_paid', 100, None, 20)])['result']
s = snapshot(ids)
d = s['data']['documents'][0]
assert d['status'] == 'approved' and float(d['paid_amount']) == 20 and len(s['data']['payments']) == 1
assert s['data']['payments'][0]['created_by'] == 'base D-ERP157'
c_rows['c1 non-exempt insert'] = 'unreachable: materializer leg + derive approved'
# c2 real non-exempt UPDATE OF paid_amount path (legacy writer): same materialization.
ids2 = in_tx(lambda: [tx_insert('income', 'approved', 100)])['result']
in_tx(lambda: run("UPDATE transactions SET status='partially_paid',paid_amount=20 WHERE id=%s", (ids2[0],)))
s = snapshot(ids2)
d = s['data']['documents'][0]
assert d['status'] == 'approved' and len(s['data']['payments']) == 1
c_rows['c2 non-exempt update paid_amount'] = 'unreachable: materializer leg + derive approved'
# c3 exempt paths (_paid_guard_is_exempt): reachable without legs, but the core refuses them.
for label, extra, vals in [('c3 reimbursement', ',is_reimbursement', True)]:
    ids3 = in_tx(lambda: [str(run(f"""INSERT INTO transactions(company_id,type,description,status,amount,iva_rate,date,due_date,supplier_id,account_id,paid_amount{extra})
        VALUES(%s,'income','LOCAL 2n-2b exempt','partially_paid',100,0,'2026-10-01','2026-10-20',%s,%s,20,%s) RETURNING id""", (company, supplier, account, vals))[0][0])])['result']
    exp = in_tx(lambda: [tx_insert('expense', 'approved', 40)])['result']
    pair = ids3 + exp
    before = snapshot(pair)
    d = before['data']['documents']
    st = {x['id']: (x['status'], x['paid_amount']) for x in d}
    assert st[ids3[0]][0] == 'partially_paid' and float(st[ids3[0]][1]) == 20
    assert [p for p in before['data']['payments'] if p['transaction_id'] == ids3[0]] == []
    r = execute(pair, 40)
    assert r['outcome'] == 'P0001' and r['message'] in ('unsupported_debt', 'paid_ledger_divergent'), r
    assert snapshot(pair)['hash'] == before['hash']
    c_rows[label] = f"reachable (exempt), refused {r['message']}, snapshot identical"
rows.append({'case': 'c partially_paid legacy-only', 'result': c_rows})

# ---------- Passo 1: installation order ----------
order = {}
ids = fixture('e')
before = snapshot(ids)
run('BEGIN')
run(legacy_approval)
run("SELECT set_config('request.jwt.claim.sub',%s,true)", (admin_uid,))
run('SET LOCAL ROLE authenticated')
run('SAVEPOINT x')
try:
    run('SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,%s)', (str(uuid4()), supplier, json.dumps([{'transaction_id': ids[0], 'mode': 'settle'}, {'transaction_id': ids[1], 'mode': 'offset'}]), json.dumps({'account_id': account, 'date': '2026-10-13', 'amount': 60}), '2026-10-13'))
    order['core_without_approval_no_bp'] = 'ACCEPTED'
except psycopg2.Error as e:
    order['core_without_approval_no_bp'] = f'{e.pgcode} {e.diag.message_primary}'
    run('ROLLBACK TO SAVEPOINT x')
run('ROLLBACK')
assert order['core_without_approval_no_bp'] == 'P0001 installation_order: approval_candidate_required', order
assert snapshot(ids)['hash'] == before['hash']
assert run("SELECT pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure)")[0][0] == original_approval
# With approval present: same no-BP case applies and reverses exactly (case e above). Reverse-time guard:
applied = execute(ids, 60)
assert applied['outcome'] == 'ok'
group = applied['result']['group_id']
during = snapshot(ids)
run('BEGIN')
run(legacy_approval)
run("SELECT set_config('request.jwt.claim.sub',%s,true)", (admin_uid,))
run('SET LOCAL ROLE authenticated')
run('SAVEPOINT x')
try:
    run('SELECT transaction_offset_reverse(%s,%s,%s)', (group, str(uuid4()), 'order probe'))
    order['reverse_after_approval_removed'] = 'ACCEPTED'
except psycopg2.Error as e:
    order['reverse_after_approval_removed'] = f'{e.pgcode} {e.diag.message_primary}'
    run('ROLLBACK TO SAVEPOINT x')
run('ROLLBACK')
assert order['reverse_after_approval_removed'] == 'P0001 installation_order: approval_candidate_required', order
assert snapshot(ids)['hash'] == during['hash']
assert reverse(group)['outcome'] == 'ok'
# Removal order: core rollback refuses while approval/status are installed (guard inside rollback file).
core_rb = (root / 'supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql').read_text()
guard = core_rb[core_rb.index("DO $$ BEGIN IF position('issue335-status-v2l'"):core_rb.index('GRANT issue335_executor')]
run('BEGIN')
try:
    run(guard)
    order['core_rollback_before_approval'] = 'ACCEPTED'
except psycopg2.Error as e:
    order['core_rollback_before_approval'] = e.diag.message_primary
run('ROLLBACK')
assert order['core_rollback_before_approval'] == 'rollback_order: status_and_approval_before_core', order
rows.append({'case': 'order', 'result': order})

# ---------- (g) editor/manager cannot borrow the reverse exemption ----------
for subject, label in [('00000000-0000-0000-0000-000000000017', 'editor'), ('00000000-0000-0000-0000-000000000016', 'manager')]:
    ids = fixture('e')
    group = execute(ids, 60)['result']['group_id']
    before = snapshot(ids)
    r1 = in_tx(lambda: (run("SELECT set_config('issue335.ctx',%s,true)", (str(uuid4()),)), run("UPDATE transactions SET status='approved',payment_date=NULL WHERE id=%s", (ids[1],)))[1], subject)
    r2 = in_tx(lambda: run('SELECT _issue335_reverse(%s,%s,%s)', (group, str(uuid4()), 'forged')), subject)
    assert r1['outcome'] != 'ok' or r1['result'] == 0, r1
    assert r2['outcome'] == '42501', r2
    assert snapshot(ids)['hash'] == before['hash']
    rows.append({'case': 'g attack ' + label, 'update': r1.get('outcome'), 'internal': r2['outcome']})

assert run("SELECT pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure)")[0][0] == original_approval
result = {'block': '2n-Bloco2b', 'zero_skips': True, 'rule': 'all columns; only transactions.updated_at may differ; prior legs identical; new group legs reversed; net per document/account equal', 'cases': rows}
Path(output).write_text(json.dumps(result, indent=2, ensure_ascii=False, default=str))
print('PASS phase2n-status', json.dumps({'cases': len(rows)}))
c.close()
