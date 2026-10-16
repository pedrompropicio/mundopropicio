// #330 module inerte, sans réseau propre. Identité dérivée de la session dans la RPC.
import { COUNTRIES } from "./countries.ts";
export type Rpc = (fn: string,args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: {message: string; code?: string | null} | null }>;
export const PROFILE_ACTIONS = ["profile_confirm", "profile_preferences"] as const;
export function profileError(message: string): number {
 if (message === "no_session") return 401;
 if (message === "parental_flow_required" || message === "profile_unavailable") return 409;
 if (["profile_payload","profile_confirmation_required","birth_date_invalid","country_invalid","city_invalid","phone_invalid"].includes(message)) return 400;
 return 500;
}
export async function profileState(rpc: Rpc,site: string,hash: string) {
 const {data,error}=await rpc("club_profile_state",{p_site:site,p_session_hash:hash});
 if(error) throw new Error(error.message);
 if(!data || typeof data!=="object") throw new Error("profile_state_empty");
 return data;
}
// Optional reads are isolated; authentication failures must escape the fallback.
export const PROFILE_READ_TIMEOUT_MS = 1500;
export async function optionalRead<T>(read: () => PromiseLike<T>): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try { return await Promise.race([Promise.resolve().then(read), new Promise<never>((_, reject) => { timer=setTimeout(()=>reject(new Error("profile_read_timeout")),PROFILE_READ_TIMEOUT_MS); })]); }
 finally { if(timer !== undefined) clearTimeout(timer); }
}
export async function profileMe(rpc: Rpc,site: string,hash: string) {
 try { return {profile:await optionalRead(()=>profileState(rpc,site,hash)),profile_status:"ok"}; }
 catch(e) {
  if(e instanceof Error && e.message === "no_session") return {profile:null,profile_status:"no_session"};
  return {profile:null,profile_status:"temporarily_unavailable",profile_error:"profile_state_unavailable"};
 }
}
export async function profileRuleRead(read: () => PromiseLike<{data: unknown;error: unknown}>) {
 try { const {data,error}=await optionalRead(read); if(error) throw new Error("profile_config_unavailable"); return publicProfileRule(data); }
 catch { return {...publicProfileRule(null),status:"error",error:"profile_config_unavailable"}; }
}
export async function profileConfirm(rpc: Rpc,site: string,hash: string,payload: unknown) {
 try {
 const {data,error}=await rpc("club_profile_confirm",{p_site:site,p_session_hash:hash,p_payload:payload});
 if(error) return {status:profileError(error.message),body:{error:profileError(error.message)===500?"profile_confirm_unavailable":error.message}};
 if(!data || typeof data!=="object") return {status:500,body:{error:"profile_state_empty"}};
 return {status:200,body:data};
 } catch { return {status:500,body:{error:"profile_confirm_unavailable"}}; }
}
// Adapter WhatsApp bloqué: la preuve #322 ne couvre que meta_ads; aucune fausse préférence locale.
export function profilePreferences() { return {status:409,body:{error:"whatsapp_adapter_pending"}}; }
export const profileCountries = () => Object.entries(COUNTRIES).map(([code,name])=>({code,name}));
export function publicProfileRule(rows: unknown) {
 const settings=(Array.isArray(rows)?rows[0]:rows) as {enabled?: boolean;version?:string}|null;
 return {rule_key:"profile_complete",label:"Completa o teu perfil",points:settings?.enabled?50:null,cap:50,scope:"adesao",version:settings?.version??"profile-v1",available:settings?.enabled===true,status:settings?.enabled?"ok":"indisponivel"};
}
