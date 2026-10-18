import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ControllerMessage69,decode69,request69,sha69} from '../../docs/testes/issue333/pilot8/controller-message69';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {QUERY70,syntheticEnvelope70} from './fixtures/issue333-envelope70';

const UPSTREAM_SHA256='3be41a3c2e7de0239ec55b1e750c8373e355ca6267d1c2870a74a579672fd130';
const UPSTREAM_BYTES=18942;
const localProof=process.env.ISSUE333_LOCAL_PROOF==='1';
const UNIT='ação — 東京|';

const schema70=(r:Record<string,unknown>)=>{
  if(r.n!==1024||typeof r.n!=='number')throw Error('n type/value mismatch');
  if(typeof r.payload!=='string')throw Error('payload type mismatch');
  const p=r.payload as string;
  if(p.length!==UNIT.length*1024)throw Error('payload length mismatch');
  if(p!==UNIT.repeat(1024))throw Error('payload content mismatch');
  const nv=r.nested_value as Record<string,unknown>;
  if(typeof nv!=='object'||nv===null||Array.isArray(nv))throw Error('nested_value type mismatch');
  if(nv.nullable!==null)throw Error('nested nullable mismatch');
  if(JSON.stringify(nv.items)!==JSON.stringify([1,'ação',true]))throw Error('nested items mismatch');
};

describe('contrato70 — fixture sintética versionada, NÃO prova Cloud/upstream',()=>{
  it('synthetic UTF8 bytes survive strict decoding without reserialization',()=>{
    const raw=syntheticEnvelope70();
    const r=request69('proof70-synthetic-0001',QUERY70,['n','nested_value','payload']);
    const result=decode69(raw,r,schema70,true);
    expect(result.receipt.bytes).toBe(raw.byteLength);
    expect(result.receipt.envelopeSha256).toBe(createHash('sha256').update(raw).digest('hex'));
  });
  it('strict decode69 validates id/query/fingerprint/schema and exact payload',async()=>{
    const raw=syntheticEnvelope70();
    const r=request69('proof70-synthetic-0001',QUERY70,['n','nested_value','payload']);
    expect(r.fingerprint).toBe('9c1588ccaaef8c4fbcdb007da46ddd4668caf8932fe3eeca0810c80541c6042f');
    const result=decode69(new Uint8Array(raw),r,schema70,true);
    expect(result.receipt.envelopeSha256).toBe(sha69(raw));
    expect(result.receipt.bytes).toBe(raw.byteLength);
    expect(result.receipt.strict).toBe(true);
    expect(result.receipt.rows).toBe(1);
  });
  it('full receiver flow persists raw bytes 0600 and consumes once',async()=>{
    const dir=await mkdtemp(tmpdir()+'/message70-');
    const raw=syntheticEnvelope70();
    const r=request69('proof70-synthetic-0001',QUERY70,['n','nested_value','payload']);
    const t=new ControllerMessage69(dir);
    await t.prepare(r);
    const result=await t.receive(r.id,new Uint8Array(raw),schema70);
    expect(result.receipt.envelopeSha256).toBe(sha69(raw));
    const stored=await readFile(`${dir}/${r.id}.raw.json`);
    expect(stored.equals(raw)).toBe(true);
    await expect(t.receive(r.id,new Uint8Array(raw),schema70)).rejects.toThrow();
  });
  it('rejects tampered payload (one repetition removed) and wrong fingerprint',async()=>{
    const raw=syntheticEnvelope70();
    const r=request69('proof70-synthetic-0001',QUERY70,['n','nested_value','payload']);
    const e=JSON.parse(raw.toString('utf8'));
    e.data[0].payload=UNIT.repeat(1023);
    expect(()=>decode69(Buffer.from(JSON.stringify(e),'utf8'),r,schema70,true)).toThrow();
    e.data[0].payload=UNIT.repeat(1024);e.fingerprint='0'.repeat(64);
    expect(()=>decode69(Buffer.from(JSON.stringify(e),'utf8'),r,schema70,true)).toThrow();
  });
  it('query fingerprint matches upstream QUERY_SHA256',()=>{
    expect(sha69(QUERY70)).toBe('9c1588ccaaef8c4fbcdb007da46ddd4668caf8932fe3eeca0810c80541c6042f');
  });
});

describe.skipIf(!localProof)('prova70 capturada — opt-in ISSUE333_LOCAL_PROOF=1, artefacto local obrigatório',()=>{
  it('captured bytes match actual upstream metadata and strict contract',async()=>{
    let raw:Buffer;
    try{raw=await readFile('/tmp/issue333-proof70/envelope-received.json');}
    catch{throw Error('ISSUE333_LOCAL_PROOF=1 requires captured /tmp/issue333-proof70/envelope-received.json; synthetic fixture is not delivery proof');}
    expect(raw.byteLength).toBe(UPSTREAM_BYTES);
    expect(sha69(raw)).toBe(UPSTREAM_SHA256);
    const r=request69('proof70-synthetic-0001',QUERY70,['n','nested_value','payload']);
    expect(decode69(raw,r,schema70,true).receipt.envelopeSha256).toBe(UPSTREAM_SHA256);
  });
});
