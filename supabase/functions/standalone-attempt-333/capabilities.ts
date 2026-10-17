/** Service-only canonical reader; errors never enable a mutation. */
type Capabilities = Record<'scanner_create'|'accountant_edit',boolean>;
type ServiceReader = { rpc(name:string):PromiseLike<{data:unknown;error:unknown}> };
export async function readCapabilities(admin:ServiceReader):Promise<Capabilities> {
 const closed:Capabilities={scanner_create:false,accountant_edit:false};
 try {
  const {data,error}=await admin.rpc('standalone_attempt_capability_333');
  if(error || !data || typeof data!=='object' || Array.isArray(data))return closed;
  const value=data as Partial<Capabilities>;
  return {scanner_create:value.scanner_create===true,accountant_edit:value.accountant_edit===true};
 } catch {return closed;}
}