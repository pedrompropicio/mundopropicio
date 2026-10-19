import {it,expect,afterEach} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {OfficialSelectBridge,type SelectBridgeTiming} from '../../docs/testes/issue333/pilot8/private-cloud57';

const fp=(q:string)=>createHash('sha256').update(q).digest('hex');
async function respond(dir:string,id:string,payload:unknown){await writeFile(`${dir}/${id}.response.json`,JSON.stringify(payload),{mode:0o600});}
const directories:string[]=[];
async function fresh(){const dir=await mkdtemp('/tmp/issue333-bridge60-');directories.push(dir);return dir;}
afterEach(async()=>{await Promise.all(directories.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
/** A poll notification occurs only after the request file is committed and the first
 * response read finds ENOENT. No real-time sleep or assumed request ordering. */
class ControlledTiming implements SelectBridgeTiming {
  time=0;
  private sleepers:Array<()=>void>=[];
  private waiter:{count:number;resolve:()=>void}|undefined;
  now=()=>this.time;
  sleep=(ms:number)=>{
    expect(ms).toBe(200);
    return new Promise<void>(resolve=>{
      this.sleepers.push(resolve);
      if(this.waiter&&this.sleepers.length>=this.waiter.count){this.waiter.resolve();this.waiter=undefined;}
    });
  };
  ready(count=1){
    if(this.sleepers.length>=count)return Promise.resolve();
    return new Promise<void>(resolve=>{this.waiter={count,resolve};});
  }
  resume(){for(const resolve of this.sleepers.splice(0))resolve();}
}
async function requestId(dir:string,query:string){
  for(const file of await readdir(dir)){
    if(!file.endsWith('.request.json'))continue;
    const request=JSON.parse(await readFile(`${dir}/${file}`,'utf8'));
    if(request.query===query){expect(request.fingerprint).toBe(fp(query));return request.id as string;}
  }
  throw Error('Committed request missing');
}

it('relay accepts only exact id + query fingerprint + complete expected schema',async()=>{
 const dir=await fresh();const timing=new ControlledTiming();const b=new OfficialSelectBridge(dir,1500,timing);
 const q='SELECT 1 AS n';
 const pending=b.select(q,['n']);
 await timing.ready();const id=await requestId(dir,q);
 await respond(dir,id,{id,fingerprint:fp(q),data:[{n:0}]});timing.resume();
 expect(await pending).toEqual({n:0});
});
it('relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape',async()=>{
 const dir=await fresh();const timing=new ControlledTiming();const b=new OfficialSelectBridge(dir,400,timing);
 const q='SELECT count(*)::int n FROM auth.sessions';
 // wrong id
 let p=b.select(q,['n']);let rejection=expect(p).rejects.toThrow('identity mismatch');await timing.ready();await respond(dir,'0001',{id:'9999',fingerprint:fp(q),data:[{n:0}]});timing.resume();
 await rejection;
 // wrong fingerprint
 p=b.select(q,['n']);rejection=expect(p).rejects.toThrow('fingerprint mismatch');await timing.ready();await respond(dir,'0002',{id:'0002',fingerprint:'0'.repeat(64),data:[{n:0}]});timing.resume();
 await rejection;
 // missing expected field (the proof59 0011 failure shape: no n at all)
 p=b.select(q,['n']);rejection=expect(p).rejects.toThrow('missing expected field: n');await timing.ready();await respond(dir,'0003',{id:'0003',fingerprint:fp(q),data:[{revoked:true}]});timing.resume();
 await rejection;
 // scalar/non-row payload
 p=b.select(q,['n']);rejection=expect(p).rejects.toThrow('shape invalid');await timing.ready();await respond(dir,'0004',{id:'0004',fingerprint:fp(q),data:0});timing.resume();
 await rejection;
});
it('relay never turns an absent field into PASS and times out without any response',async()=>{
 const dir=await fresh();const b=new OfficialSelectBridge(dir,300);
 await expect(b.select('SELECT 1 AS n',['n'])).rejects.toThrow('deadline');
 const files=await readdir(dir);
 expect(files.filter(f=>f.endsWith('.request.json'))).toHaveLength(1);
});
it('browser worker persists browser.json atomically even when a final guard fails',async()=>{
 // Static contract: evidence write lives in finally, before context.close, and pair
 // statuses/bodies are local variables never stored on the args dict.
 const src=await readFile('docs/testes/issue333/pilot8/cloud-browser57.py','utf8');
 expect(src).toContain("atomic_write_json(out/'browser.json',evidence)");
 expect(src.indexOf('finally:')).toBeGreaterThan(src.indexOf("STAGE='execute'"));
 expect(src).not.toContain("args['pair_statuses']");
 expect(src).toContain("evidence['pair_statuses']=statuses");
 expect(src).toContain("evidence['pair_bodies']=bodies");
 expect(src).toContain("'failure':None");
 expect(src).toContain('sanitize_error');
 // failure path must not print raw exception text
 expect(src).toContain("except Exception as exc:");
 expect(src).not.toMatch(/print\(.*str\(exc\)/);
});
it('browser worker asserts pair statuses captured before read-only check',async()=>{
 const src=await readFile('docs/testes/issue333/pilot8/cloud-browser57.py','utf8');
 const iPair=src.indexOf("assert evidence['pair_statuses'] is not None");
 const iCheck=src.indexOf("STAGE='read-only-check'");
 expect(iPair).toBeGreaterThan(-1);expect(iPair).toBeLessThan(iCheck);
});

it('relay rejects stale (out-of-order) and duplicate responses',async()=>{
 const dir=await fresh();const timing=new ControlledTiming();const b=new OfficialSelectBridge(dir,3000,timing);
 const q1='SELECT 1 AS n',q2='SELECT 2 AS n';
 const p1=b.select(q1,['n']);const p2=b.select(q2,['n']);
 const rejection1=expect(p1).rejects.toThrow('fingerprint mismatch');
 const rejection2=expect(p2).rejects.toThrow('identity mismatch');
 await timing.ready(2);
 const id1=await requestId(dir,q1),id2=await requestId(dir,q2);expect(id1).not.toBe(id2);
 // Deliver the second response first with a duplicate first-request identity.
 await respond(dir,id2,{id:id1,fingerprint:fp(q2),data:[{n:2}]});
 // Then deliver a stale second-query fingerprint addressed to the first request.
 await respond(dir,id1,{id:id1,fingerprint:fp(q2),data:[{n:1}]});
 timing.resume();await Promise.all([rejection1,rejection2]);
});

it('relay refuses even an exact response at the controlled deadline, without fallback',async()=>{
 const dir=await fresh();const timing=new ControlledTiming();const b=new OfficialSelectBridge(dir,3000,timing);
 const q='SELECT 1 AS n';const p=b.select(q,['n']);
 const rejection=expect(p).rejects.toThrow('Official SELECT bridge response deadline; no account fallback');
 await timing.ready();const id=await requestId(dir,q);
 await respond(dir,id,{id,fingerprint:fp(q),data:[{n:1}]});
 timing.time=3000;timing.resume();await rejection;
 expect((await readdir(dir)).filter(file=>file.endsWith('.request.json'))).toEqual([`${id}.request.json`]);
});
