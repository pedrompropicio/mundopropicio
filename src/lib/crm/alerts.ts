// Alertas accionáveis do Dashboard MP Audience (Fase 2).
// Calculados a partir dos dados do período seleccionado. Se não houver nada
// a assinalar, a lista vem vazia e a barra não aparece — não se inventam
// alertas para encher.
import { differenceInDays, parseISO, startOfDay } from "date-fns";
import { aggregate } from "@/lib/crm/aggregate";
import { EVENT_TARGET_ROAS } from "@/lib/crm/dashboard-format";
import { lisbonToday } from "@/lib/date-lisbon";
import type { AdsetBudgetRow } from "@/lib/crm/dashboard-queries";
import type { CampaignRow, EventRow, InsightRow } from "@/components/crm/dashboard/types";

export type AlertTone = "danger" | "warning";
export type AlertAction =
  | { kind: "pixels" }
  | { kind: "budgets" }
  | { kind: "simulate"; eventId: string };

export interface DashboardAlert {
  id: string;
  tone: AlertTone;
  text: string;
  actionLabel: string;
  action: AlertAction;
}

/** Regra da Fase 1: taxa de passagem impossível ⇒ evento do pixel em falta. */
export function funnelImpossible(rows: InsightRow[]): { step: string; rate: number } | null {
  const a = aggregate(rows);
  const steps: Array<{ key: string; label: string; value: number }> = [
    { key: "impressions", label: "Cliques/Impressões", value: a.impressions },
    { key: "clicks", label: "ViewContent/Cliques", value: a.clicks },
    { key: "view_content", label: "AddToCart/ViewContent", value: a.viewContent },
    { key: "add_to_cart", label: "InitiateCheckout/AddToCart", value: a.addToCart },
    { key: "initiate_checkout", label: "Compras/InitiateCheckout", value: a.initiateCheckout },
    { key: "purchases", label: "", value: a.conversions },
  ];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    if (prev.value <= 0) continue;
    const rate = curr.value / prev.value;
    const impossible =
      rate > 1 || (prev.key === "initiate_checkout" && steps[i].key === "purchases" && rate > 0.8);
    if (impossible) return { step: prev.label, rate };
  }
  return null;
}

export interface AlertsInput {
  periodInsights: InsightRow[];
  /** Snapshots de conjuntos da conta (só budgets + fase de aprendizagem). */
  adsets: AdsetBudgetRow[];
  /** Campanhas visíveis no ecrã (respeita o filtro de status). */
  campaigns: CampaignRow[];
  /** Evento por id, para o alerta de ROAS abaixo da meta. */
  eventsById: Map<string, EventRow>;
  insightsByCampaign: Map<string, InsightRow[]>;
  currencyFormat: (cents: number) => string;
  roasFormat: (roas: number | null) => string;
}

export function computeDashboardAlerts(input: AlertsInput): DashboardAlert[] {
  const out: DashboardAlert[] = [];

  // 1) Taxa impossível no funil → diagnóstico de pixel.
  const funnel = funnelImpossible(input.periodInsights);
  if (funnel) {
    out.push({
      id: "funnel",
      tone: "danger",
      text: `Taxa impossível no funil: ${funnel.step} em ${(funnel.rate * 100).toFixed(1)}% — o pixel não dispara em todo o fluxo.`,
      actionLabel: "Ver pixels",
      action: { kind: "pixels" },
    });
  }

  // 2) Conjuntos em fase de aprendizagem (contagem + verba diária do pior caso).
  const visibleCampaignIds = new Set(input.campaigns.map((c) => c.external_campaign_id));
  const learning = input.adsets.filter(
    (a) =>
      a.learning_stage_info?.status === "LEARNING" &&
      (a.effective_status ?? a.status) !== "PAUSED" &&
      visibleCampaignIds.has(a.external_campaign_id),
  );
  if (learning.length > 0) {
    const worstCaseDaily = learning.reduce((s, a) => s + (a.daily_budget_cents ?? 0), 0);
    out.push({
      id: "learning",
      tone: "warning",
      text: `${learning.length} ${learning.length === 1 ? "conjunto" : "conjuntos"} ainda em aprendizagem, ${input.currencyFormat(worstCaseDaily)}/dia em risco de otimização instável.`,
      actionLabel: "Rever verbas",
      action: { kind: "budgets" },
    });
  }

  // 3) ROAS por evento abaixo da meta, com projecção linear até à data do evento.
  const byEvent = new Map<string, { event: EventRow; rows: InsightRow[] }>();
  for (const c of input.campaigns) {
    if (!c.linked_event_id) continue;
    const e = input.eventsById.get(c.linked_event_id);
    if (!e || e.status !== "active") continue;
    const target = e.event_type === "tour_split" && e.parent_event_id
      ? input.eventsById.get(e.parent_event_id) ?? e
      : e;
    const cur = byEvent.get(target.id) ?? { event: target, rows: [] };
    cur.rows.push(...(input.insightsByCampaign.get(c.external_campaign_id) ?? []));
    byEvent.set(target.id, cur);
  }

  const today = lisbonToday();
  for (const [, { event, rows }] of byEvent) {
    const agg = aggregate(rows);
    if (agg.roas == null || agg.spendCents <= 0) continue;
    if (agg.roas >= EVENT_TARGET_ROAS) continue;
    let projLabel = "";
    if (event.date) {
      const daysUntil = differenceInDays(startOfDay(parseISO(event.date)), startOfDay(today));
      if (daysUntil > 0) {
        // Projecção linear: mantém o ritmo actual de gasto e de receita.
        const perDaySpend = agg.spendCents / Math.max(1, rows.length ? uniqueDays(rows) : 1);
        const projSpend = agg.spendCents + perDaySpend * daysUntil;
        const projRevenue = agg.revenueCents + agg.roas * perDaySpend * daysUntil;
        const proj = projSpend > 0 ? projRevenue / projSpend : null;
        projLabel = ` Projecção linear até ${daysUntil}d do evento: ${input.roasFormat(proj)}.`;
      }
    }
    out.push({
      id: `event-roas:${event.id}`,
      tone: agg.roas < EVENT_TARGET_ROAS / 2 ? "danger" : "warning",
      text: `«${event.name}» com ROAS ${input.roasFormat(agg.roas)} — abaixo da meta ${EVENT_TARGET_ROAS}x.${projLabel}`,
      actionLabel: "Simular",
      action: { kind: "simulate", eventId: event.id },
    });
  }

  return out;
}

function uniqueDays(rows: InsightRow[]): number {
  const s = new Set<string>();
  for (const r of rows) if (r.date_start) s.add(r.date_start);
  return Math.max(1, s.size);
}
