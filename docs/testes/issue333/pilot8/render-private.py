"""Inert exact DECLARE renderer. No network, database, credentials or activation."""
import json, os, re, sys
from pathlib import Path
from uuid import UUID
def render(p, template):
    keys = {'owner_id','company_id','role_id','email','fixture_marker','created_at','window_start','window_end','document_sha256','document_size','document_mime','invoice_number'}
    if set(p) != keys or any(not isinstance(v, str) for v in p.values()):
        raise ValueError('Exact string parameters required; credentials forbidden')
    for k in ('owner_id','company_id','role_id'):
        if str(UUID(p[k])) != p[k]: raise ValueError('Canonical UUID required')
    needle = " p jsonb := '__PARAMETERS_JSON__'::jsonb;"
    if template.count(needle) != 1: raise ValueError('Exact DECLARE assignment required')
    return template.replace(needle, " p jsonb := '" + json.dumps(p, ensure_ascii=True).replace("'", "''") + "'::jsonb;")
if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('Expected /tmp parameters and /tmp output')
    source, target = [Path(x).resolve() for x in sys.argv[1:]]
    if any(not str(x).startswith('/tmp/') for x in (source,target)): raise SystemExit('Private /tmp paths only')
    data = render(json.loads(source.read_text()), Path(__file__).with_name('activation.INERTE.sql').read_text())
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd,'w') as f: f.write(data)
    print('Rendered exact DECLARE; not executed')