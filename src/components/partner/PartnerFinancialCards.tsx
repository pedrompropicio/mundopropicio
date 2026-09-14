import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";

/**
 * Cards financeiros do portal do sócio.
 *
 * Receitas: REALIZADAS, SEM IVA (net) = bilhetes vendidos + patrocínios confirmados
 * (transações type=income cat. 1.2*) + bares/F&B (transações type=income cat. 1.1.03*).
 * Despesas: BP aprovado + overheads, na BASE DE APURAMENTO DO SÓCIO (D-ERP9) —
 * c/IVA ou base líquida conforme `expensesWithVat`. Usa o mesmo `bpTotalExpense`
 * da vista Agrupada, garantindo que os valores batem exatamente.
 */
export interface PartnerFinancialCardsProps {
  ticketsNet: number;
  sponsorshipNet: number;
  barsNet: number;
  /** Restantes rubricas de receita (ex. 1.3.04 Revenue Share). */
  otherNet?: number;
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
  /**
   * (g17) Números do FECHO vindos do servidor (perímetro da raiz). Quando dados,
   * mandam sobre o cálculo local — o Portal nunca mostra um "Resultado" que não
   * seja o do fecho.
   */
  fecho?: { revenueNet: number; expenses: number; result: number; expensesWithVat: boolean } | null;
  /** Base efectiva das despesas do sócio (D-ERP9): true = c/IVA, false = s/IVA. */
  expensesWithVat?: boolean;
  /** Rótulo da base e da sua origem (contrato do evento vs regra do sócio). */
  expenseBasisNote?: string | null;
}

export function PartnerFinancialCards({
  ticketsNet, sponsorshipNet, barsNet, otherNet = 0, bpExpenseGross,
  bpExpenseRealized = 0, showRealized = false, realizedError = false,
  adjustedRubricsCount = 0, fecho = null,
  expensesWithVat = true, expenseBasisNote = null,
}: PartnerFinancialCardsProps) {
  const incomeNet = fecho ? fecho.revenueNet : ticketsNet + sponsorshipNet + barsNet + otherNet;
  const expenseTotal = fecho ? fecho.expenses : bpExpenseGross;
  const result = fecho ? fecho.result : incomeNet - expenseTotal;
  const basisShort = expensesWithVat ? "c/IVA" : "s/IVA";
  const pct = !fecho && showRealized && bpExpenseGross > 0
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
            {fecho ? "Receitas do evento" : "Receitas Realizadas"}
          </h3>
        </div>
        <p className="mt-2 text-xl sm:text-2xl font-bold font-mono text-emerald-500">
          {formatCurrency(incomeNet)}
        </p>
        {fecho ? (
          <p className="mt-2 text-[10px] text-muted-foreground">Valores do fecho do evento, sem IVA</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span><span className="font-medium text-foreground/70">Bilheteira:</span> {formatCurrency(ticketsNet)}</span>
            <span><span className="font-medium text-foreground/70">Patrocínio:</span> {formatCurrency(sponsorshipNet)}</span>
            <span><span className="font-medium text-foreground/70">Bares:</span> {formatCurrency(barsNet)}</span>
            {otherNet !== 0 && (
              <span><span className="font-medium text-foreground/70">Outras:</span> {formatCurrency(otherNet)}</span>
            )}
          </div>
        )}
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
          {formatCurrency(expenseTotal)}
        </p>
        {fecho ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Despesas do evento {fecho.expensesWithVat ? "c/IVA" : "s/IVA"}
          </p>
        ) : showRealized ? (
          realizedError ? (
            <p className="mt-2 text-[10px] text-red-400">Não foi possível carregar os realizados</p>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Previsto {basisShort} · Realizado{" "}
              <span className="font-semibold text-foreground/80 font-mono">{formatCurrency(bpExpenseRealized ?? 0)}</span>{" "}
              <span className={`font-semibold ${pctColor}`}>({pct.toFixed(0)}%)</span>
            </p>
          )
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground">Total previsto {basisShort}</p>
        )}
        {!fecho && expenseBasisNote && (
          <p className="mt-1 text-[10px] text-muted-foreground/80 italic">{expenseBasisNote}</p>
        )}
        {/* Nota do cálculo local: não se aplica ao número do fecho. */}
        {!fecho && adjustedRubricsCount > 0 && (
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
