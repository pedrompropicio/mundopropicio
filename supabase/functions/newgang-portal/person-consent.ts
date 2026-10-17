import { optionalRead, type Rpc } from "./profile.ts";
export const CONSENT_TEXTS = {
 email: { version: "email-v3", text: "Aceito receber por email as novidades do Newgang Festival e do Clube Newgang, da Mundo Propício. Posso retirar a autorização a qualquer momento." },
 ads: { version: "anuncios-v1", text: "Autorizo a Mundo Propício a usar o meu email para anúncios no Meta, TikTok e Google. Posso retirar a qualquer momento." },
};
export async function consentMe(rpc: Rpc, site: string, hash: string) {
 try {
  const {data,error} = await optionalRead(()=>rpc("club_consent_state",{p_site:site,p_session_hash:hash}));
  if(error) throw new Error(error.message);
  if(!data || typeof data!=="object") throw new Error("consent_empty");
  return {consents:data,consents_status:"ok"};
 } catch(e) {
  return {consents:null,consents_status:e instanceof Error && e.message==="no_session"?"no_session":"temporarily_unavailable"};
 }
}
export async function consentPreferences(rpc: Rpc, site: string, hash: string, payload: unknown) {
 try {
  const {data,error}=await rpc("club_profile_preferences",{p_site:site,p_session_hash:hash,p_payload:payload});
  if(error) {
   const status=error.message==="no_session"?401:error.message==="consent_payload"?400:
    ["parental_flow_required","consent_policy_unavailable","idempotency_conflict","consent_revision_conflict"].includes(error.message)?409:503;
   return {status,body:{error:status===503?"consent_unavailable":error.message}};
  }
  if(!data || typeof data!=="object" || !("ok" in data) || data.ok!==true) return {status:503,body:{error:"consent_unavailable"}};
  return {status:200,body:data};
 } catch { return {status:503,body:{error:"consent_unavailable"}}; }
}