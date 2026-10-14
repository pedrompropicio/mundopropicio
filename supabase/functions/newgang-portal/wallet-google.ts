// Google Wallet — cartão do Clube Newgang (Loyalty). Montagem e assinatura puras; a rede fica em funções finas no fim.
// Nunca registar a chave nem o JWT de acesso.

export const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
export const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
export const CLASS_SUFFIX = "newgang_clube_2027";
export const ORIGINS = ["https://newgangfestival.pt", "https://www.newgangfestival.pt"];
export const EVENT_LINE = "Newgang Festival 2027 · 25/03/2027 · MEO Arena";
export const LOGO = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/logo-newgang-producoes-branco.png";
export const BG = "#0b1f14";

// Provisórios: substituir por URLs públicos após receber e carregar as imagens do Pedro.
// O domínio .invalid e a flag impedem aplicar criativos inexistentes por engano.
export const WALLET_ARTWORK_READY = false;
export const WALLET_ARTWORK_URLS = {
  logo: "https://example.invalid/newgang/wallet/logo-quadrado-v1.png",
  Gang: "https://example.invalid/newgang/wallet/hero-gang-v1.png",
  Elite: "https://example.invalid/newgang/wallet/hero-elite-v1.png",
  Lenda: "https://example.invalid/newgang/wallet/hero-lenda-v1.png",
} as const;
export const WALLET_LEVEL_COLORS = { Gang: BG, Elite: "#170a2b", Lenda: "#050505" } as const;
type ArtworkOptions = { artworkReady?: boolean };

export function levelArtwork(level: string | null) {
  const key = level === "Elite" || level === "Lenda" ? level : "Gang";
  return {
    heroImage: {
      sourceUri: { uri: WALLET_ARTWORK_URLS[key] },
      contentDescription: { defaultValue: { language: "pt-PT", value: `Clube Newgang · ${key}` } },
    },
    hexBackgroundColor: WALLET_LEVEL_COLORS[key],
  };
}

export type SaKey = { client_email: string; private_key: string };

export const classId = (issuer: string) => `${issuer}.${CLASS_SUFFIX}`;
export const objectId = (issuer: string, memberId: string) => `${issuer}.ngclub_${memberId.replace(/-/g, "")}`;
export const barcodeValue = (memberNo: number) => `NG-${memberNo}`;

export function buildClass(issuer: string, o: { logo?: string | null; color?: string | null } & ArtworkOptions = {}) {
  return {
    id: classId(issuer),
    issuerName: "Newgang Festival",
    programName: "Clube Newgang",
    programLogo: { sourceUri: { uri: o.logo || ((o.artworkReady ?? WALLET_ARTWORK_READY) ? WALLET_ARTWORK_URLS.logo : LOGO) }, contentDescription: { defaultValue: { language: "pt-PT", value: "Newgang" } } },
    hexBackgroundColor: o.color || BG,
    reviewStatus: "UNDER_REVIEW",
    countryCode: "PT",
    linksModuleData: {
      uris: [
        { id: "meu_clube", uri: "https://newgangfestival.pt/meu-clube", description: "O meu Clube" },
        { id: "regulamento", uri: "https://newgangfestival.pt/clube/regulamento", description: "Regulamento" },
      ],
    },
  };
}

export type WalletMember = { id: string; member_no: number; first_name: string | null; points: number; level: string | null; crew: string | null };

export function buildObject(issuer: string, m: WalletMember, o: ArtworkOptions = {}) {
  const text: Array<{ id: string; header: string; body: string }> = [];
  if (m.crew) text.push({ id: "crew", header: "Crew", body: m.crew });
  text.push({ id: "evento", header: "Próximo evento", body: EVENT_LINE });
  return {
    id: objectId(issuer, m.id),
    classId: classId(issuer),
    state: "ACTIVE",
    accountId: String(m.member_no),
    accountName: m.first_name || "Membro",
    ...((o.artworkReady ?? WALLET_ARTWORK_READY) ? levelArtwork(m.level) : {}),
    loyaltyPoints: { label: "Pontos", balance: { int: Math.trunc(m.points) } },
    secondaryLoyaltyPoints: { label: "Nível", balance: { string: m.level || "—" } },
    textModulesData: text,
    barcode: { type: "QR_CODE", value: barcodeValue(m.member_no), alternateText: barcodeValue(m.member_no) },
  };
}

export function saveClaims(saEmail: string, objId: string, nowSec = Math.floor(Date.now() / 1000)) {
  return { iss: saEmail, aud: "google", typ: "savetowallet", iat: nowSec, origins: ORIGINS, payload: { loyaltyObjects: [{ id: objId }] } };
}

// ---------- JWT RS256 ----------
const enc = new TextEncoder();
export const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? enc.encode(b) : b;
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export async function signJwt(claims: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export const saveUrl = (jwt: string) => `https://pay.google.com/gp/v/save/${jwt}`;

/** Objeto mudou? (só pontos e nível disparam PATCH automático). */
export const needsPatch = (p: { last_points: number | null; last_level: string | null }, points: number, level: string | null) =>
  p.last_points !== points || (p.last_level ?? null) !== (level ?? null);

// ---------- Rede (fina) ----------
let tokenCache: { tok: string; exp: number } | null = null;
let keyCache: CryptoKey | null = null;

export function readSaKey(raw: string | undefined): SaKey {
  if (!raw) throw new Error("wallet_not_configured");
  const j = JSON.parse(raw);
  if (!j.client_email || !j.private_key) throw new Error("wallet_not_configured");
  return { client_email: j.client_email, private_key: j.private_key };
}

export async function saSigner(sa: SaKey) { keyCache ??= await importPrivateKey(sa.private_key); return keyCache; }

export async function accessToken(sa: SaKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.tok;
  const assertion = await signJwt({ iss: sa.client_email, scope: WALLET_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, await saSigner(sa));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`wallet_token ${r.status}`);
  const j = await r.json();
  tokenCache = { tok: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return tokenCache.tok;
}

export async function walletFetch(sa: SaKey, path: string, init: RequestInit = {}) {
  const tok = await accessToken(sa);
  return await fetch(`${WALLET_API}${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

/** Cria se não existir; nunca reescreve a classe existente (idempotente). */
export async function ensureClass(sa: SaKey, issuer: string, cls: ReturnType<typeof buildClass>) {
  const g = await walletFetch(sa, `/loyaltyClass/${encodeURIComponent(cls.id)}`);
  if (g.ok) return;
  if (g.status !== 404) throw new Error(`wallet_class_get ${g.status} ${(await g.text()).slice(0, 300)}`);
  const p = await walletFetch(sa, "/loyaltyClass", { method: "POST", body: JSON.stringify(cls) });
  if (!p.ok && p.status !== 409) throw new Error(`wallet_class_insert ${p.status} ${(await p.text()).slice(0, 300)}`);
}

/** Aplicação pontual do logo aprovado: só PATCH da classe existente, nunca POST. */
export async function patchClassLogo(sa: SaKey, issuer: string) {
  if (!WALLET_ARTWORK_READY || new URL(WALLET_ARTWORK_URLS.logo).hostname.endsWith(".invalid")) {
    throw new Error("wallet_artwork_pending");
  }
  const { programLogo } = buildClass(issuer);
  const r = await walletFetch(sa, `/loyaltyClass/${encodeURIComponent(classId(issuer))}`, {
    method: "PATCH", body: JSON.stringify({ programLogo }),
  });
  if (!r.ok) throw new Error(`wallet_class_patch ${r.status} ${(await r.text()).slice(0, 300)}`);
}

export async function upsertObject(sa: SaKey, obj: ReturnType<typeof buildObject>) {
  const p = await walletFetch(sa, "/loyaltyObject", { method: "POST", body: JSON.stringify(obj) });
  if (p.ok) return "insert";
  if (p.status !== 409) throw new Error(`wallet_object_insert ${p.status} ${(await p.text()).slice(0, 300)}`);
  await patchObject(sa, obj);
  return "patch";
}

export async function patchObject(sa: SaKey, obj: ReturnType<typeof buildObject>) {
  const { id, classId: _c, ...rest } = obj;
  const r = await walletFetch(sa, `/loyaltyObject/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(rest) });
  if (!r.ok) throw new Error(`wallet_object_patch ${r.status} ${(await r.text()).slice(0, 300)}`);
}
