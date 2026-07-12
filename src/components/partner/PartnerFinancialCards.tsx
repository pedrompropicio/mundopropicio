import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";

/**
 * Cards financeiros do portal do sócio — visão ÚNICA e fixa (sem seletor de modos).
 *
 * Receitas: REALIZADAS, SEM IVA (net) = bilhetes vendidos + patrocínios confirmados
 * (transações type=income cat. 1.2*) + bares/F&B (transações type=income cat. 1.1.03*).
 * Despesas: BP aprovado + overheads, COM IVA (bruto) — usa o mesmo `bpTotalExpense`
 * da vista Agrupada, garantindo que os valores batem exatamente.
 */
export interface PartnerFinancialCardsProps {
  ticketsNet: number;
  sponsorshipNet: number;
  barsNet: number;
  bpExpenseGross: number;
}

export function PartnerFinancialCards({
  ticketsNet, sponsorshipNet, barsNet, bpExpenseGross,
}: PartnerFinancialCardsProps) {
  const incomeNet = ticketsNet + sponsorshipNet + barsNet;
  const result = incomeNet - bpExpenseGross;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {/* RECEITAS REALIZADAS (net) */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            Receitas Realizadas
          </h3>
        </div>
        <p className="mt-2 text-xl sm:text-2xl font-bold font-mono text-emerald-500">
          {formatCurrency(incomeNet)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span><span className="font-medium text-foreground/70">Bilheteira:</span> {formatCurrency(ticketsNet)}</span>
          <span><span className="font-medium text-foreground/70">Patrocínio:</span> {formatCurrency(sponsorshipNet)}</span>
          <span><span className="font-medium text-foreground/70">Bares:</span> {formatCurrency(barsNet)}</span>
        </div>
      </div>

      {/* DESPESAS BP + OVERHEAD (bruto c/IVA) */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            Despesas
          </h3>
        </div>
        <p className="mt-2 text-xl sm:text-2xl font-bold font-mono text-amber-500">
          {formatCurrency(bpExpenseGross)}
        </p>
        <p className="mt-2 text-[10px] text-muted-foreground">Total previsto c/IVA</p>
      </div>

      {/* RESULTADO */}
      <Card className={result >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
        <CardContent className="p-4 flex flex-col justify-between h-full gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Resultado</span>
          <span className={`text-xl sm:text-2xl font-bold font-mono ${result >= 0 ? "text-emerald-500" : "text-red-400"}`}>
            {formatCurrency(result)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

export default PartnerFinancialCards;
