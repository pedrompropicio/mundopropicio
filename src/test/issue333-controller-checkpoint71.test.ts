// @vitest-environment node
import {it,expect} from 'vitest';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {ControllerCheckpoint71,AwaitController71,validate71,effect71,type Schema71} from '../../docs/testes/issue333/pilot8/controller-checkpoint71';
import {ControllerMessage69,sha69,MAX_MESSAGE69} from '../../docs/testes/issue333/pilot8/controller-message69';
import {bundle71} from '../../docs/testes/issue333/pilot8/select-bundle71';
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