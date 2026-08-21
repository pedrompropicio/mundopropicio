import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/crm/dashboard-format";

// ============================================================
// KPI Card
// ============================================================
export interface KpiProps {
  label: string;
  big: string;
  delta?: number | null; // signed decimal
  subtitle: string;
  accent?: "default" | "primary";
  invertDelta?: boolean; // for "spend" where increase isn't necessarily good
}
export function KpiCard({ label, big, delta, subtitle, accent = "default", invertDelta = false }: KpiProps) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const positive = hasDelta && (invertDelta ? delta! < 0 : delta! > 0);
  const negative = hasDelta && (invertDelta ? delta! > 0 : delta! < 0);
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
          {hasDelta && (
            <div
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                positive && "text-emerald-500",
                negative && "text-red-500",
                !positive && !negative && "text-muted-foreground",
              )}
            >
              {positive ? (
                <TrendingUp className="h-3 w-3" />
              ) : negative ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {formatPercent(delta!)}
            </div>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}
