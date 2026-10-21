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

def run(st):
    role = st['role']
    try:
        if role not in ('supabase_admin', 'none'):
            cur.execute('SET ROLE ' + '"' + role.replace('"', '""') + '"')
        cur.execute(st['sql'])
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
          ['05_types', '06_sequences', '07_tables', '09_functions', '10_views'], ['09_functions_meta'],
          ['11_defaults'], ['12_seq_owned'], ['13_constraints'], ['13_constraints_fk'], ['14_rls'], ['15_indexes'],
          ['16_triggers'], ['16_triggers_state'], ['16_policies'],
          ['17_acl_tables', '17_acl_seq', '17_acl_functions'], ['18_acl_columns'], ['19_default_acl']]
known = {p for b in blocks for p in b}
assert set(phases) <= known, set(phases) - known
failed = []
stats = {}
for block in blocks:
    pending = [st for p in block for st in phases.get(p, [])]
    passes = 0
    while pending:
        passes += 1
        nxt = []
        for st in pending:
            err = run(st)
            if err:
                nxt.append((st, err))
        if len(nxt) == len(pending):
            failed += [dict(phase=s['phase'], key=s['key'], role=s['role'], error=e) for s, e in nxt]
            break
        pending = [s for s, _ in nxt]
    stats['+'.join(block)] = dict(total=sum(len(phases.get(p, [])) for p in block), passes=passes)
cur.execute("SELECT rolsuper FROM pg_roles WHERE rolname='postgres'")
assert cur.fetchone()[0] is False, 'postgres tem de ser NOSUPERUSER como em Live'
json.dump(dict(stats=stats, failed=failed), open(report_path, 'w'), ensure_ascii=False, indent=1)
print('phase2h install:', sum(v['total'] for v in stats.values()), 'statements;', len(failed), 'failed')
for f in failed[:60]:
    print(' FAIL', f['key'], f['error'][:160])
