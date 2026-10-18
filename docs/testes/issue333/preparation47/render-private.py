"""INERT renderer only: no network, Auth, login or database connection.
Usage: python3 render-private.py /tmp/private-params.json /tmp/private-output.sql
Inputs must be locally assembled from the NEW AuthAdmin response + controller pre-reads.
"""
import json, os, sys
from pathlib import Path
from uuid import UUID
if len(sys.argv) != 3:
    raise SystemExit('Expected private input and output paths under /tmp')
source, target = (Path(x).resolve() for x in sys.argv[1:])
if not str(source).startswith('/tmp/') or not str(target).startswith('/tmp/'):
    raise SystemExit('Private paths must remain under /tmp')
p = json.loads(source.read_text())
keys = {'company_id','owner_id','role_id','attempt_id','destination_id','email','created_at','window_start','window_end','fixture_marker'}
if set(p) != keys or not all(isinstance(v, str) for v in p.values()):
    raise SystemExit('Exact parameter set required; no credentials accepted')
for k in ('company_id','owner_id','role_id','attempt_id','destination_id'):
    if str(UUID(p[k])) != p[k]:
        raise SystemExit('Canonical UUID required')
template = Path(__file__).with_name('prepare-fixture.INERTE.sql').read_text()
if template.count("'__PARAMETERS_JSON__'") != 1:
    raise SystemExit('Template placeholder mismatch')
rendered = template.replace("'__PARAMETERS_JSON__'", "'" + json.dumps(p, ensure_ascii=True).replace("'", "''") + "'")
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(rendered)
print('Private SQL rendered; not executed')
