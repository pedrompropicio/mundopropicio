/** Local-only finite message receiver. Never dispatches SQL, logs in, or waits for a controller. */
import {createHash} from 'node:crypto';
import {mkdir,open,readFile,rename,unlink,writeFile,stat} from 'node:fs/promises';
export const sha69=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const MAX_MESSAGE69=64*1024;
export type Request69={version:1;id:string;query:string;fingerprint:string;maxBytes:number;expectedKeys:string[];status:'pending'|'consumed'|'cancelled'};
export function request69(id:string,query:string,expectedKeys:string[]):Request69 {
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('Request id refused');
 if(!Array.isArray(expectedKeys)||expectedKeys.length===0||expectedKeys.some(k=>typeof k!=='string'||!k)||new Set(expectedKeys).size!==expectedKeys.length)throw Error('Expected keys refused');
 // Constant/reviewed single SELECT only; not a general SQL sandbox or proof that arbitrary functions are read-only.
 if(!/^SELECT\s/i.test(query)||/[;\u0000]|--|\/\*|\*\//.test(query))throw Error('Single reviewed SELECT required');
 return {version:1,id,query,fingerprint:sha69(query),maxBytes:MAX_MESSAGE69,expectedKeys,status:'pending'};
}
type Record69=Record<string,unknown>;
const object69=(v:unknown):v is Record69=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function decode69(raw:Uint8Array,r:Request69,validateRow:(row:Record69)=>void,strict=true){
 if(JSON.stringify(r)!==JSON.stringify(request69(r.id,r.query,r.expectedKeys)))throw Error('Fresh bounded request required');
 if(r.status!=='pending'||r.fingerprint!==sha69(r.query))throw Error('Stale request or query fingerprint drift');
 if(raw.byteLength>r.maxBytes)throw Error('Oversized envelope refused; no untested chunks');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 const e:unknown=JSON.parse(text);
 if(!object69(e))throw Error('Envelope object required; double encoding refused');
 const allowed=strict?['version','id','query','fingerprint','source','data','rowCount']:['id','query','source','data'];
 if(Object.keys(e).length!==allowed.length||Object.keys(e).some(k=>!allowed.includes(k)))throw Error('Envelope shape refused');
 if(e.id!==r.id||e.query!==r.query||typeof e.source!=='string'||!e.source)throw Error('Request identity/query/source mismatch');
 if(strict&&(e.version!==1||e.fingerprint!==r.fingerprint))throw Error('Protocol version/fingerprint mismatch');
 if(!Array.isArray(e.data)||e.data.length!==1||!object69(e.data[0]))throw Error('One aggregate row required');
 if(strict&&e.rowCount!==e.data.length)throw Error('Row count mismatch');
 const row=e.data[0];
 if(Object.keys(row).length!==r.expectedKeys.length||r.expectedKeys.some(k=>!Object.prototype.hasOwnProperty.call(row,k)))throw Error('Row schema keys mismatch');
 validateRow(row);
 return {row,receipt:{id:r.id,queryFingerprint:r.fingerprint,envelopeSha256:sha69(raw),bytes:raw.byteLength,strict,rows:1}};
}
export class ControllerMessage69 {
 constructor(readonly directory:string){if(!directory.startsWith('/tmp/'))throw Error('Private /tmp directory required')}
 private async atomic(path:string,data:string|Uint8Array){const t=path+'.tmp';await writeFile(t,data,{mode:0o600,flag:'wx'});await rename(t,path)}
 async prepare(r:Request69){
  const fresh=request69(r.id,r.query,r.expectedKeys);
  if(JSON.stringify(r)!==JSON.stringify(fresh))throw Error('Fresh request contract required');
  await mkdir(this.directory,{recursive:true,mode:0o700});
  const active=await open(`${this.directory}/active.json`,'wx',0o600);
  try{await active.writeFile(JSON.stringify({id:r.id,fingerprint:r.fingerprint}))}finally{await active.close()}
  const file=await open(`${this.directory}/${r.id}.request.json`,'wx',0o600);try{await file.writeFile(JSON.stringify(r))}finally{await file.close()}
 }
 async receive(id:string,raw:Uint8Array,validateRow:(row:Record69)=>void){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('Request id refused');
  const p=`${this.directory}/${id}`;const lock=await open(p+'.lock','wx',0o600);
  try{
   const active=JSON.parse(await readFile(`${this.directory}/active.json`,'utf8')) as {id:string;fingerprint:string};
   if(active.id!==id)throw Error('Out of order response refused');
   const info=await stat(p+'.request.json');if((info.mode&0o777)!==0o600)throw Error('Private request permissions required');
   const r=JSON.parse(await readFile(p+'.request.json','utf8')) as Request69;
   if(r.id!==id||active.fingerprint!==r.fingerprint||r.version!==1||r.maxBytes!==MAX_MESSAGE69)throw Error('Stored request mismatch');
   const result=decode69(raw,r,validateRow,true);
   // Original UTF8 bytes, not JSON.stringify(data). Evidence committed before consumption.
   await this.atomic(p+'.raw.json',raw);
   await this.atomic(p+'.receipt.json',JSON.stringify(result.receipt));
   await this.atomic(p+'.request.json',JSON.stringify({...r,status:'consumed'}));
   await unlink(`${this.directory}/active.json`);
   return result;
  }finally{await lock.close();await unlink(p+'.lock')}
 }
 async cancel(id:string){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('Request id refused');
  const p=`${this.directory}/${id}`;const lock=await open(p+'.lock','wx',0o600);
  try{
   const active=JSON.parse(await readFile(`${this.directory}/active.json`,'utf8')) as {id:string};
   const r=JSON.parse(await readFile(p+'.request.json','utf8')) as Request69;
   if(active.id!==id||r.status!=='pending')throw Error('Cancellation refused');
   await this.atomic(p+'.request.json',JSON.stringify({...r,status:'cancelled'}));await unlink(`${this.directory}/active.json`);
  }finally{await lock.close();await unlink(p+'.lock')}
 }
}