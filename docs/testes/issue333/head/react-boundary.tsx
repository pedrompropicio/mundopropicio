import React, {useSyncExternalStore} from 'react';
const state={user:'22222222-2222-4222-8222-222222222222',company:'11111111-1111-4111-8111-111111111111'};
const listeners=new Set<()=>void>();
(window as any).localContext=(user:string,company:string)=>{state.user=user;state.company=company;window.dispatchEvent(new CustomEvent('mp:active-company-changed',{detail:{companyId:company}}));for(const l of listeners)l()};
function useStateBoundary(){useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb)},()=>state.user+state.company);return state}
export const useAuth=()=>{const s=useStateBoundary();return {user:{id:s.user},loading:false,isAdmin:false,isAccountant:false}};
export const useCompany=()=>({companyId:useStateBoundary().company});
export const useToast=()=>({toast:(t:any)=>{const node=document.getElementById('local-toast');if(node)node.textContent=t.title+' '+(t.description??'')}});
async function post(path:string,body:any){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();return {data,error:r.ok?null:Error('Local boundary '+r.status)}}
export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:state.user},access_token:'local-owner'}}})},rpc:async(name:string,args:any)=>post('/local/rpc',{name,args,user:state.user,company:state.company}),functions:{invoke:async(name:string,o:any)=>{const r=await fetch('/functions/v1/'+name,{method:'POST',headers:{Authorization:'Bearer local-owner','Content-Type':'application/json',...o.headers},body:JSON.stringify(o.body)});return {data:await r.json(),error:r.ok?null:Error('HTTP '+r.status)}}},
from:(table:string)=>{const filters:any={};const q:any={select:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q},is:()=>q,gte:()=>q,lt:()=>q,order:()=>q,limit:()=>q,then:(ok:any,bad:any)=>post('/local/query',{table,filters,user:state.user,company:state.company}).then(ok,bad)};return q},storage:{from:(bucket:string)=>({download:async(path:string)=>{const r=await fetch('/local/storage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bucket,path})});return {data:r.ok?await r.blob():null,error:r.ok?null:Error('Local read failed')}}})}};
export const prepareFileForInvoiceOcr=async()=>({ok:false});
export const fileToBase64=()=>{throw Error('OCR unavailable')};

export const getCurrentCompanyId=async()=>state.company;
