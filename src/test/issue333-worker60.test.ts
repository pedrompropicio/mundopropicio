import {it,expect,afterAll} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {chromiumDriver57} from '../../docs/testes/issue333/pilot8/private-cloud57';

const OWNER='11111111-1111-4111-8111-811111111111'.replace('8111-811111111111','4111-8111-111111111111');
const OWNER_ID='11111111-1111-4111-8111-111111111111';
const PDF='docs/testes/issue333/pilot8/preflight56/evidence/pilot8-fiction.pdf';
const SECRET='SECRET-TOKEN-NEVER-IN-EVIDENCE';
const children:ChildProcess[]=[];
afterAll(()=>{for(const c of children)c.kill('SIGKILL')});

async function startDouble(scenario:string):Promise<number>{
 const child=spawn('python3',['docs/testes/issue333/pilot8/double-server60.py'],{env:{...process.env,DOUBLE_SCENARIO:scenario},stdio:['ignore','pipe','pipe']});
 children.push(child);
 return new Promise((resolve,reject)=>{
  let buf='';const t=setTimeout(()=>reject(Error('double server no port')),15000);
  child.stdout!.on('data',d=>{buf+=d;const m=buf.match(/PORT=(\d+)/);if(m){clearTimeout(t);resolve(Number(m[1]))}});
  child.on('exit',()=>{clearTimeout(t);reject(Error('double server exited'))});
 });
}
async function runWorker(scenario:string){
 const port=await startDouble(scenario);
 const out=await mkdtemp('/tmp/issue333-worker60-');
 const base=`http://127.0.0.1:${port}`;
 const input={mode:'execute',output:out,cloud_url:base,app_url:base,public_key:'pub-double',
  owner:OWNER_ID,company:'company-double',reference:'FICTICIO-DOUBLE60',pdf:PDF,
  storage_key:'sb-double-auth-token',session:{user:{id:OWNER_ID},access_token:SECRET},
  actor_name:'Membro Fictício Piloto8',tax_id:'PT500000001',isolated:true,dialog_open:true,
  entry_path:'/transacoes',start_path:'/'};
 let result:any=null,error:any=null;
 try{result=await chromiumDriver57('docs/testes/issue333/pilot8/cloud-browser57.py',input);}
 catch(e){error=e;}
 let evidence:any=null;
 try{evidence=JSON.parse(await readFile(out+'/browser.json','utf8'));}catch{}
 return {result,error,evidence,out};
}

it('worker real Chromium: par execute 200/200 persiste browser.json sem tokens',async()=>{
 const {result,evidence,out}=await runWorker('ok');
 expect(error0(result)).toBeTruthy();
 expect(evidence).not.toBeNull();
 expect(evidence.executeRequests).toBe(2);
 expect(evidence.pair_statuses).toEqual([200,200]);
 expect(evidence.reopenedCheckOk).toBe(true);
 expect(evidence.check).toEqual({status:'conferido'});
 const raw=await readFile(out+'/browser.json','utf8');
 expect(raw).not.toContain(SECRET);
 expect(raw).not.toContain('access_token');
 // atomicidade: sem ficheiro .tmp residual
 await expect(stat(out+'/browser.tmp')).rejects.toThrow();
},120000);
function error0(r:any){return r&&r.executeRequests===2;}

it('falha parcial do par HTTP: resposta observada preservada, falha registada, nada inventado',async()=>{
 const {evidence}=await runWorker('partial_fail');
 expect(evidence).not.toBeNull();
 expect(evidence.pair_statuses).toHaveLength(2);
 expect(evidence.pair_statuses).toContain(200);
 const failedLeg=evidence.pair_bodies.find((b:any)=>b&&b.transport_failure);
 expect(failedLeg).toBeTruthy();
 const okLeg=evidence.pair_bodies.find((b:any)=>b&&b.status==='conferido');
 expect(okLeg).toBeTruthy();
},120000);

it('falha ANTES do par HTTP (guarda de autorização): browser.json gravado com falha sanitizada',async()=>{
 const {error,evidence}=await runWorker('preview_fail');
 expect(error).toBeTruthy();
 expect(evidence).not.toBeNull();
 expect(evidence.failure).toBeTruthy();
 expect(evidence.failure.stage).toBe('prepare');
 expect(evidence.pair_statuses).toBeNull();
 expect(evidence.executeRequests).toBe(0);
},120000);

it('falha DEPOIS do par HTTP (pedido bloqueado): evidência preserva o par e regista o bloqueio',async()=>{
 const {error,evidence}=await runWorker('blocked_fail');
 expect(error).toBeTruthy();
 expect(evidence).not.toBeNull();
 expect(evidence.pair_statuses).toEqual([200,200]);
 expect(evidence.blocked.length).toBeGreaterThan(0);
 expect(evidence.failure).toBeTruthy();
},120000);
