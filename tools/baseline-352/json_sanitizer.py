"""Type-preserving JSON PII redaction; never replaces a JSON document with a text placeholder."""
import json,re,uuid,hashlib,hmac,pathlib
LITERAL=re.compile(r"'(?:''|\\.|[^'])*'",re.S)
def private_salt():
 p=pathlib.Path(__file__).resolve().parents[2]/'.replay-private/identity-salt'
 salt=bytes.fromhex(p.read_text().strip())
 if len(salt)!=32:raise ValueError('invalid private replay salt')
 return salt

def synthetic_uuid(original,salt=None):
 salt=private_salt() if salt is None else salt
 if len(salt)!=32:raise ValueError('invalid private replay salt')
 value=str(uuid.UUID(original)).lower().encode()
 return str(uuid.UUID(bytes=hmac.new(salt,b'mp352-identity-v1\0'+value,hashlib.sha256).digest()[:16],version=4))
EMAIL='redigido@example.invalid'
EMAIL_PATTERN=re.compile(r'[^\s@]+@[^\s@]+\.[^\s@]+')
PERSONAL={'name','full_name','first_name','last_name','display_name','phone','phone_number','iban','nif','nipc','matched_by','notes','description'}
IDENTITY={'sub','user_id','profile_id','recipient_profile_id'}
def decode(m):return m[0][1:-1].replace("''","'")
def shape(v):
 if isinstance(v,dict):return {k:shape(x) for k,x in v.items()}
 if isinstance(v,list):return [shape(x) for x in v]
 return type(v).__name__
def sanitize_json(value,salt=None):
 parsed=json.loads(value);changes=[]
 def walk(v,path=()):
  if isinstance(v,dict):return {k:walk(x,path+(k,)) for k,x in v.items()}
  if isinstance(v,list):return [walk(x,path+(i,)) for i,x in enumerate(v)]
  key=str(path[-1]).lower() if path else ''
  if isinstance(v,str):
   kind=None;new=v
   try:uuid.UUID(v);is_uuid=True
   except (ValueError,AttributeError):is_uuid=False
   if is_uuid and (key in IDENTITY or key in PERSONAL):new=synthetic_uuid(v,salt);kind='uuid'
   elif key in {'email','email_address'} or EMAIL_PATTERN.fullmatch(v):new=EMAIL;kind='email'
   elif key in PERSONAL or key in IDENTITY:new='redigido';kind='string'
   if kind and new!=v:changes.append({'field':'.'.join(map(str,path)),'type':kind});return new
  elif key in PERSONAL or key in IDENTITY:
   if type(v) is int:new=0
   elif type(v) is float:new=0.0
   elif type(v) is bool:new=False
   else:new=None
   if new!=v:changes.append({'field':'.'.join(map(str,path)),'type':type(v).__name__})
   return new
  return v
 result=walk(parsed)
 if shape(result)!=shape(parsed):raise ValueError('JSON type changed')
 text=json.dumps(result,ensure_ascii=False,separators=(',',':'));json.loads(text)
 return text,changes

def contexts(sql):
 for m in LITERAL.finditer(sql):
  before=sql[max(0,m.start()-300):m.start()];after=sql[m.end():m.end()+30];value=decode(m)
  claims=bool(re.search(r"set_config\s*\(\s*'request\.jwt\.claims'\s*,\s*$",before,re.I))
  cast=bool(re.match(r'\s*::\s*(?:pg_catalog\.)?jsonb?\b',after,re.I))
  declaration=bool(re.search(r'\bjsonb?\s*(?::=|DEFAULT)\s*$',before,re.I))
  if claims and not value:continue # Intentional reset to empty GUC, not a JSON payload.
  if claims or cast or declaration:yield m,value

def validate_sql(sql):
 checked=0
 for m,value in contexts(sql):
  try:json.loads(value)
  except ValueError:raise ValueError('invalid JSON literal at line '+str(sql.count('\n',0,m.start())+1)) from None
  checked+=1
 return checked

def placeholder_spans(sql):
 spans=[]
 for m in LITERAL.finditer(sql):
  value=decode(m)
  try:parsed=json.loads(value)
  except ValueError:continue
  if not isinstance(parsed,(dict,list)):continue
  for hit in re.finditer(r'"redigido@example\.invalid"',m[0]):spans.append((m.start()+hit.start(),m.start()+hit.end()))
 return spans
