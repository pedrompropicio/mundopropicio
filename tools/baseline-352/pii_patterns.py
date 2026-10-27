"""PII pattern gate: values never printed. Known redaction placeholders excluded, not arbitrary addresses."""
import re,json,sys,datetime,argparse
from json_sanitizer import placeholder_spans,validate_sql
from pathlib import Path
UUID=re.compile(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b',re.I)
HASH=re.compile(r'\b[0-9a-f]{32,128}\b',re.I)
EMAIL=re.compile(r'(?<![\w.+-])[A-Z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+',re.I)
IBAN=re.compile(r'\b[A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]){11,30}\b',re.I)
PHONE_INT=re.compile(r'(?<![\w])\+\d(?:[ ().-]*\d){7,14}(?![\w])')
PHONE_LOCAL=re.compile(r'(?<![\w])(?:\(?\d{2,3}\)?[ .-]+)?[2-9]\d{2,4}[ .-]+\d{3,4}(?:[ .-]+\d{3,4})?(?![\w])')
NIF=re.compile(r'(?<![\w])\d{9}(?![\w])')
CPF_CNPJ=re.compile(r'(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})(?!\d)')
LITERAL=re.compile(r"'(?:''|\\.|[^'])*'",re.S)
COMMENTS=re.compile(r'--[^\n]*|/\*[\s\S]*?\*/')
FIELD=re.compile(r'(?i)(?:\b|\")(?P<field>matched_by|notes|description)\"?\s*(?:=|:=|(?:NOT\s+)?ILIKE|(?:NOT\s+)?LIKE|~\*?|IN\s*\()\s*(?:E)?$')
def overlaps(a,b,spans):return any(a<y and b>x for x,y in spans)
def string_value(m):return m.group()[1:-1].replace("''", "'")
def checksum_nif(v):
 if len(v)!=9:return False
 n=11-(sum(int(x)*(9-i) for i,x in enumerate(v[:8]))%11);return int(v[-1])==(0 if n>=10 else n)
def check_iban(v):
 v=re.sub(r'\s','',v).upper()
 if len(v)<15 or len(v)>34:return False
 try:return int(''.join(str(ord(c)-55) if c.isalpha() else c for c in v[4:]+v[:4]))%97==1
 except ValueError:return False
def pii_hits(s):
 blocked=[m.span() for p in [UUID,HASH] for m in p.finditer(s)];hits=[]
 def add(m,typ,method,field=None,valid=None):
  if overlaps(m.start(),m.end(),blocked):return
  hits.append({'start':m.start(),'end':m.end(),'type':typ,'line':s.count('\n',0,m.start())+1,'method':method,**({'column':field} if field else {}),**({'checksum_valid':valid} if valid is not None else {})})
 for m in EMAIL.finditer(s):add(m,'email','pattern; may include service/template address')
 for m in IBAN.finditer(s):
  # SQL numeric masks in to_char are not bank accounts.
  if m.group().upper().startswith('FM') and re.search(r"to_char\([^,\n]+,\s*'?$",s[max(0,m.start()-100):m.start()],re.I):continue
  v=re.sub(r'\s','',m.group())
  if re.match(r'^[A-Z]{2}\d{2}',v,re.I):add(m,'IBAN','pattern; checksum reported separately',valid=check_iban(m.group()))
 for m in PHONE_INT.finditer(s):add(m,'telefone','international prefix pattern')
 # National numbers and fiscal identifiers: only SQL literal values; avoids numeric schema metadata.
 literals=list(LITERAL.finditer(s))
 for lit in literals:
  val=lit.group();off=lit.start()
  for pattern,typ,method in [(PHONE_LOCAL,'telefone','national formatted number in SQL literal'),(NIF,'NIF/NIPC','nine digit candidate in SQL literal'),(CPF_CNPJ,'NIF/NIPC','formatted CPF/CNPJ candidate in SQL literal')]:
   for m in pattern.finditer(val):
    a=off+m.start();b=off+m.end()
    if overlaps(a,b,blocked) or overlaps(a,b,[(x['start'],x['end']) for x in hits if x['type'] in ['IBAN','telefone']]):continue
    v=m.group();digits=re.sub(r'\D','',v)
    # Exclude ISO dates, timestamp fragments, versions and known mathematical masks.
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:.*)?',string_value(lit)) or len(set(digits))==1:continue
    if typ=='telefone' and not 8<=len(digits)<=15:continue
    hits.append({'start':a,'end':b,'type':typ,'line':s.count('\n',0,a)+1,'method':method,**({'checksum_valid':checksum_nif(digits)} if typ=='NIF/NIPC' and len(digits)==9 else {})})
  context=s[max(0,lit.start()-180):lit.start()];m=FIELD.search(context)
  if m and re.search(r'[A-Za-zÀ-ÿ]',string_value(lit)):
   hits.append({'start':lit.start(),'end':lit.end(),'type':'nome_em_texto_livre_candidato','line':s.count('\n',0,lit.start())+1,'column':m.group('field').lower(),'method':'literal compared/assigned to matched_by/notes/description; conservative review candidate, not confirmed person'})
 # INSERT column/value mapping, including nested INSERT inside function/DO bodies.
 ins=re.compile(r'\bINSERT\s+INTO\s+[\w."]+\s*\((?P<cols>[\w\s,\"]+)\)\s*VALUES\s*',re.I)
 for m in ins.finditer(s):
  cols=[c.strip().strip('"').lower() for c in m.group('cols').split(',')];targets={i:c for i,c in enumerate(cols) if c in ['matched_by','notes','description']}
  if not targets:continue
  pos=m.end()
  while pos<len(s) and s[pos]=='(':
   i=pos+1;depth=1;part=i;segments=[]
   while i<len(s) and depth:
    if s[i]=="'":
     lm=LITERAL.match(s,i)
     if lm:i=lm.end();continue
    if s[i]=='(':depth+=1
    elif s[i]==')':
     depth-=1
     if depth==0:segments.append((part,i));break
    elif s[i]==',' and depth==1:segments.append((part,i));part=i+1
    i+=1
   for ix,col in targets.items():
    if ix>=len(segments):continue
    a,b=segments[ix]
    for lm in LITERAL.finditer(s,a,b):
     if re.search(r'[A-Za-zÀ-ÿ]',string_value(lm)):hits.append({'start':lm.start(),'end':lm.end(),'type':'nome_em_texto_livre_candidato','line':s.count('\n',0,lm.start())+1,'column':col,'method':'INSERT VALUES literal in personal/free-text field; conservative candidate, not confirmed person'})
   pos=i+1
   while pos<len(s) and s[pos].isspace():pos+=1
   if pos<len(s) and s[pos]==',':
    pos+=1
    while pos<len(s) and s[pos].isspace():pos+=1
   else:break
 unique={tuple((x[k] for k in ['start','end','type'])):x for x in hits};return sorted(unique.values(),key=lambda x:(x['start'],x['type']))

_raw_pii_hits=pii_hits
def pii_hits(s):
    placeholders=[m.span() for m in re.finditer(r"'<redigido:(?:texto|IBAN|NIF/NIPC)>'|'redigido@exemplo\.invalid'|'\+000000000'",s)]
    return [h for h in _raw_pii_hits(s) if not overlaps(h['start'],h['end'],placeholders+placeholder_spans(s)+[m.span() for m in re.finditer(r'mail-[0-9a-f]{64}@homolog\.invalid',s)])]
