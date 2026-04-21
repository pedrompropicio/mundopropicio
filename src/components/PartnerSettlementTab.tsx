import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, UserCheck, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { calcTotalWithIva } from "@/lib/iva";
import {
  getPartnerCalcBasisLabel,
  getPartnerExpenseBase,
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  usesGrossExpenseAmounts,
} from "@/lib/partner-calc-basis";
import {
  HOUSE_PARTNER_ID,
  HOUSE_PARTNER_NAME,
  computeHousePercentage,
} from "@/lib/house-partner";

interface Props {
  eventId: string;
  eventName: string;
  /** IDs dos sub-eventos quando este é um Master de turnê (vazio em evento simples). */
  childEventIds?: string[];
}

interface PartnerSettlement {
  partnerId: string;
  partnerName: string;
  isHouse: boolean;
  percentage: number;
  lossPercentage: number | null;
  effectivePercentage: number;
  expenseIncludesIva: boolean;
  calcBasis: string;
  revenue: number;
  expenses: number;
  result: number;
  partnerShare: number;
  paidExpenses: { description: string; amount: number; date: string; category: string }[];
  totalPaidByPartner: number;
  partnerExtras: { description: string; amount: number; date: string; category: string }[];
  totalPartnerExtras: number;
  settlement: number; // positive = company pays partner, negative = partner pays company
}

interface CityBreakdown {
  eventId: string;
  cityName: string;
  revenueNet: number;
  revenueGross: number;
  expensesNet: number;
  expensesGross: number;
  resultNet: number;
}

interface CategoryExpenseRow {
  category: string;
  amountNet: number;
  amountGross: number;
  count: number;
}

interface BpDeviationRow {
  category: string;
  planned: number;
  real: number;
  deviation: number;
  deviationPct: number;
}

interface TicketBreakdownRow {
  zoneName: string;
  lotName: string;
  sessionLabel: string; // "DD/MM" ou "DD/MM HH:MM" ou "—"
  dayLabel: string;     // "DD/MM/YYYY"
  quantity: number;
  unitPrice: number;
  totalGross: number;
  totalNet: number;
}

interface BoxOfficeSettlementRow {
  accountName: string;
  grossSales: number;
  deductions: number;
  netReceived: number;
  status: string;
}

export function PartnerSettlementTab({ eventId, eventName, childEventIds }: Props) {
  // Quando estamos no Master de uma turnê, o encontro de contas tem de
  // consolidar receitas/despesas/bilheteira de TODOS os eventos (Master +
  // sub-eventos). Em evento simples este array fica só com o próprio id.
  const allEventIds = [eventId, ...(childEventIds || [])];
  const allEventIdsKey = allEventIds.join(",");
  const isTour = (childEventIds?.length ?? 0) > 0;

  // Event info (master + cities)
  const { data: event } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("partner_calc_basis, cities(name)")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Sub-events with city info (for breakdown)
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub-events-cities", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, cities(name)")
        .in("id", allEventIds)
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  // Partners (external — Mundo Propício é injetada depois)
  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Event transactions (with category)
  const { data: transactions = [] } = useQuery({
    queryKey: ["event-transactions-settlement", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, type, date, status, event_id, is_transitory, exclude_from_result, account_categories(name, code)")
        .in("event_id", allEventIds);
      if (error) throw error;
      return data;
    },
  });

  // Partner paid expenses
  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, account_categories(name))")
        .in("event_id", allEventIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Partner advance expenses (Extras do Sócio — pagas pela empresa, abatidas no fecho)
  const { data: partnerAdvances = [] } = useQuery({
    queryKey: ["partner-advance-expenses", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_advance_expenses")
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, account_categories(name))")
        .in("event_id", allEventIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // BP (forecast) for BP × Real reconciliation
  const { data: forecasts = [] } = useQuery({
    queryKey: ["event-forecasts-settlement", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, type, amount, iva_rate, status, account_categories(name, code)")
        .in("event_id", allEventIds)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  // Box-office settlements (fecho de bilheteira)
  const { data: boxOfficeSettlements = [] } = useQuery({
    queryKey: ["box-office-settlements", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_office_settlements" as any)
        .select("*, financial_accounts(name)")
        .in("event_id", allEventIds);
      if (error) {
        // Tabela pode não existir em todos os projetos — tolera ausência.
        return [];
      }
      return data || [];
    },
  });

  // Ticket sales detalhadas (zone+lot) com sessão e dia
  const { data: ticketBreakdown = [] } = useQuery({
    queryKey: ["event-ticket-breakdown-settlement", allEventIdsKey],
    queryFn: async () => {
      const [zonesRes, sessionsRes] = await Promise.all([
        supabase
          .from("event_ticket_zones")
          .select("id, name, event_id, session_id")
          .in("event_id", allEventIds),
        supabase
          .from("event_sessions")
          .select("id, label, date, start_time, event_id")
          .in("event_id", allEventIds),
      ]);
      const zones = zonesRes.data || [];
      const sessions = sessionsRes.data || [];
      if (zones.length === 0) return [];
      const zoneIds = zones.map((z: any) => z.id);
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, name, price, iva_rate, zone_id")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];
      const lotIds = lots.map((l: any) => l.id);
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lotIds);
      const byLot: Record<string, { quantity: number; gross: number }> = {};
      (sales || []).forEach((s: any) => {
        const key = s.lot_id;
        if (!byLot[key]) byLot[key] = { quantity: 0, gross: 0 };
        byLot[key].quantity += Number(s.quantity || 0);
        const g = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
        byLot[key].gross += g;
      });
      return lots.map((l: any) => {
        const z = zones.find((zz: any) => zz.id === l.zone_id);
        const sess = sessions.find((ss: any) => ss.id === z?.session_id);
        const agg = byLot[l.id] || { quantity: 0, gross: 0 };
        const ivaRate = Number(l.iva_rate || 0);
        const totalNet = agg.gross / (1 + ivaRate / 100);
        const dayLabel = sess?.date ? format(new Date(sess.date), "dd/MM/yyyy") : "—";
        let sessionLabel = "—";
        if (sess) {
          const d = sess.date ? format(new Date(sess.date), "dd/MM") : "";
          const t = sess.start_time ? String(sess.start_time).slice(0, 5) : "";
          const lbl = sess.label && sess.label !== "default" ? sess.label : "";
          sessionLabel = [d, t, lbl].filter(Boolean).join(" ") || "—";
        }
        return {
          zoneName: z?.name || "—",
          lotName: l.name || "—",
          sessionLabel,
          dayLabel,
          quantity: agg.quantity,
          unitPrice: Number(l.price || 0),
          totalGross: agg.gross,
          totalNet,
        } as TicketBreakdownRow;
      }).filter((r) => r.quantity > 0);
    },
  });

  // Ticket sales (consolidado para receita global — mantém lógica existente)
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["event-ticket-sales-settlement", allEventIdsKey],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (!zones || zones.length === 0) return [];
      const zoneIds = zones.map(z => z.id);
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, price, iva_rate, zone_id")
        .in("zone_id", zoneIds);
      if (!lots || lots.length === 0) return [];
      const lotIds = lots.map(l => l.id);
      const { data: sales } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lotIds);
      return (sales || []).map((s: any) => {
        const lot = lots.find((l: any) => l.id === s.lot_id);
        const ivaRate = lot?.iva_rate || 0;
        const gross = s.total_value != null ? Number(s.total_value) : s.quantity * s.unit_price;
        const net = gross / (1 + ivaRate / 100);
        return { gross, net, iva: gross - net };
      });
    },
  });

  // Calculate financials
  const hasTicketSales = ticketSales.length > 0;
  const ticketRevenueGross = ticketSales.reduce((s: number, t: any) => s + t.gross, 0);
  const ticketRevenueNet = ticketSales.reduce((s: number, t: any) => s + t.net, 0);

  const validTx = transactions.filter((t: any) => !t.is_transitory && !t.exclude_from_result && (t.status === "approved" || t.status === "paid"));
  const incomeTransactions = validTx.filter((t: any) => t.type === "income");
  const expenseTransactions = validTx.filter((t: any) => t.type === "expense");

  const totalRevenueNet = hasTicketSales
    ? ticketRevenueNet
    : incomeTransactions.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalRevenueGross = hasTicketSales
    ? ticketRevenueGross
    : incomeTransactions.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);

  const totalExpensesNet = expenseTransactions.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpensesGross = expenseTransactions.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);

  const calcBasis = normalizePartnerCalcBasis(event?.partner_calc_basis);
  const revenueBase = getPartnerRevenueBase(totalRevenueNet);
  const expenseBase = getPartnerExpenseBase(calcBasis, totalExpensesNet, totalExpensesGross);
  const resultBase = revenueBase - expenseBase;

  // ---- City breakdown (para turnês) ----
  const cityBreakdown: CityBreakdown[] = isTour
    ? subEvents
        .filter((se: any) => se.id !== eventId)
        .map((se: any) => {
          const evtTx = validTx.filter((t: any) => t.event_id === se.id);
          const inc = evtTx.filter((t: any) => t.type === "income");
          const exp = evtTx.filter((t: any) => t.type === "expense");
          const revenueNet = inc.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const revenueGross = inc.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);
          const expensesNet = exp.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const expensesGross = exp.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);
          return {
            eventId: se.id,
            cityName: (se.cities as any)?.name || se.name,
            revenueNet,
            revenueGross,
            expensesNet,
            expensesGross,
            resultNet: revenueNet - expensesNet,
          };
        })
    : [];

  // ---- Top despesas por categoria ----
  const expenseByCategory: CategoryExpenseRow[] = (() => {
    const map: Record<string, CategoryExpenseRow> = {};
    expenseTransactions.forEach((t: any) => {
      const cat = t.account_categories?.name || "Sem categoria";
      if (!map[cat]) map[cat] = { category: cat, amountNet: 0, amountGross: 0, count: 0 };
      map[cat].amountNet += Number(t.amount);
      map[cat].amountGross += calcTotalWithIva(Number(t.amount), Number(t.iva_rate));
      map[cat].count += 1;
    });
    return Object.values(map).sort((a, b) => b.amountNet - a.amountNet);
  })();

  // ---- BP × Real ----
  const bpDeviation: BpDeviationRow[] = (() => {
    const map: Record<string, { planned: number; real: number }> = {};
    forecasts.forEach((f: any) => {
      if (f.type !== "expense") return;
      const cat = f.account_categories?.name || "Sem categoria";
      if (!map[cat]) map[cat] = { planned: 0, real: 0 };
      map[cat].planned += Number(f.amount);
    });
    expenseTransactions.forEach((t: any) => {
      const cat = t.account_categories?.name || "Sem categoria";
      if (!map[cat]) map[cat] = { planned: 0, real: 0 };
      map[cat].real += Number(t.amount);
    });
    return Object.entries(map)
      .map(([category, v]) => {
        const deviation = v.real - v.planned;
        const deviationPct = v.planned > 0 ? (deviation / v.planned) * 100 : (v.real > 0 ? 100 : 0);
        return { category, planned: v.planned, real: v.real, deviation, deviationPct };
      })
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  })();

  const totalPlanned = bpDeviation.reduce((s, r) => s + r.planned, 0);
  const totalReal = bpDeviation.reduce((s, r) => s + r.real, 0);

  // ---- Box-office settlements rows ----
  const boxOfficeRows: BoxOfficeSettlementRow[] = (boxOfficeSettlements as any[]).map((s) => ({
    accountName: s.financial_accounts?.name || "—",
    grossSales: Number(s.gross_sales || 0),
    deductions: Number(s.total_deductions || 0),
    netReceived: Number(s.net_amount || 0),
    status: s.status || "—",
  }));

  // ---- Build partners list with HOUSE injection ----
  const housePct = computeHousePercentage(partners.map((p: any) => ({ percentage: p.percentage })));
  const allPartners = [
    ...partners,
    ...(housePct != null
      ? [{
          id: HOUSE_PARTNER_ID,
          isHouse: true,
          suppliers: { name: HOUSE_PARTNER_NAME },
          percentage: housePct,
          loss_percentage: null,
          expense_includes_iva: false,
        } as any]
      : []),
  ];

  if (allPartners.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento.
      </div>
    );
  }

  // Build settlements
  const settlements: PartnerSettlement[] = allPartners.map((p: any) => {
    const isHouse = !!p.isHouse;
    const revenue = revenueBase;
    const expenses = ignoresOperationalExpenses(calcBasis)
      ? 0
      : (p.expense_includes_iva || usesGrossExpenseAmounts(calcBasis) ? totalExpensesGross : totalExpensesNet);
    const result = ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBase;
    const effectivePercentage = result < 0 && p.loss_percentage != null ? Number(p.loss_percentage) : Number(p.percentage);
    const partnerShare = result * (effectivePercentage / 100);

    // Mundo Propício (empresa gestora) não tem "pagas pelo sócio" nem "extras" — é a empresa que paga tudo.
    const partnerExpenses = isHouse
      ? []
      : paidExpenses
          .filter((pe: any) => pe.partner_id === p.id)
          .map((pe: any) => ({
            description: pe.transactions?.description || "—",
            amount: usesGrossExpenseAmounts(calcBasis)
              ? calcTotalWithIva(Number(pe.transactions?.amount || 0), Number(pe.transactions?.iva_rate || 0))
              : Number(pe.transactions?.amount || 0),
            date: pe.transactions?.date || "",
            category: pe.transactions?.account_categories?.name || "—",
          }));
    const totalPaidByPartner = partnerExpenses.reduce((s, e) => s + e.amount, 0);

    const extrasForPartner = isHouse
      ? []
      : partnerAdvances
          .filter((pe: any) => pe.partner_id === p.id)
          .map((pe: any) => ({
            description: pe.transactions?.description || "—",
            amount: usesGrossExpenseAmounts(calcBasis)
              ? calcTotalWithIva(Number(pe.transactions?.amount || 0), Number(pe.transactions?.iva_rate || 0))
              : Number(pe.transactions?.amount || 0),
            date: pe.transactions?.date || "",
            category: pe.transactions?.account_categories?.name || "—",
          }));
    const totalPartnerExtras = extrasForPartner.reduce((s, e) => s + e.amount, 0);

    const settlement = partnerShare + totalPaidByPartner - totalPartnerExtras;

    return {
      partnerId: p.id,
      partnerName: p.suppliers?.name || "—",
      isHouse,
      percentage: Number(p.percentage),
      lossPercentage: p.loss_percentage != null ? Number(p.loss_percentage) : null,
      effectivePercentage,
      expenseIncludesIva: !!p.expense_includes_iva,
      calcBasis,
      revenue,
      expenses,
      result,
      partnerShare,
      paidExpenses: partnerExpenses,
      totalPaidByPartner,
      partnerExtras: extrasForPartner,
      totalPartnerExtras,
      settlement,
    };
  });

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 16;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 12) { doc.addPage(); y = 16; }
    };

    // ===== HEADER =====
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Relatório de Fecho — ${eventName}`, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, y);
    y += 4;
    doc.text(`Base de cálculo: ${getPartnerCalcBasisLabel(calcBasis)}`, margin, y);
    doc.setTextColor(0);
    y += 8;

    // ===== 1. RESUMO FINANCEIRO =====
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("1. Resumo Financeiro", margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["", "Sem IVA", "Com IVA"]],
      body: [
        ["Receita", formatCurrency(totalRevenueNet), formatCurrency(totalRevenueGross)],
        ["Despesas", formatCurrency(totalExpensesNet), formatCurrency(totalExpensesGross)],
        ["Resultado (base de cálculo)", formatCurrency(resultBase), ""],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 41, 41] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ===== 2. QUEBRA POR CIDADE (turnê) =====
    if (cityBreakdown.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("2. Quebra por Cidade", margin, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Cidade", "Receita s/IVA", "Despesa s/IVA", "Resultado"]],
        body: cityBreakdown.map((c) => [
          c.cityName,
          formatCurrency(c.revenueNet),
          formatCurrency(c.expensesNet),
          formatCurrency(c.resultNet),
        ]),
        foot: [["TOTAL",
          formatCurrency(cityBreakdown.reduce((s, c) => s + c.revenueNet, 0)),
          formatCurrency(cityBreakdown.reduce((s, c) => s + c.expensesNet, 0)),
          formatCurrency(cityBreakdown.reduce((s, c) => s + c.resultNet, 0)),
        ]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 41, 41] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 3. BILHETEIRA — RESUMOS =====
    if (ticketBreakdown.length > 0) {
      ensureSpace(30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("3. Bilheteira — Totais Vendidos", margin, y);
      y += 6;

      // Helper para agregar e renderizar mini-tabela
      const renderSummary = (
        title: string,
        groups: { key: string; quantity: number; totalGross: number; totalNet: number }[]
      ) => {
        if (groups.length === 0) return;
        ensureSpace(20 + groups.length * 5);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60);
        doc.text(title, margin, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          head: [[title.replace("Por ", ""), "Qtd.", "Total c/IVA", "Total s/IVA"]],
          body: groups.map((g) => [
            g.key,
            g.quantity.toString(),
            formatCurrency(g.totalGross),
            formatCurrency(g.totalNet),
          ]),
          foot: [[
            "TOTAL",
            groups.reduce((s, g) => s + g.quantity, 0).toString(),
            formatCurrency(groups.reduce((s, g) => s + g.totalGross, 0)),
            formatCurrency(groups.reduce((s, g) => s + g.totalNet, 0)),
          ]],
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [41, 41, 41] },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      };

      const groupBy = (keyFn: (r: TicketBreakdownRow) => string) => {
        const map: Record<string, { key: string; quantity: number; totalGross: number; totalNet: number }> = {};
        ticketBreakdown.forEach((r) => {
          const k = keyFn(r);
          if (!map[k]) map[k] = { key: k, quantity: 0, totalGross: 0, totalNet: 0 };
          map[k].quantity += r.quantity;
          map[k].totalGross += r.totalGross;
          map[k].totalNet += r.totalNet;
        });
        return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
      };

      const byDay = groupBy((r) => r.dayLabel);
      const bySession = groupBy((r) => r.sessionLabel);
      const byZone = groupBy((r) => r.zoneName);
      const byLot = groupBy((r) => r.lotName);

      // Só mostra "Por Dia" se houver mais de um dia
      if (byDay.length > 1) renderSummary("Por Dia", byDay);
      // Só mostra "Por Sessão" se houver sessões úteis (mais de 1 ou diferente do dia)
      if (bySession.length > 1 || (bySession.length === 1 && bySession[0].key !== "—")) {
        renderSummary("Por Sessão", bySession);
      }
      renderSummary("Por Zona", byZone);
      renderSummary("Por Lote", byLot);
    }

    // ===== 4. FECHO DE BILHETEIRA =====
    if (boxOfficeRows.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("4. Fecho de Bilheteiras / Recintos", margin, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Bilheteira", "Vendas Brutas", "Deduções", "Líquido Recebido", "Estado"]],
        body: boxOfficeRows.map((r) => [
          r.accountName,
          formatCurrency(r.grossSales),
          formatCurrency(r.deductions),
          formatCurrency(r.netReceived),
          r.status,
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 41, 41] },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 5. DESPESAS POR CATEGORIA =====
    if (expenseByCategory.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("5. Despesas por Categoria", margin, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Lançamentos", "s/IVA", "c/IVA"]],
        body: expenseByCategory.slice(0, 20).map((r) => [
          r.category,
          r.count.toString(),
          formatCurrency(r.amountNet),
          formatCurrency(r.amountGross),
        ]),
        foot: [["TOTAL",
          expenseByCategory.reduce((s, r) => s + r.count, 0).toString(),
          formatCurrency(expenseByCategory.reduce((s, r) => s + r.amountNet, 0)),
          formatCurrency(expenseByCategory.reduce((s, r) => s + r.amountGross, 0)),
        ]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 41, 41] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 6. CONCILIAÇÃO BP × REAL =====
    if (bpDeviation.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("6. Conciliação BP × Real (Despesas)", margin, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Planeado (BP)", "Real", "Desvio", "Desvio %"]],
        body: bpDeviation.slice(0, 25).map((r) => [
          r.category,
          formatCurrency(r.planned),
          formatCurrency(r.real),
          (r.deviation >= 0 ? "+" : "") + formatCurrency(r.deviation),
          (r.deviationPct >= 0 ? "+" : "") + r.deviationPct.toFixed(1) + "%",
        ]),
        foot: [["TOTAL",
          formatCurrency(totalPlanned),
          formatCurrency(totalReal),
          (totalReal - totalPlanned >= 0 ? "+" : "") + formatCurrency(totalReal - totalPlanned),
          totalPlanned > 0 ? ((totalReal - totalPlanned) / totalPlanned * 100).toFixed(1) + "%" : "—",
        ]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 41, 41] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 7. DISTRIBUIÇÃO AOS SÓCIOS =====
    ensureSpace(50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("7. Distribuição aos Sócios", margin, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Sócio", "%", "Quota Bruta", "Pagas (+)", "Extras (−)", "Saldo Final"]],
      body: settlements.map((s) => [
        s.partnerName,
        `${s.effectivePercentage}%`,
        formatCurrency(s.partnerShare),
        formatCurrency(s.totalPaidByPartner),
        `−${formatCurrency(s.totalPartnerExtras)}`,
        formatCurrency(s.settlement),
      ]),
      foot: [["TOTAL", "100%",
        formatCurrency(settlements.reduce((s, x) => s + x.partnerShare, 0)),
        formatCurrency(settlements.reduce((s, x) => s + x.totalPaidByPartner, 0)),
        `−${formatCurrency(settlements.reduce((s, x) => s + x.totalPartnerExtras, 0))}`,
        formatCurrency(settlements.reduce((s, x) => s + x.settlement, 0)),
      ]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 41, 41] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ===== 8. DETALHES POR SÓCIO =====
    for (const s of settlements) {
      ensureSpace(30);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const pctLabel = s.lossPercentage != null ? `${s.percentage}% lucro / ${s.lossPercentage}% prejuízo` : `${s.percentage}%`;
      doc.text(`${s.partnerName} (${pctLabel})`, margin, y);
      y += 5;

      const summaryRows = [
        ["Participação no resultado", formatCurrency(s.partnerShare)],
        ["Despesas pagas pelo sócio (+)", formatCurrency(s.totalPaidByPartner)],
        ["Extras do sócio (−)", `−${formatCurrency(s.totalPartnerExtras)}`],
        ["Saldo do encontro de contas", formatCurrency(s.settlement)],
      ];
      autoTable(doc, {
        startY: y,
        body: summaryRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
        theme: "plain",
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      if (s.paidExpenses.length > 0) {
        ensureSpace(20);
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text("Despesas pagas pelo sócio:", margin, y);
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [["Descrição", "Categoria", "Data", "Valor"]],
          body: s.paidExpenses.map(e => [
            e.description, e.category,
            e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
            formatCurrency(e.amount),
          ]),
          foot: [["Total", "", "", formatCurrency(s.totalPaidByPartner)]],
          margin: { left: margin + 4, right: margin },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [80, 80, 80] },
          footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
          columnStyles: { 3: { halign: "right" } },
        });
        y = (doc as any).lastAutoTable.finalY + 4;
      }

      if (s.partnerExtras.length > 0) {
        ensureSpace(20);
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text("Extras do sócio (pagas pela empresa, abatidas):", margin, y);
        y += 3;
        autoTable(doc, {
          startY: y,
          head: [["Descrição", "Categoria", "Data", "Valor"]],
          body: s.partnerExtras.map(e => [
            e.description, e.category,
            e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
            `−${formatCurrency(e.amount)}`,
          ]),
          foot: [["Total a abater", "", "", `−${formatCurrency(s.totalPartnerExtras)}`]],
          margin: { left: margin + 4, right: margin },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [120, 60, 60] },
          footStyles: { fillColor: [250, 230, 230], textColor: [120, 0, 0], fontStyle: "bold" },
          columnStyles: { 3: { halign: "right" } },
        });
        y = (doc as any).lastAutoTable.finalY + 4;
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const direction = s.settlement > 0
        ? `→ Empresa deve pagar ${formatCurrency(s.settlement)} ao sócio`
        : s.settlement < 0
          ? `→ Sócio deve pagar ${formatCurrency(Math.abs(s.settlement))} à empresa`
          : "→ Sem saldo pendente";
      doc.text(direction, margin, y);
      y += 8;
    }

    // Footer institucional
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text("MP Gestão Eventos · Relatório de Fecho", margin, pageH - 6);
      doc.text(`Página ${p}/${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
    }

    doc.save(`Fecho_${eventName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold flex items-center gap-2">Encontro de Contas <HelpTooltip text={helpTexts.partnerSettlement} size={14} /></h3>
        </div>
        <Button size="sm" variant="outline" onClick={exportPdf}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

      {/* Global summary */}
      <div className="glass rounded-xl p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Receita (s/IVA)</p>
            <p className="text-xl font-bold font-mono text-success">{formatCurrency(revenueBase)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Despesas</p>
            <p className="text-xl font-bold font-mono text-destructive">{formatCurrency(expenseBase)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Resultado</p>
            <p className={`text-xl font-bold font-mono ${resultBase >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(resultBase)}
            </p>
          </div>
        </div>
      </div>

      {/* City breakdown for tours */}
      {cityBreakdown.length > 0 && (
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Quebra por Cidade</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Receita s/IVA</TableHead>
                <TableHead className="text-right">Despesa s/IVA</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cityBreakdown.map((c) => (
                <TableRow key={c.eventId}>
                  <TableCell>{c.cityName}</TableCell>
                  <TableCell className="text-right font-mono text-success">{formatCurrency(c.revenueNet)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{formatCurrency(c.expensesNet)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${c.resultNet >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(c.resultNet)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Per-partner cards */}
      {settlements.map((s) => (
        <div key={s.partnerId} className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold">{s.partnerName}</span>
              <Badge variant="outline" className="text-xs">
                {s.lossPercentage != null
                  ? `${s.percentage}% lucro / ${s.lossPercentage}% prejuízo`
                  : `${s.percentage}%`}
              </Badge>
              {s.lossPercentage != null && s.effectivePercentage !== s.percentage && (
                <Badge variant="secondary" className="text-xs">Aplicado: {s.effectivePercentage}%</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {s.settlement > 0 ? (
                <Badge className="bg-success/15 text-success text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" /> {s.isHouse ? "Resultado" : "Empresa paga"} {formatCurrency(s.settlement)}
                </Badge>
              ) : s.settlement < 0 ? (
                <Badge className="bg-destructive/15 text-destructive text-xs">
                  <TrendingDown className="h-3 w-3 mr-1" /> {s.isHouse ? "Prejuízo" : "Sócio paga"} {formatCurrency(Math.abs(s.settlement))}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">Sem saldo</Badge>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Participação no resultado</span>
                <p className={`font-mono font-bold ${s.partnerShare >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.partnerShare)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Pagas pelo sócio (+)</span>
                <p className="font-mono font-bold text-success">{formatCurrency(s.totalPaidByPartner)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Extras do sócio (−)</span>
                <p className="font-mono font-bold text-destructive">{formatCurrency(s.totalPartnerExtras)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Saldo final</span>
                <p className={`font-mono font-bold text-lg ${s.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.settlement)}</p>
              </div>
            </div>

            {s.paidExpenses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Despesas pagas pelo sócio:</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.paidExpenses.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={3} className="font-bold text-xs">Total</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatCurrency(s.totalPaidByPartner)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {s.partnerExtras.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">🧳 Extras do sócio (pagas pela empresa, abatidas no fecho):</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.partnerExtras.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">−{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={3} className="font-bold text-xs">Total a abater</TableCell>
                      <TableCell className="text-right font-mono font-bold text-destructive">−{formatCurrency(s.totalPartnerExtras)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {s.isHouse && (
              <p className="text-xs text-muted-foreground italic">
                Não acumula extras nem despesas pagas por sócio.
              </p>
            )}
            {!s.isHouse && s.paidExpenses.length === 0 && s.partnerExtras.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sem despesas pagas por este sócio nem extras registados.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
