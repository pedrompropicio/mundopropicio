import { describe,expect,it,vi } from 'vitest';
import { proposedCapabilities } from '../../../patches/issue333/capability-reader.PROPOSTA';
describe('#333 inert service capability integration proposal',()=>{
 it('absent/unavailable/malformed server response stays closed',async()=>{
  for(const data of [null,{}, {scanner_create:'true',accountant_edit:1}])expect(await proposedCapabilities({rpc:async()=>({data,error:null})})).toEqual({scanner_create:false,accountant_edit:false});
  expect(await proposedCapabilities({rpc:async()=>{throw Error('offline')}})).toEqual({scanner_create:false,accountant_edit:false});
 });
 it('returns strict booleans per operation from canonical service RPC only',async()=>{
  const rpc=vi.fn(async()=>({data:{scanner_create:true,accountant_edit:false,sensitive:'not-returned'},error:null}));
  expect(await proposedCapabilities({rpc})).toEqual({scanner_create:true,accountant_edit:false});expect(rpc).toHaveBeenCalledWith('standalone_attempt_capability_333');
 });
 it('RPC error cannot return stale enabled data',async()=>{expect(await proposedCapabilities({rpc:async()=>({data:{scanner_create:true},error:Error('denied')})})).toEqual({scanner_create:false,accountant_edit:false});});
});