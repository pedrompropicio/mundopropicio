"""Fail-closed G1 scanner, with hash/line-bound rebindings of approved literals."""
import hashlib,json,pathlib,sys
from pii_patterns import pii_hits
from json_sanitizer import validate_sql
ROOT=pathlib.Path(__file__).resolve().parents[2]
H=lambda b:hashlib.sha256(b).hexdigest()
def scan(root):
 allow=json.loads((root/'supabase/baseline/live-only/pii-allowlist.json').read_text())['entries']
 matches={(e['file'],e['file_sha256'],e['line'],e['type'],e['literal_sha256'])for e in allow}
 errors=[];findings=[];accepted=0;files=list((root/'supabase/baseline').rglob('*.sql'))
 for path in files:
  raw=path.read_bytes();s=raw.decode();name=str(path.relative_to(root));digest=H(raw)
  try:validate_sql(s)
  except ValueError as error:errors.append({'file':name,'error':str(error)})
  for h in pii_hits(s):
   key=(name,digest,h['line'],h['type'],H(s[h['start']:h['end']].encode()))
   if key in matches:accepted+=1
   else:findings.append({'file':name,'line':h['line'],'type':h['type'],'literal_sha256':key[-1]})
 return {'files':len(files),'occurrences':len(findings),'findings':findings,'json_errors':errors,'reviewed_literals':accepted}
if __name__=='__main__':
 result=scan(ROOT);print(json.dumps(result));sys.exit(bool(result['occurrences']or result['json_errors']))
