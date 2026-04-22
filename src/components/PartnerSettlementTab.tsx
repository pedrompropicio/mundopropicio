import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, UserCheck, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { calcTotalWithIva } from "@/lib/iva";
import {
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
  /** Cauções/transitórias pagas pelo sócio ainda não devolvidas. Cap em 0 (não vai negativo). */
  transitoryCredit: number;
  transitoryItems: { description: string; amount: number; date: string; category: string; sign: 1 | -1 }[];
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
  l1Code: string;
  l1Name: string;
  l2Code: string;
  l2Name: string;
  amountNet: number;
  amountGross: number;
  count: number;
}

interface TicketBreakdownRow {
  zoneName: string;
  lotName: string;
  sessionLabel: string; // "DD/MM" ou "DD/MM HH:MM" ou "—"
  dayLabel: string;     // "DD/MM/YYYY"
  subEventName: string; // Nome do sub-evento
  cityName: string;     // Nome da cidade (ou nome do evento se não tiver cidade)
  eventId: string;      // ID do sub-evento (para cruzar com cityBreakdown)
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

  // Modo de agrupamento da secção 3 (Bilheteira) — default: subevento + data + sessão
  type TicketGroupMode = "sub_date_session" | "session" | "day" | "zone" | "lot";
  const [ticketGroupMode, setTicketGroupMode] = useState<TicketGroupMode>("sub_date_session");

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
        .select("id, description, amount, iva_rate, type, date, status, event_id, is_transitory, exclude_from_result, category_id, account_categories(name, code, parent_id)")
        .in("event_id", allEventIds);
      if (error) throw error;
      return data;
    },
  });

  // Plano de contas completo (para resolver raiz da hierarquia)
  const { data: allCategories = [] } = useQuery({
    queryKey: ["all-account-categories-settlement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, name, code, parent_id");
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
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, type, is_transitory, status, account_categories(name))")
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

  // Ticket sales detalhadas (zone+lot) com sessão, dia, cidade e sub-evento
  const { data: ticketBreakdown = [] } = useQuery({
    queryKey: ["event-ticket-breakdown-settlement", allEventIdsKey],
    queryFn: async () => {
      const [zonesRes, sessionsRes, eventsRes] = await Promise.all([
        supabase
          .from("event_ticket_zones")
          .select("id, name, event_id, session_id")
          .in("event_id", allEventIds),
        supabase
          .from("event_sessions")
          .select("id, label, date, start_time, event_id")
          .in("event_id", allEventIds),
        supabase
          .from("events")
          .select("id, name, cities(name)")
          .in("id", allEventIds),
      ]);
      const zones = zonesRes.data || [];
      const sessions = sessionsRes.data || [];
      const eventsList = eventsRes.data || [];
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
        const ev = eventsList.find((e: any) => e.id === z?.event_id);
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
        const cityName = (ev?.cities as any)?.name || ev?.name || eventName;
        return {
          zoneName: z?.name || "—",
          lotName: l.name || "—",
          sessionLabel,
          dayLabel,
          subEventName: ev?.name || eventName,
          cityName,
          eventId: ev?.id || "",
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
  // Receita = ticket sales daquele sub-evento (se existirem) + receitas de transactions
  // Despesas = transactions de despesa do sub-evento (com e sem IVA)
  const cityBreakdown: CityBreakdown[] = isTour
    ? subEvents
        .filter((se: any) => se.id !== eventId)
        .map((se: any) => {
          const evtTx = validTx.filter((t: any) => t.event_id === se.id);
          const inc = evtTx.filter((t: any) => t.type === "income");
          const exp = evtTx.filter((t: any) => t.type === "expense");
          const txRevenueNet = inc.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const txRevenueGross = inc.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);
          // Receita de bilheteira do sub-evento (somar ticketBreakdown filtrado)
          const tbRows = (ticketBreakdown as TicketBreakdownRow[]).filter((tb) => tb.eventId === se.id);
          const tbNet = tbRows.reduce((s, r) => s + r.totalNet, 0);
          const tbGross = tbRows.reduce((s, r) => s + r.totalGross, 0);
          const revenueNet = tbNet + txRevenueNet;
          const revenueGross = tbGross + txRevenueGross;
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

  // ---- Despesas agrupadas pelos níveis 1 e 2 do Plano de Contas ----
  // Resolve cadeia de pais até obter L1 (raiz) e L2 (nível imediatamente abaixo da raiz).
  const expenseByCategory: CategoryExpenseRow[] = (() => {
    const catById: Record<string, { id: string; name: string; code: string; parent_id: string | null }> = {};
    (allCategories as any[]).forEach((c) => { catById[c.id] = c; });
    // Devolve [L1, L2] — onde L2 pode ser igual a L1 se a categoria estiver no nível raiz.
    const findL1L2 = (catId: string | null | undefined): { l1: any; l2: any } | null => {
      if (!catId) return null;
      const chain: any[] = [];
      let cur = catById[catId];
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        chain.push(cur);
        if (!cur.parent_id) break;
        const parent = catById[cur.parent_id];
        if (!parent) break;
        cur = parent;
      }
      // chain está ordenada do nível mais profundo até à raiz; inverter para ter raiz primeiro
      chain.reverse();
      const l1 = chain[0];
      const l2 = chain[1] || chain[0];
      return l1 ? { l1, l2 } : null;
    };
    const map: Record<string, CategoryExpenseRow> = {};
    expenseTransactions.forEach((t: any) => {
      const lv = findL1L2(t.category_id);
      const l1 = lv?.l1;
      const l2 = lv?.l2;
      const key = l1 && l2 ? `${l1.code}|${l2.code}` : "sem-categoria";
      if (!map[key]) {
        map[key] = {
          l1Code: l1?.code || "",
          l1Name: l1?.name || "Sem categoria",
          l2Code: l2?.code || "",
          l2Name: l2?.name || "Sem categoria",
          amountNet: 0,
          amountGross: 0,
          count: 0,
        };
      }
      map[key].amountNet += Number(t.amount);
      map[key].amountGross += calcTotalWithIva(Number(t.amount), Number(t.iva_rate));
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => {
      const c1 = a.l1Code.localeCompare(b.l1Code, undefined, { numeric: true });
      if (c1 !== 0) return c1;
      return a.l2Code.localeCompare(b.l2Code, undefined, { numeric: true });
    });
  })();

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

  // ---- Crédito transitório (cauções pagas e ainda não devolvidas) ----
  // Regras:
  //  • Sócio externo: recebe crédito apenas pelas transitórias DIRETAMENTE vinculadas a ele
  //    via partner_paid_expenses (despesas pagas − devoluções recebidas). Cap em 0.
  //  • Mundo Propício (casa): recebe crédito por TODAS as transitórias órfãs (sem vínculo a
  //    sócio) — ou seja, despesas transitórias pagas pela empresa menos as devoluções que
  //    voltaram para a empresa. Cap em 0.
  // Nota: independente do calcBasis — caução é sempre amount líquido (não tem IVA real).
  const transitoryTxsAll = transactions.filter((t: any) => t.is_transitory && (t.status === "approved" || t.status === "paid"));
  const partnerLinkedTxIds = new Set((paidExpenses as any[]).map((pe) => pe.transaction_id));
  const houseTransitoryExpenses = transitoryTxsAll
    .filter((t: any) => t.type === "expense" && !partnerLinkedTxIds.has(t.id))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const houseTransitoryIncomes = transitoryTxsAll
    .filter((t: any) => t.type === "income" && !partnerLinkedTxIds.has(t.id))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const houseTransitoryCredit = Math.max(0, houseTransitoryExpenses - houseTransitoryIncomes);
  const houseTransitoryItems = transitoryTxsAll
    .filter((t: any) => !partnerLinkedTxIds.has(t.id))
    .map((t: any) => ({
      description: t.description || "—",
      amount: Number(t.amount || 0),
      date: t.date || "",
      category: t.account_categories?.name || "—",
      sign: (t.type === "expense" ? 1 : -1) as 1 | -1,
    }));

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
    // Filtra fora as transitórias — essas vão para a secção de crédito transitório (abaixo).
    const partnerExpenses = isHouse
      ? []
      : paidExpenses
          .filter((pe: any) => pe.partner_id === p.id && !pe.transactions?.is_transitory)
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

    // Items transitórios:
    //  • Sócio externo → linhas vinculadas em partner_paid_expenses (despesas e devoluções diretas)
    //  • Mundo Propício → todas as transitórias órfãs do evento
    const transitoryItems = isHouse
      ? houseTransitoryItems
      : (paidExpenses as any[])
          .filter((pe) => pe.partner_id === p.id && pe.transactions?.is_transitory)
          .map((pe) => {
            const sign: 1 | -1 = pe.transactions?.type === "expense" ? 1 : -1;
            return {
              description: pe.transactions?.description || "—",
              amount: Number(pe.transactions?.amount || 0),
              date: pe.transactions?.date || "",
              category: pe.transactions?.account_categories?.name || "—",
              sign,
            };
          });

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
      transitoryCredit: 0, // calculado abaixo
      transitoryItems,
      settlement: 0,        // recalculado abaixo
    };
  });

  // Crédito transitório:
  //  • Mundo Propício: total das órfãs (já calculado, cap em 0)
  //  • Sócios externos: gross vinculado direto (despesas − devoluções), cap em 0
  settlements.forEach((s) => {
    if (s.isHouse) {
      s.transitoryCredit = houseTransitoryCredit;
    } else {
      const gross = s.transitoryItems.reduce((acc, it) => acc + it.sign * it.amount, 0);
      s.transitoryCredit = Math.max(0, gross);
    }
    s.settlement = s.partnerShare + s.totalPaidByPartner - s.totalPartnerExtras + s.transitoryCredit;
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
    doc.text(`Relatorio de Fecho - ${eventName}`, margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, y);
    doc.setTextColor(0);
    y += 8;
    doc.setTextColor(0);
    y += 8;

    // ===== 1. RESUMO FINANCEIRO =====
    // Larguras explícitas para garantir alinhamento dos totais com os cabeçalhos.
    const tableWidth = pageW - margin * 2;
    const labelColW = 90;
    const valueColW = (tableWidth - labelColW) / 2;

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
        ["Resultado", formatCurrency(totalRevenueNet - totalExpensesNet), formatCurrency(totalRevenueGross - totalExpensesGross)],
      ],
      margin: { left: margin, right: margin },
      tableWidth,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [41, 41, 41], halign: "right" },
      columnStyles: {
        0: { cellWidth: labelColW, halign: "left", fontStyle: "bold" },
        1: { cellWidth: valueColW, halign: "right" },
        2: { cellWidth: valueColW, halign: "right" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ===== 2. QUEBRA POR CIDADE (turnê) =====
    if (cityBreakdown.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("2. Quebra por Cidade", margin, y);
      y += 5;
      const cityCol1 = 60;
      const cityValW = (tableWidth - cityCol1) / 3;
      autoTable(doc, {
        startY: y,
        head: [["Cidade", "Receita s/IVA", "Despesa c/IVA", "Resultado"]],
        body: cityBreakdown.map((c) => [
          c.cityName,
          formatCurrency(c.revenueNet),
          formatCurrency(c.expensesGross),
          formatCurrency(c.revenueNet - c.expensesGross),
        ]),
        foot: [["TOTAL",
          formatCurrency(cityBreakdown.reduce((s, c) => s + c.revenueNet, 0)),
          formatCurrency(cityBreakdown.reduce((s, c) => s + c.expensesGross, 0)),
          formatCurrency(cityBreakdown.reduce((s, c) => s + (c.revenueNet - c.expensesGross), 0)),
        ]],
        margin: { left: margin, right: margin },
        tableWidth,
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [41, 41, 41], halign: "right" },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
        columnStyles: {
          0: { cellWidth: cityCol1, halign: "left", fontStyle: "bold" },
          1: { cellWidth: cityValW, halign: "right" },
          2: { cellWidth: cityValW, halign: "right" },
          3: { cellWidth: cityValW, halign: "right" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 3. BILHETEIRA - RESUMOS =====
    if (ticketBreakdown.length > 0) {
      ensureSpace(30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("3. Bilheteira - Totais Vendidos", margin, y);
      y += 6;

      // Larguras explícitas para a tabela de bilheteira
      const tbCol1 = 130; // descrição (cidade/dia/sessão)
      const tbColQ = 22;
      const tbColV = (tableWidth - tbCol1 - tbColQ) / 2;

      const fmtRow = (label: string, qty: number, gross: number, net: number) => [
        label, qty.toString(), formatCurrency(gross), formatCurrency(net),
      ];

      // Helper para agregar e renderizar mini-tabela genérica (modos session/day/zone/lot)
      const renderSimple = (
        title: string,
        firstColLabel: string,
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
          head: [[firstColLabel, "Qtd.", "Total c/IVA", "Total s/IVA"]],
          body: groups.map((g) => fmtRow(g.key, g.quantity, g.totalGross, g.totalNet)),
          foot: [fmtRow(
            "TOTAL",
            groups.reduce((s, g) => s + g.quantity, 0),
            groups.reduce((s, g) => s + g.totalGross, 0),
            groups.reduce((s, g) => s + g.totalNet, 0),
          )],
          margin: { left: margin, right: margin },
          tableWidth,
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [41, 41, 41], halign: "right" },
          footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
          columnStyles: {
            0: { cellWidth: tbCol1, halign: "left" },
            1: { cellWidth: tbColQ, halign: "right" },
            2: { cellWidth: tbColV, halign: "right" },
            3: { cellWidth: tbColV, halign: "right" },
          },
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

      // Renderiza apenas o agrupamento escolhido pelo utilizador
      switch (ticketGroupMode) {
        case "sub_date_session": {
          // Agrupar por Cidade > Dia > Sessão com subtotais
          // Estrutura: { cidade: { dia: { sessão: agg } } }
          const tree: Record<string, Record<string, Record<string, { quantity: number; totalGross: number; totalNet: number }>>> = {};
          ticketBreakdown.forEach((r) => {
            const city = r.cityName || "—";
            const day = r.dayLabel || "—";
            const sess = r.sessionLabel || "—";
            tree[city] = tree[city] || {};
            tree[city][day] = tree[city][day] || {};
            tree[city][day][sess] = tree[city][day][sess] || { quantity: 0, totalGross: 0, totalNet: 0 };
            const a = tree[city][day][sess];
            a.quantity += r.quantity;
            a.totalGross += r.totalGross;
            a.totalNet += r.totalNet;
          });

          const body: any[] = [];
          let grandQty = 0, grandGross = 0, grandNet = 0;

          const sortedCities = Object.keys(tree).sort();
          sortedCities.forEach((city) => {
            let cityQty = 0, cityGross = 0, cityNet = 0;
            const sortedDays = Object.keys(tree[city]).sort((a, b) => {
              // dd/MM/yyyy → ordenar cronologicamente
              const pa = a.split("/"); const pb = b.split("/");
              const da = pa.length === 3 ? `${pa[2]}-${pa[1]}-${pa[0]}` : a;
              const db = pb.length === 3 ? `${pb[2]}-${pb[1]}-${pb[0]}` : b;
              return da.localeCompare(db);
            });
            sortedDays.forEach((day) => {
              let dayQty = 0, dayGross = 0, dayNet = 0;
              const sortedSess = Object.keys(tree[city][day]).sort();
              sortedSess.forEach((sess) => {
                const a = tree[city][day][sess];
                body.push({
                  row: fmtRow(`    ${sess}`, a.quantity, a.totalGross, a.totalNet),
                  style: "detail",
                });
                dayQty += a.quantity; dayGross += a.totalGross; dayNet += a.totalNet;
              });
              body.push({
                row: fmtRow(`  Subtotal ${day}`, dayQty, dayGross, dayNet),
                style: "subday",
              });
              cityQty += dayQty; cityGross += dayGross; cityNet += dayNet;
            });
            body.push({
              row: fmtRow(`Subtotal ${city}`, cityQty, cityGross, cityNet),
              style: "subcity",
            });
            grandQty += cityQty; grandGross += cityGross; grandNet += cityNet;
          });

          ensureSpace(20 + body.length * 5);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60);
          doc.text("Por Cidade / Data / Sessao", margin, y);
          y += 3;

          autoTable(doc, {
            startY: y,
            head: [["Cidade / Data / Sessao", "Qtd.", "Total c/IVA", "Total s/IVA"]],
            body: body.map((b) => b.row),
            foot: [fmtRow("TOTAL GERAL", grandQty, grandGross, grandNet)],
            margin: { left: margin, right: margin },
            tableWidth,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [41, 41, 41], halign: "right" },
            footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
            columnStyles: {
              0: { cellWidth: tbCol1, halign: "left" },
              1: { cellWidth: tbColQ, halign: "right" },
              2: { cellWidth: tbColV, halign: "right" },
              3: { cellWidth: tbColV, halign: "right" },
            },
            didParseCell: (data) => {
              if (data.section !== "body") return;
              const meta = body[data.row.index];
              if (!meta) return;
              if (meta.style === "subcity") {
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.fillColor = [220, 220, 220];
              } else if (meta.style === "subday") {
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.fillColor = [240, 240, 240];
              }
            },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
          break;
        }
        case "session": {
          renderSimple("Por Sessao", "Sessao", groupBy((r) => r.sessionLabel));
          break;
        }
        case "day": {
          renderSimple("Por Dia", "Dia", groupBy((r) => r.dayLabel));
          break;
        }
        case "zone": {
          renderSimple("Por Zona", "Zona", groupBy((r) => r.zoneName));
          break;
        }
        case "lot": {
          renderSimple("Por Lote", "Lote", groupBy((r) => r.lotName));
          break;
        }
      }
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

    // ===== 5. DESPESAS POR CATEGORIA (L1 + L2 com subtotais por L1) =====
    if (expenseByCategory.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("5. Despesas por Categoria", margin, y);
      y += 5;

      // Larguras explícitas
      const expCol1 = 118; // L1/L2 descrição
      const expColC = 34;  // contagem (cabe "Lançamentos")
      const expColV = (tableWidth - expCol1 - expColC) / 2;

      // Agrupar L2 por L1
      const byL1: Record<string, { l1Code: string; l1Name: string; rows: CategoryExpenseRow[] }> = {};
      expenseByCategory.forEach((r) => {
        const k = r.l1Code || "_";
        if (!byL1[k]) byL1[k] = { l1Code: r.l1Code, l1Name: r.l1Name, rows: [] };
        byL1[k].rows.push(r);
      });

      const body: { row: any[]; style: "l1" | "l2" }[] = [];
      let grandCount = 0, grandNet = 0, grandGross = 0;

      Object.values(byL1)
        .sort((a, b) => a.l1Code.localeCompare(b.l1Code, undefined, { numeric: true }))
        .forEach((g) => {
          // Linha L1 (cabeçalho do grupo) com subtotais
          const l1Count = g.rows.reduce((s, r) => s + r.count, 0);
          const l1Net = g.rows.reduce((s, r) => s + r.amountNet, 0);
          const l1Gross = g.rows.reduce((s, r) => s + r.amountGross, 0);
          body.push({
            row: [
              `${g.l1Code} ${g.l1Name}`.trim(),
              l1Count.toString(),
              formatCurrency(l1Net),
              formatCurrency(l1Gross),
            ],
            style: "l1",
          });
          // Linhas L2 (filhas indentadas)
          g.rows.forEach((r) => {
            // Se L2 == L1 (categoria sem filho), não duplicar — já apresentada no L1
            if (r.l2Code === r.l1Code && r.l2Name === r.l1Name) return;
            body.push({
              row: [
                `    ${r.l2Code} ${r.l2Name}`.trim(),
                r.count.toString(),
                formatCurrency(r.amountNet),
                formatCurrency(r.amountGross),
              ],
              style: "l2",
            });
          });
          grandCount += l1Count;
          grandNet += l1Net;
          grandGross += l1Gross;
        });

      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Lançamentos", "s/IVA", "c/IVA"]],
        body: body.map((b) => b.row),
        foot: [["TOTAL",
          grandCount.toString(),
          formatCurrency(grandNet),
          formatCurrency(grandGross),
        ]],
        margin: { left: margin, right: margin },
        tableWidth,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [41, 41, 41], halign: "right" },
        footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
        columnStyles: {
          0: { cellWidth: expCol1, halign: "left" },
          1: { cellWidth: expColC, halign: "right" },
          2: { cellWidth: expColV, halign: "right" },
          3: { cellWidth: expColV, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const meta = body[data.row.index];
          if (!meta) return;
          if (meta.style === "l1") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [230, 230, 230];
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ===== 6. DISTRIBUIÇÃO AOS SÓCIOS =====
    ensureSpace(50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("6. Distribuição aos Sócios", margin, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Sócio", "%", "Quota Bruta", "Pagas (+)", "Extras (-)", "Saldo Final"]],
      body: settlements.map((s) => [
        s.partnerName,
        `${s.effectivePercentage}%`,
        formatCurrency(s.partnerShare),
        formatCurrency(s.totalPaidByPartner),
        `-${formatCurrency(s.totalPartnerExtras)}`,
        formatCurrency(s.settlement),
      ]),
      foot: [["TOTAL", "100%",
        formatCurrency(settlements.reduce((s, x) => s + x.partnerShare, 0)),
        formatCurrency(settlements.reduce((s, x) => s + x.totalPaidByPartner, 0)),
        `-${formatCurrency(settlements.reduce((s, x) => s + x.totalPartnerExtras, 0))}`,
        formatCurrency(settlements.reduce((s, x) => s + x.settlement, 0)),
      ]],
      margin: { left: margin, right: margin },
      tableWidth,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 41, 41] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: (() => {
        const colPct = 18;
        const colSocio = 40;
        const colVal = (tableWidth - colSocio - colPct) / 4;
        return {
          0: { cellWidth: colSocio, halign: "left" },
          1: { cellWidth: colPct, halign: "center" },
          2: { cellWidth: colVal, halign: "right" },
          3: { cellWidth: colVal, halign: "right" },
          4: { cellWidth: colVal, halign: "right" },
          5: { cellWidth: colVal, halign: "right" },
        };
      })(),
      didParseCell: (data) => {
        // Alinha o cabeçalho às mesmas posições das células do corpo
        if (data.section === "head" || data.section === "foot") {
          if (data.column.index === 0) data.cell.styles.halign = "left";
          else if (data.column.index === 1) data.cell.styles.halign = "center";
          else data.cell.styles.halign = "right";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ===== 7. DETALHES POR SÓCIO =====
    // A MUNDO PROPÍCIO não recebe repasse de si mesma — só sócios externos têm secção própria.
    for (const s of settlements.filter((x: any) => !x.isHouse)) {
      ensureSpace(30);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const pctLabel = s.lossPercentage != null ? `${s.percentage}% lucro / ${s.lossPercentage}% prejuízo` : `${s.percentage}%`;
      doc.text(`${s.partnerName} (${pctLabel})`, margin, y);
      y += 5;

      const summaryRows = [
        ["Participação no resultado", formatCurrency(s.partnerShare)],
        ["Despesas pagas pelo sócio (+)", formatCurrency(s.totalPaidByPartner)],
        ["Extras do sócio (-)", `-${formatCurrency(s.totalPartnerExtras)}`],
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
        y += 4;
        autoTable(doc, {
          startY: y,
          head: [["Descrição", "Categoria", "Data", "Valor"]],
          body: s.partnerExtras.map(e => [
            e.description, e.category,
            e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
            `-${formatCurrency(e.amount)}`,
          ]),
          foot: [["Total a abater", "", "", `-${formatCurrency(s.totalPartnerExtras)}`]],
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
        ? `-> MUNDO PROPÍCIO deve pagar ${formatCurrency(s.settlement)} ao sócio`
        : s.settlement < 0
          ? `-> Sócio deve pagar ${formatCurrency(Math.abs(s.settlement))} à MUNDO PROPÍCIO`
          : "-> Sem saldo pendente";
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
        <div className="flex items-center gap-2">
          <Select value={ticketGroupMode} onValueChange={(v) => setTicketGroupMode(v as TicketGroupMode)}>
            <SelectTrigger className="h-8 w-[260px] text-xs">
              <SelectValue placeholder="Agrupamento de bilheteira" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sub_date_session">Bilheteira: Subevento / Data / Sessão</SelectItem>
              <SelectItem value="session">Bilheteira: Por Sessão</SelectItem>
              <SelectItem value="day">Bilheteira: Por Dia</SelectItem>
              <SelectItem value="zone">Bilheteira: Por Zona</SelectItem>
              <SelectItem value="lot">Bilheteira: Por Lote</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
          </Button>
        </div>
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
                <TableHead className="text-right">Despesa c/IVA</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cityBreakdown.map((c) => {
                const result = c.revenueNet - c.expensesGross;
                return (
                  <TableRow key={c.eventId}>
                    <TableCell>{c.cityName}</TableCell>
                    <TableCell className="text-right font-mono text-success">{formatCurrency(c.revenueNet)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{formatCurrency(c.expensesGross)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${result >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(result)}</TableCell>
                  </TableRow>
                );
              })}
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
            <div className="grid gap-3 sm:grid-cols-5 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Participação no resultado</span>
                <p className={`font-mono font-bold ${s.partnerShare >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.partnerShare)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Pagas pelo sócio (+)</span>
                <p className="font-mono font-bold text-success">{formatCurrency(s.totalPaidByPartner)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground" title="Cauções e transitórias pagas pelo sócio ainda não devolvidas">Cauções pendentes (+)</span>
                <p className="font-mono font-bold text-success">{formatCurrency(s.transitoryCredit)}</p>
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

            {s.transitoryItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  🛡️ Cauções / transitórias pagas pelo sócio
                  <span className="text-muted-foreground/70"> — entram no acerto até serem devolvidas (não impactam resultado)</span>
                </p>
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
                    {s.transitoryItems.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className={`text-right font-mono ${e.sign > 0 ? "text-success" : "text-destructive"}`}>
                          {e.sign > 0 ? "+" : "−"}{formatCurrency(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={3} className="font-bold text-xs">Crédito líquido (após devoluções)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-success">{formatCurrency(s.transitoryCredit)}</TableCell>
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
