// Executed against a temporary copy of the REAL patched index.ts; no network permissions.
import { handler, testPublicCache } from "./handler-under-test.ts";
import { fake } from "./handler-client.ts";
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));}
const token="fixture-access-token-000000000000";
async function call(action:string,extra:Record<string,unknown>={}) {const r=await handler(new Request("https://example.invalid",{method:"POST",headers:{origin:"https://newgangfestival.pt","content-type":"application/json"},body:JSON.stringify({action,...extra})})); return {status:r.status,body:await r.json()};}
function core(b:any){eq(b.points,1500);eq(b.level,"Goat");eq(b.level_protected,true);eq(b.referrals.confirmed_friends,5);eq(b.pending_crew.status,"crew_full");eq(b.history.length,1);eq(b.crew.name,"Fixture Crew");}
for(const failure of ["missing","timeout","denied","sql"]){
 Deno.test(`handler ${failure}: site/bundle/me preserve 327/328 and public cache`,async()=>{
  fake.failure=failure;fake.member=true;
  for(const action of ["site","bundle"]){const r=await call(action);eq(r.status,200);const site=action==="bundle"?r.body.site:r.body;eq(site.club.profile_mission.available,false);eq(site.club.profile_mission.points,null);eq(site.club.profile_mission.status,"error");eq(site.club.rules.find((r:any)=>r.rule_key==="friend_joined").points,75);eq(site.club.rules_unavailable[0].rule_key,"promo_lot_purchase");eq(site.club.levels.map((r:any)=>r.min_points),[0,750,3000]);}
  const me=await call("me",{token});eq(me.status,200);core(me.body);eq(me.body.profile,null);eq(me.body.profile_status,"temporarily_unavailable");
  for(const privateKey of ["birth_date","city","phone","PRIVATE_SENTINEL"]){eq(JSON.stringify(testPublicCache()).includes(privateKey),false);const pub=await call("bundle",{token});eq(JSON.stringify(pub.body).includes(privateKey),false);}
 });
}
Deno.test("handler config enabled/disabled/absent and healthy private profile",async()=>{fake.failure="ok";fake.member=true;for(const state of [true,false,null]){fake.enabled=state;const r=await call("site");eq(r.status,200);eq(r.body.club.profile_mission.available,state===true);eq(r.body.club.profile_mission.points,state===true?50:null);}const r=await call("me",{token});core(r.body);eq(r.body.profile.city,"PRIVATE_SENTINEL");eq(r.body.profile_status,"ok");});
Deno.test("handler auth rejection never releases member data",async()=>{fake.failure="ok";fake.member=false;for(const action of ["me","profile_confirm"]){eq(await call(action,{token}),{status:401,body:{error:"no_session"}});}fake.member=true;eq((await call("me",{token:"x"})).status,401);eq((await call("me")).status,401);fake.failure="no_session";eq(await call("me",{token}),{status:401,body:{error:"no_session"}});});
Deno.test("handler confirmation errors no success or retry",async()=>{fake.member=true;for(const failure of ["missing","denied","sql","rejected","parental","disabled","no_session"]){fake.failure=failure;fake.confirmCalls=0;const r=await call("profile_confirm",{token,profile_payload:{confirm:true}});eq(r.status,failure==="no_session"?401:["parental","disabled"].includes(failure)?409:500);eq(r.body.ok,undefined);eq(r.body.awarded,undefined);eq(fake.confirmCalls,1);} });
Deno.test("handler countries shape complete ISO list",async()=>{const r=await call("profile_countries");eq(r.status,200);eq(r.body.version,"iso-3166-1-2026-10");eq(r.body.countries.length,249);eq(r.body.countries.find((r:any)=>r.code==="PT"),{code:"PT",name:"Portugal"});});

Deno.test("handler empty profile is unavailable not default zero",async()=>{fake.member=true;fake.failure="empty";const r=await call("me",{token});eq(r.status,200);core(r.body);eq(r.body.profile,null);eq(r.body.profile_status,"temporarily_unavailable");});
