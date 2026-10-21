"""LOCAL ONLY: complete catalog before/after twelve inert candidate pairs."""
import json
import sys
from pathlib import Path
import psycopg2

sock, port, root, output = sys.argv[1:]
assert sock.startswith('/tmp/'), 'local socket only'
root = Path(root)
out = Path(output)
out.mkdir(parents=True, exist_ok=True)
c = psycopg2.connect(host=sock, port=port, user='postgres', dbname='postgres', sslmode='disable')
c.autocommit = True
capture = (root / 'supabase/tests/issue335/live/phase2h-capture.sql').read_text()

def snapshot():
    with c.cursor() as q:
        q.execute(capture)
        v = json.loads(q.fetchone()[0])
        for rows in v.values():
            if not isinstance(rows, list):
                continue
            for row in rows:
                if isinstance(row, dict) and isinstance(row.get('acl'), str):
                    row['acl'] = '{' + ','.join(sorted(row['acl'].strip('{}').split(','))) + '}'
            rows.sort(key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
        return v

before = snapshot()
(out / 'before.json').write_text(json.dumps(before, indent=2, ensure_ascii=False))
names = ['offset_group_storage', 'offset_core', 'offset_invariants', 'offset_balance', 'offset_approval',
         'status', 'offset_kill_switch', 'emergency', 'reactivation', 'cash_position', 'cash_position_invariant', 'restore']
with c.cursor() as q:
    q.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')
    assert q.fetchone()[0] is False
    for n in names:
        q.execute((root / f'supabase/manual/20261021_issue335_{n}.INERTE.sql').read_text())
        print('installed local', n)
    for n in reversed(names):
        q.execute((root / f'supabase/manual/20261021_issue335_{n}.ROLLBACK-INERTE.sql').read_text())
        print('rolled back local', n)
after = snapshot()
(out / 'after.json').write_text(json.dumps(after, indent=2, ensure_ascii=False))
diff = {k: {'before': before.get(k), 'after': after.get(k)} for k in before.keys() | after.keys()
        if before.get(k) != after.get(k)}
(out / 'differences.json').write_text(json.dumps(diff, indent=2, ensure_ascii=False))
assert not diff, 'full catalog differs: ' + ','.join(diff)
print('PASS 2l full capture equality: owners/ACL/memberships/roles/types/defaults/indexes/RI/triggers/policies/functions/views')
c.close()