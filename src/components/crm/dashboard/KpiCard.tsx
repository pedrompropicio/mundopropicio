import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/crm/dashboard-format";
import { NO_HISTORY_NOTE, type DeltaDirection } from "@/lib/crm/kpi-deltas";

// ============================================================
// KPI Card
// ============================================================
export interface KpiProps {
  label: string;
  big: string;
  /** Variação decimal já validada (null ⇒ mostra "—"). */
  delta?: number | null;
  subtitle: string;
  accent?: "default" | "primary";
  /**
   * Sentido da cor: "up-good" (ROAS, receita, conversões, ticket),
   * "up-bad" (CPM, CPC, CPA) ou "neutral" (investimento, impressões).
   */
  direction?: DeltaDirection;
  /** Sem histórico comparável: mostra "—" e a nota, em vez de inventar %. */
  comparable?: boolean;
  /** Linha secundária dentro do card (ex.: CPA dentro de Conversões). */
  secondary?: string;
}
export function KpiCard({
  label,
  big,
  delta,
  subtitle,
  accent = "default",
  direction = "neutral",
  comparable = true,
  secondary,
}: KpiProps) {
  const hasDelta =
    comparable && delta !== null && delta !== undefined && Number.isFinite(delta);
  const good = hasDelta && direction !== "neutral" &&
    (direction === "up-good" ? delta! > 0 : delta! < 0);
  const bad = hasDelta && direction !== "neutral" &&
    (direction === "up-good" ? delta! < 0 : delta! > 0);
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        accent === "primary" &&
          "border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
      )}
    >
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-4xl font-bold tabular-nums tracking-tight">{big}</div>
          {hasDelta ? (
            <div
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                good && "text-emerald-500",
                bad && "text-red-500",
                !good && !bad && "text-muted-foreground",
              )}
            >
              {delta! > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : delta! < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {formatPercent(delta!)}
            </div>
          ) : (
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">—</span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        {secondary && (
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">{secondary}</div>
        )}
        {!comparable && (
          <div className="mt-1 text-[10px] text-muted-foreground/80">{NO_HISTORY_NOTE}</div>
        )}
      </CardContent>
    </Card>
  );
}
