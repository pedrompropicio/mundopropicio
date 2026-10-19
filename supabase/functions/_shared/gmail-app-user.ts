/**
 * #333 fase11b — ligação Gmail PRÓPRIA por utilizador+empresa, via App User Connector Google
 * (connector google_mail) do gateway Lovable. Só gmail.readonly. Server-only.
 * - A chave de ligação (lovack_*) nunca sai do servidor; é guardada cifrada (AES-GCM) com AAD
 *   user:company, por isso a linha de um utilizador não decifra noutro vínculo.
 * - Vínculo de origem: cada início cria um nonce de uso único (só o hash é guardado) para o par
 *   user+empresa, com prazo de 10 min; o retorno só é aceite pelo mesmo par, uma vez.
 * - O state/PKCE do OAuth Google é validado pelo gateway (sessão + nonce próprios).
 * - Desligar apaga primeiro a chave local (bloqueia leituras) e só depois revoga no gateway.
 *   Nunca toca em emails.
 */
import { appUserReconnectRequired, authorizeAppUserOAuth, callAsAppUser, disconnectAppUser, exchangeAppUserOAuthCode } from "./appUserConnector.ts";
import { GMAIL_READONLY_SCOPE, GmailUnavailable, gmailReadOnly, type GmailReader } from "./gmail-readonly.ts";

export const GMAIL_CONNECTOR_ID = "google_mail";
export const GMAIL_SCOPES = [GMAIL_READONLY_SCOPE] as const;
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const RETURN_PATH = "/oauth/gmail/return";
export const BINDING_TTL_MS = 10 * 60 * 1000;
/** Origens onde a página de retorno pode correr. Qualquer outra é recusada. */
export const RETURN_ORIGINS = [
  "https://mpgestaoeventos.com",
  "https://www.mpgestaoeventos.com",
  "https://mundopropicio.lovable.app",
  "https://id-preview--ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f.lovable.app",
] as const;

export interface GmailConnectionStore {
  createPending(user: string, company: string, nonceHash: string, expiresAt: Date): Promise<void>;
  /** Atómico: apaga e devolve true só se existir para este user+empresa e não tiver expirado. */
  consumePending(user: string, company: string, nonceHash: string, now: Date): Promise<boolean>;
  save(user: string, company: string, ciphertext: string): Promise<void>;
  load(user: string, company: string): Promise<{ ciphertext: string; reconnect_required: boolean } | null>;
  markReconnect(user: string, company: string): Promise<void>;
  remove(user: string, company: string): Promise<void>;
}
export type GmailStatus = { linked: boolean; reconnect_required: boolean; mailbox_email?: string };
export type GmailConnection = {
  status(user: string, company: string): Promise<GmailStatus>;
  start(user: string, company: string, origin: string): Promise<{ authorization_url: string }>;
  complete(user: string, company: string, binding: string, code: string): Promise<GmailStatus>;
  disconnect(user: string, company: string): Promise<{ revoked_at_google: boolean }>;
  reader(user: string, company: string): Promise<GmailReader | null>;
};
export class GmailConnectError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u: ArrayBuffer) => Array.from(new Uint8Array(u)).map((x) => x.toString(16).padStart(2, "0")).join("");
export const hashNonce = async (n: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n)));

async function aesKey(secretB64: string) {
  const raw = unb64(secretB64);
  if (raw.length !== 32) throw new Error("Chave de cifra inválida");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const aad = (user: string, company: string) => new TextEncoder().encode(`data-entry-gmail:${user}:${company}`);
export async function sealKey(secretB64: string, user: string, company: string, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(user, company) }, await aesKey(secretB64), new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function openKey(secretB64: string, user: string, company: string, stored: string) {
  const buf = unb64(stored);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12), additionalData: aad(user, company) }, await aesKey(secretB64), buf.subarray(12));
  return new TextDecoder().decode(pt);
}

export type GmailConnectionConfig = {
  store: GmailConnectionStore;
  /** Server Auth lookup, never profiles or client input. */
  resolveAuth(user: string): Promise<{ email?: string | null; email_confirmed_at?: string | null } | null>;
  clientApiKey: string;
  encryptionSecret: string;
  now?: () => Date;
  nonce?: () => string;
};
const randomNonce = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Conservative equality: exterior ASCII spaces + ASCII case only. Dots/+tags stay literal. */
export function canonicalGmailEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.replace(/^ +| +$/g, "").replace(/[A-Z]/g, c => c.toLowerCase());
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email) ? email : null;
}
const OWN_MAILBOX = "Liga o Gmail com o mesmo email usado para entrar no ERP. Não foi possível verificar a tua própria caixa.";
export function createGmailConnection(cfg: GmailConnectionConfig): GmailConnection {
  const now = cfg.now ?? (() => new Date());
  const nonce = cfg.nonce ?? randomNonce;
  const authEmail = async (user: string) => {
    const auth = await cfg.resolveAuth(user);
    const email = canonicalGmailEmail(auth?.email);
    if (!auth?.email_confirmed_at || !email) throw new GmailConnectError(OWN_MAILBOX, 403);
    return email;
  };
  const key = async (user: string, company: string) => {
    const row = await cfg.store.load(user, company);
    if (!row) return null;
    try {
      const plaintext = await openKey(cfg.encryptionSecret, user, company, row.ciphertext);
      // Old raw-key envelopes cannot prove which Auth email was verified. Fail closed.
      const payload = JSON.parse(plaintext) as { key?: unknown; email?: unknown };
      if (typeof payload.key !== "string" || !payload.key || !canonicalGmailEmail(payload.email)) return null;
      return { key: payload.key, email: String(payload.email), reconnect: row.reconnect_required };
    } catch { return null; }
  };
  const call = async (connectionAPIKey: string, path: string) => {
    const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: GMAIL_CONNECTOR_ID,
      path, init: { method: "GET" }, requiredScopes: [...GMAIL_SCOPES] });
    return res;
  };
  const verify = async (user: string, company: string, k: { key: string; email?: string }) => {
    const email = await authEmail(user);
    if (k.email && k.email !== email) throw new GmailConnectError(OWN_MAILBOX, 403);
    const res = await call(k.key, "/gmail/v1/users/me/profile?fields=emailAddress");
    if (await appUserReconnectRequired(res)) {
      await cfg.store.markReconnect(user, company);
      throw new GmailUnavailable("A tua ligação ao Gmail precisa de ser renovada. Volta a ligar a tua conta.");
    }
    if (!res.ok) throw new GmailConnectError(OWN_MAILBOX, 403);
    const profile = await res.json().catch(() => null) as { emailAddress?: unknown } | null;
    if (canonicalGmailEmail(profile?.emailAddress) !== email || await authEmail(user) !== email)
      throw new GmailConnectError(OWN_MAILBOX, 403);
    return email;
  };
  return {
    async status(user, company) {
      const k = await key(user, company);
      if (!k) return { linked: false, reconnect_required: false };
      if (k.reconnect) return { linked: false, reconnect_required: true };
      try { return { linked: true, reconnect_required: false, mailbox_email: await verify(user, company, k) }; }
      catch { return { linked: false, reconnect_required: true }; }
    },
    async start(user, company, origin) {
      await authEmail(user);
      if (!(RETURN_ORIGINS as readonly string[]).includes(origin)) throw new GmailConnectError("Abre o assistente no endereço oficial da plataforma para ligar o Gmail.", 400);
      const n = nonce();
      await cfg.store.createPending(user, company, await hashNonce(n), new Date(now().getTime() + BINDING_TTL_MS));
      const existing = await key(user, company);
      // Never send an unverified old handle to reconnect.
      if (existing) await verify(user, company, existing);
      const returnUrl = new URL(RETURN_PATH, origin); returnUrl.searchParams.set("binding", n);
      const { authorizationUrl } = await authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL, connectorId: GMAIL_CONNECTOR_ID, appUserId: user, clientAPIKey: cfg.clientApiKey,
        returnUrl: returnUrl.toString(), connectionAPIKey: existing?.key, credentialsConfiguration: { scopes: [...GMAIL_SCOPES] },
      });
      if (!/^https:\/\//.test(authorizationUrl)) throw new GmailConnectError("Ligação ao Gmail indisponível.", 503);
      return { authorization_url: authorizationUrl };
    },
    async complete(user, company, binding, code) {
      if (!(await cfg.store.consumePending(user, company, await hashNonce(binding), now())))
        throw new GmailConnectError('Este pedido de ligação expirou ou já foi usado. Começa de novo em "Ligar Gmail".', 409);
      const existing = await key(user, company);
      let result;
      try { result = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, code); }
      catch { throw new GmailConnectError("A Google não confirmou a ligação. Tenta outra vez.", 502); }
      if (result.connectorId !== GMAIL_CONNECTOR_ID) throw new GmailConnectError("Ligação recusada: serviço diferente do Gmail.", 400);
      let email: string;
      try { email = await verify(user, company, { key: result.connectionAPIKey }); }
      catch (e) {
        // Only revoke the newly issued, scoped handle, never an existing/reused handle.
        if (result.connectionAPIKey !== existing?.key) {
          try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: result.connectionAPIKey, connectorId: GMAIL_CONNECTOR_ID }); } catch { /* local access still denied */ }
        } else await cfg.store.markReconnect(user, company);
        throw e;
      }
      await cfg.store.save(user, company, await sealKey(cfg.encryptionSecret, user, company, JSON.stringify({ key: result.connectionAPIKey, email })));
      return { linked: true, reconnect_required: false, mailbox_email: email };
    },
    async disconnect(user, company) {
      const k = await key(user, company);
      await cfg.store.remove(user, company);
      if (!k) return { revoked_at_google: false };
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: k.key, connectorId: GMAIL_CONNECTOR_ID }); return { revoked_at_google: true }; }
      catch { return { revoked_at_google: false }; }
    },
    async reader(user, company) {
      const k = await key(user, company);
      if (!k) return null;
      if (k.reconnect) throw new GmailUnavailable("A tua ligação ao Gmail precisa de ser renovada. Volta a ligar a tua conta.");
      await verify(user, company, k);
      return gmailReadOnly(async (path, query) => {
        // Each message/attachment request rechecks current Auth and mailbox identity.
        const current = await key(user, company);
        if (!current || current.key !== k.key || current.reconnect) throw new GmailConnectError(OWN_MAILBOX, 403);
        await verify(user, company, current);
        const qs = query.toString();
        const res = await call(k.key, `/gmail/v1${path}${qs ? `?${qs}` : ""}`);
        if (await appUserReconnectRequired(res)) {
          await cfg.store.markReconnect(user, company);
          throw new GmailUnavailable("A tua ligação ao Gmail precisa de ser renovada. Volta a ligar a tua conta.");
        }
        await verify(user, company, current);
        return res;
      });
    },
  };
}
