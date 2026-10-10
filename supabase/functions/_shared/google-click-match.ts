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
