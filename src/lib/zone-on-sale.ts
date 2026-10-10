/**
 * #143 — marca "à venda" por sessão, à mão. A página pública do ECI devolve 403
 * (Cloudflare) às edge functions, por isso o passo automático do PROC não corre.
 * Cada mudança regista no import_audit (onebox_sync_runs, mode 'on_sale_manual')
 * quem, quando, a sessão e o antes/depois.
 */
import { supabase } from "@/integrations/supabase/client";
import { mustWrite } from "@/lib/must-write";

export const ON_SALE_MANUAL_MODE = "on_sale_manual";
export const ON_SALE_EDGE_MODE = "on_sale_edge";

export async function setZoneOnSale(params: {
  zoneId: string;
  zoneName: string;
  eventId: string;
  companyId: string;
  before: boolean | null;
  after: boolean;
}) {
  const { data: u } = await supabase.auth.getUser();
  await mustWrite(
    supabase.from("event_ticket_zones").update({ on_sale: params.after } as any).eq("id", params.zoneId).select("id"),
    "Marcar sessão",
    { expectRows: true },
  );
  const now = new Date().toISOString();
  await mustWrite(
    supabase
      .from("onebox_sync_runs")
      .insert({
        company_id: params.companyId,
        started_at: now,
        finished_at: now,
        status: "success",
        mode: ON_SALE_MANUAL_MODE,
        triggered_by: "manual",
        import_audit: {
          passo: "sessoes_a_venda",
          origem: "manual",
          event_id: params.eventId,
          zona_id: params.zoneId,
          sessao: params.zoneName,
          antes: params.before,
          depois: params.after,
          user_id: u?.user?.id ?? null,
          email: u?.user?.email ?? null,
          em: now,
        },
      } as any)
      .select("id"),
    "Registar no import_audit",
    { expectRows: true },
  );
}

export interface OnSaleRunStatus {
  lastEdge: { started_at: string; status: string; error_message: string | null } | null;
  lastManual: { started_at: string; email: string | null; sessao: string | null; depois: boolean | null } | null;
}

/** Alerta: a leitura automática falhou (ex.: 403) ou nunca correu com sucesso. */
export function onSaleAlert(s: OnSaleRunStatus | null | undefined): string | null {
  if (!s) return null;
  if (s.lastEdge && s.lastEdge.status !== "success") {
    return `A leitura automática das sessões à venda falhou (${s.lastEdge.error_message ?? s.lastEdge.status}). Marque as sessões à mão.`;
  }
  if (!s.lastEdge) {
    return "A leitura automática das sessões à venda não está a correr (a página do El Corte Inglés bloqueia o servidor). Marque as sessões à mão.";
  }
  return null;
}

export async function fetchOnSaleRunStatus(companyId: string, eventId: string): Promise<OnSaleRunStatus> {
  const [edge, manual] = await Promise.all([
    supabase
      .from("onebox_sync_runs")
      .select("started_at, status, error_message")
      .eq("company_id", companyId)
      .eq("mode", ON_SALE_EDGE_MODE)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("onebox_sync_runs")
      .select("started_at, import_audit")
      .eq("company_id", companyId)
      .eq("mode", ON_SALE_MANUAL_MODE)
      .eq("import_audit->>event_id", eventId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const m: any = manual.data;
  return {
    lastEdge: (edge.data as any) ?? null,
    lastManual: m
      ? { started_at: m.started_at, email: m.import_audit?.email ?? null, sessao: m.import_audit?.sessao ?? null, depois: m.import_audit?.depois ?? null }
      : null,
  };
}
