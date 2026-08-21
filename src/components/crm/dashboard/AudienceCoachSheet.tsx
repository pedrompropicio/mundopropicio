import { useEffect, useState } from "react";
import { FileDown, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { printAudienceCoach } from "@/lib/audience-pdf";
import { cn } from "@/lib/utils";

/**
 * AI Audience Coach (crm-meta-audience-coach).
 * Extraído de Campaigns.tsx (Fase 1) — comportamento idêntico:
 * a análise arranca quando o sheet abre para uma campanha.
 */
export function AudienceCoachSheet({
  open,
  onOpenChange,
  campaignId,
  connectionId,
  adAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  connectionId: string | null;
  adAccountId: string | null;
}) {
  const [coachData, setCoachData] = useState<any>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    (async () => {
      setCoachLoading(true);
      setCoachError(null);
      setCoachData(null);
      try {
        if (!connectionId || !adAccountId) throw new Error("Sem ad account ativa.");
        const { data, error } = await supabase.functions.invoke("crm-meta-audience-coach", {
          body: { connection_id: connectionId, ad_account_id: adAccountId, campaign_id: campaignId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.message || data.error);
        if (!cancelled) setCoachData(data);
      } catch (e: any) {
        if (!cancelled) setCoachError(e?.message || "Erro desconhecido");
      } finally {
        if (!cancelled) setCoachLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, campaignId, connectionId, adAccountId]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-400" />
              AI Audience Coach
            </SheetTitle>
            <SheetDescription>{coachData?.campaign?.name ?? "A processar..."}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {coachLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                <p className="text-sm text-muted-foreground">A analisar audiência...</p>
                <p className="text-xs text-muted-foreground/70">Pode demorar 15-30s</p>
              </div>
            )}

            {coachError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{coachError}</p>
              </div>
            )}

            {coachData && coachData.coach && (
              <>
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Artista detetado:</span>
                    <span className="text-sm font-semibold text-purple-300">{coachData.detected_artist || "—"}</span>
                    <span className={cn(
                      "ml-auto text-xs font-semibold uppercase px-2 py-0.5 rounded",
                      coachData.coach.verdict === "excelente" ? "bg-emerald-500/15 text-emerald-400" :
                      coachData.coach.verdict === "bom" ? "bg-green-500/15 text-green-400" :
                      coachData.coach.verdict === "regular" ? "bg-amber-500/15 text-amber-400" :
                      coachData.coach.verdict === "fraco" ? "bg-orange-500/15 text-orange-400" :
                      "bg-red-500/15 text-red-400"
                    )}>{coachData.coach.verdict}</span>
                  </div>
                  <p className="text-sm">{coachData.coach.summary}</p>
                </div>

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🔍 Diagnóstico do targeting atual</h4>
                  <ul className="space-y-1.5">
                    {coachData.coach.diagnostic?.map((d: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">•</span><span>{d}</span></li>
                    ))}
                  </ul>
                </div>

                {coachData.coach.missed_opportunities?.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">💡 Oportunidades perdidas</h4>
                    <ul className="space-y-1.5">
                      {coachData.coach.missed_opportunities.map((o: string, i: number) => (
                        <li key={i} className="text-sm flex gap-2"><span className="text-amber-400">•</span><span>{o}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🎯 Recomendações priorizadas</h4>
                  <div className="space-y-2">
                    {coachData.coach.recommendations?.map((r: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            r.priority === "high" ? "bg-red-500/15 text-red-400" :
                            r.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                            "bg-muted text-muted-foreground"
                          )}>{r.priority}</span>
                          <p className="text-sm font-medium flex-1">{r.action}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">{r.rationale}</p>
                        {r.how && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">Como implementar →</summary>
                            <p className="mt-1.5 text-foreground/80 pl-3 border-l-2 border-cyan-500/30">{r.how}</p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {coachData.coach.suggested_audiences?.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">✨ Audiências sugeridas para testar</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {coachData.coach.suggested_audiences.map((a: any, i: number) => (
                        <div key={i} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold">{a.name}</span>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">{a.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{a.spec}</p>
                          <p className="text-xs text-cyan-400">{a.estimated_size}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                  Análise baseada em: {coachData.context_used.current_adsets} adsets · {coachData.context_used.top_performers_count} top performers · {coachData.context_used.interests_found} interesses · {coachData.context_used.custom_audiences_count} custom audiences. Gerada {new Date(coachData.generated_at).toLocaleString("pt-PT")}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printAudienceCoach(coachData)}
                  className="w-full"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar análise como PDF
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
