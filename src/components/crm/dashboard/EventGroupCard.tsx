import { useMemo, useState } from "react";
import { differenceInDays, format, parseISO, startOfDay, subDays } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { aggregate } from "@/lib/crm/aggregate";
import {
  EVENT_TARGET_ROAS,
  formatCurrency,
  formatRoas,
  roasBarBgByEvent,
  roasColorByEvent,
} from "@/lib/crm/dashboard-format";
import { CampaignTableHeader } from "@/components/crm/dashboard/CampaignTableHeader";
import { CampaignTableRow } from "@/components/crm/dashboard/CampaignTableRow";
import type { CampaignRow, EventRow, InsightRow } from "@/components/crm/dashboard/types";

// ============================================================
// Event Group Card
// ============================================================
export function EventGroupCard({
  event,
  campaigns,
  insightsByCampaign,
  prevInsightsByCampaign,
  spark14ByCampaign,
  days,
  currency,
  onAnalyze,
  onCoach,
  onToggleStatus,
  onActivate,
  togglingCampaignId,
  onEdited,
}: {
  event: EventRow;
  campaigns: CampaignRow[];
  insightsByCampaign: Map<string, InsightRow[]>;
  prevInsightsByCampaign: Map<string, InsightRow[]>;
  spark14ByCampaign: Map<string, number[]>;
  days: number;
  currency: string;
  onAnalyze?: (id: string, name: string) => void;
  onCoach?: (id: string) => void;
  onToggleStatus?: (c: CampaignRow, target: "ACTIVE" | "PAUSED") => void;
  onActivate?: (c: CampaignRow) => void;
  togglingCampaignId?: string | null;
  onEdited?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const allInsights = useMemo(
    () => campaigns.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []),
    [campaigns, insightsByCampaign],
  );
  const agg = aggregate(allInsights);
  const dailyBudget = campaigns.reduce((s, c) => s + (c.daily_budget_cents ?? 0), 0);
  const lifetimeBudget = campaigns.reduce((s, c) => s + (c.lifetime_budget_cents ?? 0), 0);

  // Projecção linear conservadora do ROAS blended até à data do evento.
  // (currentRevenue + roas14 × dailySpend14 × daysUntil) / (currentSpend + dailySpend14 × daysUntil)
  // Conservadora: não inclui uplift de urgência típico das últimas 3-4 semanas pré-evento.
  const projection = useMemo(() => {
    if (!event.date) return null;
    const eventDay = startOfDay(parseISO(event.date));
    const today = startOfDay(new Date());
    const daysUntilEvent = differenceInDays(eventDay, today);
    if (daysUntilEvent <= 0) return null;

    const fourteenAgo = subDays(today, 14).getTime();
    let spend14 = 0;
    let revenue14 = 0;
    for (const r of allInsights) {
      if (!r.date_start) continue;
      if (parseISO(r.date_start).getTime() < fourteenAgo) continue;
      spend14 += r.spend_cents ?? 0;
      revenue14 += r.purchases_value_cents ?? 0;
    }
    if (spend14 <= 0) return null;

    const dailySpendAvg = spend14 / 14;
    const roas14 = revenue14 / spend14;
    const projectedRevenue = agg.revenueCents + roas14 * dailySpendAvg * daysUntilEvent;
    const projectedSpend = agg.spendCents + dailySpendAvg * daysUntilEvent;
    if (projectedSpend <= 0) return null;
    return { daysUntilEvent, projectedBlended: projectedRevenue / projectedSpend };
  }, [allInsights, agg.revenueCents, agg.spendCents, event.date]);

  const progressPct = agg.roas != null && Number.isFinite(agg.roas)
    ? Math.min(100, Math.max(0, (agg.roas / EVENT_TARGET_ROAS) * 100))
    : null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{event.name}</h3>
                  {event.date && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {format(parseISO(event.date), "dd/MM/yyyy")}
                    </Badge>
                  )}
                  {event.tickets_total !== null && event.tickets_total > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {event.tickets_sold ?? 0}/{event.tickets_total} bilhetes
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {campaigns.length} {campaigns.length === 1 ? "campanha" : "campanhas"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  ROAS{" "}
                  <span className={cn("font-semibold font-mono", roasColorByEvent(agg.roas))}>
                    {formatRoas(agg.roas)}
                  </span>{" "}
                  · Gasto {formatCurrency(agg.spendCents, currency)} · Receita{" "}
                  <span className="text-emerald-500/90">{formatCurrency(agg.revenueCents, currency)}</span>{" "}
                  · Conv. {agg.conversions}
                </div>
                {progressPct != null && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 rounded bg-muted overflow-hidden w-[180px] shrink-0">
                      <div
                        className={cn("h-full transition-all", roasBarBgByEvent(agg.roas))}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatRoas(agg.roas)} / {EVENT_TARGET_ROAS}x → {progressPct.toFixed(0)}%
                    </span>
                  </div>
                )}
                {projection && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Projecção linear conservadora (não inclui uplift de urgência):{" "}
                    <span className={cn("font-mono font-semibold", roasColorByEvent(projection.projectedBlended))}>
                      {formatRoas(projection.projectedBlended)}
                    </span>{" "}
                    em {projection.daysUntilEvent}d
                    {projection.projectedBlended < EVENT_TARGET_ROAS && (
                      <span className="text-amber-500"> · Risco de não atingir meta — analisar</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground tabular-nums hidden md:block">
              {dailyBudget > 0 && (
                <div>{formatCurrency(dailyBudget, currency)}/dia ativo</div>
              )}
              {lifetimeBudget > 0 && (
                <div>{formatCurrency(lifetimeBudget, currency)} lifetime</div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full">
              <CampaignTableHeader />
              <tbody>
                {campaigns.map((c) => (
                  <CampaignTableRow
                    key={c.id}
                    c={c}
                    insights={insightsByCampaign.get(c.external_campaign_id) ?? []}
                    prevInsights={prevInsightsByCampaign.get(c.external_campaign_id) ?? []}
                    days={days}
                    spark={spark14ByCampaign.get(c.external_campaign_id) ?? []}
                    currency={currency}
                    onAnalyze={onAnalyze}
                    onCoach={onCoach}
                    onToggleStatus={onToggleStatus}
                    onActivate={onActivate}
                    toggling={togglingCampaignId === c.external_campaign_id}
                    onEdited={onEdited}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
