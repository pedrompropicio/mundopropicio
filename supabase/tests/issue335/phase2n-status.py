"""#335 2n-Bloco2 LOCAL ONLY: strict full snapshots, no acceptance by normalization.
Run after phase2h-suite.sh. Findings are classified OPEN, never converted to PASS.
No hosted access, TS, trigger disabling, or manual paid_amount UPDATE.
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
c = psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable')
c.autocommit = True


def run(statement, args=None):
    with c.cursor() as q:
        q.execute(statement, args)
        return q.fetchall() if q.description else q.rowcount


def identity(subject=admin_uid):
    run('SET SESSION AUTHORIZATION postgres')
    run("SELECT set_config('request.jwt.claim.sub',%s,false)", (subject,))
    assert run('SELECT current_user,session_user,rolsuper FROM pg_roles WHERE rolname=current_user') == [('postgres', 'postgres', False)]


def authenticated(subject=admin_uid):
    run('RESET ROLE')
    run("SELECT set_config('request.jwt.claim.sub',%s,true)", (subject,))
    run('SET LOCAL ROLE authenticated')


def hash_value(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def snapshot(ids):
    # All columns, including updated_at; all pre-existing/new payment rows retained.
    tx = run('SELECT to_jsonb(t) FROM transactions t WHERE id=ANY(%s::uuid[]) ORDER BY id', (ids,))
    legs = run('SELECT to_jsonb(p) FROM transaction_payments p WHERE transaction_id=ANY(%s::uuid[]) ORDER BY id', (ids,))
    data = {'documents': [r[0] for r in tx], 'payments': [r[0] for r in legs]}
    return {'hash': hash_value(data), 'data': data}


def attempt(statement, args=None):
    run('SAVEPOINT attack')
    try:
        result = run(statement, args)
        run('RELEASE SAVEPOINT attack')
        return {'outcome': 'ok', 'result': result}
    except psycopg2.Error as e:
        result = {'outcome': e.pgcode, 'message': e.diag.message_primary}
        run('ROLLBACK TO SAVEPOINT attack')
        run('RELEASE SAVEPOINT attack')
        return result


def fixture(status='approved', old_leg=False, no_bp=False, legacy_only=False):
    run('RESET ROLE')
    run("SELECT set_config('request.jwt.claim.sub','',true)")
    ev = None
    if no_bp:
        ev = str(run("INSERT INTO events(company_id,name,date,event_nature,budget_mode) VALUES(%s,'LOCAL 2n M3 historical','2026-10-13','producao_propria','with_bp') RETURNING id", (company,))[0][0])
    ids = []
    for kind, amount in [('income', 100), ('expense', 40)]:
        st = status if kind == 'income' else 'approved'
        # Seed legacy-only amount on INSERT solely as a historical local fixture.
        # Never UPDATE paid_amount; all executable financial paths use derivation.
        value = 20 if legacy_only and kind == 'income' else 0
        tx = str(run("""INSERT INTO transactions(company_id,type,description,status,amount,iva_rate,date,due_date,supplier_id,account_id,event_id,paid_amount)
        VALUES(%s,%s,'LOCAL 2n M3 fixture',%s,%s,0,'2026-10-01','2026-10-20',%s,%s,%s,%s) RETURNING id""",
                     (company, kind, st, amount, supplier, account if kind == 'income' else None, ev if kind == 'expense' else None, value))[0][0])
        if kind == 'income' and old_leg:
            run("INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status) VALUES(%s,%s,20,'2026-10-05',%s,'transfer','paid')", (tx, company, account))
            # Legacy derivation sets approved for a partial payment; seed the REAL prior
            # partially_paid status without changing its canonically derived paid_amount.
            run('UPDATE transactions SET status=%s WHERE id=%s', (status, tx))
        ids.append(tx)
    authenticated()
    return ids


def execute(ids, value=60):
    items = [{'transaction_id': ids[0], 'mode': 'settle'}, {'transaction_id': ids[1], 'mode': 'offset'}]
    movement = {'account_id': account, 'date': '2026-10-13', 'amount': value}
    return attempt('SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,%s)',
                   (str(uuid4()), supplier, json.dumps(items), json.dumps(movement), '2026-10-13'))


def reverse(group, request=None, reason='LOCAL 2n M3 reverse'):
    return attempt('SELECT transaction_offset_reverse(%s,%s,%s)', (group, request or str(uuid4()), reason))


identity()
assert run('SELECT version()')[0][0].startswith('PostgreSQL 17.6 ')
assert run("SELECT position('issue335-status-v2l' in pg_get_functiondef('_derive_paid_amount(uuid)'::regprocedure))>0") == [(True,)]
original_derive = run("SELECT pg_get_functiondef('_derive_paid_amount(uuid)'::regprocedure)")[0][0]
original_approval = run("SELECT pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure)")[0][0]

for phase in ('BEFORE', 'AFTER'):
    if phase == 'BEFORE':
        run('BEGIN')
        # Captured legacy bodies, only this local transaction; no guard rollback with history.
        run((root / 'supabase/tests/issue335/derive.LIVE-BASELINE.sql').read_text())
        rollback = (root / 'supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql').read_text()
        body = rollback[rollback.index('CREATE OR REPLACE FUNCTION'):rollback.rindex('COMMIT;')]
        run(body)
        run('COMMIT')
    else:
        run(original_approval)
        run(original_derive)
    for name, status, old, no_bp, legacy, expected in [
        ('a approved', 'approved', False, False, False, 'apply/reverse exact snapshot'),
        ('b partially_paid old legs', 'partially_paid', True, False, False, 'apply/reverse exact snapshot'),
        ('c partially_paid legacy-only nonzero', 'partially_paid', False, False, True, 'apply/reverse exact snapshot'),
        ('d paid', 'paid', False, False, False, 'apply/reverse as requested; core currently refuses'),
        ('e legacy expense no BP', 'approved', False, True, False, 'apply/reverse exact snapshot'),
        ('f pending', 'pending', False, False, False, 'refuse; exact unchanged snapshot'),
        ('mixed partially_paid + approved', 'partially_paid', True, False, False, 'whole-group exact restoration'),
    ]:
        run('BEGIN')
        ids = fixture(status, old, no_bp, legacy)
        before = snapshot(ids)
        applied = execute(ids, 40 if old or legacy else 60)
        row = dict(phase=phase, case=name, expected=expected, before=before, applied=applied)
        if applied['outcome'] == 'ok':
            group = applied['result'][0][0]['group_id']
            during = snapshot(ids)
            assert all(d['status'] == 'paid' for d in during['data']['documents'])
            assert all(d['paid_amount'] == d['amount'] for d in during['data']['documents'])
            row['during'] = during
            # Partial/repeated reversal must not bypass whole-group guards.
            payment = str(run('SELECT id FROM transaction_payments WHERE offset_group_id=%s ORDER BY id LIMIT 1', (group,))[0][0])
            partial = attempt("UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE id=%s", (payment,))
            assert partial['outcome'] != 'ok', partial
            assert during['hash'] == snapshot(ids)['hash']
            row['partial_attempt'] = partial
            request = str(uuid4())
            result = reverse(group, request)
            row['reversed'] = result
            after = snapshot(ids)
            row['after'] = after
            row['strict_equal'] = before['hash'] == after['hash']
            if result['outcome'] == 'ok':
                old_payments = before['data']['payments']
                assert all(p in after['data']['payments'] for p in old_payments), 'prior payment modified'
                business = [
                    {k: v for k, v in d.items() if k != 'updated_at'}
                    for d in before['data']['documents']
                ]
                business_after = [{k: v for k, v in d.items() if k != 'updated_at'} for d in after['data']['documents']]
                row['business_equal_excluding_updated_at'] = business == business_after
                row['retained_reversed_legs'] = len(after['data']['payments']) - len(old_payments)
                again = reverse(group, request)
                assert again['outcome'] == 'ok'
                assert after['hash'] == snapshot(ids)['hash'], 'idempotent replay changed document/payment rows'
                different = reverse(group)
                assert different['outcome'] == 'P0001' and different['message'] == 'already_reversed'
                assert after['hash'] == snapshot(ids)['hash']
                row['repeat'] = {'same_request': again['outcome'], 'other_request': different}
            else:
                assert during['hash'] == after['hash'], 'failed reverse non-atomic'
        else:
            row['after'] = snapshot(ids)
            assert before['hash'] == row['after']['hash'], 'refused apply changed rows'
        row['acceptance'] = 'CLOSED' if name == 'f pending' and applied['outcome'] != 'ok' else 'OPEN'
        rows.append(row)
        run('RESET ROLE')
        run('ROLLBACK')

# Installation order probes: no deployment; entire alteration rolled back.
identity()
run('BEGIN')
run((root / 'supabase/tests/issue335/derive.LIVE-BASELINE.sql').read_text())
rollback = (root / 'supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql').read_text()
run(rollback[rollback.index('CREATE OR REPLACE FUNCTION'):rollback.rindex('COMMIT;')])
status_candidate = (root / 'supabase/manual/20261021_issue335_status.INERTE.sql').read_text()
status_guard = status_candidate[status_candidate.index('DO $$'):status_candidate.index('CREATE OR REPLACE FUNCTION')]
wrong = attempt(status_guard)
assert wrong['outcome'] == 'P0001' and wrong['message'] == 'installation_order: approval_before_status'
ids = fixture('approved', False, True)
before = snapshot(ids)
unguarded = execute(ids)
assert unguarded['outcome'] == 'ok', 'probe assumption: core without approval does admit historical no-BP'
group = unguarded['result'][0][0]['group_id']
failed = reverse(group)
assert failed['outcome'] == '42501', failed
rows.append(dict(phase='BEFORE/AFTER order', case='core without approval: historical no-BP', expected='refuse before financial writes', applied=unguarded, reversed=failed, acceptance='OPEN'))
run('RESET ROLE')
run('ROLLBACK')

# Editor/manager actual attempts to borrow the exception outside proven reverse.
for subject, label in [('00000000-0000-0000-0000-000000000017', 'editor'), ('00000000-0000-0000-0000-000000000016', 'manager')]:
    run('BEGIN')
    ids = fixture('approved', False, True)
    group = execute(ids)['result'][0][0]['group_id']
    authenticated(subject)
    before = snapshot(ids)
    run("SELECT set_config('issue335.ctx',%s,true)", (str(uuid4()),))
    result = attempt("UPDATE transactions SET status='approved',payment_date=NULL WHERE id=%s", (ids[1],))
    assert result['outcome'] != 'ok' or result['result'] == 0, result
    assert before['hash'] == snapshot(ids)['hash']
    internal = attempt('SELECT _issue335_reverse(%s,%s,%s)', (group, str(uuid4()), 'forged'))
    assert internal['outcome'] == '42501', internal
    rows.append(dict(case='g exception attack '+label, expected='deny or RLS0; full snapshot unchanged', obtained=result, internal=internal, acceptance='CLOSED'))
    run('RESET ROLE')
    run('ROLLBACK')

identity()
assert run("SELECT pg_get_functiondef('_derive_paid_amount(uuid)'::regprocedure)")[0][0] == original_derive
assert run("SELECT pg_get_functiondef('enforce_transaction_approval_permission()'::regprocedure)")[0][0] == original_approval
result = {'block': 'OPEN', 'reason': 'paid/legacy-only are refused; core without approval admits historical no-BP; full snapshots retain reversed legs and change updated_at', 'zero_skips': True, 'cases': rows}
Path(output).write_text(json.dumps(result, indent=2, ensure_ascii=False, default=str))
print(json.dumps({'block': result['block'], 'cases': len(rows), 'reason': result['reason'], 'zero_skips': True}))
c.close()