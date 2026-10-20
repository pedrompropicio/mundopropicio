/** Short-lived signed selectors; browser history/known IDs never establish provenance. No bodies stored. */
import { z } from "npm:zod@3";
import { gmailFilterSchema } from "./gmail-readonly.ts";
const stateSchema = z.object({ user: z.string(), company: z.string(), expires: z.number(), requestHash: z.string(), filters: gmailFilterSchema, messages: z.array(z.string()).max(20), events: z.array(z.string()).max(20), message: z.string().nullable() }).strict();
export type AssistantContinuation = z.infer<typeof stateSchema>;
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key(secret: string) { if (secret.length < 32) throw new Error("Controlo de seleção indisponível."); return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function requestHash(text: string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim())))); }
export async function signContinuation(state: AssistantContinuation, secret: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(stateSchema.parse(state)));
  return `${b64(bytes)}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), bytes)))}`;
}
export async function verifyContinuation(token: string, secret: string, ctx: { user: string; company: string }, text: string, now = Date.now()): Promise<AssistantContinuation> {
  if (token.length > 8000) throw new Error("Seleção inválida.");
  const parts = token.split("."); if (parts.length !== 2) throw new Error("Seleção inválida.");
  const bytes = decode(parts[0]);
  if (!await crypto.subtle.verify("HMAC", await key(secret), decode(parts[1]), bytes)) throw new Error("Seleção inválida.");
  const state = stateSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (state.user !== ctx.user || state.company !== ctx.company || state.expires <= now || state.requestHash !== await requestHash(text)) throw new Error("Seleção expirada ou contexto alterado; repete a pesquisa.");
  return state;
}