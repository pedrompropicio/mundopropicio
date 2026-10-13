// #62 (D-ERP230) — regras puras do casamento clique Google ↔ lead e do valor da
// conversão. Sem dependências: importado pelas edge functions e pelos testes.

export const MATCH_WINDOW_DAYS = 90; // limite da Google para conversões de clique

export type MatchMethod = "lead_capture_id" | "click_identifier" | "client_event_id";

export interface ClickForMatch {
  lead_capture_id: string | null;
  client_event_id: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
}

/**
 * Ordem: 1) lead_capture_id já gravado no clique; 2) mesmo gclid/gbraid/wbraid
 * guardado pelo portal em lead_capture.raw; 3) mesmo client_event_id (sessão do
 * portal) — fallback, marcado.
 */
export function matchClickToLead(
  c: ClickForMatch,
  leadByIdent: Map<string, string>,
  leadByClientEventId: Map<string, string>,
): { leadId: string; method: MatchMethod } | null {
  if (c.lead_capture_id) return { leadId: c.lead_capture_id, method: "lead_capture_id" };
  for (const k of ["gclid", "gbraid", "wbraid"] as const) {
    const v = c[k]?.trim();
    if (v) {
      const id = leadByIdent.get(`${k}:${v}`);
      if (id) return { leadId: id, method: "click_identifier" };
    }
  }
  if (c.client_event_id) {
    const id = leadByClientEventId.get(c.client_event_id);
    if (id) return { leadId: id, method: "client_event_id" };
  }
  return null;
}

/**
 * Valor por lead vindo de portal_settings. 0, vazio ou inválido → null:
 * a conversão vai SEM valor (a Google usa então o valor por omissão da acção de
 * conversão); 0 explícito gravaria valor zero e esconderia esse valor.
 */
export function positiveConversionValue(raw: unknown): number | null {
  let v: unknown = raw;
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    v = (v as Record<string, unknown>).value;
  }
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// #62 (D-ERP260) — partir dos LEADS. Recebe os leads elegíveis (por created_at
// ascendente) e os cliques já filtrados (consentimento, janela, identificador);
// devolve, por lead não enfileirado, o primeiro clique (captured_at ascendente)
// que lhe casa — a mesma regra de "o primeiro clique ganha" de antes.
export interface LeadForPick {
  id: string;
  client_event_id: string | null;
  raw: Record<string, unknown> | null;
}
export interface ClickForPick extends ClickForMatch {
  id: string;
  captured_at: string;
}
export function pickClickForLeads<C extends ClickForPick>(
  leads: LeadForPick[],
  clicks: C[],
  alreadyEnqueued: Set<string>,
): {
  picks: Array<{ leadId: string; method: MatchMethod; click: C }>;
  skippedExisting: number;
  noClick: number;
} {
  const leadIds = new Set(leads.map((l) => l.id));
  const leadByIdent = new Map<string, string>();
  const leadByCei = new Map<string, string>();
  for (const l of leads) {
    for (const k of ["gclid", "gbraid", "wbraid"]) {
      const v = l.raw?.[k];
      if (typeof v === "string" && v.trim() && !leadByIdent.has(`${k}:${v.trim()}`)) {
        leadByIdent.set(`${k}:${v.trim()}`, l.id);
      }
    }
    if (l.client_event_id && !leadByCei.has(l.client_event_id)) leadByCei.set(l.client_event_id, l.id);
  }
  const sorted = [...clicks].sort((a, b) =>
    a.captured_at < b.captured_at ? -1 : a.captured_at > b.captured_at ? 1 : a.id < b.id ? -1 : 1
  );
  const chosen = new Map<string, { leadId: string; method: MatchMethod; click: C }>();
  for (const c of sorted) {
    if (!(c.gclid || c.gbraid || c.wbraid)) continue;
    const m = matchClickToLead(c, leadByIdent, leadByCei);
    if (!m || !leadIds.has(m.leadId) || chosen.has(m.leadId)) continue;
    chosen.set(m.leadId, { ...m, click: c });
  }
  let skippedExisting = 0;
  let noClick = 0;
  const picks: Array<{ leadId: string; method: MatchMethod; click: C }> = [];
  for (const l of leads) {
    if (alreadyEnqueued.has(l.id)) { skippedExisting++; continue; }
    const p = chosen.get(l.id);
    if (!p) { noClick++; continue; }
    picks.push(p);
  }
  return { picks, skippedExisting, noClick };
}
