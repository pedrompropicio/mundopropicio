import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
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
  parentEventId?: string | null;
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

type ResultMode = "projection" | "realized";

interface ActiveProjection {
  id: string;
  name: string;
  date: string;
  parentEventId?: string | null;
  // Planned 100%
  bpIncome100: number;
  bpExpense: number;
  margin100: number;
  breakEvenPct: number;
  // Planned 80% (cenário pessimista sobre receita planeada)
  bpIncome80: number;
  margin80: number;
  // Real Atual (current sales + BP-or-real expenses merged)
  realIncome: number;
  realExpense: number;
  realMargin: number;
  realMarginPct: number;
  // Modo aplicado a esta linha (Real Atual)
  resultMode: ResultMode;
  // Partners
  totalPartnerPct: number;
  companyMargin100: number;
  companyMargin80: number;
  companyRealMargin: number;
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
  const [includeOverhead, setIncludeOverhead] = useState<boolean>(false);
  // Override manual do modo de cálculo de "Real Atual":
  //   "auto"       → switch automático por ciclo de vida (data passou → realized; senão projection)
  //   "projection" → força lógica antiga (BP-as-ceiling, max(pendente, BP-pago))
  //   "realized"   → força só transações reais (paid + pending), igual ao Fecho
  const [resultModeOverride, setResultModeOverride] = useState<"auto" | ResultMode>("auto");

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
    queryKey: ["ra_transactions_v5_no_transitory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, amount, status, category_id, iva_rate, is_transitory")
        .eq("is_hidden", false)
        .eq("is_transitory", false)
        .in("status", ["paid", "approved"]);
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
        .select("id, quantity, unit_price, total_value, lot_id, event_ticket_zones(event_id)");
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

  const { data: closingCostsRaw = [] } = useQuery({
    queryKey: ["ra_closing_costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, amount")
        .eq("is_overhead", true);
      if (error) throw error;
      return data;
    },
  });

  // Última data efetiva de cada evento (max de event_dates) para detetar
  // se o evento já passou e mudar a lógica de "Real Atual" automaticamente.
  const { data: eventDates = [] } = useQuery({
    queryKey: ["ra_event_dates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates")
        .select("event_id, date");
      if (error) throw error;
      return data;
    },
  });

  // Proração Master→Splits (÷N) — ver src/lib/overhead-proration.ts
  const closingCosts = useMemo(
    () => expandOverheadToSplits(closingCostsRaw as any, events as any),
    [closingCostsRaw, events],
  );

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
      const grossRevenue = ts.total_value != null ? Number(ts.total_value) : Number(ts.quantity) * Number(ts.unit_price);
      const netRevenue = grossRevenue / (1 + rate / 100);
      salesByEvent[eventId] = (salesByEvent[eventId] || 0) + netRevenue;
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

    // ── Per-event real (transactions) expense maps by category_id — NET (sem IVA) ──
    // Alinhado com os Cards do BP: contamos apenas PAID + APPROVED (PENDING é excluído).
    // Separamos PAID vs APPROVED para a regra de fusão correta:
    //   • PAID     → substitui o BP integralmente (gasto consolidado)
    //   • APPROVED → soma com o gap do BP (mantém a previsão original como teto)
    //   • PENDING  → IGNORADO (ainda não validado pela gestão)
    // transactions.amount é já a base SEM IVA (Single Source of Truth — ver mem://features/iva-portugal).
    // NÃO dividir por (1 + iva_rate/100) — isso provocaria dupla redução.
    const txnExpensePaidByCat: Record<string, Map<string, number>> = {};
    const txnExpenseApprovedByCat: Record<string, Map<string, number>> = {};
    const txnIncomeMap: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const eid = t.event_id;
      if (!eid) return;
      const net = Number(t.amount);
      if (t.type === "income") {
        // Receitas: só paid e approved são consideradas reais (alinha com Cards do BP)
        if (t.status !== "paid" && t.status !== "approved") return;
        txnIncomeMap[eid] = (txnIncomeMap[eid] ?? 0) + net;
        return;
      }
      // Despesas: só paid e approved entram (pending ignorado)
      let target: Record<string, Map<string, number>> | null = null;
      if (t.status === "paid") target = txnExpensePaidByCat;
      else if (t.status === "approved") target = txnExpenseApprovedByCat;
      if (!target) return;
      if (!target[eid]) target[eid] = new Map();
      const key = t.category_id ?? "__none__";
      target[eid].set(key, (target[eid].get(key) ?? 0) + net);
    });

    // ── Closing costs (overhead) per event — só entram quando toggle ON (Vista Sócio) ──
    const closingMap: Record<string, number> = {};
    if (includeOverhead) {
      closingCosts.forEach((cc: any) => {
        closingMap[cc.event_id] = (closingMap[cc.event_id] || 0) + Number(cc.amount);
      });
    }

    const partnerMap: Record<string, { totalPct: number; items: any[] }> = {};
    partners.forEach((p: any) => {
      if (!partnerMap[p.event_id]) partnerMap[p.event_id] = { totalPct: 0, items: [] };
      partnerMap[p.event_id].totalPct += Number(p.percentage);
      partnerMap[p.event_id].items.push(p);
    });

    /**
     * Merge BP and real expenses for one event by transaction status.
     * Alinhado com os Cards do BP: pending NÃO é contabilizado em nenhum modo.
     *
     *   • Modo "projection" (eventos ainda no início do ciclo):
     *     PAID consolida; APPROVED ou (BP − pago), o maior. Mantém o teto BP.
     *   • Modo "realized" (eventos passados / em fecho):
     *     Apenas transações validadas (paid + approved). Ignora BP por completo.
     *     Evita inflar o resultado com sobras de orçamento que já não vão materializar-se.
     */
    const mergeExpenseForEvent = (eventId: string, mode: ResultMode): number => {
      const bp = bpExpenseByEventCat[eventId];
      const paid = txnExpensePaidByCat[eventId];
      const approved = txnExpenseApprovedByCat[eventId];
      if (mode === "realized") {
        let total = 0;
        paid?.forEach((v) => { total += v; });
        approved?.forEach((v) => { total += v; });
        return total;
      }
      if (!bp && !paid && !approved) return 0;
      const allKeys = new Set<string>();
      bp?.forEach((_, k) => allKeys.add(k));
      paid?.forEach((_, k) => allKeys.add(k));
      approved?.forEach((_, k) => allKeys.add(k));
      let total = 0;
      allKeys.forEach((key) => {
        const bpAmt = bp?.get(key) ?? 0;
        const paidAmt = paid?.get(key) ?? 0;
        const approvedAmt = approved?.get(key) ?? 0;
        const remainingBp = Math.max(0, bpAmt - paidAmt);
        total += paidAmt + Math.max(approvedAmt, remainingBp);
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

    // ── Última data efetiva de cada evento (max(event_dates) ou events.date) ──
    const lastDateByEvent: Record<string, string> = {};
    events.forEach((e: any) => {
      lastDateByEvent[e.id] = e.date;
    });
    eventDates.forEach((ed: any) => {
      const cur = lastDateByEvent[ed.event_id];
      if (!cur || String(ed.date).localeCompare(cur) > 0) {
        lastDateByEvent[ed.event_id] = ed.date;
      }
    });

    // Modo automático: se a última data já passou → "realized"; senão → "projection".
    // Para Master prorrateado de um sub-evento, considera-se a data do próprio sub-evento.
    const todayStr = new Date().toISOString().slice(0, 10);
    const autoModeFor = (eventId: string): ResultMode => {
      const lastDate = lastDateByEvent[eventId];
      if (!lastDate) return "projection";
      return lastDate.localeCompare(todayStr) < 0 ? "realized" : "projection";
    };
    const resolveMode = (eventId: string): ResultMode => {
      if (resultModeOverride !== "auto") return resultModeOverride;
      return autoModeFor(eventId);
    };

    // ── Helper: prorated Master shares (BP and merged) for a sub-event ──
    const getMasterShare = (subEventId: string, mode: ResultMode) => {
      const sub = events.find((e: any) => e.id === subEventId);
      const masterId = sub?.parent_event_id;
      if (!masterId) return { bpExpense: 0, mergedExpense: 0, closing: 0 };
      const siblings = childrenByMaster[masterId] || [];
      const n = siblings.length || 1;
      return {
        bpExpense: bpExpenseTotalForEvent(masterId) / n,
        mergedExpense: mergeExpenseForEvent(masterId, mode) / n,
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
      // Modo aplicado a este evento (override manual ou auto por ciclo de vida)
      const eventMode = resolveMode(e.id);
      const masterShare = getMasterShare(e.id, eventMode);
      const ownTicketSales = salesByEvent[e.id] ?? 0;
      const ownTxnIncome = txnIncomeMap[e.id] ?? 0;
      const ownClosing = closingMap[e.id] ?? 0;
      const totalPartnerPct = partnerMap[e.id]?.totalPct ?? 0;
      const companyPct = 100 - totalPartnerPct;
      const hasSales = ownTicketSales > 0;

      if (e.status === "completed") {
        // Concluídos: sempre lógica "realized" — só transações reais
        const ownExpense = mergeExpenseForEvent(e.id, "realized");
        const masterShareCompleted = getMasterShare(e.id, "realized");
        const expense = ownExpense + masterShareCompleted.mergedExpense + ownClosing + masterShareCompleted.closing;
        const income = ownTicketSales + ownTxnIncome;
        const margin = income - expense;
        completed.push({
          id: e.id,
          name: e.name,
          date: e.date,
          parentEventId: e.parent_event_id ?? null,
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
        // Modo "projection": despesas = merge BP+real (mantém teto BP) — útil antes/durante
        // Modo "realized":   despesas = só transações reais (paid + approved) — eventos passados
        // Receita: APENAS realizada (bilheteira vendida + transações income paid+approved).
        // BP de outras receitas NÃO entra no Real (alinha com os Cards do sub-evento).
        const ticketRevenueSold = ownTicketSales;
        const realIncome = ticketRevenueSold + ownTxnIncome;
        const ownMergedExpense = mergeExpenseForEvent(e.id, eventMode);
        const realExpense =
          ownMergedExpense + masterShare.mergedExpense + ownClosing + masterShare.closing;
        const realMargin = realIncome - realExpense;

        // ── PLANEADO 80% (cenário pessimista sobre receita planeada) ──
        // Aplica 0,80 sobre a receita PLANEADA (lotes + outras receitas BP), com despesas BP completas
        const bpIncome80 = bpIncome100 * PESSIMISTIC_FACTOR;
        const margin80 = bpIncome80 - bpExpense;

        active.push({
          id: e.id,
          name: e.name,
          date: e.date,
          parentEventId: e.parent_event_id ?? null,
          bpIncome100,
          bpExpense,
          margin100,
          breakEvenPct: Math.min(breakEvenPct, 999),
          bpIncome80,
          margin80,
          realIncome,
          realExpense,
          realMargin,
          realMarginPct: realIncome > 0 ? (realMargin / realIncome) * 100 : 0,
          resultMode: eventMode,
          totalPartnerPct,
          companyMargin100: margin100 * (companyPct / 100),
          companyMargin80: margin80 * (companyPct / 100),
          companyRealMargin: realMargin * (companyPct / 100),
          incomeSource: hasSales ? "ticket_sales" : "lot_projection",
          expenseSource: "forecasts",
        });
      }
    });

    // Agrupa por turnê (parent_event_id) e ordena cronologicamente.
    // A chave da turnê usa a data mais antiga dos seus sub-eventos para
    // posicionar a turnê inteira; dentro da turnê, ordena por data ascendente.
    const tourEarliestDate = new Map<string, string>();
    const trackTour = (eventId: string, parentId: string | null, date: string) => {
      const key = parentId ?? eventId;
      const cur = tourEarliestDate.get(key);
      if (!cur || date.localeCompare(cur) < 0) tourEarliestDate.set(key, date);
    };
    completed.forEach((e) => trackTour(e.id, e.parentEventId ?? null, e.date));
    active.forEach((e) => trackTour(e.id, e.parentEventId ?? null, e.date));

    const tourSort = (a: { id: string; date: string; parentEventId?: string | null }, b: { id: string; date: string; parentEventId?: string | null }) => {
      const aKey = a.parentEventId ?? a.id;
      const bKey = b.parentEventId ?? b.id;
      const aTour = tourEarliestDate.get(aKey) ?? a.date;
      const bTour = tourEarliestDate.get(bKey) ?? b.date;
      const tourCmp = aTour.localeCompare(bTour);
      if (tourCmp !== 0) return tourCmp;
      // mesma turnê → cronológico
      return a.date.localeCompare(b.date);
    };

    completed.sort(tourSort);
    active.sort(tourSort);

    const yearTotals = {
      income: completed.reduce((s, e) => s + e.totalIncome, 0),
      expense: completed.reduce((s, e) => s + e.totalExpense, 0),
      margin: completed.reduce((s, e) => s + e.margin, 0),
      companyShare: completed.reduce((s, e) => s + e.companyShare, 0),
    };

    return { completed, active, yearTotals };
  }, [events, transactions, forecasts, ticketSales, partners, ticketLots, closingCosts, eventDates, currentYear, includeOverhead, resultModeOverride]);

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
          "Plan. 100% Receita", "Plan. 100% Margem", "Break-Even",
          "Plan. 80% Receita", "Plan. 80% Margem",
          "Real Receita", "Real Despesa", "Real Margem",
        ]],
        body: active.map((e) => [
          e.name,
          formatDate(e.date),
          formatCurrency(e.bpIncome100),
          formatCurrency(e.margin100),
          `${e.breakEvenPct.toFixed(1)}%`,
          formatCurrency(e.bpIncome80),
          formatCurrency(e.margin80),
          formatCurrency(e.realIncome),
          formatCurrency(e.realExpense),
          formatCurrency(e.realMargin),
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Análise de Resultados {currentYear}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Modo Real</span>
          <select
            value={resultModeOverride}
            onChange={(e) => setResultModeOverride(e.target.value as "auto" | ResultMode)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            title="Como calcular a coluna 'Real Atual': automático por data, projeção (com teto BP) ou só realizado"
          >
            <option value="auto">Auto (por data)</option>
            <option value="projection">Projeção (BP+Real)</option>
            <option value="realized">Realizado (só TX)</option>
          </select>
          <span className="text-xs text-muted-foreground ml-2">Overhead</span>
          <select
            value={includeOverhead ? "with" : "without"}
            onChange={(e) => setIncludeOverhead(e.target.value === "with")}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            title="Incluir/excluir rateios de overhead nos resultados"
          >
            <option value="without">Sem overhead (Vista Empresa)</option>
            <option value="with">Com overhead (Vista Sócio)</option>
          </select>
          <Button variant="outline" size="sm" onClick={generatePdf}>
            <Download className="h-4 w-4 mr-1" />
            PDF
          </Button>
        </div>
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
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 ml-auto cursor-help">
                            <Users className="h-3 w-3" /> Empresa
                          </span>
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
            <strong>Planeado 100%</strong>: receita e despesas BP completas · <strong>Planeado 80%</strong>: receita BP × 0,80 com despesas BP completas (cenário pessimista) · <strong>Real Atual</strong>: bilheteira vendida + receitas reais (transações paid/approved). Despesas seguem o <em>Modo Real</em>: 🔮 <strong>Projeção</strong> usa BP como teto onde ainda não há real validado (eventos por vir) · 📊 <strong>Realizado</strong> só conta transações validadas, alinhado com os Cards do BP (eventos passados). <em>Apenas transações <strong>paid + approved</strong> entram no Real (pending excluído). Todos os valores SEM IVA.</em>
          </p>
          <div className="overflow-x-auto glass rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium" rowSpan={2}>Evento</th>
                  <th className="p-3 text-center font-medium border-b border-border/30" colSpan={3}>Planeado 100%</th>
                  <th className="p-3 text-center font-medium border-b border-border/30 border-l-2 border-l-border" colSpan={2}>Planeado 80%</th>
                  <th className="p-3 text-center font-medium border-b border-border/30 border-l-2 border-l-border" colSpan={4}>Real Atual</th>
                </tr>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-right font-medium">Receita</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                  <th className="p-2 text-right font-medium">Break-Even</th>

                  <th className="p-2 text-right font-medium border-l-2 border-l-border">Receita</th>
                  <th className="p-2 text-right font-medium">Margem</th>

                  <th className="p-2 text-right font-medium border-l-2 border-l-border">Receita</th>
                  <th className="p-2 text-right font-medium">Despesa</th>
                  <th className="p-2 text-right font-medium">Margem</th>
                  <th className="p-2 text-right font-medium">%</th>
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
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{formatDate(e.date)}</span>
                          <SourceBadge source={e.incomeSource} />
                          <SourceBadge source={e.expenseSource} />
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 gap-0.5 font-normal"
                            title={
                              e.resultMode === "realized"
                                ? "Modo Realizado: despesas usam apenas transações validadas (paid + approved), alinhado com os Cards do BP. Aplicado automaticamente quando a data do evento já passou."
                                : "Modo Projeção: despesas usam BP como teto onde ainda não há real validado (paid + approved). Pending é ignorado. Aplicado automaticamente quando o evento ainda está por vir."
                            }
                          >
                            {e.resultMode === "realized" ? "📊 Realizado" : "🔮 Projeção"}
                          </Badge>
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

                      {/* Planeado 80% */}
                      <td className="p-3 text-right font-mono text-muted-foreground border-l-2 border-l-border">{formatCurrency(e.bpIncome80)}</td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono ${e.margin80 >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(e.margin80)}
                          </span>
                          {e.totalPartnerPct > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                Empresa {companyPct.toFixed(0)}%
                              </Badge>
                              <span className={`font-mono text-xs ${e.companyMargin80 >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(e.companyMargin80)}
                              </span>
                            </div>
                          )}
                        </div>
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
