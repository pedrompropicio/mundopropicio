import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readCapabilities} from '../../../supabase/functions/standalone-attempt-333/capabilities';
vi.mock('npm:zod@3.23.8',async()=>import('zod'));
import {createAttemptHandler} from '../../../supabase/functions/standalone-attempt-333/handler';
const U='22222222-2222-4222-8222-222222222222',C='11111111-1111-4111-8111-111111111111';
beforeEach(()=>vi.stubGlobal('fetch',()=>{throw Error('external egress forbidden')}));
describe('#333 active canonical capability reader',()=>{
 it.each([null,{},[],{scanner_create:'true',accountant_edit:1}])('absent or malformed response remains closed: %j',async data=>{
  expect(await readCapabilities({rpc:async()=>({data,error:null})})).toEqual({scanner_create:false,accountant_edit:false});
 });
 it.each([{scanner_create:true,accountant_edit:false},{scanner_create:false,accountant_edit:true},{scanner_create:false,accountant_edit:false}])('reads only canonical booleans: %j',async data=>{
  const rpc=vi.fn(async()=>({data:{...data,sensitive:'ignored'},error:null}));
  expect(await readCapabilities({rpc})).toEqual(data);expect(rpc).toHaveBeenCalledExactlyOnceWith('standalone_attempt_capability_333');
 });
 it('error or lost service response never enables from stale data',async()=>{
  expect(await readCapabilities({rpc:async()=>({data:{scanner_create:true},error:Error('denied')})})).toEqual({scanner_create:false,accountant_edit:false});
  expect(await readCapabilities({rpc:async()=>{throw Error('offline')}})).toEqual({scanner_create:false,accountant_edit:false});
 });
 it('handler resolves auth and canonical context before service reader and performs no writes',async()=>{
  const capabilities=vi.fn(()=>readCapabilities({rpc:async()=>({data:{scanner_create:false,accountant_edit:true},error:null})}));
  const transport=vi.fn(()=>{throw Error('mutation forbidden')});
  const user=vi.fn(async()=>({id:U}));const context=vi.fn(async()=>({company_id:C}));
  const handler=createAttemptHandler({user,context,capabilities,transport,cors:{'Access-Control-Allow-Origin':'*'}});
  const request=(extra:Record<string,string>={})=>new Request('http://fixture',{method:'POST',headers:{Authorization:'Bearer fixture','X-Attempt-User':U,'X-Attempt-Company':C,...extra},body:JSON.stringify({action:'capabilities'})});
  expect((await handler(new Request('http://fixture',{method:'POST',body:'{}'}))).status).toBe(401);
  user.mockResolvedValueOnce(null as unknown as {id:string});expect((await handler(request())).status).toBe(401);
  context.mockResolvedValueOnce(null as unknown as {company_id:string});expect((await handler(request())).status).toBe(403);
  expect((await handler(request({'X-Attempt-Company':U}))).status).toBe(409);expect(capabilities).not.toHaveBeenCalled();
  const result=await handler(request());expect(result.status).toBe(200);expect(await result.json()).toEqual({capabilities:{scanner_create:false,accountant_edit:true}});
  expect(transport).not.toHaveBeenCalled();expect(capabilities).toHaveBeenCalledTimes(1);
  expect((await handler(new Request('http://fixture',{method:'OPTIONS'}))).headers.get('Access-Control-Allow-Origin')).toBe('*');expect(capabilities).toHaveBeenCalledTimes(1);
 });
});