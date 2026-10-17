import { handler } from './handler-under-test.ts';
import { fake } from './handler-client.ts';
const ck=(b:boolean)=>{if(!b)throw new Error('assertion failed');};
Deno.test('cities action reads without member/session and caches complete reference',async()=>{
 fake.member=false;fake.citiesCalls=0;
 for(let i=0;i<2;i++){
 const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://newgangfestival.pt','content-type':'application/json'},body:JSON.stringify({action:'cities'})}));
 ck(r.status===200);const b=await r.json();ck(b.cities.length===308&&b.country==='PT'&&b.version==='caop-2025');ck(!JSON.stringify(b).includes('SENTINEL'));}
 ck(fake.citiesCalls===1);
});
Deno.test('real profile_confirm unknown stays400 with no leaked SQL',async()=>{
 fake.member=true;fake.failure='city_unknown';
 const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://newgangfestival.pt','content-type':'application/json'},body:JSON.stringify({action:'profile_confirm',token:'fixture-access-token-000000000000',profile_payload:{confirm:true,city:'Caacais'}})}));
 ck(r.status===400);ck((await r.json()).error==='city_unknown');
});

Deno.test('real profile_confirm country_invalid stays400',async()=>{
 fake.member=true;fake.failure='country_invalid';
 const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://newgangfestival.pt','content-type':'application/json'},body:JSON.stringify({action:'profile_confirm',token:'fixture-access-token-000000000000',profile_payload:{confirm:true,birth_date:'1990-01-01',birth_country:'PT'}})}));
 ck(r.status===400);ck((await r.json()).error==='country_invalid');
});
