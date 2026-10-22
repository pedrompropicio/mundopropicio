"""#335 E: LOCAL ONLY valid-value probes; unavailable/invalid evidence fails acceptance, never skips.

Run against a faithful installed suite socket and a separate untouched catalog socket.
All changes are local transactions/savepoints; retain every attempted result and error origin.
"""
import json
import sys
from collections import Counter
from pathlib import Path

import psycopg2
from psycopg2 import sql

sock, port, baseline_sock, baseline_port, root, output = sys.argv[1:]
assert sock.startswith('/tmp/') and baseline_sock.startswith('/tmp/'), 'local sockets only'
root = Path(root)
out = Path(output)
out.parent.mkdir(parents=True, exist_ok=True)

def connect(s, p):
    c = psycopg2.connect(host=s, port=p, user='postgres', dbname='postgres', sslmode='disable')
    c.autocommit = True
    with c.cursor() as q:
        q.execute('SELECT version(),rolsuper FROM pg_roles WHERE rolname=current_user')
        version, superuser = q.fetchone()
        assert 'PostgreSQL 17.6 ' in version and superuser is False
    return c

installed = connect(sock, port)
baseline = connect(baseline_sock, baseline_port)
COMPANY = '00000000-0000-0000-0000-000000000001'
ADMIN = '00000000-0000-0000-0000-000000000010'
ACTORS = {'manager': '00000000-0000-0000-0000-000000000016',
          'editor': '00000000-0000-0000-0000-000000000017'}

def uid(n):
    return f'60000000-0000-0000-0000-{n:012d}'

def execute(c, statement, params=None):
    with c.cursor() as q:
        q.execute(statement, params)
        return q.fetchall() if q.description else q.rowcount

def actor(c, user):
    execute(c, "SELECT set_config('request.jwt.claim.sub',%s,false)", (user,))

# The baseline gets precisely the existing credential-free fixtures, real Auth triggers included.
assert execute(baseline, "SELECT to_regclass('public.transaction_offset_groups')")[0][0] is None
# psql meta-commands/reference statements are handled by baseline shell preparation.
assert execute(baseline, 'SELECT count(*) FROM public.companies WHERE id=%s', (COMPANY,))[0][0] == 1

def setup(c, grouped):
    actor(c, ADMIN)
    if execute(c, 'SELECT count(*) FROM public.transactions WHERE id=%s', (uid(20),))[0][0]:
        payment_id = execute(c, "SELECT id::text FROM public.transaction_payments WHERE transaction_id=%s AND payment_method='transfer'", (uid(20),))[0][0]
        group_id = execute(c, 'SELECT offset_group_id::text FROM public.transaction_payments WHERE id=%s', (payment_id,))[0][0] if grouped else None
        return group_id, payment_id
    execute(c, 'BEGIN')
    execute(c, 'SET LOCAL ROLE service_role')
    for role, user in ACTORS.items():
        execute(c, 'INSERT INTO public.user_roles(user_id,role,company_id) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING', (user, role, COMPANY))
    execute(c, "INSERT INTO public.suppliers(id,company_id,name) VALUES(%s,%s,'LOCAL E reference')", (uid(1), COMPANY))
    execute(c, "INSERT INTO public.events(id,company_id,name,date,budget_mode,event_nature) VALUES(%s,%s,'LOCAL E event','2026-10-13','without_bp','producao_propria')", (uid(2), COMPANY))
    execute(c, "INSERT INTO public.events(id,company_id,name,date,budget_mode,event_nature) VALUES(%s,%s,'LOCAL E alternate event','2026-10-13','without_bp','producao_propria')", (uid(12), COMPANY))
    execute(c, "INSERT INTO public.event_settlements(id,company_id,event_id,name,is_sealed) VALUES(%s,%s,%s,'LOCAL E closing',false)", (uid(3), COMPANY, uid(2)))
    execute(c, "INSERT INTO public.event_partners(id,company_id,event_id,supplier_id) VALUES(%s,%s,%s,%s)", (uid(4), COMPANY, uid(2), uid(1)))
    execute(c, "INSERT INTO public.supplier_credits(id,company_id,supplier_id,amount,reason) VALUES(%s,%s,%s,100,'LOCAL E reference')", (uid(5), COMPANY, uid(1)))
    execute(c, "INSERT INTO public.cache_payment_contracts(id,company_id,root_event_id,artist_supplier_id,beneficiary_supplier_id,gross,withholding_applies) VALUES(%s,%s,%s,%s,%s,100,false)", (uid(6), COMPANY, uid(2), uid(1), uid(1)))
    execute(c, "INSERT INTO public.ticket_office_settlements(id,company_id,event_id,financial_account_id,created_by) VALUES(%s,%s,%s,'00000000-0000-0000-0000-000000000030',%s)", (uid(7), COMPANY, uid(2), ADMIN))
    execute(c, "INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,iva_rate) VALUES(%s,%s,%s,'00000000-0000-0000-0000-000000000052','income','LOCAL E forecast',1000,0)", (uid(8), COMPANY, uid(2)))
    execute(c, "INSERT INTO public.financial_accounts(id,company_id,name,type) VALUES(%s,%s,'LOCAL E card','prepaid_card')", (uid(11), COMPANY))
    execute(c, "INSERT INTO public.card_sessions(id,company_id,card_account_id,holder_name,status) VALUES(%s,%s,%s,'LOCAL E holder','open')", (uid(9), COMPANY, uid(11)))
    execute(c, "INSERT INTO public.payment_lists(id,company_id,title,status) VALUES(%s,%s,'LOCAL E list','draft')", (uid(10), COMPANY))
    execute(c, 'RESET ROLE')
    for n, amount in [(20, 100), (21, 40), (22, 100), (23, 50)]:
        execute(c, "INSERT INTO public.transactions(id,company_id,status,type,description,amount,iva_rate,date,supplier_id,event_id,account_id,payment_method) VALUES(%s,%s,'approved',%s,%s,%s,0,'2026-10-13','00000000-0000-0000-0000-000000000020',%s,'00000000-0000-0000-0000-000000000030','transfer')", (uid(n), COMPANY, 'expense' if n == 21 else 'income', f'LOCAL E {n}', amount, uid(2)))
    execute(c, "INSERT INTO public.transaction_payments(id,transaction_id,company_id,amount,payment_date,account_id) VALUES(%s,%s,%s,10,'2026-10-13','00000000-0000-0000-0000-000000000030')", (uid(30), uid(22), COMPANY))
    group_id = None
    payment_id = uid(31)
    if grouped:
        execute(c, 'SET LOCAL ROLE authenticated')
        result = execute(c, "SELECT public.transaction_offset_execute(%s,'00000000-0000-0000-0000-000000000020',%s::jsonb,'{\"account_id\":\"00000000-0000-0000-0000-000000000030\",\"date\":\"2026-10-13\",\"amount\":60}', '2026-10-13')", (uid(40), json.dumps([{'transaction_id': uid(20), 'mode': 'settle'}, {'transaction_id': uid(21), 'mode': 'offset'}])))[0][0]
        group_id = result['group_id']
        payment_id = execute(c, "SELECT id::text FROM public.transaction_payments WHERE transaction_id=%s AND payment_method='transfer'", (uid(20),))[0][0]
        execute(c, 'RESET ROLE')
    else:
        execute(c, "INSERT INTO public.transaction_payments(id,transaction_id,company_id,amount,payment_date,account_id) VALUES(%s,%s,%s,100,'2026-10-13','00000000-0000-0000-0000-000000000030')", (uid(31), uid(20), COMPANY))
    execute(c, 'COMMIT')
    return group_id, payment_id

def columns(c, table):
    return execute(c, "SELECT column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position", (table,))

protected = set('id reversed_at reversal_kind amount iva_rate supplier_id company_id type forecast_id event_id is_hidden event_settlement_id currency fx_rate original_amount installment_group_id installment_number installment_total card_session_id held_by_supplier_id settlement_id is_transitory supplier_credit_id parent_transaction_id is_reimbursement cache_contract_id shared_cost_account_id declared_withholding_amount declared_withholding_rate split_percentage split_amount split_mode payment_method reversed_by reversal_reason paying_partner_id ordering_partner_id shared_cost_counterparty_id category_id exclude_from_result cache_role cache_root_event_id cache_artist_supplier_id operation_key invoice_group_id transitory_reason account_id status payment_date paid_amount'.split())
special = {
    'supplier_id': uid(1), 'shared_cost_counterparty_id': uid(1), 'held_by_supplier_id': uid(1),
    'cache_artist_supplier_id': uid(1), 'event_id': uid(12), 'cache_root_event_id': uid(2),
    'event_settlement_id': uid(3), 'ordering_partner_id': uid(4), 'paying_partner_id': uid(4),
    'supplier_credit_id': uid(5), 'cache_contract_id': uid(6), 'settlement_id': uid(7),
    'forecast_id': uid(8), 'card_session_id': uid(9), 'payment_list_id': uid(10),
    'parent_transaction_id': uid(23), 'transaction_id': uid(23),
    'category_id': '00000000-0000-0000-0000-000000000052',
    'account_id': '00000000-0000-0000-0000-000000000031',
    'shared_cost_account_id': '00000000-0000-0000-0000-000000000031',
    'company_id': '00000000-0000-0000-0000-000000000002',
    'reversed_by': ADMIN, 'payment_entity': '12345', 'payment_reference': '123456789',
    'payment_method': 'direct_debit', 'currency': 'USD', 'reversal_kind': 'cash_refund',
    'transitory_reason': 'repasse', 'cache_role': 'artist_balance', 'operation_key': 'E-335',
    'split_mode': 'absolute', 'iban_override': 'PT50000201231234567890154',
    'invoice_group_id': uid(60), 'installment_group_id': uid(61), 'id': uid(62),
}

def value(c, table, column, udt, row_id):
    old = execute(c, sql.SQL('SELECT {} FROM public.{} WHERE id=%s').format(sql.Identifier(column), sql.Identifier(table)), (row_id,))[0][0]
    if column == 'status':
        return 'cancelled' if table == 'transaction_payments' else 'overdue'
    if column == 'type':
        return 'expense' if old == 'income' else 'income'
    if column == 'paid_amount':
        return max(0, (old or 0) - 1)
    if column == 'offset_id':
        candidates = execute(c, 'SELECT id FROM public.transaction_offsets ORDER BY id LIMIT 1')
        return candidates[0][0] if candidates else None
    if column in ('offset_group_id', 'offset_item_id'):
        return None  # new linkage columns: unlink is a concrete attack, not legacy-column coverage
    if column in special:
        return special[column]
    if udt == 'bool':
        return not bool(old)
    if udt in ('numeric', 'int4', 'int8', 'float8'):
        return 6 if column == 'iva_rate' else (old or 0) + 1
    if udt == 'uuid':
        return uid(63)
    if udt == 'date':
        return '2026-10-14'
    if udt == 'timestamptz':
        return '2026-10-14T12:00:00Z'
    if udt in ('text', 'varchar'):
        return f'LOCAL E {column}'
    raise AssertionError(f'unhandled type {table}.{column}: {udt}')

def origin(e):
    ctx = e.diag.context or ''
    if 'issue335_guard()' in ctx:
        return 'guarda #335'
    if e.pgcode == '42501':
        return 'RLS/ACL' if not ctx else 'trigger legado/permissão'
    if e.diag.constraint_name:
        return 'constraint ' + e.diag.constraint_name
    return 'trigger legado' if ctx else 'SQL/constraint'

def snapshot(c, table, row_id):
    return execute(c, sql.SQL('SELECT to_jsonb(t) FROM public.{} t WHERE id=%s').format(sql.Identifier(table)), (row_id,))[0][0]

def probe(c, table, col, val, user, row_id, op='UPDATE'):
    actor(c, user)
    execute(c, 'BEGIN')
    before = snapshot(c, table, row_id)
    execute(c, 'SET LOCAL ROLE authenticated')
    try:
        if op == 'UPDATE':
            n = execute(c, sql.SQL('UPDATE public.{} SET {}=%s WHERE id=%s').format(sql.Identifier(table), sql.Identifier(col)), (val, row_id))
        elif op == 'DELETE':
            n = execute(c, sql.SQL('DELETE FROM public.{} WHERE id=%s').format(sql.Identifier(table)), (row_id,))
        else:
            assert op == 'INSERT'
            obj = dict(before)
            obj['id'] = uid(70)
            if col is not None:
                obj[col] = val
            n = execute(c, sql.SQL('INSERT INTO public.{} SELECT (jsonb_populate_record(NULL::public.{},%s::jsonb)).*').format(sql.Identifier(table), sql.Identifier(table)), (json.dumps(obj),))
        execute(c, 'RESET ROLE')
        lookup_id = val if op == 'UPDATE' and col == 'id' else row_id if op == 'UPDATE' else uid(70)
        after = None if op == 'DELETE' else snapshot(c, table, lookup_id)
        changed = [] if after is None else [k for k in before if before[k] != after.get(k)]
        return {'state': '00000' if n == 1 else 'ROW_FILTERED', 'origin': 'permitido' if n == 1 else 'RLS linha não atingida', 'message': '', 'rowcount': n, 'changed': changed, 'effective': after}
    except psycopg2.Error as e:
        return {'state': e.pgcode, 'origin': origin(e), 'message': e.diag.message_primary, 'context': e.diag.context, 'constraint': e.diag.constraint_name, 'rowcount': 0}
    finally:
        execute(c, 'ROLLBACK')

rows = []
findings = []
try:
    gid, mp = setup(installed, True)
    _, bp = setup(baseline, False)
    for table in ('transactions', 'transaction_payments'):
        livecols = columns(baseline, table)
        installedcols = columns(installed, table)
        assert [r[0] for r in installedcols if r[0] not in ('offset_group_id', 'offset_item_id')] == [r[0] for r in livecols]
        for col, udt, nullable in installedcols:
            for role, user in ACTORS.items():
                legacy_id = uid(22) if table == 'transactions' else uid(30)
                managed_id = uid(20) if table == 'transactions' else mp
                is_new = col in ('offset_group_id', 'offset_item_id')
                val = value(installed, table, col, udt, managed_id)
                expected = 'recusado' if table == 'transaction_payments' or col in protected else 'permitido-inofensivo'
                reason = 'perna gerida imutável fora do estorno integral' if table == 'transaction_payments' else ('identidade/valor/estado/elegibilidade/saldo ou ligação protegida' if col in protected else 'metadado não lido pelo cálculo de dinheiro nem pelo estorno; verificar efeito real')
                blegacy = None if is_new else probe(baseline, table, col, val, user, legacy_id)
                alegacy = probe(installed, table, col, val, user, legacy_id)
                bmanaged = None if is_new else probe(baseline, table, col, val, user, uid(20) if table == 'transactions' else bp)
                amanaged = probe(installed, table, col, val, user, managed_id)
                parity = is_new or (blegacy['state'], blegacy['origin'], blegacy['message']) == (alegacy['state'], alegacy['origin'], alegacy['message'])
                valid = is_new or bmanaged['state'] == '00000'
                correct = amanaged['origin'] == 'guarda #335' if expected == 'recusado' else amanaged['state'] == '00000'
                if bmanaged and bmanaged['state'] == '00000' and col not in bmanaged['changed']:
                    valid = False  # no-op or a value normalized back by a legacy trigger is not an attack
                verdict = 'PASS' if parity and valid and correct else 'ABERTO'
                if verdict != 'PASS':
                    findings.append({'table': table, 'column': col, 'role': role, 'parity': parity, 'valid_same_state_without_guard': valid, 'expected_observed': correct})
                rows.append({'table': table, 'column': col, 'role': role, 'operation': 'UPDATE', 'value': str(val), 'expected_group': expected, 'reason': reason, 'without_group_before': blegacy, 'without_group_after': alegacy, 'with_group_state_before_no_335': bmanaged, 'with_group_after': amanaged, 'legacy_parity': parity, 'valid_same_state_without_guard': valid, 'verdict': verdict})
        for role, user in ACTORS.items():
            for op in ('INSERT', 'DELETE'):
                leg = uid(22) if table == 'transactions' else uid(30)
                managed = uid(20) if table == 'transactions' else mp
                b = probe(baseline, table, None, None, user, leg, op)
                a = probe(installed, table, None, None, user, leg, op)
                m = probe(installed, table, None, None, user, managed, op)
                rows.append({'table': table, 'column': '*row*', 'role': role, 'operation': op, 'without_group_before': b, 'without_group_after': a, 'with_group_after': m, 'legacy_parity': (a['state'], a['message']) == (b['state'], b['message']), 'verdict': 'OBSERVAÇÃO; INSERT não é ataque coluna-a-coluna'})
    result = {'status': 'FECHADO' if not findings else 'ABERTO', 'rows': rows, 'findings': findings, 'skips': 0,
              'origins': dict(Counter(x[k]['origin'] for x in rows for k in ('without_group_before', 'without_group_after', 'with_group_state_before_no_335', 'with_group_after') if x.get(k))),
              'limits': ['INSERT/DELETE por linha, não por coluna; baseline twin de grupo sem links é controlo de validade, não um grupo aplicado sem #335', 'successful metadata probes record effective full row; end-to-end reverse and related-row parity still require explicit proof']}
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False, default=str) + '\n')
    print(json.dumps({'status': result['status'], 'rows': len(rows), 'open': len(findings), 'skips': 0, 'origins': result['origins']}, ensure_ascii=False))
    assert not findings, 'E acceptance OPEN: see per-column findings; no skipped cases promoted to PASS'
finally:
    installed.close()
    baseline.close()