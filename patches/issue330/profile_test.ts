import { profileConfirm, profileError, profileState, profilePreferences, profileCountries, publicProfileRule } from "./profile.ts";
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));}
Deno.test("50 rule public only config, no private fields",()=>{eq(publicProfileRule([{enabled:true,version:"profile-v1"}]).points,50);eq(publicProfileRule(null).available,false);eq(profileCountries().length,249);});
Deno.test("confirmation passes only session/site payload to RPC",async()=>{let captured:unknown;const r=await profileConfirm((fn,args)=>{captured={fn,args};return Promise.resolve({data:{awarded:50},error:null});},"site","hash",{confirm:true});eq(r.status,200);eq(captured,{fn:"club_profile_confirm",args:{p_site:"site",p_session_hash:"hash",p_payload:{confirm:true}}});});
Deno.test("401 expired session",async()=>{eq((await profileConfirm(()=>Promise.resolve({data:null,error:{message:"no_session"}}),"s","h",{})).status,401);});
Deno.test("parental dependency 409 no invented proof",()=>eq(profileError("parental_flow_required"),409));
Deno.test("whatsapp deny/revoke adapter pending independent",()=>eq(profilePreferences(),{status:409,body:{error:"whatsapp_adapter_pending"}}));
Deno.test("credit fault no success",async()=>eq((await profileConfirm(()=>Promise.resolve({data:null,error:{message:"profile_credit_failed"}}),"s","h",{})).status,500));
Deno.test("empty/error state explicit not fake 50",async()=>{for(const error of [null,{message:"offline"}]){let failed=false;try{await profileState(()=>Promise.resolve({data:null,error}),"s","h");}catch{failed=true;}eq(failed,true);}});
Deno.test("payload/country error status",()=>{eq(profileError("profile_payload"),400);eq(profileError("country_invalid"),400);});
