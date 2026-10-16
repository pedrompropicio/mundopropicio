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
  subject_token: string | null;
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
  let token: string | null = null;
  if (p.subject_token !== undefined && p.subject_token !== null) {
    if (typeof p.subject_token !== "string" || !TOKEN_RE.test(p.subject_token)) return { ok: false, error: "subject_invalid" };
    token = p.subject_token;
  }
  let at: string | null = null;
  if (typeof p.client_decided_at === "string" && !Number.isNaN(Date.parse(p.client_decided_at))) at = new Date(p.client_decided_at).toISOString();
  const path = typeof p.path === "string" ? p.path.slice(0, 300) : null;
  return { ok: true, value: { state: p.state, purpose: "meta_ads", policy_version: p.policy_version, banner_version: p.banner_version,
    client_seq: p.client_seq, client_decided_at: at, idempotency_key: p.idempotency_key, subject_token: token, path } };
}

/** Token de consentimento enviado com lead/redirect; mal formado = ausente. */
export function readConsentToken(body: any): string | null {
  const t = body?.consent_token;
  return typeof t === "string" && TOKEN_RE.test(t) ? t : null;
}

const META_KEYS = ["fbc", "fbp", "_fbc", "_fbp", "fbclid"];
const META_PARAM_RE = /([?&])(fbclid|_fbc|_fbp|fbc|fbp)=[^&#]*&?/gi;

export function stripMetaParams(url: string): string {
  return url.replace(META_PARAM_RE, "$1").replace(/[?&]+(#|$)/, "$1");
}

/** Sem prova válida: retira identificadores Meta do registo (a BD repete esta limpeza no trigger). */
export function stripMetaIdentifiers(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out.fbc; delete out.fbp;
  for (const k of ["referrer", "destination_url"]) if (typeof out[k] === "string") out[k] = stripMetaParams(out[k] as string);
  if (out.raw && typeof out.raw === "object") {
    const raw = { ...(out.raw as Record<string, unknown>) };
    for (const k of META_KEYS) delete raw[k];
    out.raw = raw;
  }
  return out;
}

const RPC_ERRORS = new Set(["scope_invalid", "state_invalid", "purpose_invalid", "idempotency_key_required", "seq_invalid",
  "version_invalid", "policy_invalid", "subject_invalid", "idempotency_conflict", "seq_conflict"]);

/** Converte a resposta da RPC marketing_consent_record numa resposta HTTP. Desconhecido → 503 fail-closed. */
export function consentRecordResponse(data: any, httpOk: boolean): { status: number; body: Record<string, unknown> } {
  if (!httpOk || !data || typeof data !== "object") return { status: 503, body: { ok: false, error: "persist_failed", marketing_allowed: false } };
  if (data.ok === true && typeof data.decision_id === "number") {
    return { status: 200, body: { ok: true, receipt: {
      decision_id: data.decision_id, replay: data.replay === true, recorded_state: data.recorded_state,
      server_received_at: data.server_received_at, effective_state: data.effective_state,
      effective_decision_id: data.effective_decision_id, marketing_allowed: data.marketing_allowed === true,
      expires_at: data.expires_at ?? null, subject_token: data.subject_token ?? null } } };
  }
  const err = typeof data.error === "string" && RPC_ERRORS.has(data.error) ? data.error : "persist_failed";
  const status = err === "persist_failed" ? 503 : (err === "idempotency_conflict" || err === "seq_conflict") ? 409 : 400;
  return { status, body: { ok: false, error: err, marketing_allowed: false } };
}

/** Interpreta marketing_consent_bind: só proof===true com ids numéricos conta. */
export function interpretBind(data: any, httpOk: boolean): { proof: boolean; subject_id?: string; event_id?: number } {
  if (!httpOk || !data || data.proof !== true || typeof data.event_id !== "number" || typeof data.subject_id !== "string") return { proof: false };
  return { proof: true, subject_id: data.subject_id, event_id: data.event_id };
}
