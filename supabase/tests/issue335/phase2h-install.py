"""#335 fase 2h — instala o DDL gerado do catálogo de Live num PostgreSQL 17.6 LOCAL.

Cada instrução corre com SET ROLE <dono/concedente real>; os objectos do papel
postgres (NOSUPERUSER, como em Live) são criados com os privilégios desse papel.
Ordem: fases fixas; dentro de cada fase, re-tentativa determinística até não haver
progresso (resolve dependências topológicas). Falhas finais são listadas, nunca escondidas.
Uso: phase2h-install.py <socket_dir> <port> <ddl.json> <relatorio.json>
"""
import json, sys
import psycopg2

sock, port, ddl_path, report_path = sys.argv[1:]
assert sock.startswith('/tmp/'), 'apenas local'
ddl = json.load(open(ddl_path))
c = psycopg2.connect(host=sock, port=port, user='supabase_admin', dbname='postgres', sslmode='disable')
c.autocommit = True
cur = c.cursor()
cur.execute("SET check_function_bodies=off")

def run(st, as_admin=False):
    role = st['role']
    try:
        del c.notices[:]
        if role not in ('supabase_admin', 'none') and not as_admin:
            cur.execute('SET ROLE ' + '"' + role.replace('"', '""') + '"')
        cur.execute(st['sql'])
        bad = [n for n in c.notices if 'no privileges were granted' in n or 'not all privileges were granted' in n or 'no privileges could be revoked' in n]
        if bad and not st['key'].endswith(':revoke'):
            return 'WARN: ' + bad[0].strip()
        return None
    except psycopg2.Error as e:
        return f'{e.pgcode}: {e.diag.message_primary}'
    finally:
        cur.execute('RESET ROLE')

phases = {}
for st in ddl['statements']:
    if st['phase'] == '99_unsupported':
        continue
    phases.setdefault(st['phase'], []).append(st)
# tabelas, funções e views dependem entre si: tratadas como um bloco com re-tentativa
blocks = [['00_roles'], ['01_members'], ['02_schemas'], ['03_schema_acl'], ['04_extensions'],
          ['05_types', '06_sequences', '07_tables', '09_functions', '10_views'], ['08_dropped_columns'], ['09_functions_meta'],
          ['17_acl_tables', '17_acl_seq', '17_acl_functions'], ['18_acl_columns'],
          ['11_defaults'], ['12_seq_owned'], ['13_constraints'], ['13_constraints_fk'], ['14_rls'], ['15_indexes'],
          ['16_triggers'], ['16_triggers_state'], ['16_policies'],
          ['19_default_acl']]
known = {p for b in blocks for p in b}
assert set(phases) <= known, set(phases) - known
failed = []
stats = {}
admin_fallback = []
owner_of = {}
for st in ddl['statements']:
    if st['key'].endswith(':revoke'):
        owner_of[st['key'][:-len(':revoke')]] = st['role']
carry = []
for block in blocks:
    pending = carry + [st for p in block for st in phases.get(p, [])]
    # ACL: REVOKE de reposição primeiro; depois GRANTs do dono; depois concedentes derivados.
    def order(st):
        k = st['key']
        if k.endswith(':revoke'):
            return 0
        obj = k.rsplit(':', 3)[0] if k.split(':')[0] in ('schema', 'tacl', 'vacl', 'sacl', 'facl') else None
        return 1 if obj is None or owner_of.get(obj) == st['role'] else 2
    pending.sort(key=order)
    passes = 0
    nxt = []
    while pending:
        passes += 1
        nxt = []
        for st in pending:
            err = run(st)
            if err:
                nxt.append((st, err))
        if len(nxt) == len(pending):
            break
        pending = [s for s, _ in nxt]
    carry = [s for s, _ in nxt]
    last_err = {s['key']: e for s, e in nxt}
    stats['+'.join(block)] = dict(total=sum(len(phases.get(p, [])) for p in block), passes=passes, carried=len(carry))
# Fallback documentado: funções cuja criação exige superuser (proconfig com GUC SUSET) são
# criadas pelo administrador e depois entregues ao dono real.
rest = []
for st in carry:
    if st['phase'] == '09_functions' and last_err[st['key']].startswith('42501: permission denied to set parameter'):
        err = run(st, as_admin=True)
        if not err:
            sig = st['key'].split(':', 1)[1]
            err = run(dict(role='supabase_admin', key='own', sql=f'ALTER ROUTINE {sig} OWNER TO "{st["role"]}"'))
            if not err:
                admin_fallback.append(st['key'])
                continue
        last_err[st['key']] = err
    rest.append(st)
failed = [dict(phase=s['phase'], key=s['key'], role=s['role'], error=last_err[s['key']]) for s in rest]
cur.execute("SELECT rolsuper FROM pg_roles WHERE rolname='postgres'")
assert cur.fetchone()[0] is False, 'postgres tem de ser NOSUPERUSER como em Live'
json.dump(dict(stats=stats, admin_fallback=admin_fallback, failed=failed), open(report_path, 'w'), ensure_ascii=False, indent=1)
print('phase2h install:', sum(v['total'] for v in stats.values()), 'statements;', len(failed), 'failed')
for f in failed[:60]:
    print(' FAIL', f['key'], f['error'][:160])
