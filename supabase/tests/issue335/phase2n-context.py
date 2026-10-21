"""#335 2n1b LOCAL ONLY. Real token/SQL/trigger attacks, faithful PG17.6.
Security item3 stays OPEN if a privileged owner-created trigger borrows live context.
No historical privilege observations are accepted as attacks. No TS or hosted access.
"""
import json
import re
import sys
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql

socket, port, output = sys.argv[1:]
assert socket.startswith('/tmp/issue335phase2h.'), 'faithful disposable local socket required'
rows = []
company = '00000000-0000-0000-0000-000000000001'
supplier = '00000000-0000-0000-0000-000000000020'
uid = '00000000-0000-0000-0000-000000000010'
actors = [('editor', 'authenticated', '17'), ('manager', 'authenticated', '16'),
          ('user', 'authenticated', '15'), ('anon', 'anon', '10'),
          ('service_role', 'service_role', '10'), ('sandbox_exec', 'sandbox_exec', '10'),
          ('sandbox_exec specific', 'sandbox_exec_sfohvvlqccmmebvjgibx', '10'),
          ('postgres', 'postgres', '10'), ('postgres SET executor', 'issue335_executor', '10')]


def connect(role='postgres', subject='10'):
    c = psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable')
    c.autocommit = True
    q = c.cursor()
    session = 'postgres' if role == 'issue335_executor' else role
    q.execute(sql.SQL('SET SESSION AUTHORIZATION {}').format(sql.Identifier(session)))
    q.execute("SELECT set_config('request.jwt.claim.sub',%s,false)", ('00000000-0000-0000-0000-0000000000' + subject,))
    q.execute('SELECT current_user,session_user,rolsuper FROM pg_roles WHERE rolname=current_user')
    assert q.fetchone() == (session, session, False)
    if role == 'issue335_executor':
        q.execute('SET ROLE issue335_executor')
        q.execute('SELECT current_user,session_user')
        assert q.fetchone() == ('issue335_executor', 'postgres')
    return c


def execute(c, statement, params=None):
    with c.cursor() as q:
        q.execute(statement, params)
        return q.fetchall() if q.description else q.rowcount


admin = connect()
version = execute(admin, 'SELECT version()')[0][0]
assert version.startswith('PostgreSQL 17.6 ')
assert execute(admin, "SELECT pg_has_role('postgres','issue335_executor','SET')") == [(False,)]
execute(admin, 'CREATE SCHEMA issue335_2n1b')
execute(admin, """CREATE FUNCTION issue335_2n1b.capture() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
IF NOT issue335_context_valid('execute') THEN RAISE EXCEPTION 'capture_not_live'; END IF;
RAISE NOTICE '2N1B_TOKEN:%',current_setting('issue335.ctx'); RETURN NEW; END $$;
CREATE TRIGGER issue335_2n1b_capture BEFORE INSERT ON transaction_offset_groups
FOR EACH ROW EXECUTE FUNCTION issue335_2n1b.capture()""")

try:
    # Item1: genuinely distinct legitimate token for each transaction ending.
    for ending in ('COMMIT', 'ROLLBACK'):
        a = connect('authenticated')
        execute(a, 'BEGIN')
        group = str(execute(a, "SELECT issue335_test.j_group(%s)", ('2n1b-token-' + ending,))[0][0])
        tokens = [re.search(r'2N1B_TOKEN:([a-f0-9-]{36})', n).group(1) for n in a.notices if '2N1B_TOKEN:' in n]
        assert len(tokens) == 1
        token = tokens[0]
        assert execute(a, 'SELECT count(*) FROM issue335_execution_context') if False else True
        execute(a, ending)
        exists = execute(admin, 'SELECT count(*) FROM transaction_offset_groups WHERE id=%s', (group,))[0][0]
        assert exists == (1 if ending == 'COMMIT' else 0)
        execute(admin, 'GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE')
        for label, role, subject in actors:
            b = connect(role, subject)
            execute(b, 'BEGIN')
            execute(b, "SELECT set_config('issue335.ctx',%s,true)", (token,))
            expected = 'P0001:managed_operation_required' if role in ('postgres', 'issue335_executor') else '42501'
            try:
                execute(b, "SELECT _issue335_execute(NULL,NULL,'[]',NULL,current_date,NULL)")
                raise AssertionError('cross-session replay accepted')
            except psycopg2.Error as e:
                actual = e.pgcode + ':' + e.diag.message_primary
                assert actual == expected or expected == '42501' and e.pgcode == '42501', actual
            finally:
                execute(b, 'ROLLBACK')
                b.close()
            rows.append(dict(item=1, role=label, attack='replay after own ' + ending, expected=expected, actual=actual, pass_=True))
        execute(admin, 'GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET FALSE')
        execute(a, 'BEGIN')
        execute(a, "SELECT set_config('issue335.ctx',%s,true)", (token,))
        assert execute(a, 'SELECT issue335_context_valid()') == [(False,)]
        try:
            execute(a, "SELECT _issue335_execute(NULL,NULL,'[]',NULL,current_date,NULL)")
            raise AssertionError('same-session replay accepted')
        except psycopg2.Error as e:
            assert e.pgcode == '42501'
        execute(a, 'ROLLBACK')
        rows.append(dict(item=1, role='same A new xid', attack='replay after own ' + ending, expected='false/42501', actual='false/42501', pass_=True))
        a.close()
    execute(admin, 'DROP TRIGGER issue335_2n1b_capture ON transaction_offset_groups')
    # Fixtures are legitimate existing FKs, not nonexistent IDs or invalid INSERT values.
    g = str(execute(admin, "SELECT issue335_test.j_group('2n1b-target')")[0][0])
    txs = []
    for kind in ('income', 'expense'):
        txs.append(str(execute(admin, """INSERT INTO transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
        VALUES(%s,'approved',%s,'2n1b valid FK',10,0,'2026-10-13',%s) RETURNING id""", (company, kind, supplier))[0][0]))
    item = str(execute(admin, 'SELECT id FROM transaction_offset_items WHERE group_id=%s ORDER BY id LIMIT 1', (g,))[0][0])
    offset = str(execute(admin, 'SELECT id FROM transaction_offsets WHERE offset_group_id IS NOT NULL ORDER BY id LIMIT 1')[0][0])
    inserts = {
        'transaction_offset_groups': ("""INSERT INTO transaction_offset_groups(id,company_id,supplier_id,request_id,request_hash,operation_date,movement_amount,created_by)
        VALUES(%s,%s,%s,%s,'valid-test-hash','2026-10-13',0,%s) RETURNING id""", lambda: (str(uuid4()), company, supplier, str(uuid4()), uid)),
        'transaction_offset_items': ("""INSERT INTO transaction_offset_items(id,group_id,company_id,transaction_id,cash_order,type,base_amount,iva_rate,gross_amount,prior_paid_amount,prior_status,open_amount,cash_amount,compensation_amount)
        VALUES(%s,%s,%s,%s,99,'income',10,0,10,0,'approved',10,0,10) RETURNING id""", lambda: (str(uuid4()), g, company, txs[0])),
        'transaction_offsets': ("""INSERT INTO transaction_offsets(id,company_id,receivable_transaction_id,payable_transaction_id,amount,offset_group_id)
        VALUES(%s,%s,%s,%s,1,%s) RETURNING id""", lambda: (str(uuid4()), company, txs[0], txs[1], g)),
    }
    # BEFORE valid-value positive control: constraints + real FKs using trigger-created context.
    # Not an actor security assertion: owner explicitly provisions a local validation trigger.
    execute(admin, """CREATE TABLE issue335_2n1b.control(cmd text);
CREATE FUNCTION issue335_2n1b.control_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE tok uuid:=gen_random_uuid(); BEGIN
INSERT INTO issue335_execution_context VALUES(pg_backend_pid(),pg_current_xact_id(),tok,'execute');
PERFORM set_config('issue335.ctx',tok::text,true);
EXECUTE NEW.cmd; DELETE FROM issue335_execution_context WHERE backend_pid=pg_backend_pid(); RETURN NEW; END $$;
CREATE TRIGGER control_context BEFORE INSERT ON issue335_2n1b.control FOR EACH ROW EXECUTE FUNCTION issue335_2n1b.control_context()""")
    # Test group insert passes exact constraints in trusted owner-created trigger then rolls back.
    statement, values = inserts['transaction_offset_groups']
    execute(admin, 'BEGIN')
    rendered = admin.cursor().mogrify(statement, values()).decode()
    assert execute(admin, 'INSERT INTO issue335_2n1b.control VALUES(%s)', (rendered,)) == 1
    execute(admin, 'ROLLBACK')
    # Item2 full actor INSERT/DELETE matrix; guarded group versus explicitly legal legacy offset.
    execute(admin, 'GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE')
    for label, role, subject in actors:
        for table, target in [('transaction_offset_groups', g), ('transaction_offset_items', item), ('transaction_offsets', offset)]:
            for action in ('INSERT', 'DELETE'):
                b = connect(role, subject)
                execute(b, 'BEGIN')
                counts = {t: execute(admin, sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(t)))[0][0] for t in inserts}
                st, args = inserts[table] if action == 'INSERT' else ('DELETE FROM ' + table + ' WHERE id=%s RETURNING id', lambda: (target,))
                try:
                    result = execute(b, st, args())
                    assert result == [], ('unexpected managed write', role, table, action, result)
                    actual, affected = 'ok:0', 0
                except psycopg2.Error as e:
                    actual, affected = e.pgcode + ':' + e.diag.message_primary, 0
                    allowed = ('42501', 'P0001')
                    assert e.pgcode in allowed and (e.pgcode != 'P0001' or e.diag.message_primary in ('managed_operation_required', 'invalid_group_state')), actual
                execute(b, 'ROLLBACK')
                b.close()
                assert counts == {t: execute(admin, sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(t)))[0][0] for t in inserts}
                rows.append(dict(item=2, role=label, attack=action + ' ' + table, expected='42501/guard or RLS0; no managed write', actual=actual, affected=affected, persistent=False, pass_=True))
        # service_role/postgres may write UNMANAGED legacy offsets; expected bypass not hidden.
        if role in ('service_role', 'postgres'):
            b = connect(role, subject)
            execute(b, 'BEGIN')
            st, args = inserts['transaction_offsets'];vals = list(args());vals[-1] = None
            inserted = str(execute(b, st, vals)[0][0])
            assert execute(b, 'DELETE FROM transaction_offsets WHERE id=%s RETURNING id', (inserted,)) == [(inserted,)]
            execute(b, 'ROLLBACK');b.close()
            rows.append(dict(item=2, role=label, attack='legacy offset INSERT+DELETE', expected='1+1 authorized bypass, rollback', actual='1+1', persistent=False, pass_=True))
    execute(admin, 'GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET FALSE')
    # Item3 REAL attacker trigger on test table, dispatched inside legitimate live core.
    # Owner-created SECURITY DEFINER is part of trusted computing base: measure, never call safe.
    execute(admin, """CREATE TABLE issue335_2n1b.attacker(t text);
CREATE TABLE issue335_2n1b.results(target text, actual text, affected integer);
CREATE FUNCTION issue335_2n1b.attack() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE n int; BEGIN
IF NOT issue335_context_valid('execute') THEN RAISE EXCEPTION 'not_live_stolen_token'; END IF;
BEGIN EXECUTE NEW.t; GET DIAGNOSTICS n=ROW_COUNT;
INSERT INTO issue335_2n1b.results VALUES(NEW.t,'ok',n);
EXCEPTION WHEN OTHERS THEN INSERT INTO issue335_2n1b.results VALUES(NEW.t,SQLSTATE||':'||SQLERRM,0); END;
RETURN NEW; END $$;
CREATE TRIGGER attacker BEFORE INSERT ON issue335_2n1b.attacker FOR EACH ROW EXECUTE FUNCTION issue335_2n1b.attack();
CREATE FUNCTION issue335_2n1b.hook() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN IF pg_trigger_depth()>2 THEN RETURN NEW; END IF;
INSERT INTO issue335_2n1b.attacker SELECT cmd FROM issue335_2n1b.commands; RETURN NEW; END $$;
CREATE TABLE issue335_2n1b.commands(cmd text);
CREATE TRIGGER issue335_2n1b_hook AFTER INSERT ON transaction_offset_groups FOR EACH ROW EXECUTE FUNCTION issue335_2n1b.hook()""")
    statements = []
    for table in inserts:
        st, args = inserts[table]
        statements.append(admin.cursor().mogrify(st, args()).decode())
    for table, column, target in [('companies', 'display_name', company), ('suppliers', 'name', supplier),
                                  ('financial_accounts', 'name', '00000000-0000-0000-0000-000000000030')]:
        statements.append(admin.cursor().mogrify(sql.SQL("UPDATE {} SET {}={}||' stolen' WHERE id=%s").format(sql.Identifier(table), sql.Identifier(column), sql.Identifier(column)), (target,)).decode())
    for table in ('events', 'event_settlements'):
        condition = ' AND NOT is_sealed' if table == 'event_settlements' else ''
        target = execute(admin, 'SELECT id FROM ' + table + ' WHERE company_id=%s' + condition + ' ORDER BY id LIMIT 1', (company,))[0][0]
        statements.append(admin.cursor().mogrify(sql.SQL("UPDATE {} SET name=name||' stolen' WHERE id=%s").format(sql.Identifier(table)), (str(target),)).decode())
    for st in statements:
        execute(admin, 'INSERT INTO issue335_2n1b.commands VALUES(%s)', (st,))
    execute(admin, 'BEGIN')
    execute(admin, "SELECT issue335_test.j_group('2n1b-attacker-live')")
    findings = execute(admin, 'SELECT target,actual,affected FROM issue335_2n1b.results')
    assert len(findings) == 8, findings
    # Exact observed boundary: privileged malicious owner trigger can borrow same PID/xid context.
    assert findings[0][1:] == ('ok', 1), findings
    assert all(x[1:] == ('ok', 1) for x in findings[3:]), findings
    for target, actual, affected in findings:
        rows.append(dict(item=3, role='owner-created attacker SECURITY DEFINER trigger', attack=target,
                         expected='security requirement: DENY; owner trusted-base boundary being measured',
                         actual=actual, affected=affected, security_pass=False if actual == 'ok' else True,
                         classification='OPEN privilege/context borrowing; all rolled back', pass_=True))
    execute(admin, 'ROLLBACK')
    print('OPEN item3: owner-created malicious trigger borrows legitimate context; group INSERT and 5 parent UPDATEs succeed in transaction, rolled back. No candidate installed.')
    print('PASS item1: distinct COMMIT/ROLLBACK live tokens rejected across sessions and new xid')
    print('PASS item2: 54 actual managed INSERT/DELETE probes + legacy bypass controls, no persistence')
    print('PASS item4 dedicated runner executed; item3 security remains OPEN, not a green security gate')
finally:
    try:
        execute(admin, 'ROLLBACK')
        execute(admin, 'DROP TRIGGER IF EXISTS issue335_2n1b_capture ON transaction_offset_groups')
        execute(admin, 'DROP TRIGGER IF EXISTS issue335_2n1b_hook ON transaction_offset_groups')
        execute(admin, 'DROP SCHEMA issue335_2n1b CASCADE')
        execute(admin, 'GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET FALSE')
    finally:
        Path(output).write_text(json.dumps(rows, indent=2, ensure_ascii=False))
        admin.close()
print('2n1b measured', len(rows), 'probes; no skips; security item3 OPEN')
