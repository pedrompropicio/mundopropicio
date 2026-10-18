"""Isolated double for proof60 dynamic worker tests. Serves a minimal page with the
exact controls cloud-browser57.py drives, plus a fake data-entry endpoint.
All on 127.0.0.1; no external traffic. Scenario via env DOUBLE_SCENARIO:
  ok            - both execute legs return 200 conferido
  partial_fail  - first execute leg 200, second leg connection reset (no response)
  preview_fail  - preview returns actor name that does not match (guard fails before pair)
  blocked_fail  - page fires an extra disallowed request after execute (guard fails after pair)
Prints the chosen port on stdout as PORT=<n>.
"""
import http.server,json,os,sys,socketserver

SCENARIO=os.environ.get('DOUBLE_SCENARIO','ok')
OWNER='11111111-1111-4111-8111-111111111111'
ACTOR='Membro Fictício Piloto8'
REFERENCE='FICTICIO-DOUBLE60'
TAX='PT500000001'

PAGE=f"""<!doctype html><html><body>
<button title="Assistente de Entrada de Dados (#333)">abrir</button>
<div id="dlg">
<button id="new">Novo lote</button>
<label>Escolher documento <input type="file" id="file"></label>
<fieldset id="form" disabled>
<label>Fornecedor <input id="f1"></label>
<label>NIF do fornecedor <input id="f2"></label>
<label>Número da fatura <input id="f3"></label>
<label>Data da fatura <input id="f4"></label>
<label>Total (EUR) <input id="f5"></label>
<label>IVA (EUR) <input id="f6"></label>
<label>NIF do destinatário no documento <input id="f7"></label>
<label>Nota (opcional) <input id="f8"></label>
<label>Quem pagou <select aria-label="Quem pagou" id="payer"><option value="{OWNER}">dono</option></select></label>
<button id="prep">Preparar prévia</button>
</fieldset>
<div id="authz" hidden><div role="region" aria-label="Autorização" id="authztext"></div>
<label><input type="checkbox" id="ck">confirmo</label>
<button id="exec">Autorizar e executar este lote</button></div>
<div id="done" hidden>Registado e conferido</div>
<button id="resume">Retomar último lote</button>
</div>
<script>
const EP='ENDPOINT';
let sid=null,pid=null;
async function post(body,json=true){{
  const opt=json?{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}}
               :{{method:'POST',body:body}};
  const r=await fetch(EP,opt);return r.json();
}}
document.getElementById('new').onclick=async()=>{{const r=await post({{action:'session'}});sid=r.session.id;}};
document.getElementById('file').onchange=async(e)=>{{
  const fd=new FormData();fd.set('session_id',sid);fd.set('file',e.target.files[0]);
  await post(fd,false);
  document.getElementById('form').disabled=false;
}};
document.getElementById('prep').onclick=async()=>{{
  const r=await post({{action:'preview',session_id:sid,document_id:'d1',fields:{{}}}});
  pid=r.id;
  document.getElementById('authztext').textContent='Autoriza '+r.actor+' a registar '+r.reference;
  document.getElementById('authz').hidden=false;
}};
document.getElementById('exec').ondblclick=async()=>{{
  const r=await post({{action:'execute',session_id:sid,preview_id:pid,snapshot_hash:'h',authorize:true}});
  if(r.status==='conferido')document.getElementById('done').hidden=false;
  if('BLOCKED'){{await fetch('https://external.invalid/x').catch(()=>{{}});}}
}};
document.getElementById('resume').onclick=async()=>{{
  await post({{action:'session',session_id:sid}});
  document.getElementById('done').hidden=false;
}};
</script></body></html>"""

class H(http.server.BaseHTTPRequestHandler):
    legs=0
    def log_message(self,*a):pass
    def _json(self,code,obj):
        b=json.dumps(obj).encode()
        self.send_response(code);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith('/auth/v1/user'):return self._json(200,{'id':OWNER})
        body=PAGE.replace('ENDPOINT',f'http://127.0.0.1:{self.server.server_port}/functions/v1/data-entry')
        body=body.replace("'BLOCKED'",'true' if SCENARIO=='blocked_fail' else 'false')
        b=body.encode()
        self.send_response(200);self.send_header('Content-Type','text/html')
        self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0'));raw=self.rfile.read(n)
        if 'application/json' not in self.headers.get('Content-Type',''):
            return self._json(200,{'id':'d1','reused':False})
        body=json.loads(raw or b'{}');a=body.get('action')
        if a=='session':return self._json(200,{'session':{'id':'s1'}})
        if a=='preview':
            actor='OUTRO NOME' if SCENARIO=='preview_fail' else ACTOR
            return self._json(200,{'id':'p1','snapshot_hash':'h','actor':actor,'reference':REFERENCE})
        if a=='execute':
            H.legs+=1
            if SCENARIO=='partial_fail' and H.legs==2:
                # connection reset: no response at all
                self.connection.shutdown(2);self.connection.close();return
            return self._json(200,{'status':'conferido'})
        if a=='check':return self._json(200,{'status':'conferido'})
        return self._json(400,{'error':'unknown'})

class S(socketserver.ThreadingTCPServer):
    allow_reuse_address=True;daemon_threads=True

srv=S(('127.0.0.1',0),H)
print(f'PORT={srv.server_port}',flush=True)
srv.serve_forever()
