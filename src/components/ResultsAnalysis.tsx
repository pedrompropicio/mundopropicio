import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Download, TrendingUp, Target, BarChart3, Users, Ticket, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PESSIMISTIC_FACTOR = 0.8;

interface CompletedResult {
  id: string;
  name: string;
  date: string;
  totalIncome: number;
  totalExpense: number;
  margin: number;
  marginPct: number;
  totalPartnerPct: number;
  companyShare: number;
  hasPartners: boolean;
  incomeSource: "transactions" | "ticket_sales";
  expenseSource: "transactions";
}

interface ActiveProjection {
  id: string;
  name: string;
  date: string;
  // Planned 100%
  bpIncome100: number;
  bpExpense: number;
  margin100: number;
  breakEvenPct: number;
  // Real Atual (current sales + BP-or-real expenses merged)
  realIncome: number;
  realExpense: number;
  realMargin: number;
  realMarginPct: number;
  // Real Pessimista (current sales × 0.8 + same expenses)
  pessimisticIncome: number;
  pessimisticMargin: number;
  // Partners
  totalPartnerPct: number;
  companyMargin100: number;
  companyRealMargin: number;
  companyPessimisticMargin: number;
  incomeSource: "lot_projection" | "ticket_sales";
  expenseSource: "forecasts" | "transactions";
}

const sourceLabels: Record<string, { label: string; icon: "ticket" | "file" }> = {
  ticket_sales: { label: "Vendas", icon: "ticket" },
  lot_projection: { label: "Projeção Lotes", icon: "ticket" },
  transactions: { label: "Transações", icon: "file" },
  forecasts: { label: "BP", icon: "file" },
};

function SourceBadge({ source }: { source: string }) {
  const info = sourceLabels[source] ?? { label: source, icon: "file" };
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 font-normal text-muted-foreground">
      {info.icon === "ticket" ? <Ticket className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
      {info.label}
    </Badge>
  );
}

export function ResultsAnalysis() {
  const currentYear = new Date().getFullYear();

  const { data: events = [] } = useQuery({
    queryKey: ["ra_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type, parent_event_id, partner_calc_basis")
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["ra_transactions_v3"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, amount, status, category_id, iva_rate");
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["ra_forecasts_v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, amount, category_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ra_ticket_sales_v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("id, quantity, unit_price, lot_id, event_ticket_zones(event_id)");
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["ra_partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("event_id, percentage, loss_percentage, suppliers(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ra_ticket_lots_v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("id, quantity, price, iva_rate, zone_id, event_ticket_zones(event_id)");
      if (error) throw error;
      return data;
    },
  });

  const { data: closingCosts = [] } = useQuery({
    queryKey: ["ra_closing_costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_closing_costs")
        .select("event_id, amount");
      if (error) throw error;
      return data;
    },
  });

  const { completed, active, yearTotals } = useMemo(() => {
    // ── Build sub-event children index per Master event ──
    const childrenByMaster: Record<string, string[]> = {};
    events.forEach((e: any) => {
      if (e.parent_event_id) {
        if (!childrenByMaster[e.parent_event_id]) childrenByMaster[e.parent_event_id] = [];
        childrenByMaster[e.parent_event_id].push(e.id);
      }
    });

    // ── Projected revenue from ticket lots (capacity × price) — NET (sem IVA) ──
    // Ticket prices include IVA ("por dentro"); extract net using each lot's iva_rate (default 6%)
    const lotRevenueMap: Record<string, number> = {};
    ticketLots.forEach((lot: any) => {
      const eventId = lot.event_ticket_zones?.event_id;
      if (!eventId) return;
      const rate = Number(lot.iva_rate ?? 6);
      const netPrice = Number(lot.price) / (1 + rate / 100);
      lotRevenueMap[eventId] = (lotRevenueMap[eventId] || 0) + Number(lot.quantity) * netPrice;
    });

    // Lookup helper: lot id → iva_rate (for sales extraction)
    const lotIvaRate: Record<string, number> = {};
    ticketLots.forEach((lot: any) => {
      lotIvaRate[lot.id] = Number(lot.iva_rate ?? 6);
    });

    // ── Real ticket sales per event — NET (sem IVA) ──
    const salesByEvent: Record<string, number> = {};
    ticketSales.forEach((ts: any) => {
      const eventId = ts.event_ticket_zones?.event_id;
      if (!eventId) return;
      const rate = lotIvaRate[ts.lot_id] ?? 6;
      const netUnit = Number(ts.unit_price) / (1 + rate / 100);
      salesByEvent[eventId] = (salesByEvent[eventId] || 0) + Number(ts.quantity) * netUnit;
    });

    // ── Per-event BP expense map by category_id (event_forecasts.amount já é base sem IVA) ──
    const bpExpenseByEventCat: Record<string, Map<string, number>> = {};
    const bpIncomeMap: Record<string, number> = {};
    forecasts.forEach((f: any) => {
      const eid = f.event_id;
      if (!eid) return;
      if (f.type === "income") {
        bpIncomeMap[eid] = (bpIncomeMap[eid] ?? 0) + Number(f.amount);
        return;
      }
      if (!bpExpenseByEventCat[eid]) bpExpenseByEventCat[eid] = new Map();
      const key = f.category_id ?? "__none__";
      bpExpenseByEventCat[eid].set(key, (bpExpenseByEventCat[eid].get(key) ?? 0) + Number(f.amount));
    });

    // ── Per-event real (transactions) expense map by category_id — NET (sem IVA) ──
    // transactions.amount inclui IVA; extrair base usando iva_rate da transação
    const txnExpenseByEventCat: Record<string, Map<string, number>> = {};
    const txnIncomeMap: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const eid = t.event_id;
      if (!eid) return;
      const rate = Number(t.iva_rate ?? 0);
      const net = Number(t.amount) / (1 + rate / 100);
      if (t.type === "income") {
        txnIncomeMap[eid] = (txnIncomeMap[eid] ?? 0) + net;
        return;
      }
      if (!txnExpenseByEventCat[eid]) txnExpenseByEventCat[eid] = new Map();
      const key = t.category_id ?? "__none__";
      txnExpenseByEventCat[eid].set(key, (txnExpenseByEventCat[eid].get(key) ?? 0) + net);
    });

    // ── Closing costs per event ──
    const closingMap: Record<string, number> = {};
    closingCosts.forEach((cc: any) => {
      closingMap[cc.event_id] = (closingMap[cc.event_id] || 0) + Number(cc.amount);
    });

    const partnerMap: Record<string, { totalPct: number; items: any[] }> = {};
    partners.forEach((p: any) => {
      if (!partnerMap[p.event_id]) partnerMap[p.event_id] = { totalPct: 0, items: [] };
      partnerMap[p.event_id].totalPct += Number(p.percentage);
      partnerMap[p.event_id].items.push(p);
    });

    /**
     * Merge BP and real expenses for one event applying rule C:
     *   For each category that has BP:        amount = real > 0 ? real : bp
     *   For categories with real but no BP:   amount = real (extra cost)
     *   "__none__" key handled the same way (uncategorised).
     */
    const mergeExpenseForEvent = (eventId: string): number => {
      const bp = bpExpenseByEventCat[eventId];
      const real = txnExpenseByEventCat[eventId];
      if (!bp && !real) return 0;
      const allKeys = new Set<string>();
      bp?.forEach((_, k) => allKeys.add(k));
      real?.forEach((_, k) => allKeys.add(k));
      let total = 0;
      allKeys.forEach((key) => {
        const bpAmt = bp?.get(key) ?? 0;
        const realAmt = real?.get(key) ?? 0;
        // Rule C: real where exists, BP where it doesn't
        total += realAmt > 0 ? realAmt : bpAmt;
      });
      return total;
    };

    // BP-only expense (for "Planeado 100%" column)
    const bpExpenseTotalForEvent = (eventId: string): number => {
      const bp = bpExpenseByEventCat[eventId];
      if (!bp) return 0;
      let s = 0;
      bp.forEach((v) => { s += v; });
      return s;
    };

    // ── Helper: prorated Master shares (BP and merged) for a sub-event ──
    const getMasterShare = (subEventId: string) => {
      const sub = events.find((e: any) => e.id === subEventId);
      const masterId = sub?.parent_event_id;
      if (!masterId) return { bpExpense: 0, mergedExpense: 0, closing: 0 };
      const siblings = childrenByMaster[masterId] || [];
      const n = siblings.length || 1;
      return {
        bpExpense: bpExpenseTotalForEvent(masterId) / n,
        mergedExpense: mergeExpenseForEvent(masterId) / n,
        closing: (closingMap[masterId] ?? 0) / n,
      };
    };

    // ── Filter year events, exclude Master (multi_day) ──
    const yearEvents = events.filter(
      (e: any) => new Date(e.date).getFullYear() === currentYear && e.event_type !== "multi_day"
    );

    const completed: CompletedResult[] = [];
    const active: ActiveProjection[] = [];

    yearEvents.forEach((e: any) => {
      const masterShare = getMasterShare(e.id);
      const ownTicketSales = salesByEvent[e.id] ?? 0;
      const ownTxnIncome = txnIncomeMap[e.id] ?? 0;
      const ownClosing = closingMap[e.id] ?? 0;
      const totalPartnerPct = partnerMap[e.id]?.totalPct ?? 0;
      const companyPct = 100 - totalPartnerPct;
      const hasSales = ownTicketSales > 0;

      if (e.status === "completed") {
        // Completed: real expenses (transactions only, merged still applies for consistency)
        const ownExpense = mergeExpenseForEvent(e.id);
        const expense = ownExpense + masterShare.mergedExpense + ownClosing + masterShare.closing;
        const income = ownTicketSales + ownTxnIncome;
        const margin = income - expense;
        completed.push({
          id: e.id,
          name: e.name,
          date: e.date,
          totalIncome: income,
          totalExpense: expense,
          margin,
          marginPct: income > 0 ? (margin / income) * 100 : 0,
          totalPartnerPct,
          companyShare: margin * (companyPct / 100),
          hasPartners: totalPartnerPct > 0,
          incomeSource: hasSales ? "ticket_sales" : "transactions",
          expenseSource: "transactions",
        });
      } else if (e.status === "active" || e.status === "confirmed") {
        // ── PLANEADO 100% ──
        const lotRevenue = lotRevenueMap[e.id] ?? 0;
        const bpOtherIncome = bpIncomeMap[e.id] ?? 0;
        const bpIncome100 = lotRevenue + bpOtherIncome;
        const ownBpExpense = bpExpenseTotalForEvent(e.id);
        const bpExpense = ownBpExpense + masterShare.bpExpense + ownClosing + masterShare.closing;
        const margin100 = bpIncome100 - bpExpense;
        const breakEvenPct = bpIncome100 > 0 ? (bpExpense / bpIncome100) * 100 : 0;

        // ── REAL ATUAL ──
        // Receita = bilheteira VENDIDA + outras receitas BP (assume que outras receitas concretizam)
        // Despesas = merge linha-a-linha (real onde existe, BP onde não) + Master prorrateado + fecho real
        const ticketRevenueSold = ownTicketSales;
        const realIncome = ticketRevenueSold + bpOtherIncome;
        const ownMergedExpense = mergeExpenseForEvent(e.id);
        const realExpense =
          ownMergedExpense + masterShare.mergedExpense + ownClosing + masterShare.closing;
        const realMargin = realIncome - realExpense;

        // ── REAL PESSIMISTA ──
        // Bilheteira × 0,8 + outras receitas BP; mesmas despesas
        const pessimisticIncome = ticketRevenueSold * PESSIMISTIC_FACTOR + bpOtherIncome;
        const pessimisticMargin = pessimisticIncome - realExpense;

        active.push({
          id: e.id,
          name: e.name,
          date: e.date,
          bpIncome100,
          bpExpense,
          margin100,
          breakEvenPct: Math.min(breakEvenPct, 999),
          realIncome,
          realExpense,
          realMargin,
          realMarginPct: realIncome > 0 ? (realMargin / realIncome) * 100 : 0,
          pessimisticIncome,
          pessimisticMargin,
          totalPartnerPct,
          companyMargin100: margin100 * (companyPct / 100),
          companyRealMargin: realMargin * (companyPct / 100),
          companyPessimisticMargin: pessimisticMargin * (companyPct / 100),
          incomeSource: hasSales ? "ticket_sales" : "lot_projection",
          expenseSource: "forecasts",
        });
      }
    });

    completed.sort((a, b) => a.date.localeCompare(b.date));
    active.sort((a, b) => a.date.localeCompare(b.date));

    const yearTotals = {
      income: completed.reduce((s, e) => s + e.totalIncome, 0),
      expense: completed.reduce((s, e) => s + e.totalExpense, 0),
      margin: completed.reduce((s, e) => s + e.margin, 0),
      companyShare: completed.reduce((s, e) => s + e.companyShare, 0),
    };

    return { completed, active, yearTotals };
  }, [events, transactions, forecasts, ticketSales, partners, ticketLots, closingCosts, currentYear]);

  const generatePdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(16);
    doc.text(`Análise de Resultados ${currentYear}`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-PT")}`, 14, 24);

    let y = 30;

    if (completed.length > 0) {
      doc.setFontSize(12);
      doc.text("Eventos Concluídos", 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [["Evento", "Data", "Receitas", "Despesas", "Margem", "Margem %", "Sócios %", "Parte Empresa"]],
        body: [
          ...completed.map((e) => [
            e.name,
            formatDate(e.date),
            formatCurrency(e.totalIncome),
            formatCurrency(e.totalExpense),
            formatCurrency(e.margin),
            `${e.marginPct.toFixed(1)}%`,
            e.hasPartners ? `${e.totalPartnerPct.toFixed(0)}%` : "—",
            formatCurrency(e.companyShare),
          ]),
          [
            { content: `TOTAL ${currentYear}`, styles: { fontStyle: "bold" } },
            "",
            { content: formatCurrency(yearTotals.income), styles: { fontStyle: "bold" } },
            { content: formatCurrency(yearTotals.expense), styles: { fontStyle: "bold" } },
            { content: formatCurrency(yearTotals.margin), styles: { fontStyle: "bold" } },
            yearTotals.income > 0
              ? `${((yearTotals.margin / yearTotals.income) * 100).toFixed(1)}%`
              : "—",
            "",
            { content: formatCurrency(yearTotals.companyShare), styles: { fontStyle: "bold" } },
          ],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 105] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    }

    if (active.length > 0) {
      if (y > 160) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(12);
      doc.text("Eventos Ativos — Projeções", 14, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [[
          "Evento", "Data",
          "Planeado Receita", "Planeado Despesa", "Planeado Margem", "Break-Even",
          "Real Receita", "Real Despesa", "Real Margem",
          "Pess. Receita", "Pess. Margem",
        ]],
        body: active.map((e) => [
          e.name,
          formatDate(e.date),
          formatCurrency(e.bpIncome100),
          formatCurrency(e.bpExpense),
          formatCurrency(e.margin100),
          `${e.breakEvenPct.toFixed(1)}%`,
          formatCurrency(e.realIncome),
          formatCurrency(e.realExpense),
          formatCurrency(e.realMargin),
          formatCurrency(e.pessimisticIncome),
          formatCurrency(e.pessimisticMargin),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });
    }

    doc.save(`analise-resultados-${currentYear}.pdf`);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Análise de Resultados {currentYear}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={generatePdf}>
          <Download className="h-4 w-4 mr-1" />
          PDF
        </Button>
      </div>

      {/* --- COMPLETED --- */}
      {completed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            Eventos Concluídos
          </h3>
          <div className="overflow-x-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium">Evento</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Data</th>
                  <th className="p-3 text-right font-medium">Receitas</th>
                  <th className="p-3 text-right font-medium">Despesas</th>
                  <th className="p-3 text-right font-medium">Margem</th>
                  <th className="p-3 text-right font-medium hidden lg:table-cell">Margem %</th>
                  <th className="p-3 text-right font-medium">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 ml-auto">
                          <Users className="h-3 w-3" /> Empresa
                        </TooltipTrigger>
                        <TooltipContent>Parte da margem que cabe à empresa, descontando a participação dos sócios</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {completed.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <a href={`/eventos/${e.id}`} className="font-medium hover:text-primary transition-colors">
                        {e.name}
                      </a>
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{formatDate(e.date)}</td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-success">{formatCurrency(e.totalIncome)}</span>
                        <SourceBadge source={e.incomeSource} />
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-mono text-warning">{formatCurrency(e.totalExpense)}</span>
                        <SourceBadge source={e.expenseSource} />
                      </div>
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${e.margin >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(e.margin)}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                      {e.marginPct.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {e.hasPartners && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {e.totalPartnerPct.toFixed(0)}% sócios
                          </Badge>
                        )}
                        <span className={`font-mono font-semibold ${e.companyShare >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(e.companyShare)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold text-xs uppercase">
                  <td className="p-3" colSpan={2}>Total {currentYear}</td>
                  <td className="p-3 text-right font-mono text-success">{formatCurrency(yearTotals.income)}</td>
                  <td className="p-3 text-right font-mono text-warning">{formatCurrency(yearTotals.expense)}</td>
                  <td className={`p-3 text-right font-mono ${yearTotals.margin >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(yearTotals.margin)}
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                    {yearTotals.income > 0 ? `${((yearTotals.margin / yearTotals.income) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className={`p-3 text-right font-mono ${yearTotals.companyShare >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(yearTotals.companyShare)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* --- ACTIVE PROJECTIONS --- */}
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            Eventos Ativos — Projeções
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            <strong>Planeado</strong>: BP completo · <strong>Real Atual</strong>: bilheteira vendida + outras receitas BP, despesas reais onde existem (senão BP) · <strong>Pessimista</strong>: bilheteira vendida × 0,80 · <em>Todos os valores SEM IVA</em>
          </p>
          <div className="overflow-x-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium" rowSpan={2}>Evento</th>
                  <th className="p-3 text-center font-medium border-b border-border/30" colSpan={3}>Planeado 100%</th>
                  <th className="p-3 text-center font-medium border-b border-border/30 border-l-2 border-l-border" colSpan={4}>Real Atual</th>
                  <th className="p-3 text-center font-medium border-b border-border/30 border-l-2 border-l-border" colSpan={2}>Pessimista (×0,8)</th>
                </tr>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-right font-medium">Receita</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                  <th className="p-2 text-right font-medium">Break-Even</th>

                  <th className="p-2 text-right font-medium border-l-2 border-l-border">Receita</th>
                  <th className="p-2 text-right font-medium">Despesa</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                  <th className="p-2 text-right font-medium">%</th>

                  <th className="p-2 text-right font-medium border-l-2 border-l-border">Receita</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {active.map((e) => {
                  const companyPct = 100 - e.totalPartnerPct;
                  return (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <a href={`/eventos/${e.id}`} className="font-medium hover:text-primary transition-colors">
                          {e.name}
                        </a>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{formatDate(e.date)}</span>
                          <SourceBadge source={e.incomeSource} />
                          <SourceBadge source={e.expenseSource} />
                        </div>
                      </td>

                      {/* Planeado 100% */}
                      <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(e.bpIncome100)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono ${e.margin100 >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(e.margin100)}
                          </span>
                          {e.totalPartnerPct > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                Empresa {companyPct.toFixed(0)}%
                              </Badge>
                              <span className={`font-mono text-xs ${e.companyMargin100 >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(e.companyMargin100)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Badge
                          variant={e.breakEvenPct <= 70 ? "default" : e.breakEvenPct <= 90 ? "secondary" : "destructive"}
                          className="font-mono text-xs"
                        >
                          {e.breakEvenPct.toFixed(1)}%
                        </Badge>
                      </td>

                      {/* Real Atual */}
                      <td className="p-3 text-right font-mono text-success border-l-2 border-l-border">{formatCurrency(e.realIncome)}</td>
                      <td className="p-3 text-right font-mono text-warning">{formatCurrency(e.realExpense)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono font-semibold ${e.realMargin >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(e.realMargin)}
                          </span>
                          {e.totalPartnerPct > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                Empresa {companyPct.toFixed(0)}%
                              </Badge>
                              <span className={`font-mono text-xs ${e.companyRealMargin >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(e.companyRealMargin)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`p-3 text-right font-mono text-xs ${e.realMargin >= 0 ? "text-success" : "text-destructive"}`}>
                        {e.realMarginPct.toFixed(1)}%
                      </td>

                      {/* Pessimista */}
                      <td className="p-3 text-right font-mono text-muted-foreground border-l-2 border-l-border">{formatCurrency(e.pessimisticIncome)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono ${e.pessimisticMargin >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(e.pessimisticMargin)}
                          </span>
                          {e.totalPartnerPct > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                Empresa {companyPct.toFixed(0)}%
                              </Badge>
                              <span className={`font-mono text-xs ${e.companyPessimisticMargin >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(e.companyPessimisticMargin)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completed.length === 0 && active.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Sem dados de resultados para {currentYear}.
        </p>
      )}
    </section>
  );
}
