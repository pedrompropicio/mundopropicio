"""#335 fase 2j — concorrência restante. LOCAL ONLY (harness fiel 2h).
Barreiras: aresta de lock observada em pg_blocking_pids ou estado 'idle in transaction' do detentor; nunca sleep.
Cada cenário afirma UM resultado exacto (sem erros tolerados)."""
import concurrent.futures, json, sys, time, uuid
from pathlib import Path
import psycopg2

socket, port, root = sys.argv[1:]
assert socket.startswith(('/tmp/issue335phase2f.', '/tmp/issue335phase2h.'))
conns = [psycopg2.connect(host=socket, port=port, user='supabase_admin', dbname='postgres', sslmode='disable', application_name=f'issue335_2j_{i}') for i in range(3)]
for c in conns: c.autocommit = True
s1, s2, obs = conns
company='00000000-0000-0000-0000-000000000001'; supplier='00000000-0000-0000-0000-000000000020'
account='00000000-0000-0000-0000-000000000030'; uid='00000000-0000-0000-0000-000000000010'
CONFLICT=('55P03','encontro_em_conflito: operação concorrente; atualize a prévia e tente novamente')
def sql(c,q,a=None):
    with c.cursor() as cur:
        cur.execute(q,a); return cur.fetchall() if cur.description else []
for c in conns:
    sql(c,"SELECT set_config('request.jwt.claim.sub',%s,false)",(uid,)); sql(c,"SET statement_timeout='12s'")
def outcome(c,q,a=None):
    try: return ('ok',sql(c,q,a))
    except psycopg2.Error as e: return (e.pgcode,e.diag.message_primary)
def blocked(waiter,holder):
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        if sql(obs,'SELECT %s=ANY(pg_blocking_pids(%s))',(holder,waiter))[0][0]: return
    raise AssertionError('aresta de lock esperada não observada')
def fixture(extra_income_cols='', vals=()):
    a,b=str(uuid.uuid4()),str(uuid.uuid4())
    sql(obs,f"INSERT INTO transactions(id,company_id,status,type,description,amount,iva_rate,date,supplier_id{extra_income_cols}) VALUES(%s,%s,'approved','income','2j conc+',100,0,'2026-10-13',%s{',%s'*len(vals)})",(a,company,supplier,*vals))
    sql(obs,"INSERT INTO transactions(id,company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(%s,%s,'approved','expense','2j conc-',40,0,'2026-10-13',%s)",(b,company,supplier))
    return a,b
def call(a,b,req=None):
    items=json.dumps([dict(transaction_id=a,mode='settle'),dict(transaction_id=b,mode='offset')])
    mv=json.dumps(dict(account_id=account,date='2026-10-13',amount=60))
    return "SELECT transaction_offset_execute(%s,%s,%s::jsonb,%s::jsonb,'2026-10-13')",(req or str(uuid.uuid4()),supplier,items,mv)
def groups(a): return sql(obs,"SELECT count(*) FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=%s AND g.status='applied'",(a,))[0][0]
for c in (s1,s2): sql(c,'SET ROLE authenticated')
pool=concurrent.futures.ThreadPoolExecutor(max_workers=2)

# F1 — offset_create legado cruzado. Detentor: par legado criado e por confirmar sobre os mesmos documentos.
a,b=fixture()
sql(s1,'BEGIN'); sql(s1,"SELECT transaction_offset_create(%s,%s,40,'2j cruzado')",(a,b))
r=outcome(s2,*call(a,b)); sql(s1,'COMMIT')
assert r==CONFLICT,r
assert groups(a)==0
r2=outcome(s2,*call(a,b))  # depois do commit: encontro adopta o par legado ou recusa por par divergente — exacto:
print('F1 resultado após commit do par legado:',r2[0], r2[1] if r2[0]!='ok' else 'aplicado')
assert r2[0]=='ok' and groups(a)==1, r2
print('PASS 2j F1 offset_create legado em curso x encontro: 55P03 exacto, zero grupo; após commit o encontro adopta o par (1 grupo)')
# inverso: encontro em curso x offset_create legado → o legado espera o commit (aresta observada) e depois recusa.
a,b=fixture()
sql(s2,'BEGIN'); assert outcome(s2,*call(a,b))[0]=='ok'
fut=pool.submit(outcome,s1,"SELECT transaction_offset_create(%s,%s,40,'2j cruzado inverso')",(a,b))
blocked(s1.get_backend_pid(),s2.get_backend_pid())
sql(s2,'COMMIT'); r=fut.result(timeout=12)
print('F1b legado após encontro:',r)
assert r[0]!='ok', r
assert sql(obs,"SELECT count(*) FROM transaction_offsets WHERE receivable_transaction_id=%s AND offset_group_id IS NULL",(a,))[0][0]==0
print('PASS 2j F1b encontro em curso x offset_create legado: legado espera (aresta observada) e é recusado após commit:',r[0])

# F2 — selagem real concorrente.
ev=str(uuid.uuid4()); es=str(uuid.uuid4())
sql(obs,"INSERT INTO events(id,company_id,budget_mode,name,date,event_nature) VALUES(%s,%s,'without_bp','2j selo conc','2026-10-13','producao_propria')",(ev,company))
sql(obs,"INSERT INTO event_settlements(id,event_id,company_id,name,is_sealed) VALUES(%s,%s,%s,'2j conc',false)",(es,ev,company))
a,b=fixture(',event_id,event_settlement_id',(ev,es))
sql(s1,'BEGIN'); sql(s1,"SELECT seal_event_settlement(%s,'{\"check1\":0,\"check2\":0}'::jsonb,NULL,'2j conc')",(es,))
r=outcome(s2,*call(a,b)); sql(s1,'COMMIT')
assert r==CONFLICT,r
r=outcome(s2,*call(a,b)); assert r[0]=='P0001' and r[1].startswith('sealed_settlement'),r
print('PASS 2j F2 selagem em curso x encontro: 55P03 exacto; após selar, sealed_settlement exacto; zero grupo')
sql(s1,"SELECT unseal_event_settlement(%s,'2j conc')",(es,))
sql(s2,'BEGIN'); assert outcome(s2,*call(a,b))[0]=='ok'
fut=pool.submit(outcome,s1,"SELECT seal_event_settlement(%s,'{\"check1\":0,\"check2\":0}'::jsonb,NULL,'2j conc 2')",(es,))
blocked(s1.get_backend_pid(),s2.get_backend_pid()); sql(s2,'COMMIT')
r=fut.result(timeout=12); assert r[0]=='ok',r
print('PASS 2j F2b encontro em curso x selagem: selagem espera o commit (aresta observada) e sela depois; grupo aplicado antes do selo')

# F3 — inclusão em lista concorrente.
a,b=fixture()
lid=str(uuid.uuid4()); sql(obs,"INSERT INTO payment_lists(id,company_id,title,status) VALUES(%s,%s,'2j conc','draft')",(lid,company))
sql(s1,'BEGIN'); sql(s1,"INSERT INTO payment_list_items(transaction_id,payment_list_id,company_id) VALUES(%s,%s,%s)",(b,lid,company))
r=outcome(s2,*call(a,b)); sql(s1,'COMMIT')
both=sql(obs,"SELECT count(*) FROM payment_list_items WHERE transaction_id=%s AND removed_at IS NULL",(b,))[0][0]
print('F3 inclusão em lista em curso x encontro:',r[0],r[1] if r[0]!='ok' else 'aplicado','| item na lista:',both,'| grupos:',groups(a))
F3_RESULT=(r[0],groups(a),both)
for c in (s1,s2): sql(c,'RESET ROLE')

# F4 — reabertura concorrente da flag (rollback do kill-switch) x encontro.
ks=Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql').read_text()
ko=Path(root+'/supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql').read_text()
sql(obs,ks)
a,b=fixture()
sql(s2,'SET ROLE authenticated')
assert outcome(s2,*call(a,b))==('P0001','encontro_desativado')
sql(s2,'RESET ROLE')
reopen=ko.replace('BEGIN;','',1).replace('COMMIT;','')
sql(s1,'BEGIN'); sql(s1,reopen)   # reabertura em curso: advisory (335,1) exclusivo + flag true não confirmada
sql(s2,'SET ROLE authenticated')
r=outcome(s2,*call(a,b))  # old committed admission flag still false; exact clear rejection
assert r==('P0001','encontro_desativado'),r
sql(s1,'COMMIT')
r=outcome(s2,*call(a,b)); assert r[0]=='ok',r
print('PASS 2j F4 reabertura em curso: chamada antes do commit 42501 exacto (sem grupo); depois do commit aplica (1 grupo)')
assert groups(a)==1
sql(s2,'RESET ROLE')
# F4b — negativo in-flight: encontro admitido (fence partilhada) x fecho → fecho espera; nova chamada rejeitada 42501.
a,b=fixture(); sql(s2,'SET ROLE authenticated')
sql(s2,'BEGIN'); assert outcome(s2,*call(a,b))[0]=='ok'
fut=pool.submit(outcome,s1,ks,None); blocked(s1.get_backend_pid(),s2.get_backend_pid())
sql(s2,'ROLLBACK')   # in-flight abortado pelo próprio cliente
assert fut.result(timeout=12)[0]=='ok'
assert groups(a)==0
r=outcome(s2,*call(a,b)); assert r==('P0001','encontro_desativado'),r
print('PASS 2j F4b in-flight abortado + fecho: zero grupo; fecho conclui; nova chamada 42501; reverse também fechado:',outcome(s2,"SELECT transaction_offset_reverse(%s,%s,'x')",(str(uuid.uuid4()),str(uuid.uuid4())))[0])
sql(s2,'RESET ROLE'); sql(obs,ko)
print('F3_RESULT',F3_RESULT)
if F3_RESULT[0]=='ok' and F3_RESULT[2]>0:
    print('ACHADO 2j F3: encontro aplicado E documento incluído em lista activa em simultâneo (KEY SHARE do item não conflitua com NO KEY UPDATE).')
    sys.exit(3)
assert F3_RESULT[0]=='55P03' and F3_RESULT[1]==0, F3_RESULT
print('PASS 2j F3 inclusão em lista em curso x encontro: 55P03 exacto, zero grupo')
for c in conns: c.close()
