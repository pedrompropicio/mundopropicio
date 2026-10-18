/** Finite local transport. Never dispatches SQL or polls. Replay is scoped to one action. */
import {readFile,writeFile} from 'node:fs/promises';
import {ControllerMessage69,request69,sha69,MAX_MESSAGE69,type Request69} from './controller-message69';
import {atomicPrivate66,type Driver66} from './checkpoint66';
export class AwaitController71 extends Error {
 constructor(readonly request:Request69){super('Finite controller response required');this.name='AwaitController71'}
}
export type Schema71={type:'object';properties:Record<string,SchemaNode71>};
export type SchemaNode71={type:'union';options:SchemaNode71[]}|{type:'object';properties:Record<string,SchemaNode71>}|{type:'array';items:SchemaNode71}|{type:'string'|'number'|'boolean'|'null';pattern?:string;integer?:boolean;minimum?:number};
export function validate71(value:unknown,s:SchemaNode71):void {
 if(s.type==='union'){for(const option of s.options){try{validate71(value,option);return}catch{}}throw Error('Union type refused')}
 if(s.type==='null'){if(value!==null)throw Error('Null required');return}
 if(s.type==='array'){if(!Array.isArray(value))throw Error('Array required');value.forEach(v=>validate71(v,s.items));return}
 if(s.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Object required');
  const r=value as Record<string,unknown>,keys=Object.keys(s.properties);
  if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.prototype.hasOwnProperty.call(r,k)))throw Error('Exact nested schema required');
  keys.forEach(k=>validate71(r[k],s.properties[k]));return;
 }
 if(typeof value!==s.type)throw Error('Scalar type required');
 if(typeof value==='number'&&(!Number.isFinite(value)||(s.integer&&!Number.isSafeInteger(value))||(s.minimum!==undefined&&value<s.minimum)))throw Error('Bounded number required');
 if(typeof value==='string'&&s.pattern&&!new RegExp(s.pattern).test(value))throw Error('String pattern required');
}
export type Contract71=Request69&{schema:Schema71;estimatedEnvelopeBytes:number;queryBytes:number};
export function contract71(id:string,query:string,schema:Schema71,estimatedEnvelopeBytes=32768):Contract71 {
 const request=request69(id,query,Object.keys(schema.properties));
 const queryBytes=Buffer.byteLength(query);
 if(queryBytes>MAX_MESSAGE69||estimatedEnvelopeBytes>MAX_MESSAGE69)throw Error('Reduce necessary projection; chunks forbidden');
 return {...request,schema,estimatedEnvelopeBytes,queryBytes};
}
export class ControllerCheckpoint71 {
 private cursor=0;
 private method='query';
 begin(method:string){this.method=method;this.cursor=0}
 constructor(readonly directory:string,readonly scope:string,private schemas:(query:string,keys:string[])=>Schema71){
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(scope))throw Error('Scope refused');
 }
 async select(query:string,keys:string[]=[]):Promise<Record<string,any>> {
  if(!keys.length)throw Error('Reviewed schema keys required');
  const id=`${this.scope}-${this.method}-${String(++this.cursor).padStart(4,'0')}`;
  const r=request69(id,query,keys),receiver=new ControllerMessage69(this.directory);
  const schema=this.schemas(query,keys),contract=contract71(id,query,schema);
  const path=`${this.directory}/${id}.request.json`;
  let stored:Request69;
  try{stored=JSON.parse(await readFile(path,'utf8')) as Request69}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await receiver.prepare(r);await writeFile(`${this.directory}/${id}.contract.json`,JSON.stringify(contract),{mode:0o600,flag:'wx'});throw new AwaitController71(r)}
  if(stored.query!==query||stored.fingerprint!==r.fingerprint||JSON.stringify(stored.expectedKeys)!==JSON.stringify(keys))throw Error('Resume query/schema drift');
  const saved=JSON.parse(await readFile(`${this.directory}/${id}.contract.json`,'utf8')) as Contract71;
  if(JSON.stringify(saved.schema)!==JSON.stringify(schema))throw Error('Resume schema drift');
  if(stored.status==='cancelled')throw Error('Cancelled response refused');
  if(stored.status!=='consumed')throw new AwaitController71(r);
  // Receipt must exist; never accept a partially committed receive as consumed.
  const raw=await readFile(`${this.directory}/${id}.raw.json`);
  const receipt=JSON.parse(await readFile(`${this.directory}/${id}.receipt.json`,'utf8'));
  if(receipt.envelopeSha256!==sha69(raw)||receipt.bytes!==raw.length||receipt.strict!==true)throw Error('Stored receipt drift');
  const {decode69}=await import('./controller-message69');
  return decode69(raw,r,row=>validate71(row,schema),true).row;
 }
 async receive(id:string,raw:Uint8Array,upstream:{bytes:number;sha256:string}) {
  if(!Number.isSafeInteger(upstream.bytes)||upstream.bytes!==raw.byteLength||upstream.bytes>MAX_MESSAGE69||! /^[a-f0-9]{64}$/.test(upstream.sha256)||sha69(raw)!==upstream.sha256)throw Error('Independent upstream size/hash mismatch');
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('Request id refused');
  const c=JSON.parse(await readFile(`${this.directory}/${id}.contract.json`,'utf8')) as Contract71;
  if(c.id!==id)throw Error('Contract identity drift');
  return new ControllerMessage69(this.directory).receive(id,raw,row=>validate71(row,c.schema));
 }
}
/** Completed methods are replayed, not repeated; started effects are uncertain and stop.
 * Private journal may contain a session: it is never exported as evidence. */
export function durableDriver71(d:Driver66,directory:string,scope:string,transport:ControllerCheckpoint71):Driver66 {
 const effectMethods=new Set(['login','chromium','checkReadOnly','logoutGlobal','banOnlyCreatedUser']);
 return new Proxy(d,{get(target,key){
  const original=Reflect.get(target,key);
  if(typeof original!=='function'||['bindIdentity','importContext','exportContext','validatePdf','now','wait','secret'].includes(String(key)))return typeof original==='function'?original.bind(target):original;
  return async(...args:unknown[])=>{
   transport.begin(String(key));
   const path=`${directory}/${scope}-${String(key)}.method.json`;
   let cached:any;try{cached=JSON.parse(await readFile(path,'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
   if(cached?.status==='complete'){target.importContext(cached.context);return cached.value}
   if(cached?.status==='started')throw Error('Uncertain effect; cleanup only, never retry');
   // Methods containing SELECT can suspend; their inner effects have their own journal.
   if(effectMethods.has(String(key))&&!['chromium','checkReadOnly'].includes(String(key)))await atomicPrivate66(path,{status:'started'});
   let value;try{value=await original.apply(target,args)}catch(e){if(process.env.ISSUE333_LOCAL_DEBUG==='1'&&e instanceof Error&&e.name!=='AwaitController71')console.error(String(key),e.message);throw e}
   await atomicPrivate66(path,{status:'complete',value,context:target.exportContext()});return value;
  };
 }});
}
export async function effect71<T>(directory:string,key:string,fn:()=>Promise<T>):Promise<T> {
 if(!/^[a-zA-Z0-9_-]+$/.test(key))throw Error('Effect key refused');
 const path=`${directory}/${key}.effect.json`;
 let saved:any;try{saved=JSON.parse(await readFile(path,'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
 if(saved?.status==='complete')return saved.value as T;
 if(saved)throw Error('Uncertain inner effect; cleanup only');
 await atomicPrivate66(path,{status:'started'});const value=await fn();await atomicPrivate66(path,{status:'complete',value});return value;
}