import {it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {checkpoint66,PrivateStore66,artifactHash66,type Driver66,type State66} from '../../docs/testes/issue333/pilot8/checkpoint66';
import {OfficialSelect66} from '../../docs/testes/issue333/pilot8/official-select66';
import type {Artifact} from '../../docs/testes/issue333/pilot8/future-runner';
import {PGlite} from '@electric-sql/pglite';
const a:Artifact={bytes:new Uint8Array(3),size:3,mime:'application/pdf',sha256:'a'.repeat(64),reference:'FICTICIO-local66',marker:'issue333-pilot8-'+'2'.repeat(32),company:'local-company'};
const owner={id:'local-owner',createdAt:'2026-10-18T17:00:00Z',roleId:'local-role',fullName:'Local Fixture'};
const secret='PRIVATE-LOCAL-NOT-IN-EVIDENCE';
async function harness(){
 let now=0,active=false,revoked=false,expires=0,sessions=0,invoices=0;const calls:string[]=[];
 const dir=await mkdtemp('/tmp/checkpoint66-');const store=new PrivateStore66(dir);
 await store.save({version:1,phase:'identity_reviewed',identity:owner,artifactHash:artifactHash66(a),pending:[],actions:{}});
 await writeFile(dir+'/password',secret,{mode:0o600});
 const d:Driver66={bindIdentity:()=>{},exportContext:()=>({baseline:{financial:0,acl:'same'},latest:{session_id:'one',preview_id:'one'}}),importContext:()=>{},validateCheckpoint:async(_o,_a,phase)=>{calls.push('validate-'+phase);if(phase==='activated'&&(!active||expires<=now)||phase==='revoked'&&!revoked)throw Error('gate');},
 validatePdf:async()=>{calls.push('pdf')},preflightReadOnly:async()=>{throw Error('no create preflight')},preflightResume:async()=>{calls.push('preflight');return {identityExact:true,referenceAbsent:true,sourcesExact:true,globalsClosed:true,activeAllowlist:active?2:0,sessions,neverSignedIn:true}},
 createUser:async()=>{throw Error('NEVER CREATE')},notifyController:async()=>{throw Error('no polling controller')},readReady:async()=>{calls.push('readiness');return {owner:owner.id,company:a.company,marker:a.marker,role:'manager',sessionCount:sessions,activeCompany:null,canonicalCompany:a.company,preparation:active,assistantCreate:active,globalOpen:false,expiresAt:expires}},
 login:async()=>{calls.push('login');sessions=1;return {owner:owner.id,token:secret}},chromium:async()=>{calls.push('pair');invoices++;return {sessions:1,documents:1,previews:1,executeRequests:2,invoices,results:invoices,financialEffects:0,downloadedSha:a.sha256,approvedOwner:owner.id,approvedNameFromServer:true,reopenedCheckOk:true}},
 requestRevocation:async()=>{throw Error('no controller loop')},readRevoked:async()=>{calls.push('revoked');return {count:active||revoked?2:0,disabled:revoked?2:0}},checkReadOnly:async()=>{calls.push('check200');return {ok:true,extraWrites:0}},logoutGlobal:async()=>{calls.push('logout');sessions=0},banOnlyCreatedUser:async id=>{expect(id).toBe(owner.id);calls.push('ban');sessions=0},readSessionCount:async()=>{calls.push('sessions-independent');return sessions},finalBaselines:async()=>{calls.push('baseline-independent');return {financialUnchanged:true,priorCandidatesPreserved:true,globalsClosed:true}},now:()=>now,wait:async()=>{throw Error('NO TIMERS ACROSS TURNS')},secret:()=>{throw Error('no new password')}
 };
 return {store,d,calls,dir,advance:(ms:number)=>{now+=ms},activate:()=>{active=true;expires=now+570000},revoke:()=>{revoked=true;active=false},invoices:()=>invoices};
}
it('durable pre-activation checkpoint survives >60s and >5min: no pending SELECT/timer/login',async()=>{
 const h=await harness();expect((await checkpoint66('prepare',h.d,a,h.store)).checkpoint).toBe('await_activation');const before=[...h.calls];h.advance(900000);expect(h.calls).toEqual(before);
 expect(await readdir(h.dir)).not.toContain('invocation.lock');h.activate();expect((await checkpoint66('execute',h.d,a,new PrivateStore66(h.dir))).checkpoint).toBe('await_revocation');expect(h.invoices()).toBe(1);
 h.advance(900000);h.revoke();expect((await checkpoint66('finish',h.d,a,new PrivateStore66(h.dir))).checkpoint).toBe('complete');expect(h.calls).toContain('check200');expect(h.calls.slice(-4)).toEqual(['logout','ban','sessions-independent','baseline-independent']);
 const evidence=await readFile(h.dir+'/checkpoint.json','utf8');expect(evidence).not.toContain(secret);expect(evidence).not.toContain('access_token');expect(await readdir(h.dir)).not.toContain('token');
});
it('expired permissions after controller activation forbid login and report scoped revoke pending',async()=>{
 const h=await harness();await checkpoint66('prepare',h.d,a,h.store);h.activate();h.advance(600000);const r=await checkpoint66('execute',h.d,a,h.store);expect(r.checkpoint).toBe('aborted');expect(r.pending).toContain('controller_revoke_exact_two');expect(h.calls).not.toContain('login');expect(h.calls).toContain('sessions-independent');expect(h.invoices()).toBe(0);
});
it('a second execute invocation cannot produce a second simulated invoice',async()=>{const h=await harness();await checkpoint66('prepare',h.d,a,h.store);h.activate();await checkpoint66('execute',h.d,a,h.store);const r=await checkpoint66('execute',h.d,a,h.store);expect(r.checkpoint).toBe('aborted');expect(h.invoices()).toBe(1);expect(h.calls.filter(x=>x==='pair')).toHaveLength(1)});
it.each(['login','worker','logout','ban','sessions'])('dynamic %s failure persists stage and independent cleanup, no retries',async failure=>{
 const h=await harness();await checkpoint66('prepare',h.d,a,h.store);h.activate();
 if(failure==='login')h.d.login=async()=>{h.calls.push('login');throw Error(secret)};
 if(failure==='worker')h.d.chromium=async()=>{h.calls.push('worker');throw Error(secret)};
 if(failure==='logout')h.d.logoutGlobal=async()=>{h.calls.push('logout');throw Error(secret)};
 if(failure==='ban')h.d.banOnlyCreatedUser=async()=>{h.calls.push('ban');throw Error(secret)};
 if(failure==='sessions')h.d.readSessionCount=async()=>{h.calls.push('sessions-independent');return 1};
 let r=await checkpoint66('execute',h.d,a,h.store);if(r.checkpoint==='await_revocation'){h.revoke();r=await checkpoint66('finish',h.d,a,h.store)}
 expect(r.checkpoint).toBe('aborted');expect(h.calls).toContain('ban');expect(h.calls).toContain('sessions-independent');expect(h.calls).toContain('baseline-independent');expect(await readFile(h.dir+'/checkpoint.json','utf8')).not.toContain(secret);
});
it('revocation missing never performs authenticated check; returns pending actions without polling',async()=>{const h=await harness();await checkpoint66('prepare',h.d,a,h.store);h.activate();await checkpoint66('execute',h.d,a,h.store);const r=await checkpoint66('finish',h.d,a,h.store);expect(r.pending).toContain('controller_revoke_exact_two');expect(h.calls).not.toContain('check200')});
it('read-check writes fail certification even with HTTP OK',async()=>{const h=await harness();await checkpoint66('prepare',h.d,a,h.store);h.activate();await checkpoint66('execute',h.d,a,h.store);h.revoke();h.d.checkReadOnly=async()=>({ok:true,extraWrites:1});expect((await checkpoint66('finish',h.d,a,h.store)).checkpoint).toBe('aborted')});
it('atomic invocation lock prevents overlapping execution',async()=>{const h=await harness();const release=await h.store.lock();await expect(checkpoint66('prepare',h.d,a,h.store)).rejects.toThrow();expect(h.calls).toEqual([]);await release()});
it('official transport captures complete actual PostgreSQL JSON result, validates nested config without copying',async()=>{
 const pg=new PGlite();const dir=await mkdtemp('/tmp/select66-pg-');await pg.exec('create table source(id int, acl text); insert into source values(1,\'owner-only\')');
 const bridge=new OfficialSelect66(dir,async q=>JSON.stringify((await pg.query(q)).rows));
 const q="SELECT jsonb_build_object('count',(select count(*) from source),'acl',(select jsonb_agg(to_jsonb(s)) from source s)) baseline";
 try{expect((await bridge.select(q,['baseline'])).baseline).toEqual({count:1,acl:[{id:1,acl:'owner-only'}]});const names=await readdir(dir);const request=JSON.parse(await readFile(dir+'/'+names.find(n=>n.endsWith('.request.json')),'utf8'));const raw=await readFile(dir+'/'+request.id+'.official.json','utf8');expect(JSON.parse(raw)[0].baseline.acl[0].acl).toBe('owner-only');await expect(bridge.accept(request.id,{id:request.id,fingerprint:request.fingerprint,data:[{baseline:{}}]})).rejects.toThrow('duplicate');}finally{await pg.close()}
});
it.each(['fingerprint','schema','late','identity'])('rejects %s official envelope without converting absent data to PASS',async problem=>{
 const dir=await mkdtemp('/tmp/select66-reject-');const bridge=new OfficialSelect66(dir,async()=>{throw Error('not called')});const id='11111111-1111-4111-8111-111111111111';await writeFile(dir+'/'+id+'.request.json',JSON.stringify({id,fingerprint:'exact',expectedKeys:['baseline'],status:problem==='late'?'failed':'pending'}),{mode:0o600});
 await expect(bridge.accept(id,{id:problem==='identity'?'wrong':id,fingerprint:problem==='fingerprint'?'wrong':'exact',data:[problem==='schema'?{n:0}:{baseline:{}}]})).rejects.toThrow();
});