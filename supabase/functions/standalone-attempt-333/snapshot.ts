/** Called only after canonical check; labels are optional and never authorize effects. */
type Row = Record<string, any>;
type Chain = { eq(column:string,value:string):Chain; limit(n:number):Chain; maybeSingle():PromiseLike<{data:Row|null;error:unknown}> };
type Reader = {from(table:string):{select(columns:string):Chain}};
export async function readSnapshot(admin:Reader,user:string,company:string,operation:string,id:string,hash:string) {
 const {data,error}=await admin.from('standalone_attempts_333').select('id,company_id,principal,operation,envelope_hash,envelope').eq('id',id).eq('company_id',company).eq('principal',user).eq('operation',operation).eq('envelope_hash',hash).maybeSingle();
 if(error||!data)return null;
 const label=async(table:string,column:string,key:string,value:string)=>{try{const r=await admin.from(table).select(column).eq(key,value).maybeSingle();return !r.error&&typeof r.data?.[column]==='string'?r.data[column]:null}catch{return null}};
 const payer=async()=>{const payerId=data.envelope?.payload?.paid_by_partner_id;if(typeof payerId!=='string')return null;
  try{const membership=await admin.from('user_roles').select('user_id').eq('user_id',payerId).eq('company_id',company).limit(1).maybeSingle();if(membership.error||!membership.data)return null;return await label('profiles','full_name','id',payerId)}catch{return null}
 };
 const [companyName,actorName,payerName]=await Promise.all([label('companies','display_name','id',company),label('profiles','full_name','id',user),payer()]);
 return {company_name:companyName,actor_name:actorName,payer_name:payerName,id:data.id,user_id:data.principal,company_id:data.company_id,operation:data.operation,hash:data.envelope_hash,envelope:data.envelope};
}