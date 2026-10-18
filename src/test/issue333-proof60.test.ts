import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {OfficialSelectBridge} from '../../docs/testes/issue333/pilot8/private-cloud57';

const fp=(q:string)=>createHash('sha256').update(q).digest('hex');
async function respond(dir:string,id:string,payload:unknown){await writeFile(`${dir}/${id}.response.json`,JSON.stringify(payload),{mode:0o600});}

it('relay accepts only exact id + query fingerprint + complete expected schema',async()=>{
 const dir=await mkdtemp('/tmp/issue333-bridge60-');const b=new OfficialSelectBridge(dir,1500);
 const q='SELECT 1 AS n';
 const pending=b.select(q,['n']);
 await new Promise(r=>setTimeout(r,50));
 await respond(dir,'0001',{id:'0001',fingerprint:fp(q),data:[{n:0}]});
 expect(await pending).toEqual({n:0});
});
it('relay rejects response with swapped id, wrong fingerprint, missing field or revoked shape',async()=>{
 const dir=await mkdtemp('/tmp/issue333-bridge60-');const b=new OfficialSelectBridge(dir,400);
 const q='SELECT count(*)::int n FROM auth.sessions';
 // wrong id
 let p=b.select(q,['n']);await new Promise(r=>setTimeout(r,30));await respond(dir,'0001',{id:'9999',fingerprint:fp(q),data:[{n:0}]});
 await expect(p).rejects.toThrow('identity mismatch');
 // wrong fingerprint
 p=b.select(q,['n']);await new Promise(r=>setTimeout(r,30));await respond(dir,'0002',{id:'0002',fingerprint:'0'.repeat(64),data:[{n:0}]});
 await expect(p).rejects.toThrow('fingerprint mismatch');
 // missing expected field (the proof59 0011 failure shape: no n at all)
 p=b.select(q,['n']);await new Promise(r=>setTimeout(r,30));await respond(dir,'0003',{id:'0003',fingerprint:fp(q),data:[{revoked:true}]});
 await expect(p).rejects.toThrow('missing expected field: n');
 // scalar/non-row payload
 p=b.select(q,['n']);await new Promise(r=>setTimeout(r,30));await respond(dir,'0004',{id:'0004',fingerprint:fp(q),data:0});
 await expect(p).rejects.toThrow('shape invalid');
});
it('relay never turns an absent field into PASS and times out without any response',async()=>{
 const dir=await mkdtemp('/tmp/issue333-bridge60-');const b=new OfficialSelectBridge(dir,300);
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
 const dir=await mkdtemp('/tmp/issue333-bridge60-');const b=new OfficialSelectBridge(dir,600);
 const q1='SELECT 1 AS n',q2='SELECT 2 AS n';
 const p1=b.select(q1,['n']);const p2=b.select(q2,['n']);
 await new Promise(r=>setTimeout(r,30));
 // out-of-order: response for 0002 arrives first, carrying 0001's id content is fine,
 // but a response addressed to 0001 with 0002's fingerprint must fail
 await respond(dir,'0001',{id:'0001',fingerprint:fp(q2),data:[{n:1}]});
 await expect(p1).rejects.toThrow('fingerprint mismatch');
 // duplicate id on the second request's file is rejected by identity check
 await respond(dir,'0002',{id:'0001',fingerprint:fp(q2),data:[{n:2}]});
 await expect(p2).rejects.toThrow('identity mismatch');
});
