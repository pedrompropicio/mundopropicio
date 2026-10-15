// Issue #320 P1 — lógica pura partilhada pelos caminhos CAPI (testável sem rede).

export type MetaOutcome =
  | { kind: "ok" }
  | { kind: "meta_access"; code: 100; subcode: 33; detail: string } // terminal + alerta
  | { kind: "insufficient"; detail: string }                         // terminal
  | { kind: "transient"; detail: string };

export function classifyMetaResponse(status: number, parsed: any, rawText = ""): MetaOutcome {
  if (status >= 200 && status < 300) return { kind: "ok" };
  const err = parsed?.error;
  const code = Number(err?.code);
  const subcode = Number(err?.error_subcode);
  const detail = String(err?.message ?? rawText ?? "").slice(0, 300);
  if (code === 100 && subcode === 33) return { kind: "meta_access", code: 100, subcode: 33, detail };
  if (status === 400 && subcode === 2804050) return { kind: "insufficient", detail: "insufficient_customer_data" };
  return { kind: "transient", detail: `meta_status=${status} ${detail}`.trim() };
}

export type GuardResult = { allowed: boolean; reason: string | null; event_time?: number };

/** Interpreta a resposta da RPC capi_guard_lead_dispatch; qualquer erro/forma inesperada bloqueia. */
export function interpretGuard(data: unknown, error: unknown): GuardResult {
  if (error) return { allowed: false, reason: "guard_rpc_error" };
  const g = (Array.isArray(data) ? data[0] : data) as any;
  if (!g || typeof g !== "object") return { allowed: false, reason: "guard_invalid_response" };
  if (g.allowed !== true) return { allowed: false, reason: String(g.reason ?? "blocked") };
  if (typeof g.event_time !== "number") return { allowed: false, reason: "guard_missing_event_time" };
  return { allowed: true, reason: null, event_time: g.event_time };
}

/** capi_dispatch_allowed: só true explícito permite; erro ou outro valor = suspenso. */
export function interpretDispatchAllowed(data: unknown, error: unknown): boolean {
  if (error) return false;
  const v = Array.isArray(data) ? data[0] : data;
  return v === true;
}

/** Resultado do registo do alerta 100/33: só conta como registado se a RPC confirmou. */
export function interpretAlertRecorded(data: unknown, error: unknown): boolean {
  if (error) return false;
  const v = Array.isArray(data) ? data[0] : data;
  return v === "error_meta_access";
}
