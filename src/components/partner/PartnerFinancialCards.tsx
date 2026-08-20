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
  bpExpenseRealized?: number | null;
  showRealized?: boolean;
  realizedError?: boolean;
  /**
   * Nº de rubricas L3 cujo previsto foi substituído pelo realizado (ver
   * "Previsto + excedido à realidade" em PartnerEventDetail). Quando > 0 acrescenta
   * uma nota discreta no card Despesas.
   */
  adjustedRubricsCount?: number;
}

export function PartnerFinancialCards({
  ticketsNet, sponsorshipNet, barsNet, bpExpenseGross,
  bpExpenseRealized = 0, showRealized = false, realizedError = false,
  adjustedRubricsCount = 0,
}: PartnerFinancialCardsProps) {
  const incomeNet = ticketsNet + sponsorshipNet + barsNet;
  const result = incomeNet - bpExpenseGross;
  const pct = showRealized && bpExpenseGross > 0
    ? (bpExpenseRealized ?? 0) / bpExpenseGross * 100
    : 0;
  const pctColor = pct <= 100 ? "text-emerald-500" : pct <= 110 ? "text-amber-500" : "text-red-500";

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
        {showRealized ? (
          realizedError ? (
            <p className="mt-2 text-[10px] text-red-400">Não foi possível carregar os realizados</p>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Previsto c/IVA · Realizado{" "}
              <span className="font-semibold text-foreground/80 font-mono">{formatCurrency(bpExpenseRealized ?? 0)}</span>{" "}
              <span className={`font-semibold ${pctColor}`}>({pct.toFixed(0)}%)</span>
            </p>
          )
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground">Total previsto c/IVA</p>
        )}
        {adjustedRubricsCount > 0 && (
          <p className="mt-1 text-[10px] text-amber-500/80 italic">
            inclui {adjustedRubricsCount} rubrica{adjustedRubricsCount === 1 ? "" : "s"} ajustada{adjustedRubricsCount === 1 ? "" : "s"} ao realizado
          </p>
        )}
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
