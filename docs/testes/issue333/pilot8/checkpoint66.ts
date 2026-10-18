/** Local/test-only phase runner. No Cloud transport or account creation here. */
import {mkdir,readFile,writeFile,rename,stat,open,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Artifact,PilotDriver} from './future-runner';
export type Identity66={id:string;createdAt:string;roleId:string;fullName:string};
export type Phase66='identity_reviewed'|'await_activation'|'executing'|'await_revocation'|'checking'|'complete'|'aborted';
export type State66={version:1;phase:Phase66;identity:Identity66;artifactHash:string;context?:unknown;failure?:string;pending:string[];actions:Record<string,string>};
export interface Store66 {load():Promise<State66>;save(state:State66):Promise<void>;lock():Promise<()=>Promise<void>>;getSecret(kind:'password'|'token'):Promise<string>;putToken(token:string):Promise<void>;eraseSecrets():Promise<void>}
export interface Driver66 extends PilotDriver {bindIdentity(owner:Identity66):void;exportContext():unknown;importContext(context:unknown):void;validateCheckpoint(owner:Identity66,artifact:Artifact,phase:'activated'|'revoked'):Promise<void>}
const require66=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
export function artifactHash66(a:Artifact){return createHash('sha256').update(JSON.stringify([a.marker,a.company,a.reference,a.sha256,a.size,a.mime])).digest('hex')}
export async function atomicPrivate66(path:string,value:unknown){const temp=path+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path)}
export class PrivateStore66 implements Store66 {
 constructor(readonly directory:string){require66(directory.startsWith('/tmp/'),'Private checkpoint requires /tmp')}
 async load(){const p=this.directory+'/checkpoint.json';require66(((await stat(p)).mode&0o777)===0o600,'Checkpoint permissions');return JSON.parse(await readFile(p,'utf8')) as State66}
 async save(s:State66){await mkdir(this.directory,{recursive:true,mode:0o700});await atomicPrivate66(this.directory+'/checkpoint.json',s)}
 async lock(){await mkdir(this.directory,{recursive:true,mode:0o700});const p=this.directory+'/invocation.lock';const f=await open(p,'wx',0o600);return async()=>{await f.close();await unlink(p)}}
 async getSecret(k:'password'|'token'){const p=this.directory+'/'+k;require66(((await stat(p)).mode&0o777)===0o600,'Secret permissions');return readFile(p,'utf8')}
 async putToken(token:string){await writeFile(this.directory+'/token',token,{mode:0o600,flag:'wx'})}
 async eraseSecrets(){for(const n of ['password','token'])try{await unlink(this.directory+'/'+n)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
}
/** Each invocation completes its own SELECTs. Human/controller pauses have no timers. */
export async function checkpoint66(action:'prepare'|'execute'|'finish'|'cleanup',d:Driver66,a:Artifact,store:Store66){
 const unlock=await store.lock();let s:State66|undefined,token='';
 try {
  s=await store.load();require66(s.version===1&&s.artifactHash===artifactHash66(a),'Checkpoint artifact/version drift');
  const allowed={prepare:'identity_reviewed',execute:'await_activation',finish:'await_revocation',cleanup:'aborted'};
  require66(s.phase===allowed[action]||(s.actions['controller_resume']===action&&['executing','checking'].includes(s.phase))||(action==='cleanup'&&['executing','checking'].includes(s.phase)),'Checkpoint phase refused; never retry execution');
  d.bindIdentity(s.identity);if(s.context)d.importContext(s.context);
  await d.validatePdf(a);
  if(action==='prepare'){
   const preflight=d.preflightResume;require66(preflight,'Resume preflight absent');if(!preflight)throw Error('Resume preflight absent');
   const p=await preflight(s.identity,a);require66(p.identityExact&&p.referenceAbsent&&p.sourcesExact&&p.globalsClosed&&p.activeAllowlist===0&&p.sessions===0&&p.neverSignedIn,'Pre-activation refused');
   require66((await store.getSecret('password')).length>=16,'Private password absent');
   s.context=d.exportContext();s.phase='await_activation';await store.save(s);return {checkpoint:s.phase,pending:['controller_activation'],noPendingSelect:true};
  }
  if(action==='execute'){
   await d.validateCheckpoint(s.identity,a,'activated'); // NOT preflightResume: role manager and two active rows now.
   const ready=await d.readReady(s.identity,a);require66(ready&&ready.owner===s.identity.id&&ready.company===a.company&&ready.marker===a.marker&&ready.role==='manager'&&ready.sessionCount===0&&!ready.globalOpen&&ready.canonicalCompany===a.company&&ready.preparation&&ready.assistantCreate&&ready.expiresAt>d.now(),'Activated readiness refused');
   s.phase='executing';await store.save(s); // before any login/HTTP; crash cannot repeat.
   const login=await d.login(a.marker+'@fixture.invalid',await store.getSecret('password'));token=login.token;await store.putToken(token);require66(login.owner===s.identity.id,'Login identity drift');
   const r=await d.chromium(s.identity,token,a);
   require66(r.sessions===1&&r.documents===1&&r.previews===1&&r.executeRequests===2&&r.invoices===1&&r.results===1&&r.financialEffects===0&&r.downloadedSha===a.sha256&&r.approvedOwner===s.identity.id&&r.approvedNameFromServer&&r.reopenedCheckOk,'Single-preview evidence mismatch');
   s.context=d.exportContext();s.phase='await_revocation';s.pending=['controller_revoke_exact_two'];await store.save(s);
   return {checkpoint:s.phase,pending:s.pending,noPendingSelect:true};
  }
  if(action==='finish'){
   await d.validateCheckpoint(s.identity,a,'revoked');const r=await d.readRevoked(s.identity,a);require66(r.count===2&&r.disabled===2,'Revocation not proven');
   token=await store.getSecret('token');s.phase='checking';s.pending=[];await store.save(s);
   const c=await d.checkReadOnly(s.identity,token,a);require66(c.ok&&c.extraWrites===0,'Own-lot check must be 200/conferido without writes');
  }
  if(action==='cleanup'){try{token=await store.getSecret('token')}catch{}}
  await cleanup66(d,a,store,s,token);s.phase=s.pending.length?'aborted':'complete';await store.save(s);return {checkpoint:s.phase,pending:s.pending,actions:s.actions,noPendingSelect:true};
 } catch(e){
  if(e instanceof Error&&e.name==='AwaitController71'&&s){
   s.context=d.exportContext();s.actions['controller_resume']=action;await store.save(s);
   return {checkpoint:s.phase,pending:['controller_select'],noPendingSelect:true};
  }
  if(!s)throw e;
  // Retain type and safe stage, never raw messages containing credentials/headers.
  s.failure=`${e instanceof Error?e.name:'Error'} during ${action}/${s.phase}`;s.phase='aborted';
  try{if(!token)token=await store.getSecret('token')}catch{}
  try{await cleanup66(d,a,store,s,token)}catch(cleanupError){
   if(cleanupError instanceof Error&&cleanupError.name==='AwaitController71'){s.context=d.exportContext();s.actions['controller_resume']='cleanup';await store.save(s);return {checkpoint:s.phase,pending:s.pending,noPendingSelect:true}}
   throw cleanupError;
  }await store.save(s);
  return {checkpoint:'aborted',failure:s.failure,pending:s.pending,actions:s.actions,noPendingSelect:true};
 } finally {token='';await unlock()}
}
async function cleanup66(d:Driver66,a:Artifact,store:Store66,s:State66,token:string){
 const pending=new Set<string>();
 async function attempt(name:string,fn:()=>Promise<unknown>){pending.add(name);s.pending=[...pending];await store.save(s);try{await fn();s.actions[name]='confirmed';pending.delete(name)}catch(e){if(e instanceof Error&&e.name==='AwaitController71')throw e;s.actions[name]=`failed:${e instanceof Error?e.name:'Error'}`}s.pending=[...pending];await store.save(s)}
 await attempt('controller_revoke_exact_two',async()=>{const r=await d.readRevoked(s.identity,a);require66(r.count===0||r.count===2&&r.disabled===2,'Revocation pending')});
 if(token)await attempt('logout_global',()=>d.logoutGlobal(token));
 await attempt('ban_reviewed_identity',()=>d.banOnlyCreatedUser(s.identity.id));
 await attempt('sessions_zero_independent',async()=>require66(await d.readSessionCount(s.identity.id)===0,'Sessions remain'));
 await attempt('baseline_independent',async()=>{const b=await d.finalBaselines(s.identity,a);require66(b.financialUnchanged&&b.priorCandidatesPreserved&&b.globalsClosed,'Baseline drift')});
 // Failed logout retains private token ONLY for a separately authorized cleanup invocation.
 if(!pending.has('logout_global'))await attempt('erase_private_secrets',()=>store.eraseSecrets());
 s.pending=[...pending];
}