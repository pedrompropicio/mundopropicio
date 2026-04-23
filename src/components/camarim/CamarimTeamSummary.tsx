import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, FileWarning, Receipt, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  type CamarimItemStatus,
} from "@/lib/camarim-helpers";

interface SummaryItem {
  total_amount: number;
  status: CamarimItemStatus;
  has_document: boolean;
}

interface Props {
  items: SummaryItem[];
  budget: number;
  spent: number;
  currency?: string;
}

export function CamarimTeamSummary({ items, budget, spent, currency = "EUR" }: Props) {
  const stats = useMemo(() => {
    const byStatus: Record<CamarimItemStatus, number> = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      integrated: 0,
      pending_review: 0,
    };
    let missingDocs = 0;
    for (const it of items) {
      byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
      if (!it.has_document) missingDocs += 1;
    }
    const remaining = Math.max(0, budget - spent);
    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    return { byStatus, missingDocs, remaining, pct };
  }, [items, budget, spent]);

  const tone =
    stats.pct >= 100 ? "destructive" : stats.pct >= 80 ? "warning" : "ok";

  return (
    <div className="grid grid-cols-2 gap-2">
      <Card className="border-border/60">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Receipt className="h-3 w-3" /> Restante
          </div>
          <p
            className={cn(
              "mt-1 text-base font-bold tabular-nums",
              tone === "destructive" && "text-destructive",
              tone === "warning" && "text-amber-600",
            )}
          >
            {formatCurrency(stats.remaining, currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            de {formatCurrency(budget, currency)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Send className="h-3 w-3" /> Submetidos
          </div>
          <p className="mt-1 text-base font-bold tabular-nums">
            {stats.byStatus.submitted}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {stats.byStatus.draft} rascunho · {stats.byStatus.rejected} rejeitado
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" /> Aprovados
          </div>
          <p className="mt-1 text-base font-bold tabular-nums text-emerald-600">
            {stats.byStatus.approved + stats.byStatus.integrated}
          </p>
          <p className="text-[10px] text-muted-foreground">prontos a integrar</p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border-border/60",
          stats.missingDocs > 0 && "border-amber-500/40 bg-amber-500/5",
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <FileWarning className="h-3 w-3" /> Sem fatura
          </div>
          <p
            className={cn(
              "mt-1 text-base font-bold tabular-nums",
              stats.missingDocs > 0 ? "text-amber-600" : "text-foreground",
            )}
          >
            {stats.missingDocs}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {stats.missingDocs > 0 ? "anexar talão/recibo" : "tudo documentado"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
