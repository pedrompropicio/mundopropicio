"""#335 2n-Bloco7 LOCAL ONLY: permissions, replay, import guards and bounded scale.
Real PG17.6 / postgres NOSUPERUSER / real triggers. Every fixture is rolled back.
No assertion exceptions are caught. No hosted credentials or connections.
"""
import json
import sys
import time
from pathlib import Path
from uuid import uuid4

import psycopg2

socket, port, output = sys.argv[1:]
assert socket.startswith('/tmp/issue335phase2h.'), 'local faithful socket required'
c = psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable')
c.autocommit = True
rows = []
company = '00000000-0000-0000-0000-000000000001'
supplier = '00000000-0000-0000-0000-000000000020'
account = '00000000-0000-0000-0000-000000000030'
statement = '00000000-0000-0000-0000-000000000040'
admin = '00000000-0000-0000-0000-000000000010'


def run(sql, args=None):
    with c.cursor() as q:
        q.execute(sql, args)
        return q.fetchall() if q.description else q.rowcount


run('SET SESSION AUTHORIZATION postgres')
assert run('SELECT current_user,session_user,rolsuper FROM pg_roles WHERE rolname=current_user') == [('postgres', 'postgres', False)]
assert run('SELECT version()')[0][0].startswith('PostgreSQL 17.6 ')
catalog = {}
catalog['policies'] = run("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('user_permissions','bank_statement_lines','bank_line_transactions','transaction_offsets','issue335_commands') ORDER BY 1,2")
catalog['functions'] = run("SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('has_permission','has_permission_in','has_staff_role','transaction_offset_execute','transaction_offset_reverse','reconcile_bank_line') ORDER BY 1")
catalog['fk'] = run("SELECT conname,conrelid::regclass::text,confrelid::regclass::text,pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND (conrelid='transaction_offset_groups'::regclass OR confrelid='bank_statement_lines'::regclass) ORDER BY 1")
catalog['sandbox'] = run("SELECT rolname,c.relname,has_table_privilege(r.oid,c.oid,'INSERT'),has_table_privilege(r.oid,c.oid,'UPDATE'),has_table_privilege(r.oid,c.oid,'DELETE') FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname LIKE 'sandbox_exec%' AND n.nspname='public' AND c.relname IN ('transaction_offsets','bank_line_transactions','bank_statement_lines') ORDER BY 1,2")
catalog['sandbox_functions'] = run("SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sandbox_exec%'")
catalog['role_permissions'] = run("SELECT role,permission FROM role_permissions WHERE permission IN ('manage_bank_reconciliation','approve_transactions') ORDER BY 1,2")
catalog['acl_matrix'] = run("SELECT r.rolname,p.oid::regprocedure::text,has_function_privilege(r.oid,p.oid,'EXECUTE') FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND p.proname IN ('reconcile_bank_line','transaction_offset_execute','transaction_offset_reverse') ORDER BY 1,2")


def actor(uid, anonymous=False):
    run('RESET ROLE')
    run("SELECT set_config('request.jwt.claim.sub',%s,true)", (uid or '',))
    run('SET LOCAL ROLE anon' if anonymous else 'SET LOCAL ROLE authenticated')
    assert run('SELECT auth.uid()::text')[0][0] == uid


def owner():
    run('RESET ROLE')
    run("SELECT set_config('request.jwt.claim.sub','',true)")


def begin(role='admin', override=None):
    run('RESET SESSION AUTHORIZATION')
    run('BEGIN')
    owner()
    uid = str(uuid4())
    run('SET LOCAL ROLE supabase_auth_admin')
    run("INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES(%s,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',%s,%s::jsonb,now(),now())", (uid, uid + '@local.invalid', json.dumps({'company_id': company})))
    owner()
    run('SET SESSION AUTHORIZATION postgres')
    assert run('SELECT session_user')[0][0] == 'postgres'
    run('DELETE FROM user_roles WHERE user_id=%s', (uid,))
    run('INSERT INTO user_roles(user_id,role,company_id) VALUES(%s,%s,%s)', (uid, role, company))
    if override is not None:
        run("INSERT INTO user_permissions(user_id,permission,granted,company_id) VALUES(%s,'manage_bank_reconciliation',%s,%s)", (uid, override, company))
    return uid


def fixture(n=2, prior=0):
    ids = []
    for i in range(n):
        kind = 'income' if i < n // 2 else 'expense'
        amount = 100 if kind == 'income' else 40
        tx = str(run("INSERT INTO transactions(company_id,type,description,status,amount,iva_rate,date,due_date,supplier_id,account_id) VALUES(%s,%s,'LOCAL Bloco7','approved',%s,0,'2026-10-13','2026-10-13',%s,%s) RETURNING id", (company, kind, amount, supplier, account if prior else None))[0][0])
        for _ in range(prior):
            run("INSERT INTO transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status) VALUES(%s,%s,1,'2026-10-01',%s,'transfer','paid')", (tx, company, account))
        ids.append(tx)
    amount = n // 2 * 60
    line = str(run("INSERT INTO bank_statement_lines(company_id,statement_id,financial_account_id,booking_date,value_date,description,amount,line_hash) VALUES(%s,%s,%s,'2026-10-13','2026-10-13','LOCAL Bloco7',%s,%s) RETURNING id", (company, statement, account, amount, str(uuid4())))[0][0])
    return ids, line, amount


def items(ids, request=None):
    return [{'transaction_id': tx, 'mode': 'settle' if i < len(ids) // 2 else 'offset', **({'request_id': request, 'supplier_id': supplier} if request else {})} for i, tx in enumerate(ids)]


def execute(ids, amount, request=None):
    return run("SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')", (request or str(uuid4()), supplier, json.dumps(items(ids)), json.dumps({'account_id': account, 'date': '2026-10-13', 'amount': amount})))[0][0]


def reconcile(ids, line, request=None):
    return run('SELECT reconcile_bank_line(%s,%s::jsonb)', (line, json.dumps(items(ids, request or str(uuid4())))))


def snapshot(ids, line):
    was = run('SELECT current_user')[0][0]
    owner()
    data = {}
    for table, where, args in [
        ('transactions', 'id=ANY(%s::uuid[])', (ids,)),
        ('transaction_payments', 'transaction_id=ANY(%s::uuid[])', (ids,)),
        ('transaction_offsets', 'receivable_transaction_id=ANY(%s::uuid[]) OR payable_transaction_id=ANY(%s::uuid[])', (ids, ids)),
        ('transaction_offset_items', 'transaction_id=ANY(%s::uuid[])', (ids,)),
        ('transaction_offset_groups', 'id IN(SELECT group_id FROM transaction_offset_items WHERE transaction_id=ANY(%s::uuid[]))', (ids,)),
        ('bank_statement_lines', 'id=%s', (line,)),
        ('bank_line_transactions', 'line_id=%s', (line,)),
    ]:
        data[table] = [r[0] for r in run(f'SELECT to_jsonb(t) FROM {table} t WHERE {where} ORDER BY id', args)]
    if was != 'postgres':
        run('SET LOCAL ROLE ' + was)
    return data


def attempt(fn):
    run('SAVEPOINT probe')
    try:
        value = fn()
        run('RELEASE SAVEPOINT probe')
        return {'outcome': 'ok', 'value': value}
    except psycopg2.Error as e:
        run('ROLLBACK TO SAVEPOINT probe')
        run('RELEASE SAVEPOINT probe')
        return {'outcome': e.pgcode, 'message': e.diag.message_primary, 'constraint': e.diag.constraint_name}


# Independent valid fixtures for every role × function × effective override.
for role in ('admin', 'manager', 'editor', 'accountant', 'user', 'anon'):
    for override in ((None,) if role == 'anon' else (None, True, False)):
        for function in ('execute', 'bank', 'reverse'):
            uid = begin('user' if role == 'anon' else role, override)
            ids, line, amount = fixture()
            group = None
            if function == 'reverse':
                actor(admin)
                group = execute(ids, amount)['group_id']
            actor(None if role == 'anon' else uid, role == 'anon')
            permission = None if role == 'anon' else run("SELECT has_permission(auth.uid(),'manage_bank_reconciliation')")[0][0]
            before = snapshot(ids, line)
            # snapshot resets subject for owner reads; restore exact actor.
            actor(None if role == 'anon' else uid, role == 'anon')
            expected = role in ('admin', 'manager', 'editor') if function == 'execute' else role == 'admin' if function == 'reverse' else role in ('admin', 'manager') or (role == 'editor' and permission)
            result = attempt(lambda: execute(ids, amount) if function == 'execute' else reconcile(ids, line) if function == 'bank' else run('SELECT transaction_offset_reverse(%s,%s,%s)', (group, str(uuid4()), 'LOCAL Bloco7')))
            assert (result['outcome'] == 'ok') == bool(expected), (role, override, function, permission, result)
            after = snapshot(ids, line)
            if not expected:
                assert before == after, 'denial changed full snapshots'
                assert result['outcome'] == ('42501' if role == 'anon' else 'P0001'), result
                if role != 'anon':
                    assert result['message'] == 'permission_denied', result
            else:
                assert before != after, 'accepted call must have real effect'
                assert after['transaction_offset_groups'][0]['status'] == ('reversed' if function == 'reverse' else 'applied')
            rows.append({'case': 'permissions', 'role': role, 'override': override, 'permission': permission, 'function': function, 'expected_accept': bool(expected), 'result': result, 'before': before, 'after': after})
            run('ROLLBACK')
print('PASS permissions: 48 real role/function/override cells; full snapshots')

# RLS permits bank management to user+override but cannot open role-gated core.
for role in ('admin', 'manager', 'editor', 'accountant', 'user'):
    uid = begin(role, True)
    actor(uid)
    result = attempt(lambda: run("INSERT INTO user_permissions(user_id,permission,granted,company_id) VALUES(%s,'LOCAL_privilege_probe',true,%s)", (uid, company)))
    assert (result['outcome'] == 'ok') == (role == 'admin'), (role, result)
    if role != 'admin':
        assert result['outcome'] == '42501', result
    rows.append({'case': 'user_permissions_write', 'role': role, 'result': result})
    run('ROLLBACK')
print('PASS user_permissions: only admin can grant; self/company restrictive policy is not a grant')

uid = begin('manager')
ids, line, amount = fixture()
request = str(uuid4())
actor(admin)
applied = execute(ids, amount, request)
before = snapshot(ids, line)
actor(admin)
replayed = execute(ids, amount, request)
assert replayed == applied
assert snapshot(ids, line) == before
actor(uid)
mismatch = attempt(lambda: execute(ids, amount, request))
assert mismatch['outcome'] == 'P0001' and mismatch['message'] == 'request_actor_mismatch', mismatch
assert snapshot(ids, line) == before
rows.append({'case': 'request_replay', 'same_actor': replayed, 'other_actor': mismatch, 'before': before, 'after': snapshot(ids, line)})
run('ROLLBACK')
print('PASS request replay: same actor identical; other authorized actor request_actor_mismatch')

# Exact import collision semantics: ignore_duplicates=>DO NOTHING; regular UPDATE refused.
uid = begin()
ids, line, amount = fixture()
actor(admin)
reconcile(ids, line)
before = snapshot(ids, line)
owner()
for label, sql, args in [
    ('delete_line', 'DELETE FROM bank_statement_lines WHERE id=%s', (line,)),
    ('delete_statement', 'DELETE FROM bank_statements WHERE id=%s', (statement,)),
    ('replace_update', "UPDATE bank_statement_lines SET description='replaced' WHERE id=%s", (line,)),
    ('delete_link', 'DELETE FROM bank_line_transactions WHERE line_id=%s', (line,)),
    ('upsert_update', "INSERT INTO bank_statement_lines(id,company_id,statement_id,financial_account_id,booking_date,amount,line_hash) SELECT id,company_id,statement_id,financial_account_id,booking_date,amount,line_hash FROM bank_statement_lines WHERE id=%s ON CONFLICT(id) DO UPDATE SET description='replaced'", (line,)),
]:
    result = attempt(lambda: run(sql, args))
    assert result['outcome'] == 'P0001' and result['message'] == 'managed_bank_anchor_immutable', (label, result)
    assert snapshot(ids, line) == before
    rows.append({'case': 'import_guard', 'operation': label, 'result': result, 'before': before, 'after': snapshot(ids, line)})
result = attempt(lambda: run("INSERT INTO bank_statement_lines(company_id,statement_id,financial_account_id,booking_date,amount,line_hash) SELECT company_id,statement_id,financial_account_id,booking_date,amount,line_hash FROM bank_statement_lines WHERE id=%s ON CONFLICT(financial_account_id,line_hash) DO NOTHING", (line,)))
assert result['outcome'] == 'ok' and result['value'] == 0, result
assert snapshot(ids, line) == before
rows.append({'case': 'import_ignore_duplicate', 'result': result, 'before': before, 'after': snapshot(ids, line)})
actor(admin)
group = before['transaction_offset_groups'][0]['id']
run('SELECT transaction_offset_reverse(%s,%s,%s)', (group, str(uuid4()), 'LOCAL Bloco7'))
owner()
reversed_snapshot = snapshot(ids, line)
result = attempt(lambda: run('DELETE FROM bank_statement_lines WHERE id=%s', (line,)))
assert result['outcome'] == '23503' and result['constraint'] == 'transaction_offset_groups_bank_line_id_fkey', result
assert snapshot(ids, line) == reversed_snapshot
rows.append({'case': 'restrict_after_reverse', 'result': result, 'before': reversed_snapshot, 'after': snapshot(ids, line)})
run('ROLLBACK')
print('PASS import: duplicate ignored unchanged; active writes blocked; reversed history FK RESTRICT')

# Maximum accepted documents with two prior real payments each (100 old legs).
uid = begin()
ids, line, amount = fixture(50, 2)
actor(admin)
start = time.perf_counter()
result = execute(ids, amount)
elapsed = time.perf_counter() - start
owner()
count = run('SELECT count(*),count(*) FILTER(WHERE payment_method=\'transfer\') FROM transaction_payments WHERE offset_group_id=%s', (result['group_id'],))[0]
# 1500 cash: 15×98 +30; 10 income +25 expense compensation legs =35.
assert count == (51, 16), count
assert run('SELECT count(*) FROM transaction_offset_items WHERE group_id=%s', (result['group_id'],))[0][0] == 50
actor(admin)
start = time.perf_counter()
run('SELECT transaction_offset_reverse(%s,%s,%s)', (result['group_id'], str(uuid4()), 'LOCAL scale'))
reverse_elapsed = time.perf_counter() - start
owner()
assert run("SELECT count(*) FROM transaction_payments WHERE transaction_id=ANY(%s::uuid[]) AND offset_group_id IS NULL AND status='paid'", (ids,))[0][0] == 100
rows.append({'case': 'scale50', 'documents': 50, 'prior_payments': 100, 'new_payments': count[0], 'apply_seconds': elapsed, 'reverse_seconds': reverse_elapsed})
run('ROLLBACK')
print('PASS scale50: 100 prior payments, 51 new legs; real apply/reverse', elapsed, reverse_elapsed)

Path(output).write_text(json.dumps({'catalog': catalog, 'results': rows, 'open': [], 'skips': 0}, indent=2, default=str))
c.close()
print('PASS Bloco7 local runner; assertions preserved; fixtures rolled back')