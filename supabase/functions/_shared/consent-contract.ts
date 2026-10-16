// #322 — contrato puro (sem rede) de consentimento marketing por interação, usado pelo portal-track.
export type Portal = "mp" | "coala" | "newgang";

const ORIGIN_PORTAL: Record<string, Portal> = {
  "https://mundopropicio.com": "mp",
  "https://www.mundopropicio.com": "mp",
  "https://coalafestival.pt": "coala",
  "https://www.coalafestival.pt": "coala",
  "https://coalafestival.lovable.app": "coala",
  "https://newgangfestival.pt": "newgang",
  "https://www.newgangfestival.pt": "newgang",
  "https://newgang-fest-portal.lovable.app": "newgang",
};
const PREVIEW_PORTAL: Array<[string, Portal]> = [
  ["--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app", "mp"],
  ["--bef9c59c-c2a4-453d-9aec-dae7d16c9171.lovable.app", "coala"],
  ["--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app", "newgang"],
];

/** Portal derivado só do Origin validado (nunca do corpo). */
export function portalForOrigin(origin: string | null): Portal | null {
  if (!origin) return null;
  if (ORIGIN_PORTAL[origin]) return ORIGIN_PORTAL[origin];
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return null;
    for (const [suf, p] of PREVIEW_PORTAL) if (u.hostname.endsWith(suf)) return p;
  } catch { /* noop */ }
  return null;
}

export const TOKEN_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VER_RE = /^[A-Za-z0-9._-]{1,64}$/;

export type ConsentDecision = {
  state: "granted" | "denied" | "revoked";
  purpose: "meta_ads";
  policy_version: string;
  banner_version: string;
  client_seq: number;
  client_decided_at: string | null;
  idempotency_key: string;
  subject_token: string;
  expected_revision: number | null;
  path: string | null;
};

/** Valida o corpo de uma decisão. Qualquer desvio → erro (fail-closed). */
export function parseConsentDecision(p: any): { ok: true; value: ConsentDecision } | { ok: false; error: string } {
  if (!p || typeof p !== "object") return { ok: false, error: "invalid_payload" };
  if (!["granted", "denied", "revoked"].includes(p.state)) return { ok: false, error: "state_invalid" };
  if (p.purpose !== "meta_ads") return { ok: false, error: "purpose_invalid" };
  if (typeof p.policy_version !== "string" || !VER_RE.test(p.policy_version)) return { ok: false, error: "version_invalid" };
  if (typeof p.banner_version !== "string" || !VER_RE.test(p.banner_version)) return { ok: false, error: "version_invalid" };
  if (!Number.isSafeInteger(p.client_seq) || p.client_seq <= 0) return { ok: false, error: "seq_invalid" };
  if (typeof p.idempotency_key !== "string" || !UUID_RE.test(p.idempotency_key)) return { ok: false, error: "idempotency_key_required" };
  // Token do sujeito é gerado pelo cliente (crypto, 256 bits) e obrigatório: retries/abas caem no mesmo sujeito.
  if (typeof p.subject_token !== "string" || !TOKEN_RE.test(p.subject_token)) return { ok: false, error: "subject_invalid" };
  const token: string = p.subject_token;
  let expected: number | null = null;
  if (p.expected_revision !== undefined && p.expected_revision !== null) {
    if (!Number.isSafeInteger(p.expected_revision) || p.expected_revision < 0) return { ok: false, error: "expected_revision_required" };
    expected = p.expected_revision;
  }
  if (p.state === "granted" && expected === null) return { ok: false, error: "expected_revision_required" };
  let at: string | null = null;
  if (typeof p.client_decided_at === "string" && !Number.isNaN(Date.parse(p.client_decided_at))) at = new Date(p.client_decided_at).toISOString();
  const path = typeof p.path === "string" ? p.path.slice(0, 300) : null;
  return { ok: true, value: { state: p.state, purpose: "meta_ads", policy_version: p.policy_version, banner_version: p.banner_version,
    client_seq: p.client_seq, client_decided_at: at, idempotency_key: p.idempotency_key, subject_token: token, expected_revision: expected, path } };
}

/** Token de consentimento enviado com lead/redirect; mal formado = ausente. */
export function readConsentToken(body: any): string | null {
  const t = body?.consent_token;
  return typeof t === "string" && TOKEN_RE.test(t) ? t : null;
}
export const RECEIPT_RE = /^[0-9]{1,18}\.[0-9]{1,18}\.[0-9a-f]{64}$/;
/** Recibo da decisão exata confirmada quando a interação foi gerada; sem recibo = sem prova. */
export function readConsentReceipt(body: any): string | null {
  const t = body?.consent_receipt;
  return typeof t === "string" && RECEIPT_RE.test(t) ? t : null;
}

const META_KEYS = new Set(["fbc", "fbp", "_fbc", "_fbp", "fbclid"]);

/** Nome de parâmetro normalizado: '+'→espaço, percent-decoding (até 3 níveis), minúsculas. */
export function normKey(k: string): string {
  let r = k.replace(/\+/g, " ");
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(r); i++) {
    r = r.replace(/%([0-9a-f]{2})/gi, (_m, h) => { const c = parseInt(h, 16); return c > 0 ? String.fromCharCode(c) : _m; });
  }
  return r.trim().toLowerCase();
}
export const isMetaKey = (k: string) => META_KEYS.has(normKey(k));

function filterQs(qs: string): string {
  const parts = qs.split("&");
  const kept = parts.filter((p) => !isMetaKey(p.split("=")[0]));
  return kept.length === parts.length ? qs : kept.join("&");
}

/** Remove fbclid/_fbc/_fbp/fbc/fbp por parâmetro (consecutivos, percent-encoded, fragmento). Igual a public.marketing_strip_meta_params. */
export function stripMetaParams(url: string): string {
  let base = url; let frag: string | null = null; let q: string | null = null;
  const h = base.indexOf("#"); if (h >= 0) { frag = base.slice(h + 1); base = base.slice(0, h); }
  const qi = base.indexOf("?"); if (qi >= 0) { q = base.slice(qi + 1); base = base.slice(0, qi); }
  const nq = q === null || q === "" ? q : filterQs(q);
  const nf = frag !== null && frag.includes("=") ? filterQs(frag) : frag;
  if (nq === q && nf === frag) return url;
  return base + (q === null || nq === "" ? "" : "?" + nq) + (frag === null || nf === "" ? "" : "#" + nf);
}

/** JSON recursivo: retira chaves Meta a qualquer nível e limpa URLs em strings. Igual a public.marketing_strip_meta_json. */
export function stripMetaJson(v: unknown): unknown {
  if (typeof v === "string") return stripMetaParams(v);
  if (Array.isArray(v)) return v.map(stripMetaJson);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!isMetaKey(k)) o[k] = stripMetaJson(x);
    return o;
  }
  return v;
}

/** Sem prova válida: retira identificadores Meta do registo (a BD repete esta limpeza no trigger). */
export function stripMetaIdentifiers(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out.fbc; delete out.fbp;
  for (const k of ["referrer", "destination_url"]) if (typeof out[k] === "string") out[k] = stripMetaParams(out[k] as string);
  if (out.raw && typeof out.raw === "object") out.raw = stripMetaJson(out.raw);
  return out;
}

const RPC_ERRORS = new Set(["scope_invalid", "state_invalid", "purpose_invalid", "idempotency_key_required", "seq_invalid",
  "version_invalid", "policy_invalid", "subject_invalid", "idempotency_conflict", "revision_conflict", "expected_revision_required"]);

/** Converte a resposta da RPC marketing_consent_record numa resposta HTTP. Desconhecido → 503 fail-closed. */
export function consentRecordResponse(data: any, httpOk: boolean): { status: number; body: Record<string, unknown> } {
  if (!httpOk || !data || typeof data !== "object") return { status: 503, body: { ok: false, error: "persist_failed", marketing_allowed: false } };
  if (data.ok === true && typeof data.decision_id === "number") {
    // Nunca marketing_allowed=true para deny/revoke nem sem recibo bem formado.
    const allowed = data.marketing_allowed === true && data.recorded_state === "granted"
      && typeof data.consent_receipt === "string" && RECEIPT_RE.test(data.consent_receipt);
    return { status: 200, body: { ok: true, receipt: {
      decision_id: data.decision_id, revision: data.revision ?? null, replay: data.replay === true, recorded_state: data.recorded_state,
      server_received_at: data.server_received_at, effective_state: data.effective_state ?? null,
      effective_decision_id: data.effective_decision_id ?? null, effective_revision: data.effective_revision ?? null,
      marketing_allowed: allowed, expires_at: allowed ? data.expires_at ?? null : null,
      consent_receipt: allowed ? data.consent_receipt : null } } };
  }
  const err = typeof data.error === "string" && RPC_ERRORS.has(data.error) ? data.error : "persist_failed";
  const status = err === "persist_failed" ? 503 : (err === "idempotency_conflict" || err === "revision_conflict") ? 409 : 400;
  const body: Record<string, unknown> = { ok: false, error: err, marketing_allowed: false };
  if (err === "revision_conflict") { body.effective_state = data.effective_state ?? null; body.effective_revision = data.effective_revision ?? null; }
  return { status, body };
}

/** Interpreta marketing_consent_bind: só proof===true com ids numéricos conta. */
export function interpretBind(data: any, httpOk: boolean): { proof: boolean; subject_id?: string; event_id?: number } {
  if (!httpOk || !data || data.proof !== true || typeof data.event_id !== "number" || typeof data.subject_id !== "string") return { proof: false };
  return { proof: true, subject_id: data.subject_id, event_id: data.event_id };
}
