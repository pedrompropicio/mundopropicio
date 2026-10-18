/** Official read-only CLI transport: capture complete JSON, never transcribe ACL/baseline. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {atomicPrivate66} from './checkpoint66';
export type Request66={id:string;fingerprint:string;query:string;expectedKeys:string[];status:'pending'|'consumed'|'failed'};
export type Capture66=(query:string)=>Promise<string>;
export const cliCapture66:Capture66=async query=>{
 const {stdout}=await promisify(execFile)('lovable',['supabase','query',query,'--json'],{timeout:60000,maxBuffer:32*1024*1024});return stdout;
};
export class OfficialSelect66 {
 constructor(private directory:string,private capture:Capture66=cliCapture66){if(!directory.startsWith('/tmp/'))throw Error('Private transport requires /tmp')}
 async select(query:string,expectedKeys:string[]=[]){
  if(!/^SELECT\b/i.test(query.trim())||/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|set_config|pg_sleep)\b/i.test(query))throw Error('SELECT-only transport refused');
  await mkdir(this.directory,{recursive:true,mode:0o700});const r:Request66={id:randomUUID(),fingerprint:createHash('sha256').update(query).digest('hex'),query,expectedKeys,status:'pending'};
  await atomicPrivate66(this.directory+'/'+r.id+'.request.json',r);
  try{
   const raw=await this.capture(query);await writeFile(this.directory+'/'+r.id+'.official.json',raw,{mode:0o600,flag:'wx'});
   const result=JSON.parse(raw); // only explicit supported complete row-array shapes; unknown CLI contract fails closed.
   const data=Array.isArray(result)?result:result?.data??result?.rows??result?.result;
   return await this.accept(r.id,{id:r.id,fingerprint:r.fingerprint,data});
  }catch(e){await atomicPrivate66(this.directory+'/'+r.id+'.request.json',{...r,status:'failed'});throw e}
 }
 async accept(id:string,envelope:{id:string;fingerprint:string;data:unknown}){
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid request identity');
  const p=this.directory+'/'+id+'.request.json';const r=JSON.parse(await readFile(p,'utf8')) as Request66;
  if(r.status!=='pending')throw Error('Stale/late/duplicate official response');
  if(envelope.id!==r.id||envelope.fingerprint!==r.fingerprint)throw Error('Official response identity/fingerprint mismatch');
  const data=envelope.data;if(!Array.isArray(data)||data.length!==1||!data[0]||typeof data[0]!=='object'||Array.isArray(data[0]))throw Error('Official response schema refused');
  for(const k of r.expectedKeys)if(!(k in data[0]))throw Error('Official response missing '+k);
  await atomicPrivate66(this.directory+'/'+id+'.response.json',envelope);await atomicPrivate66(p,{...r,status:'consumed'});return data[0];
 }
}