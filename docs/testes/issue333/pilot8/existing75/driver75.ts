/** LOCAL ONLY. No credentials, login, AuthAdmin or network implementation. */
import {createHash} from 'node:crypto';
import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {atomicPrivate66} from '../checkpoint66';
import type {Artifact} from '../future-runner';
export type Identity75={owner:string;company:string;role:string;confirmed:boolean;banned:boolean;profileHash:string;rolesHash:string;accountHash:string};
export type Row75={id:string;hash:string};
export type Baseline75={identity:Identity75;sessions:Row75[];history:Record<string,Row75[]>;financialHash:string;configHash:string;globalsClosed:boolean};
export type Permission75={id:string;owner:string;company:string;operation:'preparation'|'assistant_create';note:string;enabled:boolean;expiresAt:number};
export type State75={version:1;mode:'existing-user';phase:'prepared'|'blocked'|'session_bound'|'executing'|'await_revocation'|'complete';baseline:Baseline75;reference:string;sha256:string;note:string;session?:{id:string;openedForTest:boolean};permissions:Permission75[];preexistingPermissionIds:string[];additions:Record<string,string[]>;pending:string[]};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sorted=(rows:Row75[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
export class Store75{
 constructor(readonly dir:string){if(!dir.startsWith('/tmp/'))throw Error('Private /tmp required')}
 async load():Promise<State75>{const s=JSON.parse(await readFile(this.dir+'/existing75.json','utf8'));if(s.version!==1||s.mode!=='existing-user')throw Error('Existing-user state required');return s}
 async save(s:State75){await mkdir(this.dir,{recursive:true,mode:0o700});await atomicPrivate66(this.dir+'/existing75.json',s)}
 async lock(){await mkdir(this.dir,{recursive:true,mode:0o700});const p=this.dir+'/existing75.lock',f=await open(p,'wx',0o600);return async()=>{await f.close();await unlink(p)}}
}
export function guard75(expected:Identity75,current:Identity75){
 if(!uuid.test(expected.owner)||!uuid.test(expected.company)||hash(expected)!==hash(current)||!current.confirmed||current.banned)throw Error('Identity/company/role drift');
 if(!['admin','platform_admin','manager'].includes(current.role))throw Error('Current role forbidden; no promotion');
}
export function artifact75(a:Artifact){
 if(!/^issue333-pilot8-[a-f0-9]{32}$/.test(a.marker)||['issue333-pilot8-916bd3976502472ab18f39ea0adf7589','issue333-pilot8-11af044ae28127538fe8cc06be67541a'].includes(a.marker)||a.reference!=='FICTICIO-'+a.marker||a.company!=='7c858982-6ccd-47ca-bd65-e0dd3eebf01c'||a.mime!=='application/pdf'||a.size!==1517||a.bytes.length!==a.size||createHash('sha256').update(a.bytes).digest('hex')!==a.sha256||Buffer.from(a.bytes).subarray(0,5).toString()!=='%PDF-')throw Error('Reviewed PDF refused');
}
export async function prepare75(store:Store75,a:Artifact,b:Baseline75,absent:boolean,preexistingPermissionIds:string[]){
 artifact75(a);if(!absent||!b.globalsClosed||b.identity.company!==a.company)throw Error('Scope refused');
 const s:State75={version:1,mode:'existing-user',phase:'prepared',baseline:b,reference:a.reference,sha256:a.sha256,note:`FICTITIOUS one PDF; ${a.marker}; SHA256=${a.sha256}`,permissions:[],preexistingPermissionIds,additions:{},pending:[]};
 try{guard75(b.identity,b.identity)}catch{s.phase='blocked';s.pending=['current_role_not_authorized']}
 await store.save(s);return s.phase;
}
/** verify MUST use auth.getUser AND canonical server context; never trust decoded JWT alone. */
export async function bindSession75(store:Store75,verify:()=>Promise<{identity:Identity75;id:string}>,openedForTest:boolean){
 const s=await store.load();if(s.phase!=='prepared')throw Error('Authority required');const v=await verify();guard75(s.baseline.identity,v.identity);
 if(!uuid.test(v.id)||openedForTest===s.baseline.sessions.some(x=>x.id===v.id))throw Error('Session provenance refused');
 s.session={id:v.id,openedForTest};s.phase='session_bound';await store.save(s);
}
export function permissions75(s:State75,rows:Permission75[],now:number){
 if(rows.length!==2||new Set(rows.map(x=>x.id)).size!==2||new Set(rows.map(x=>x.operation)).size!==2||rows.some(x=>!uuid.test(x.id)||s.preexistingPermissionIds.includes(x.id)||x.owner!==s.baseline.identity.owner||x.company!==s.baseline.identity.company||x.note!==s.note||!x.enabled||x.expiresAt<=now||x.expiresAt>now+600000))throw Error('Exactly two NEW scoped permissions required');
 s.permissions=structuredClone(rows);
}
export function additions75(s:State75,added:Record<string,string[]>){
 for(const [table,ids] of Object.entries(added))if(!Object.hasOwn(s.baseline.history,table)||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)||s.baseline.history[table].some(x=>x.id===id)))throw Error('Cannot exclude historic/unknown IDs');
 s.additions=structuredClone(added);
}
export function compare75(s:State75,b:Baseline75){
 const before=s.baseline;
 return {historyPreserved:Object.keys(before.history).length===Object.keys(b.history).length&&Object.entries(before.history).every(([table,rows])=>Array.isArray(b.history[table])&&hash(sorted(rows))===hash(sorted(b.history[table].filter(x=>!(s.additions[table]??[]).includes(x.id))))),accountPreserved:hash(before.identity)===hash(b.identity),financialPreserved:before.financialHash===b.financialHash,configurationPreserved:before.configHash===b.configHash&&b.globalsClosed,sessionsPreserved:hash(sorted(before.sessions))===hash(sorted(b.sessions)),testSessionClosed:!s.session?.openedForTest||!b.sessions.some(x=>x.id===s.session?.id)};
}
export interface Cleanup75{
 readPermissions(ids:string[]):Promise<Permission75[]>;
 /** UPDATE exact IDs+owner/company/note/operations only, never DELETE. */
 revokeExact(rows:Permission75[]):Promise<void>;
 /** auth.signOut({scope:'local'}) from this verified dedicated test session ONLY. */
 closeTestSession(id:string):Promise<void>;
 readBaseline():Promise<Baseline75>;
}
export async function cleanup75(store:Store75,d:Cleanup75){
 const release=await store.lock();try{const s=await store.load();s.pending=[];
 const exact=(rows:Permission75[])=>rows.length===2&&new Set(rows.map(x=>x.id)).size===2&&rows.every(x=>s.permissions.some(p=>p.id===x.id&&p.owner===x.owner&&p.company===x.company&&p.operation===x.operation&&p.note===x.note));
 if(s.permissions.length){try{const ids=s.permissions.map(x=>x.id),rows=await d.readPermissions(ids);if(!exact(rows))throw Error('Scope drift');if(rows.some(x=>x.enabled))await d.revokeExact(rows);const after=await d.readPermissions(ids);if(!exact(after)||after.some(x=>x.enabled))throw Error('Revocation not proven')}catch{s.pending.push('revoke_exact_two')}}
 const beforeClose=await d.readBaseline();if(s.session?.openedForTest&&beforeClose.sessions.some(x=>x.id===s.session?.id)){try{await d.closeTestSession(s.session.id)}catch{s.pending.push('close_test_session_only')}}
 const checks=compare75(s,await d.readBaseline());if(Object.values(checks).some(x=>!x))s.pending.push('baseline_drift');if(!s.pending.length)s.phase='complete';await store.save(s);return {complete:!s.pending.length,pending:s.pending,checks};
 }finally{await release()}
}
/** One supplied canonical modal flow, durable uncertainty before dispatch, no automatic retry. */
export async function execute75(store:Store75,authorization:string,verify:()=>Promise<Identity75>,modal:()=>Promise<Record<string,string[]>>){
 if(authorization!=='PEDRO_AUTHORIZED_EXISTING_USER75_EXECUTE')throw Error('New human authorization required');const release=await store.lock();try{const s=await store.load();if(s.phase!=='session_bound'||!s.session)throw Error('Verified session required');guard75(s.baseline.identity,await verify());permissions75(s,s.permissions,Date.now());s.phase='executing';await store.save(s);const added=await modal();additions75(s,added);s.phase='await_revocation';await store.save(s);return s.phase}finally{await release()}
}
