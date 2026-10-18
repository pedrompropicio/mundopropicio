import {describe,it,expect} from 'vitest';
import {readSnapshot} from '../../../supabase/functions/standalone-attempt-333/snapshot';
function fixture(member=false,optionalError=false,missing=false){
 const calls:Array<{table:string;filters:Record<string,string>}> = [];
 const admin={from(table:string){const filters:Record<string,string>={};const chain={select(){return chain},eq(k:string,v:string){filters[k]=v;return chain},limit(){return chain},async maybeSingle(){calls.push({table,filters});if(table==='standalone_attempts_333')return {data:missing?null:{id:'a',principal:'owner',company_id:'co',operation:'scanner_create',envelope_hash:'hash',envelope:{payload:{paid_by_partner_id:'foreign'}}},error:null};if(table==='user_roles')return {data:member?{user_id:'foreign'}:null,error:null};return {data:optionalError?null:{full_name:'allowed',display_name:'company'},error:optionalError?Error('column unavailable'):null}};return chain}};
 return {admin,calls};
}
describe('#333 read-only snapshot privacy',()=>{
 it('foreign payer cannot cause a profile read or disclose a name',async()=>{const f=fixture();const s=await readSnapshot(f.admin,'owner','co','scanner_create','a','hash');expect(s?.payer_name).toBe(null);expect(f.calls.filter(c=>c.table==='profiles').map(c=>c.filters.id)).toEqual(['owner']);expect(f.calls.find(c=>c.table==='user_roles')?.filters).toEqual({user_id:'foreign',company_id:'co'});expect(f.calls[0].filters).toEqual({id:'a',company_id:'co',principal:'owner',operation:'scanner_create',envelope_hash:'hash'});});
 it('same-company canonical membership permits the optional payer label',async()=>{const f=fixture(true);expect((await readSnapshot(f.admin,'owner','co','scanner_create','a','hash'))?.payer_name).toBe('allowed');});
 it('optional missing columns or label errors do not lose the immutable snapshot',async()=>{const f=fixture(true,true);const s=await readSnapshot(f.admin,'owner','co','scanner_create','a','hash');expect(s?.envelope.payload.paid_by_partner_id).toBe('foreign');expect([s?.company_name,s?.actor_name,s?.payer_name]).toEqual([null,null,null]);});
 it('absent checked reservation reads no profiles or company labels',async()=>{const f=fixture(false,false,true);expect(await readSnapshot(f.admin,'owner','co','scanner_create','a','hash')).toBe(null);expect(f.calls.map(c=>c.table)).toEqual(['standalone_attempts_333']);});
});