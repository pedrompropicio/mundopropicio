import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { aggregate } from "@/lib/crm/aggregate";
import {
  EVENT_TARGET_ROAS,
  formatCurrency,
  formatRoas,
  formatTourDateRange,
  roasBarBgByEvent,
  roasColorByEvent,
} from "@/lib/crm/dashboard-format";
import { CampaignTableHeader } from "@/components/crm/dashboard/CampaignTableHeader";
import { CampaignTableRow } from "@/components/crm/dashboard/CampaignTableRow";
import type { CampaignRow, EventRow, InsightRow } from "@/components/crm/dashboard/types";

// ============================================================
// Tour Family Card (master + splits hierárquico)
// ============================================================
export function TourFamilyCard({
  master,
  splits,
  campaignsBySplit,
  masterCampaigns,
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
  master: EventRow;
  splits: EventRow[];
  campaignsBySplit: Map<string, CampaignRow[]>;
  masterCampaigns: CampaignRow[];
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

  const allCampaigns = useMemo(() => {
    const arr: CampaignRow[] = [...masterCampaigns];
    for (const [, cs] of campaignsBySplit) arr.push(...cs);
    return arr;
  }, [campaignsBySplit, masterCampaigns]);

  const allInsights = useMemo(
    () => allCampaigns.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []),
    [allCampaigns, insightsByCampaign],
  );
  const aggAll = aggregate(allInsights);

  const tourContext = { master, splits, onReassigned: () => onEdited?.() };

  const dailyBudget = allCampaigns.reduce((s, c) => s + (c.daily_budget_cents ?? 0), 0);
  const lifetimeBudget = allCampaigns.reduce((s, c) => s + (c.lifetime_budget_cents ?? 0), 0);

  const tourDateLabel = formatTourDateRange(splits);

  const progressPct = aggAll.roas != null && Number.isFinite(aggAll.roas)
    ? Math.min(100, Math.max(0, (aggAll.roas / EVENT_TARGET_ROAS) * 100))
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
                  <h3 className="font-semibold truncate">{master.name}</h3>
                  <Badge variant="outline" className="text-xs uppercase border-cyan-500/40 text-cyan-300">
                    Tour · {splits.length} {splits.length === 1 ? "cidade" : "cidades"}
                  </Badge>
                  {tourDateLabel && (
                    <Badge variant="outline" className="text-xs font-mono">{tourDateLabel}</Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {allCampaigns.length} {allCampaigns.length === 1 ? "campanha" : "campanhas"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  ROAS{" "}
                  <span className={cn("font-semibold font-mono", roasColorByEvent(aggAll.roas))}>
                    {formatRoas(aggAll.roas)}
                  </span>{" "}
                  · Gasto {formatCurrency(aggAll.spendCents, currency)} · Receita{" "}
                  <span className="text-emerald-500/90">{formatCurrency(aggAll.revenueCents, currency)}</span>{" "}
                  · Conv. {aggAll.conversions}
                </div>
                {progressPct != null && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 rounded bg-muted overflow-hidden w-[180px] shrink-0">
                      <div
                        className={cn("h-full transition-all", roasBarBgByEvent(aggAll.roas))}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatRoas(aggAll.roas)} / {EVENT_TARGET_ROAS}x → {progressPct.toFixed(0)}% (blended tour)
                    </span>
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
          <div className="border-t border-border divide-y divide-border">
            {splits.map((s) => {
              const cs = campaignsBySplit.get(s.id) ?? [];
              const splitInsights = cs.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []);
              const aggSplit = aggregate(splitInsights);
              return (
                <div key={s.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                    <h4 className="text-sm font-semibold">{s.name}</h4>
                    {s.date && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {format(parseISO(s.date), "dd MMM yyyy", { locale: ptBR })}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {cs.length} {cs.length === 1 ? "campanha" : "campanhas"}
                    </Badge>
                    {cs.length > 0 && (
                      <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                        ROAS{" "}
                        <span className={cn("font-semibold font-mono", roasColorByEvent(aggSplit.roas))}>
                          {formatRoas(aggSplit.roas)}
                        </span>{" "}
                        · {formatCurrency(aggSplit.spendCents, currency)} · {formatCurrency(aggSplit.revenueCents, currency)} · {aggSplit.conversions} conv.
                      </span>
                    )}
                  </div>
                  {cs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/80 italic">Sem campanhas atribuídas a esta cidade. Re-aponta uma campanha do master abaixo via 📍.</p>
                  ) : (
                    <div className="overflow-x-auto rounded border border-border/40">
                      <table className="w-full">
                        <CampaignTableHeader />
                        <tbody>
                          {cs.map((c) => (
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
                              tourContext={tourContext}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {masterCampaigns.length > 0 && (
              <div className="p-4 space-y-2 bg-amber-500/5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-300">
                      Master / blended · {masterCampaigns.length} {masterCampaigns.length === 1 ? "campanha não atribuída" : "campanhas não atribuídas"}
                    </p>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">
                      Estas campanhas estão linkadas ao master — re-aponta a uma cidade (📍) para ver ROAS por split.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-amber-500/30">
                  <table className="w-full">
                    <CampaignTableHeader />
                    <tbody>
                      {masterCampaigns.map((c) => (
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
                          tourContext={tourContext}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
