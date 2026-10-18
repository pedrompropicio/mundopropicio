import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {ControllerMessage69,decode69,request69,sha69,MAX_MESSAGE69} from '../../docs/testes/issue333/pilot8/controller-message69';
const req=()=>request69('test69-1','SELECT 1 AS n',['n']);
const bytes=(e:unknown)=>Buffer.from(JSON.stringify(e),'utf8');
const env=(r=req())=>({version:1,id:r.id,query:r.query,fingerprint:r.fingerprint,source:'official controller structuredContent auto-serialization',data:[{n:1}],rowCount:1});
const schema=(r:Record<string,unknown>)=>{if(r.n!==1||typeof r.n!=='number')throw Error('Type/value mismatch')};
describe('finite controller-message69 receiver (local doubles, no Cloud)',()=>{
 it('parses exact supplied public constant without coercing PostgreSQL numeric',async()=>{
  const raw=await readFile('/tmp/issue333-proof69/envelope-received.json');const e=JSON.parse(raw.toString('utf8'));
  const r=request69('proof69-constant-0001',e.query,['array_value','boolean_value','integer_value','nested_value','null_value','numeric_value','unicode_value']);
  const result=decode69(raw,r,row=>{
   expect(row.integer_value).toBe(68);expect(typeof row.integer_value).toBe('number');
   expect(row.numeric_value).toBe('1.25');expect(typeof row.numeric_value).toBe('string');
   expect(row.boolean_value).toBe(true);expect(row.null_value).toBeNull();
   expect(row.unicode_value).toBe('ação — 東京');expect(row.array_value).toEqual([1,2,3]);
   expect(row.nested_value).toEqual({nested:{items:[1,'ação',true],nullable:null}});
  },false);
  expect(result.receipt.bytes).toBe(683);expect(result.receipt.envelopeSha256).toBe(sha69(raw));
  expect((await stat('/tmp/issue333-proof69/envelope-received.json')).mode&0o777).toBe(0o600);
  console.log('CONSTANT69',JSON.stringify(result.receipt));
 });
 it('strict future contract requires fingerprint/version/count',()=>{
  expect(decode69(bytes(env()),req(),schema).receipt.strict).toBe(true);
  const missing={...env()} as Partial<ReturnType<typeof env>>;delete missing.fingerprint;
  expect(()=>decode69(bytes(missing),req(),schema)).toThrow();
 });
 it.each(['id','query','fingerprint','rowCount','version'])('rejects changed %s',key=>{
  expect(()=>decode69(bytes({...env(),[key]:'wrong'}),req(),schema)).toThrow();
 });
 it('rejects double encoding, truncation, map text, invalid UTF8 and oversized bytes',()=>{
  for(const raw of [bytes(JSON.stringify(env())),bytes(env()).subarray(0,20),Buffer.from('map[data:[]]'),Buffer.from([0xff]),Buffer.alloc(MAX_MESSAGE69+1)])expect(()=>decode69(raw,req(),schema)).toThrow();
 });
 it('rejects null/missing/extra keys, wrong types, nested envelope and multirow',()=>{
  for(const data of [null,[{}],[{n:1,secret:'refused'}],[{n:'1'}],[{n:2}],[{n:1},{n:1}],{data:[{n:1}]}])expect(()=>decode69(bytes({...env(),data}),req(),schema)).toThrow();
 });
 it('rejects cancelled/consumed requests and query drift',()=>{
  for(const status of ['cancelled','consumed'] as const)expect(()=>decode69(bytes(env()),{...req(),status},schema)).toThrow();
  expect(()=>decode69(bytes(env()),{...req(),query:'SELECT 2 AS n'},schema)).toThrow();
 });
 it('durably stores exact bytes and receipt before consumption, survives new receiver; rejects duplicate',async()=>{
  const dir=await mkdtemp(tmpdir()+'/message69-');const r=req();const raw=bytes(env(r));
  await new ControllerMessage69(dir).prepare(r);
  await new ControllerMessage69(dir).receive(r.id,raw,schema);
  expect(await readFile(`${dir}/${r.id}.raw.json`)).toEqual(raw);
  expect((await stat(`${dir}/${r.id}.raw.json`)).mode&0o777).toBe(0o600);
  expect(JSON.parse(await readFile(`${dir}/${r.id}.request.json`,'utf8')).status).toBe('consumed');
  await expect(new ControllerMessage69(dir).receive(r.id,raw,schema)).rejects.toThrow();
 });
 it('one outstanding request; cancellation rejects late response after next request; no timer',async()=>{
  const dir=await mkdtemp(tmpdir()+'/message69-');const t=new ControllerMessage69(dir);const r=req();await t.prepare(r);
  const r2=request69('test69-2','SELECT 1 AS n',['n']);await expect(t.prepare(r2)).rejects.toThrow();
  await t.cancel(r.id);await t.prepare(r2);
  await expect(t.receive(r.id,bytes(env(r)),schema)).rejects.toThrow('Out of order');
  await t.receive(r2.id,bytes(env(r2)),schema);
 });
 it('two concurrent replies can consume once only',async()=>{
  const dir=await mkdtemp(tmpdir()+'/message69-');const t=new ControllerMessage69(dir);const r=req();await t.prepare(r);
  const results=await Promise.allSettled([t.receive(r.id,bytes(env(r)),schema),t.receive(r.id,bytes(env(r)),schema)]);
  expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(1);expect(results.filter(v=>v.status==='rejected')).toHaveLength(1);
 });
 it('invalid response leaves request pending; failure committing evidence never becomes consumed',async()=>{
  const dir=await mkdtemp(tmpdir()+'/message69-');const t=new ControllerMessage69(dir);const r=req();await t.prepare(r);
  await expect(t.receive(r.id,bytes({...env(r),fingerprint:'wrong'}),schema)).rejects.toThrow();
  await writeFile(`${dir}/${r.id}.raw.json.tmp`,'blocked',{mode:0o600});
  await expect(t.receive(r.id,bytes(env(r)),schema)).rejects.toThrow();
  expect(JSON.parse(await readFile(`${dir}/${r.id}.request.json`,'utf8')).status).toBe('pending');
 });
 it('rejects traversal and non-SELECT/multiple statements, does not claim arbitrary SELECT safety',()=>{
  expect(()=>request69('../bad','SELECT 1',['n'])).toThrow();
  for(const q of ['DELETE FROM x','SELECT 1; SELECT 2','SELECT 1 -- comment'])expect(()=>request69('valid',q,['n'])).toThrow();
 });
});