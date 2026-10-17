import { createCitiesReader } from "../../supabase/functions/newgang-portal/cities.ts";
import { profileConfirm } from "../../supabase/functions/newgang-portal/profile.ts";
const rows = JSON.parse(await Deno.readTextFile(new URL('../../docs/testes/issue332/cities/caop2025-municipalities.json',import.meta.url).pathname));
const response = {country:'PT',version:'caop-2025',cities:rows.map((r: any)=>({code:r.codigo,name:r.nome,region:r.regiao,secret:'SENTINEL'}))};
const ck=(b:boolean)=>{if(!b)throw new Error('assertion failed');};
Deno.test('public reference bounded cache strips unrelated fields',async()=>{
 let calls=0,t=0;const read=createCitiesReader(async()=>{calls++;return {data:response,error:null};},()=>t);
 const a=await read();ck(a.status===200&&JSON.stringify(a.body).indexOf('SENTINEL')<0);await read();ck(calls===1);t=60000;await read();ck(calls===2);
});
Deno.test('missing RPC fails closed and does not cache failure',async()=>{
 let calls=0;const read=createCitiesReader(async()=>{calls++;return calls===1?{data:null,error:{message:'PRIVATE_SENTINEL'}}:{data:response,error:null};});
 ck((await read()).status===503);ck((await read()).status===200);ck(calls===2);
});
Deno.test('incomplete or duplicate references never publish',async()=>{
 for(const cities of [response.cities.slice(1),response.cities.map((r:any)=>({...r,code:'0101'}))])ck((await createCitiesReader(async()=>({data:{...response,cities},error:null}))()).status===503);
});
Deno.test('PT unknown error preserved and no session stays401',async()=>{
 for(const [message,status] of [['city_unknown',400],['no_session',401]] as const){const result=await profileConfirm(async()=>({data:null,error:{message}}),'s','h',{});ck(result.status===status&&(result.body as {error?:string}).error===message);}
});
