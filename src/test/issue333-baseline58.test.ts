import {it,expect} from 'vitest';
import {baselineSQL,metadataSQL,financial,compareBaselines} from '../../docs/testes/issue333/pilot8/baseline58';
import {OfficialSelectBridge,AuthAdmin57} from '../../docs/testes/issue333/pilot8/private-cloud57';
import {mkdtemp,writeFile} from 'node:fs/promises';
it('monitors both canonical reimbursement relations and preserves NULL-owned historic rows',()=>{
 expect(financial).toContain('reimbursement_notes');expect(financial).toContain('reimbursement_note_items');
 expect(baselineSQL()).not.toContain('public.reimbursements ');expect(baselineSQL()).toContain('approved_by IS DISTINCT FROM');
 expect(metadataSQL()).toContain("('public.reimbursement_note_items','transaction_id')");
});
it('reports concurrent relation changes separately from global configuration',()=>{
 const a={data:[{name:'reimbursement_notes',n:44,h:'a'}],config:[],core_open:0,attempt_open:0};
 expect(compareBaselines(a,{...a,data:[{name:'reimbursement_notes',n:45,h:'b'}]})).toEqual({changedRelations:['reimbursement_notes'],configChanged:false,globalsClosed:true});
});
it('relay unwraps official row arrays, refuses mismatched IDs, and has a finite timeout',async()=>{
 const dir=await mkdtemp('/tmp/issue333-relay58-');const b=new OfficialSelectBridge(dir,300);
 const read=b.select('SELECT 1 n');await new Promise(r=>setTimeout(r,40));await writeFile(dir+'/0001.response.json',JSON.stringify({id:'0001',data:[{n:1}]}));expect(await read).toEqual({n:1});
 const bad=b.select('SELECT 2 n');await new Promise(r=>setTimeout(r,40));await writeFile(dir+'/0002.response.json',JSON.stringify({id:'wrong',data:[{n:2}]}));await expect(bad).rejects.toThrow('identity mismatch');
 await expect(b.select('SELECT 3 n')).rejects.toThrow('deadline');
});
it('Auth HTTP timeout terminates without a retry or second request',async()=>{
 let requests=0;
 const transport:typeof fetch=async(_url,options)=>{requests++;return new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(Error('finite timeout'))))};
 const auth=new AuthAdmin57('http://local','local-service','local-public',transport,20);
 await expect(auth.readProbe()).rejects.toThrow('finite timeout');expect(requests).toBe(1);
});