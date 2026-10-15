// Issue #320 / D-ERP281 — guardas do P1 CAPI, partilhadas pelas edge functions de envio à Meta.
// Lógica pura (sem I/O próprio) para poder ser testada com mocks e sem rede.

export const META_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // prazo Meta para eventos website

export type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Interruptor persistente. Qualquer erro ou resposta ambígua conta como SUSPENSO. */
export async function dispatchAllowed(rpc: RpcFn): Promise<boolean> {
  try {
    const { data, error } = await rpc("capi_dispatch_allowed");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Prova de consentimento por interacção (servidor). Erro = sem prova. */
export async function consentProof(rpc: RpcFn, leadId: string | null, eventName: string): Promise<boolean> {
  try {
    const { data, error } = await rpc("capi_consent_proof", { p_lead_id: leadId, p_event_name: eventName });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export type PreSendInput = {
  kind?: string | null;
  created_at?: string | null;
  event_name?: string | null;
  now?: number;
};

/** Regras locais verificadas imediatamente antes do POST (defesa em profundidade). */
export function localBlockReason(i: PreSendInput): string | null {
  const now = i.now ?? Date.now();
  if (i.event_name === "ViewContent" && i.kind === "redirect_click") return "wrong_kind";
  if (i.event_name === "ViewContent" && i.kind == null) return "wrong_kind"; // sem tipo, não se arrisca
  if (i.created_at) {
    const t = Date.parse(i.created_at);
    if (!Number.isFinite(t) || now - t > META_MAX_AGE_MS) return "expired";
  } else if (i.event_name === "ViewContent") {
    return "expired";
  }
  return null;
}

export type MetaOutcome =
  | { kind: "ok" }
  | { kind: "access_100_33"; detail: string }
  | { kind: "insufficient_data"; detail: string }
  | { kind: "transient"; detail: string };

export function classifyMetaResponse(status: number, body: unknown): MetaOutcome {
  if (status >= 200 && status < 300) return { kind: "ok" };
  const err = (body as any)?.error ?? {};
  const detail = `meta_status=${status} code=${err.code ?? "?"} subcode=${err.error_subcode ?? "?"}`;
  if (Number(err.code) === 100 && Number(err.error_subcode) === 33) return { kind: "access_100_33", detail };
  if (status === 400 && Number(err.error_subcode) === 2804050) return { kind: "insufficient_data", detail };
  return { kind: "transient", detail };
}

export function suspendedResponse(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ suspended: true, reason: "capi_dispatch_suspended" }), {
    status: 423,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
