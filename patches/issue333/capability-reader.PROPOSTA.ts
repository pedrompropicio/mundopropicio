/** Proposal only: not imported by deployed/active functions. Install only after reviewed DDL authorization. */
type Capabilities = Record<'scanner_create'|'accountant_edit',boolean>;
type ServiceReader = { rpc(name:string):Promise<{data:unknown;error:unknown}> };
export async function proposedCapabilities(admin:ServiceReader):Promise<Capabilities> {
 const closed:Capabilities={scanner_create:false,accountant_edit:false};
 try {
  const {data,error}=await admin.rpc('standalone_attempt_capability_333');
  if(error || !data || typeof data!=='object')return closed;
  const value=data as Partial<Capabilities>;
  return {scanner_create:value.scanner_create===true,accountant_edit:value.accountant_edit===true};
 } catch {return closed;}
}