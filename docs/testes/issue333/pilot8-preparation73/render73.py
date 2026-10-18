"""LOCAL renderer only. No credentials/network/SQL execution. New templates, never render64."""
import hashlib, json, os, re, sys
from pathlib import Path
from uuid import UUID
from datetime import datetime
RETIRED = {'issue333-pilot8-916bd3976502472ab18f39ea0adf7589','issue333-pilot8-11af044ae28127538fe8cc06be67541a'}
COMPANY = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
def stamp(v):
    d=datetime.fromisoformat(v.replace('Z','+00:00'))
    if d.tzinfo is None: raise ValueError('timezone required')
    return d
def validate(m):
    marker=m['marker']
    if not re.fullmatch(r'issue333-pilot8-[a-f0-9]{32}',marker) or marker in RETIRED: raise ValueError('marker refused')
    if m['email']!=marker+'@fixture.invalid' or m['reference']!='FICTICIO-'+marker or m['company']!=COMPANY: raise ValueError('scope refused')
    if not isinstance(m['full_name'],str) or not m['full_name'].strip(): raise ValueError('name required')
    if m['sha256']!='8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f' or m['size']!=1517 or m['mime']!='application/pdf': raise ValueError('approved PDF required')
    pdf=Path(m['pdf']).resolve()
    if not str(pdf).startswith('/tmp/') or pdf.stat().st_mode & 0o777 != 0o600: raise ValueError('private PDF required')
    data=pdf.read_bytes()
    if len(data)!=m['size'] or hashlib.sha256(data).hexdigest()!=m['sha256']: raise ValueError('PDF drift')
def parameters(m,identity=None,window=None):
    validate(m)
    p=dict(company_id=m['company'],fixture_marker=m['marker'],email=m['email'],full_name=m['full_name'],document_sha256=m['sha256'],document_size=m['size'],document_mime=m['mime'],invoice_number=m['reference'])
    p.update(owner_id='PLACEHOLDER-UUID-OWNER',role_id='PLACEHOLDER-UUID-ROLE',created_at='PLACEHOLDER-EXACT-CREATED-AT',window_start='PLACEHOLDER-ACTIVATION-START',window_end='PLACEHOLDER-ACTIVATION-END')
    if identity:
        for k in ['owner_id','role_id']:
            if str(UUID(identity[k]))!=identity[k]: raise ValueError('canonical UUID required')
        stamp(identity['created_at']);p.update({k:identity[k] for k in ['owner_id','role_id','created_at']})
    if window:
        start,end=map(stamp,window)
        if not 0<(end-start).total_seconds()<=600: raise ValueError('activation window <=600s')
        p.update(window_start=window[0],window_end=window[1])
    return p
def render(kind,m,identity=None,window=None):
    if kind not in ['activation','revoke']: raise ValueError('template refused')
    template=Path(__file__).with_name(kind+'.INERTE.sql').read_text()
    if template.count('__MANIFEST73_PARAMETERS__')!=1 or re.search(r'issue333-pilot8-[a-f0-9]{32}',template): raise ValueError('template drift/embedded marker')
    return template.replace('__MANIFEST73_PARAMETERS__',json.dumps(parameters(m,identity,window),ensure_ascii=True).replace("'","''"))
if __name__=='__main__':
    kind,src,out=sys.argv[1:4]
    if not all(str(Path(p).resolve()).startswith('/tmp/') for p in [src,out]): raise SystemExit('/tmp only')
    m=json.loads(Path(src).read_text());identity=json.loads(Path(sys.argv[4]).read_text()) if len(sys.argv)>4 else None
    window=sys.argv[5:7] if len(sys.argv)==7 else None
    result=render(kind,m,identity,window)
    fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(result)
    print('rendered INERT only; placeholders require controller review')