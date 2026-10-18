/** Real handler; SIMULATED transport only, never Cloud/SQL proof. */
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAttemptHandler} from '../../../supabase/functions/standalone-attempt-333/handler';
const U='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333';
it.each(['check','execute'])('pending42501 real handler %s409 no retry/snapshot/bytes/effects',async action=>{
 const rpc=vi.fn(async()=>{throw {code:'42501',message:'#333: Hash divergente'}}),upload=vi.fn(),read=vi.fn(),verifyReceipt=vi.fn(),snapshot=vi.fn();
 const handler=createAttemptHandler({user:async()=>({id:U}),context:async()=>({company_id:C}),cors:{},snapshot,transport:()=>({rpc,upload,read,verifyReceipt})});
 const response=await handler(new Request('http://localhost/check',{method:'POST',headers:{Authorization:'Bearer synthetic-local','X-Attempt-User':U,'X-Attempt-Company':C},body:JSON.stringify({action,operation:'scanner_create',id:A,hash:'b'.repeat(64),...(action==='execute'?{conteudo_base64:''}:{})})}));
 expect(response.status).toBe(409);expect((await response.json()).status).toBe('pendente');expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('check',A,null,'b'.repeat(64));for(const spy of [upload,read,verifyReceipt,snapshot])expect(spy).not.toHaveBeenCalled();
});
it('pending unique branch, historical source40001 unchanged and no grants/data statements',()=>{
 const old=readFileSync('drizzle/migrations/0191_issue333_attempts_closed_structure.sql','utf8'),sql=readFileSync('supabase/manual/20261018_issue333_hash-check.PENDENTE.sql','utf8');
 expect(old.split("IF p_hash IS DISTINCT FROM v.envelope_hash THEN RAISE EXCEPTION '#333: Hash divergente' USING ERRCODE='40001'; END IF;").length-1).toBe(1);
 expect(sql).toContain("ERRCODE=CASE WHEN p_action='check' THEN '42501' ELSE '40001' END");expect(sql).toContain('91f7e9690436c59666c800fb63eb344c');expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE)\b/);
});
