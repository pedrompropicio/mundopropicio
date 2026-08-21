import { useMemo } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { aggregate } from "@/lib/crm/aggregate";
import { formatCompact } from "@/lib/crm/dashboard-format";
import type { InsightRow } from "@/components/crm/dashboard/types";

interface Step {
  key: string;
  label: string;
  /** null = a plataforma não fornece a métrica (Google) — mostra "—", nunca 0. */
  value: number | null;
}

/**
 * Funil de conversão do período: Impressões → Cliques → ViewContent → AddToCart
 * → InitiateCheckout → Compras, com taxa de passagem entre cada par.
 *
 * Taxas impossíveis (>100%, ou InitCheckout→Compra >80%) são sinalizadas a
 * vermelho: significa que o evento do pixel não dispara em todo o fluxo
 * (checkout externo sem pixel). É diagnóstico, não um bug a esconder.
 */
export function ConversionFunnelPanel({ insights }: { insights: InsightRow[] }) {
  const steps: Step[] = useMemo(() => {
    const a = aggregate(insights);
    return [
      { key: "impressions", label: "Impressões", value: a.impressions },
      { key: "clicks", label: "Cliques", value: a.clicks },
      { key: "view_content", label: "ViewContent", value: a.hasViewContent ? a.viewContent : null },
      { key: "add_to_cart", label: "AddToCart", value: a.hasAddToCart ? a.addToCart : null },
      {
        key: "initiate_checkout",
        label: "InitiateCheckout",
        value: a.hasInitiateCheckout ? a.initiateCheckout : null,
      },
      { key: "purchases", label: "Compras", value: a.conversions },
    ];
  }, [insights]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Funil de conversão · período seleccionado
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-stretch gap-1.5">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1] : null;
            const rate =
              prev && prev.value != null && prev.value > 0 && s.value != null
                ? s.value / prev.value
                : null;
            const impossible =
              rate != null &&
              (rate > 1 || (prev?.key === "initiate_checkout" && s.key === "purchases" && rate > 0.8));
            return (
              <div key={s.key} className="flex items-stretch gap-1.5">
                {prev && (
                  <div className="flex flex-col items-center justify-center px-1">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    {rate != null ? (
                      impossible ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-red-500 cursor-help">
                              <AlertTriangle className="h-3 w-3" />
                              {(rate * 100).toFixed(1)}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Taxa impossível — evento em falta no checkout. O pixel não dispara em todo o
                            fluxo (provável checkout externo).
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                          {(rate * 100).toFixed(1)}%
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 min-w-[104px]",
                    impossible
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-border bg-muted/30",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </div>
                  <div
                    className={cn(
                      "text-base font-mono tabular-nums font-semibold",
                      impossible && "text-red-500",
                    )}
                  >
                    {s.value != null && s.value > 0 ? formatCompact(s.value) : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
