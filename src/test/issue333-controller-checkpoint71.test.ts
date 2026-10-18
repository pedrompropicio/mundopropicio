// @vitest-environment node
import {it,expect} from 'vitest';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {ControllerCheckpoint71,AwaitController71,validate71,effect71,type Schema71} from '../../docs/testes/issue333/pilot8/controller-checkpoint71';
import {ControllerMessage69,sha69,MAX_MESSAGE69} from '../../docs/testes/issue333/pilot8/controller-message69';
import {bundle71} from '../../docs/testes/issue333/pilot8/select-bundle71';
import {checkpoint66,PrivateStore66,artifactHash66,type Driver66} from '../../docs/testes/issue333/pilot8/checkpoint66';
import {durableDriver71} from '../../docs/testes/issue333/pilot8/controller-checkpoint71';
import {writeFile} from 'node:fs/promises';
import type {Artifact} from '../../docs/testes/issue333/pilot8/future-runner';
const schema:Schema71={type:'object',properties:{n:{type:'number',integer:true,minimum:0}}};
async function setup(){const dir=await mkdtemp('/tmp/controller71-');const t=new ControllerCheckpoint71(dir,'local',()=>schema);let request:any;try{await t.select('SELECT 1::integer n',['n'])}catch(e){if(!(e instanceof AwaitController71))throw e;request=e.request}return {dir,t,request}}
const raw=(r:any,data=[{n:1}])=>Buffer.from(JSON.stringify({version:1,id:r.id,query:r.query,fingerprint:r.fingerprint,source:'SIMULATED official structuredContent.rows',data,rowCount:data.length}));
const meta=(b:Buffer)=>({bytes:b.length,sha256:sha69(b)});
it('finite persisted request survives a simulated 15-minute pause with no open task; exact response consumed once',async()=>{
 const h=await setup();expect((await stat(h.dir+'/'+h.request.id+'.request.json')).mode&511).toBe(384);
 // Passage of human time has no timer/promise: another instance resumes only persisted state.
 const t=new ControllerCheckpoint71(h.dir,'local',()=>schema);const b=raw(h.request);await t.receive(h.request.id,b,meta(b));
 expect(await t.select('SELECT 1::integer n',['n'])).toEqual({n:1});await expect(t.receive(h.request.id,b,meta(b))).rejects.toThrow();
 expect(await readFile(h.dir+'/'+h.request.id+'.raw.json')).toEqual(b);
});
it.each(['hash','bytes','id','query','fingerprint','schema','rows','oversized'])('rejects %s before consumption',async problem=>{
 const h=await setup();let b=raw(h.request);const m=meta(b);const e=JSON.parse(b.toString());
 if(problem==='hash')m.sha256='0'.repeat(64);if(problem==='bytes')m.bytes++;
 if(problem==='id')e.id='other';if(problem==='query')e.query='SELECT 2 n';if(problem==='fingerprint')e.fingerprint='0'.repeat(64);
 if(problem==='schema')e.data=[{n:'1'}];if(problem==='rows'){e.data.push({n:1});e.rowCount=2}
 if(problem==='oversized')e.source='x'.repeat(MAX_MESSAGE69);
 if(!['hash','bytes'].includes(problem)){b=Buffer.from(JSON.stringify(e));Object.assign(m,meta(b))}
 await expect(h.t.receive(h.request.id,b,m)).rejects.toThrow();expect(JSON.parse(await readFile(h.dir+'/'+h.request.id+'.request.json','utf8')).status).toBe('pending');
});
it('cancelled late response never resumes',async()=>{const h=await setup();await new ControllerMessage69(h.dir).cancel(h.request.id);const b=raw(h.request);await expect(h.t.receive(h.request.id,b,meta(b))).rejects.toThrow()});
it('effect journal executes once and refuses uncertain retry',async()=>{const dir=await mkdtemp('/tmp/effect71-');let n=0;expect(await effect71(dir,'pair',async()=>++n)).toBe(1);expect(await effect71(dir,'pair',async()=>++n)).toBe(1);expect(n).toBe(1);await expect(effect71(dir,'failure',async()=>{throw Error('local failure')})).rejects.toThrow();await expect(effect71(dir,'failure',async()=>++n)).rejects.toThrow('Uncertain');expect(n).toBe(1)});
it('bundle preserves exact query fingerprints and fixed local 65536 byte bound',()=>{expect(bundle71).toHaveLength(3);for(const c of bundle71){expect(c.fingerprint).toBe(sha69(c.query));expect(c.maxBytes).toBe(65536);expect(c.queryBytes).toBe(Buffer.byteLength(c.query));expect(c.estimatedEnvelopeBytes).toBeLessThanOrEqual(65536)}expect(bundle71[1].query).toBe(bundle71[2].query)});
it('nested missing counts and string counts cannot turn into PASS',()=>{expect(()=>validate71({n:undefined},schema)).toThrow();expect(()=>validate71({n:'0'},schema)).toThrow();expect(()=>validate71({n:0},schema)).not.toThrow()});
it.each(['success','expired','worker','logout','ban'])('executor + receiver + finite fake controller: %s, no repeated effects',async failure=>{
 const dir=await mkdtemp('/tmp/integrated71-'),store=new PrivateStore66(dir),spool=dir+'/select';
 const a:Artifact={bytes:new Uint8Array(3),size:3,mime:'application/pdf',sha256:'a'.repeat(64),reference:'FICTICIO-local71',marker:'issue333-pilot8-'+'7'.repeat(32),company:'local'};
 const owner={id:'local-owner',createdAt:'2026-10-18',roleId:'local-role',fullName:'Local'};
 await store.save({version:1,phase:'identity_reviewed',identity:owner,artifactHash:artifactHash66(a),pending:[],actions:{}});await writeFile(dir+'/password','private-local-password',{mode:0o600});
 let now=0,expires=0,active=false,revoked=false,pairs=0,logins=0,bans=0,logout=0,sessions=0,checks=0;
 const calls:string[]=[];
 const stage=async(action:'prepare'|'execute'|'finish'|'cleanup')=>{
  for(let i=0;i<40;i++){
   const t=new ControllerCheckpoint71(spool,action,()=>schema);
   const select=async(label:string)=>{calls.push(label);return t.select(`SELECT 1::integer n /*never*/`.replace(' /*never*/',''),['n'])};
   const d:Driver66={bindIdentity:()=>{},exportContext:()=>({baseline:0}),importContext:()=>{},validatePdf:async()=>{},preflightReadOnly:async()=>{throw Error('no identity creation')},createUser:async()=>{throw Error('never create')},notifyController:async()=>{},requestRevocation:async()=>{},
    preflightResume:async()=>{await select('prepare');return {identityExact:true,referenceAbsent:true,sourcesExact:true,globalsClosed:true,activeAllowlist:0,sessions:0,neverSignedIn:true}},
    validateCheckpoint:async(_o,_a,phase)=>{await select(phase);if(phase==='activated'&&(!active||expires<=now))throw Error('Expired');if(phase==='revoked'&&!revoked)throw Error('Not revoked')},
    readReady:async()=>{await select('ready');return {owner:owner.id,company:a.company,marker:a.marker,role:'manager',sessionCount:0,activeCompany:null,canonicalCompany:a.company,preparation:true,assistantCreate:true,globalOpen:false,expiresAt:expires}},
    login:async()=>{logins++;sessions=1;return {owner:owner.id,token:'private-local-token'}},
    chromium:async()=>{await effect71(dir,'pair',async()=>{pairs++;if(failure==='worker')throw Error('local worker failure');return {pair:[200,200]}});await select('post-pair');return {sessions:1,documents:1,previews:1,executeRequests:2,invoices:1,results:1,financialEffects:0,downloadedSha:a.sha256,approvedOwner:owner.id,approvedNameFromServer:true,reopenedCheckOk:true}},
    readRevoked:async()=>{await select('revocation');return {count:2,disabled:revoked?2:0}},
    checkReadOnly:async()=>{await effect71(dir,'check',async()=>{checks++;return 200});await select('post-check');return {ok:true,extraWrites:0}},
    logoutGlobal:async()=>{logout++;if(failure==='logout')throw Error('logout');sessions=0},banOnlyCreatedUser:async()=>{bans++;if(failure==='ban')throw Error('ban');sessions=0},
    readSessionCount:async()=>{await select('sessions');return sessions},finalBaselines:async()=>{await select('final');return {financialUnchanged:true,priorCandidatesPreserved:true,globalsClosed:true}},now:()=>now,wait:async()=>{throw Error('No polling')},secret:()=>{throw Error('No generation')},
   };
   const storedState=await store.load();
   const result=await checkpoint66(storedState.phase==='aborted'?'cleanup':action,durableDriver71(d,dir,action,t),a,store);
   if(!result.pending.includes('controller_select'))return result;
   const beforeCalls=[...calls];now+=900001;expect(calls).toEqual(beforeCalls); // no activity while controller absent
   // Activation lifetime starts separately, not from request age. Keep finite test snapshots valid except expired case.
   if(active&&failure!=='expired')expires=now+570000;
   const activeRequest=JSON.parse(await readFile(spool+'/active.json','utf8'));
   const request=JSON.parse(await readFile(spool+'/'+activeRequest.id+'.request.json','utf8'));
   const b=raw(request);await t.receive(request.id,b,meta(b));
  }throw Error('Finite local step bound');
 };
 expect((await stage('prepare')).checkpoint).toBe('await_activation');now+=900001;active=true;expires=now+(failure==='expired'?-1:570000);
 let result=await stage('execute');revoked=true;active=false;
 if(result.checkpoint==='await_revocation')result=await stage('finish');
 else if(result.pending.length)result=await stage('cleanup');
 expect(logins).toBe(failure==='expired'?0:1);expect(pairs).toBe(failure==='expired'?0:1);expect(bans).toBeGreaterThanOrEqual(1);
 expect(calls).toContain('sessions');expect(calls).toContain('final');
 if(failure==='success'){expect(result.checkpoint).toBe('complete');expect(checks).toBe(1);expect(logout).toBe(1);expect(sessions).toBe(0)}
 else expect(result.checkpoint).toBe('aborted');
 const evidence=JSON.parse(await readFile(dir+'/checkpoint.json','utf8'));expect(evidence.failure??'').not.toContain('private-local-token');
});