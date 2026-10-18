"""Inert renderer prova64. No network/DB/credentials. Identity = exact checkpoint63 (private /tmp);
window = activation moment only (<=10 min). Writes /tmp 0600; never executes."""
import json, os, re, sys
from pathlib import Path
from uuid import UUID
from datetime import datetime
LINE = re.compile(r" p jsonb := '\{[^\n]*\}'::jsonb;")
def render(template, owner, role, created_at, ws, we):
    for v in (owner, role):
        if str(UUID(v)) != v: raise ValueError('canonical UUID')
    datetime.fromisoformat(created_at.replace('Z', '+00:00'))
    if len(LINE.findall(template)) != 1: raise ValueError('exact DECLARE')
    p = json.loads(LINE.search(template).group(0)[len(" p jsonb := '"):-len("'::jsonb;")])
    p.update(owner_id=owner, role_id=role, created_at=created_at, window_start=ws, window_end=we)
    return LINE.sub(lambda _: " p jsonb := '" + json.dumps(p, ensure_ascii=True).replace("'", "''") + "'::jsonb;", template)
if __name__ == '__main__':
    # usage: render64.py <activation|revoke> /tmp/params.json /tmp/out.sql [window_start window_end]
    kind, src, out = sys.argv[1:4]
    ws, we = (sys.argv[4:6] if len(sys.argv) == 6 else ('PLACEHOLDER-ISO8601-INICIO', 'PLACEHOLDER-ISO8601-FIM-MAX-10MIN'))
    if not all(str(Path(x).resolve()).startswith('/tmp/') for x in (src, out)): raise SystemExit('/tmp only')
    prm = json.loads(Path(src).read_text())
    tpl = Path(__file__).with_name(f'{kind}.INERTE.sql').read_text()
    data = render(tpl, prm['owner_id'], prm['role_id'], prm['created_at'], ws, we)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f: f.write(data)
    print('rendered; not executed')
