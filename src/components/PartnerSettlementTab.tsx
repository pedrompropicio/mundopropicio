import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, UserCheck, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { calcTotalWithIva } from "@/lib/iva";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { isValidFechoTransaction, isTicketingRevenueTx } from "@/lib/fecho-filters";
import {
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
} from "@/lib/partner-calc-basis";
import { computeOutsideBpExcess, sumLines } from "@/lib/event-cost-basis";
import { useFechoBasis, describeFechoBasis } from "@/hooks/useFechoBasis";
import { FechoBasisSelector } from "@/components/FechoBasisSelector";

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
  paidExpenses: { description: string; amount: number; date: string; category: string; cityLabel: string }[];
  totalPaidByPartner: number;
  partnerExtras: { description: string; amount: number; date: string; category: string; cityLabel: string }[];
  totalPartnerExtras: number;
  /** Cauções/transitórias pagas pelo sócio ainda não devolvidas. Cap em 0 (não vai negativo). */
  transitoryCredit: number;
  transitoryItems: { description: string; amount: number; date: string; category: string; sign: 1 | -1 }[];
  /** Parcela da quota do resultado que já tem liquidez imediata para repasse,
   *  depois de abater a fatia do caixa do evento actualmente retida em cauções
   *  pagas com a receita/caixa da Mundo Propício. */
  resultRepasseNow: number;
  /** Parcela da quota do resultado ainda sem liquidez imediata porque o caixa do
   *  evento foi desencaixado para cobrir cauções/transitórias pagas pela MP. */
  resultPendingByCash: number;
  /** Parcela do prejuízo absorvida por cauções/transitórias ainda retidas, rateada por equity. */
  transitoryOffset: number;
  /** Aporte efetivo necessário para fechar a conta após usar a liquidez/cauções disponíveis. */
  equityContribution: number;
  /** Acerto liquidável agora — quota com liquidez imediata + pagas pelo sócio − extras.
   *  Exclui cauções pendentes e exclui a parcela do resultado sem liquidez imediata. */
  operationalSettlement: number;
  /** Saldo total incluindo o resultado ainda sem liquidez imediata e as cauções pendentes.
   *  positive = empresa paga sócio, negative = sócio paga empresa */
  settlement: number;
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
  l3Code: string;
  l3Name: string;
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
  // Nível do plano de contas a apresentar nas despesas por categoria
  const [expenseCategoryLevel, setExpenseCategoryLevel] = useState<"l2" | "l3">("l2");
  const [includeLiquidityAppendix, setIncludeLiquidityAppendix] = useState(false);

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

  // Critério de fecho (IVA · base · overhead). Valor inicial do
  // IVA vem de partner_calc_basis; o toggle nunca escreve nesse campo.
  const basis = useFechoBasis(eventId, event?.partner_calc_basis);



  // Sub-events with city info (for breakdown)
  const { data: subEvents = [] } = useQuery({
    queryKey: ["sub-events-cities", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
          .select("id, name, date, parent_event_id, cities(name)")
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
        .select("id, description, amount, iva_rate, type, date, status, event_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, account_categories(name, code, parent_id)")
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
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, type, is_transitory, status, event_id, category_id, account_categories(id, name, code, parent_id))")
        .in("event_id", allEventIds)
        .eq("status", "approved")
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
        .select("*, event_partners(id, suppliers(name)), transactions(description, amount, iva_rate, date, event_id, account_categories(name))")
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
          .select("id, event_id, type, amount, iva_rate, status, is_overhead, master_forecast_id, transaction_id, category_id, account_categories(name, code)")
        .in("event_id", allEventIds)
        .eq("status", "approved").is("version_id", null);
      if (error) throw error;
      return data;
    },
  });

  const overheads = useMemo(
    () => expandOverheadToSplits((forecasts as any[]).filter((f: any) => f.is_overhead) as any, subEvents as any),
    [forecasts, subEvents],
  );

  const adoptedMasterExpenseSlices = useMemo(
    () => expandMasterAdoptedExpensesToSplits({
      events: subEvents as any,
      forecasts: forecasts as any,
      transactions: (transactions as any[]).filter((t: any) => t.type === "expense"),
    }),
    [forecasts, subEvents, transactions],
  );

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

  const validTx = transactions.filter((t: any) => isValidFechoTransaction(t));
  const incomeTransactions = validTx.filter((t: any) => t.type === "income");
  const adoptedMasterSourceIds = new Set(
    adoptedMasterExpenseSlices.map((slice: any) => slice._master_transaction_id).filter(Boolean),
  );
  const expenseTransactions = [
    ...validTx.filter((t: any) => t.type === "expense" && !adoptedMasterSourceIds.has(t.id)),
    ...adoptedMasterExpenseSlices,
  ];

  // Receita = bilheteira (ticket_sales) + receitas em transações.
  // Se houver ticket_sales, as transações da rubrica 1.1.01 são o mesmo dinheiro → excluídas.
  const revenueTxForTotals = hasTicketSales
    ? incomeTransactions.filter((t: any) => !isTicketingRevenueTx(t))
    : incomeTransactions;

  const totalRevenueNet = (hasTicketSales ? ticketRevenueNet : 0)
    + revenueTxForTotals.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalRevenueGross = (hasTicketSales ? ticketRevenueGross : 0)
    + revenueTxForTotals.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);

  // ---- Despesa segundo o critério selecionado no seletor ----------------
  // Base "realizado" = transações; base "previsto + excedido" = linhas aprovadas do BP.
  // Overhead entra por toggle; o excesso por rubrica entra sempre nessa base.
  const operationalForecasts = (forecasts as any[]).filter((f: any) =>
    f.type === "expense" && f.status === "approved" && !f.is_transitory && !f.is_overhead && !f.exclude_from_result
  );

  const expenseSourceLines = basis.expenseSource === "committed" ? operationalForecasts : expenseTransactions;

  const overheadNet = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + Number(o.amount), 0) : 0;
  const overheadGross = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0) : 0;

  const outsideBpNet = basis.expenseSource === "committed"
    ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, false) : 0;
  const outsideBpGross = basis.expenseSource === "committed"
    ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, true) : 0;

  const totalExpensesNet = sumLines(expenseSourceLines, false) + overheadNet + outsideBpNet;
  const totalExpensesGross = sumLines(expenseSourceLines, true) + overheadGross + outsideBpGross;

  const calcBasis = normalizePartnerCalcBasis(event?.partner_calc_basis);
  const revenueBase = getPartnerRevenueBase(totalRevenueNet);
  const expenseBase = ignoresOperationalExpenses(calcBasis)
    ? 0
    : (basis.withVat ? totalExpensesGross : totalExpensesNet);
  const resultBase = revenueBase - expenseBase;


  // ---- City breakdown (para turnês) ----
  // Receita = ticket sales daquele sub-evento (se existirem) + receitas de transactions.
  // Despesas = transactions de despesa do sub-evento (com e sem IVA).
  // Lançamentos feitos no Master NÃO aparecem como "cidade"; são rateados
  // virtualmente e de forma igual pelas cidades/splits do evento.
  const cityBreakdown: CityBreakdown[] = isTour
    ? (() => {
        const childRows = subEvents.filter((se: any) => se.id !== eventId);
        const childCount = childRows.length || 1;
        const masterTx = validTx.filter((t: any) => t.event_id === eventId);
        const masterInc = masterTx.filter((t: any) => t.type === "income" && !(hasTicketSales && isTicketingRevenueTx(t)));
        const masterExp = masterTx.filter((t: any) => t.type === "expense");
        const masterTbRows = (ticketBreakdown as TicketBreakdownRow[]).filter((tb) => tb.eventId === eventId);
        const masterRevenueNetShare = (
          masterInc.reduce((s: number, t: any) => s + Number(t.amount), 0) +
          masterTbRows.reduce((s, r) => s + r.totalNet, 0)
        ) / childCount;
        const masterRevenueGrossShare = (
          masterInc.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0) +
          masterTbRows.reduce((s, r) => s + r.totalGross, 0)
        ) / childCount;
         const masterOverheadShareNet = overheads
           .filter((o: any) => o.event_id === eventId)
           .reduce((s: number, o: any) => s + Number(o.amount), 0) / childCount;
         const masterOverheadShareGross = overheads
           .filter((o: any) => o.event_id === eventId)
           .reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0) / childCount;
         const masterExpensesNetShare = masterExp.reduce((s: number, t: any) => s + Number(t.amount), 0) / childCount;
         const masterExpensesGrossShare = masterExp.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0) / childCount;

        return childRows.map((se: any) => {
          const evtTx = validTx.filter((t: any) => t.event_id === se.id);
          const inc = evtTx.filter((t: any) => t.type === "income" && !(hasTicketSales && isTicketingRevenueTx(t)));
          const exp = evtTx.filter((t: any) => t.type === "expense");
          const txRevenueNet = inc.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const txRevenueGross = inc.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0);
          const tbRows = (ticketBreakdown as TicketBreakdownRow[]).filter((tb) => tb.eventId === se.id);
          const tbNet = tbRows.reduce((s, r) => s + r.totalNet, 0);
          const tbGross = tbRows.reduce((s, r) => s + r.totalGross, 0);
          const revenueNet = tbNet + txRevenueNet + masterRevenueNetShare;
          const revenueGross = tbGross + txRevenueGross + masterRevenueGrossShare;
           const localOverheadNet = overheads
             .filter((o: any) => o.event_id === se.id)
             .reduce((s: number, o: any) => s + Number(o.amount), 0);
           const localOverheadGross = overheads
             .filter((o: any) => o.event_id === se.id)
             .reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0);
           const expensesNet = exp.reduce((s: number, t: any) => s + Number(t.amount), 0) + localOverheadNet + masterExpensesNetShare + masterOverheadShareNet;
           const expensesGross = exp.reduce((s: number, t: any) => s + calcTotalWithIva(Number(t.amount), Number(t.iva_rate)), 0) + localOverheadGross + masterExpensesGrossShare + masterOverheadShareGross;
          return {
            eventId: se.id,
            cityName: (se.cities as any)?.name || se.name,
            revenueNet,
            revenueGross,
            expensesNet,
            expensesGross,
            resultNet: revenueNet - expensesNet,
          };
        });
      })()
    : [];

  // ---- Despesas agrupadas pelos níveis 1, 2 e 3 do Plano de Contas ----
  // Resolve cadeia de pais até obter L1 (raiz), L2 (subnível) e L3 (folha).
  const expenseByCategory: CategoryExpenseRow[] = (() => {
    const catById: Record<string, { id: string; name: string; code: string; parent_id: string | null }> = {};
    (allCategories as any[]).forEach((c) => { catById[c.id] = c; });
    // Devolve [L1, L2, L3] — onde L2/L3 podem coincidir com níveis superiores se a categoria for raiz/sub.
    const findLevels = (catId: string | null | undefined): { l1: any; l2: any; l3: any } | null => {
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
      const l3 = chain[2] || chain[1] || chain[0];
      return l1 ? { l1, l2, l3 } : null;
    };
    const map: Record<string, CategoryExpenseRow> = {};
    expenseTransactions.forEach((t: any) => {
      const lv = findLevels(t.category_id);
      const l1 = lv?.l1;
      const l2 = lv?.l2;
      const l3 = lv?.l3;
      const key = l1 && l2 && l3 ? `${l1.code}|${l2.code}|${l3.code}` : "sem-categoria";
      if (!map[key]) {
        map[key] = {
          l1Code: l1?.code || "",
          l1Name: l1?.name || "Sem categoria",
          l2Code: l2?.code || "",
          l2Name: l2?.name || "Sem categoria",
          l3Code: l3?.code || "",
          l3Name: l3?.name || "Sem categoria",
          amountNet: 0,
          amountGross: 0,
          count: 0,
        };
      }
      map[key].amountNet += Number(t.amount);
      map[key].amountGross += calcTotalWithIva(Number(t.amount), Number(t.iva_rate));
      map[key].count += 1;
    });
    // Overheads (rateios de estrutura) — somam-se às mesmas categorias para
    // que o item 7 reflita o mesmo total de despesas do Resumo Financeiro.
    overheads.forEach((o: any) => {
      const lv = findLevels(o.category_id);
      const l1 = lv?.l1;
      const l2 = lv?.l2;
      const l3 = lv?.l3;
      const key = l1 && l2 && l3 ? `${l1.code}|${l2.code}|${l3.code}` : "sem-categoria";
      if (!map[key]) {
        map[key] = {
          l1Code: l1?.code || "",
          l1Name: l1?.name || "Sem categoria",
          l2Code: l2?.code || "",
          l2Name: l2?.name || "Sem categoria",
          l3Code: l3?.code || "",
          l3Name: l3?.name || "Sem categoria",
          amountNet: 0,
          amountGross: 0,
          count: 0,
        };
      }
      const amt = Number(o.amount || 0);
      map[key].amountNet += amt;
      map[key].amountGross += calcTotalWithIva(amt, Number(o.iva_rate));
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => {
      const c1 = a.l1Code.localeCompare(b.l1Code, undefined, { numeric: true });
      if (c1 !== 0) return c1;
      const c2 = a.l2Code.localeCompare(b.l2Code, undefined, { numeric: true });
      if (c2 !== 0) return c2;
      return a.l3Code.localeCompare(b.l3Code, undefined, { numeric: true });
    });
  })();

  // ---- Mapa eventId → label de cidade (para anotar despesas pagas por sócio) ----
  // Despesas no Master (rateio) ficam com label "Rateio".
  const cityLabelByEvent: Record<string, string> = (() => {
    const map: Record<string, string> = {};
    (subEvents as any[]).forEach((se) => {
      if (se.id === eventId) {
        // Master da turnê → "Rateio"; evento simples → cidade do próprio evento
        map[se.id] = isTour ? "Rateio" : ((se.cities as any)?.name || se.name || "—");
      } else {
        map[se.id] = (se.cities as any)?.name || se.name || "—";
      }
    });
    return map;
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

  // ---- Helper: caminho hierárquico completo da categoria (L1 > L2 > L3) ----
  // Usado nos detalhes de cauções/transitórias para dar contexto contabilístico real
  // (ex: "Despesas Operacionais > Cauções > Caução de Recinto") em vez de apenas a folha.
  const catByIdAll: Record<string, { id: string; name: string; code: string; parent_id: string | null }> = {};
  (allCategories as any[]).forEach((c) => { catByIdAll[c.id] = c; });
  const buildCategoryPath = (catId: string | null | undefined, fallback?: string): string => {
    if (!catId) return fallback || "—";
    const chain: string[] = [];
    let cur = catByIdAll[catId];
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      chain.unshift(cur.code ? `${cur.code} ${cur.name}` : cur.name);
      if (!cur.parent_id) break;
      const parent = catByIdAll[cur.parent_id];
      if (!parent) break;
      cur = parent;
    }
    return chain.length ? chain.join(" > ") : (fallback || "—");
  };

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
      // Caminho hierárquico completo (L1 > L2 > L3) para dar contexto contabilístico real
      category: buildCategoryPath(t.category_id, t.account_categories?.name),
      sign: (t.type === "expense" ? 1 : -1) as 1 | -1,
    }));

  // Build settlements
  const settlements: PartnerSettlement[] = allPartners.map((p: any) => {
    const isHouse = !!p.isHouse;
    const revenue = revenueBase;
    const expenses = ignoresOperationalExpenses(calcBasis)
      ? 0
      : (p.expense_includes_iva || basis.withVat ? totalExpensesGross : totalExpensesNet);

    const result = ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBase;
    const effectivePercentage = result < 0 && p.loss_percentage != null ? Number(p.loss_percentage) : Number(p.percentage);
    const partnerShare = result * (effectivePercentage / 100);

    // Mundo Propício (empresa gestora) não tem "pagas pelo sócio" nem "extras" — é a empresa que paga tudo.
    // Filtra fora as transitórias — essas vão para a secção de crédito transitório (abaixo).
    const partnerExpenses = isHouse
      ? []
      : paidExpenses
          .filter((pe: any) => pe.partner_id === p.id && !pe.transactions?.is_transitory)
          .map((pe: any) => {
            const txEvId = pe.transactions?.event_id || pe.event_id;
            return {
              description: pe.transactions?.description || "—",
              amount: basis.withVat
                ? calcTotalWithIva(Number(pe.transactions?.amount || 0), Number(pe.transactions?.iva_rate || 0))
                : Number(pe.transactions?.amount || 0),
              date: pe.transactions?.date || "",
              category: pe.transactions?.account_categories?.name || "—",
              cityLabel: cityLabelByEvent[txEvId] || "—",
            };
          });
    const totalPaidByPartner = partnerExpenses.reduce((s, e) => s + e.amount, 0);

    const extrasForPartner = isHouse
      ? []
      : partnerAdvances
          .filter((pe: any) => pe.partner_id === p.id)
          .map((pe: any) => {
            const txEvId = pe.transactions?.event_id || pe.event_id;
            return {
              description: pe.transactions?.description || "—",
              amount: basis.withVat
                ? calcTotalWithIva(Number(pe.transactions?.amount || 0), Number(pe.transactions?.iva_rate || 0))
                : Number(pe.transactions?.amount || 0),
              date: pe.transactions?.date || "",
              category: pe.transactions?.account_categories?.name || "—",
              cityLabel: cityLabelByEvent[txEvId] || "—",
            };
          });
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
              // Caminho hierárquico completo (L1 > L2 > L3) — contexto contabilístico real
              category: buildCategoryPath(
                pe.transactions?.category_id,
                pe.transactions?.account_categories?.name,
              ),
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
      resultRepasseNow: 0,
      resultPendingByCash: 0,
      transitoryOffset: 0,
      equityContribution: 0,
      operationalSettlement: 0, // calculado abaixo
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
  });

  const baseResult = ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBase;
  const totalTransitoryCredit = settlements.reduce((acc, s) => acc + s.transitoryCredit, 0);
  const resultPositivePool = Math.max(baseResult, 0);
  const resultLossPool = Math.max(-baseResult, 0);
  const pendingPool = Math.min(totalTransitoryCredit, resultPositivePool);
  const offsetPool = Math.min(totalTransitoryCredit, resultLossPool);
  const contributionPool = Math.max(0, resultLossPool - totalTransitoryCredit);

  settlements.forEach((s) => {
    const equityRatio = s.effectivePercentage / 100;
    s.resultPendingByCash = baseResult > 0 ? pendingPool * equityRatio : 0;
    s.transitoryOffset = baseResult < 0 ? offsetPool * equityRatio : 0;
    s.equityContribution = baseResult < 0 ? contributionPool * equityRatio : 0;
    s.resultRepasseNow = baseResult >= 0 ? s.partnerShare - s.resultPendingByCash : -s.equityContribution;
    // Acerto operacional = parte já líquida do resultado + pagas pelo sócio - extras.
    s.operationalSettlement = s.resultRepasseNow + s.totalPaidByPartner - s.totalPartnerExtras;
    // Saldo final = operacional + quota do resultado ainda sem liquidez + cauções pendentes.
    s.settlement = s.operationalSettlement + s.resultPendingByCash + s.transitoryCredit;
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
    y += 5;
    doc.text(`Criterio: ${describeFechoBasis(basis)}`, margin, y);
    doc.setTextColor(0);
    y += 8;
    doc.setTextColor(0);
    y += 8;

    // ===== 1. RESUMO FINANCEIRO =====
    // Receita SEM IVA; despesa conforme o critério selecionado no seletor.
    const tableWidth = pageW - margin * 2;
    const labelColW = 130;
    const valueColW = tableWidth - labelColW;
    const expenseTotalForPdf = basis.withVat ? totalExpensesGross : totalExpensesNet;
    const resultGross = totalRevenueNet - expenseTotalForPdf;
    const revenueIva = Math.max(0, totalRevenueGross - totalRevenueNet);
    const totalTransitoryAll = settlements.reduce((s, x) => s + x.transitoryCredit, 0);
    const externalSettlements = settlements.filter((s) => !s.isHouse);
    const houseSettlement = settlements.find((s) => s.isHouse);
    const totalPaidByPartners = externalSettlements.reduce((sum, s) => sum + s.totalPaidByPartner, 0);
    const companyPaidOperationalCosts = Math.max(0, expenseTotalForPdf - totalPaidByPartners);
    const retainedCash = houseSettlement?.transitoryCredit || 0;
    const distributableRevenueCash = Math.max(0, totalRevenueGross - revenueIva);
    const cashBeforeReserve = Math.max(0, distributableRevenueCash - companyPaidOperationalCosts);
    const cashAvailableForDistribution = Math.max(0, cashBeforeReserve - retainedCash);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("1. Resumo Financeiro", margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["", "Valor"]],
      body: [
        ["Receita (s/IVA)", formatCurrency(totalRevenueNet)],
        [`Despesas (${basis.withVat ? "c/IVA" : "s/IVA"})`, formatCurrency(expenseTotalForPdf)],
        ["Resultado", formatCurrency(resultGross)],
      ],

      margin: { left: margin, right: margin },
      tableWidth,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [41, 41, 41], halign: "right" },
      columnStyles: {
        0: { cellWidth: labelColW, halign: "left", fontStyle: "bold" },
        1: { cellWidth: valueColW, halign: "right" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    y += 2;

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
        head: [["Cidade", "Receita s/IVA", "Despesas", "Resultado"]],
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

    // ===== 3. DISTRIBUIÇÃO AOS SÓCIOS (visão consolidada na 1.ª página) =====
    ensureSpace(50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("3. Distribuição aos Sócios", margin, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Sócio", "%", "Quota Bruta", "Repasse já líquido", "Pagas (+)", "Extras (-)", "Operacional"]],
      body: settlements.map((s) => [
        s.partnerName,
        `${s.effectivePercentage}%`,
        formatCurrency(s.partnerShare),
        formatCurrency(s.resultRepasseNow),
        formatCurrency(s.totalPaidByPartner),
        `-${formatCurrency(s.totalPartnerExtras)}`,
        formatCurrency(s.operationalSettlement),
      ]),
      foot: [["TOTAL", "100%",
        formatCurrency(settlements.reduce((s, x) => s + x.partnerShare, 0)),
        formatCurrency(settlements.reduce((s, x) => s + x.resultRepasseNow, 0)),
        formatCurrency(settlements.reduce((s, x) => s + x.totalPaidByPartner, 0)),
        `-${formatCurrency(settlements.reduce((s, x) => s + x.totalPartnerExtras, 0))}`,
        formatCurrency(settlements.reduce((s, x) => s + x.operationalSettlement, 0)),
      ]],
      margin: { left: margin, right: margin },
      tableWidth,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [41, 41, 41] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: (() => {
        const colPct = 14;
        const colSocio = 34;
        const colVal = (tableWidth - colSocio - colPct) / 5;
        return {
          0: { cellWidth: colSocio, halign: "left" },
          1: { cellWidth: colPct, halign: "center" },
          2: { cellWidth: colVal, halign: "right" },
          3: { cellWidth: colVal, halign: "right" },
          4: { cellWidth: colVal, halign: "right" },
          5: { cellWidth: colVal, halign: "right" },
          6: { cellWidth: colVal, halign: "right", fontStyle: "bold" },
        };
      })(),
      didParseCell: (data) => {
        if (data.section === "head" || data.section === "foot") {
          if (data.column.index === 0) data.cell.styles.halign = "left";
          else if (data.column.index === 1) data.cell.styles.halign = "center";
          else data.cell.styles.halign = "right";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
    if (settlements.reduce((s, x) => s + x.transitoryCredit, 0) > 0) {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      const note2 = "Operacional = quota do resultado com liquidez imediata + pagas - extras. O item 4 detalha o que ficou pendente por desencaixe de caixa em caucoes/transitorias e o que ainda depende de devolucao.";
      const lines2 = doc.splitTextToSize(note2, tableWidth);
      doc.text(lines2, margin, y);
      y += lines2.length * 3 + 3;
      doc.setTextColor(0);
    } else {
      y += 3;
    }

    // ===== 4. DETALHES POR SÓCIO (página 2) =====
    // A MUNDO PROPÍCIO não recebe repasse de si mesma — só sócios externos têm secção própria.
    {
      const externalSettlementsP2 = settlements.filter((x: any) => !x.isHouse);
      if (externalSettlementsP2.length > 0) {
        doc.addPage();
        y = 16;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("4. Detalhes por Sócio", margin, y);
        y += 5;

        for (const s of externalSettlementsP2) {
          ensureSpace(40);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          const pctLabel = s.lossPercentage != null ? `${s.percentage}% lucro / ${s.lossPercentage}% prejuízo` : `${s.percentage}%`;
          doc.text(`${s.partnerName} (${pctLabel})`, margin, y);
          y += 3;

          // Resumo numa única linha — separa liquidez imediata da pendência de caixa
          autoTable(doc, {
            startY: y,
            head: [["Quota", "Repasse já líquido", "Pagas (+)", "Extras (-)", "Operacional", "Saldo total"]],
            body: [[
              formatCurrency(s.partnerShare),
              formatCurrency(s.resultRepasseNow),
              formatCurrency(s.totalPaidByPartner),
              `-${formatCurrency(s.totalPartnerExtras)}`,
              formatCurrency(s.operationalSettlement),
              formatCurrency(s.settlement),
            ]],
            margin: { left: margin, right: margin },
            tableWidth,
            styles: { fontSize: 8, cellPadding: 1.8, halign: "right" },
            headStyles: { fillColor: [60, 60, 60], halign: "right" },
            columnStyles: (() => {
              const w = tableWidth / 6;
              return {
                0: { cellWidth: w },
                1: { cellWidth: w },
                2: { cellWidth: w },
                3: { cellWidth: w, fontStyle: "bold" },
                4: { cellWidth: w, fontStyle: "bold" },
                5: { cellWidth: w, fontStyle: "bold" },
              };
            })(),
          });
          y = (doc as any).lastAutoTable.finalY + 1.5;

          if (s.resultPendingByCash > 0 || s.transitoryCredit > 0 || s.equityContribution > 0 || s.transitoryOffset > 0) {
            autoTable(doc, {
              startY: y,
              head: [["4. Liquidez e pendências de caixa", "Valor"]],
              body: [
                ["Repasse do resultado já com liquidez imediata", formatCurrency(s.resultRepasseNow)],
                ["Resultado ainda sem liquidez por caixa desencaixado em cauções", formatCurrency(s.resultPendingByCash)],
                ["Prejuízo absorvido provisoriamente por cauções ainda retidas", formatCurrency(s.transitoryOffset)],
                ["Aporte necessário para fechar a conta", formatCurrency(s.equityContribution)],
                ["Cauções / transitórias a devolver ao pagador", formatCurrency(s.transitoryCredit)],
                ["Saldo total após devoluções", formatCurrency(s.settlement)],
              ],
              margin: { left: margin, right: margin },
              tableWidth,
              styles: { fontSize: 7.5, cellPadding: 1.6 },
              headStyles: { fillColor: [200, 235, 240], textColor: [0, 80, 100], halign: "right" },
              columnStyles: {
                0: { halign: "left" },
                1: { halign: "right", fontStyle: "bold" },
              },
            });
            y = (doc as any).lastAutoTable.finalY + 1.5;
          }

          if (s.paidExpenses.length > 0) {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "italic");
            doc.text("Despesas pagas pelo sócio:", margin, y);
            y += 2.5;
            autoTable(doc, {
              startY: y,
              head: [["Descrição", "Cidade", "Categoria", "Data", "Valor"]],
              body: s.paidExpenses.map(e => [
                e.description,
                e.cityLabel,
                e.category,
                e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
                formatCurrency(e.amount),
              ]),
              foot: [[
                { content: "Total", colSpan: 4, styles: { halign: "right" } },
                { content: formatCurrency(s.totalPaidByPartner), styles: { halign: "right" } },
              ]],
              margin: { left: margin + 4, right: margin },
              styles: { fontSize: 7.5, cellPadding: 1.4 },
              headStyles: { fillColor: [80, 80, 80] },
              footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
              columnStyles: { 4: { halign: "right" } },
            });
            y = (doc as any).lastAutoTable.finalY + 1.5;
          }

          // Cauções / transitórias pagas pelo sócio (entram no acerto até serem devolvidas)
          if (s.transitoryItems.length > 0) {
            ensureSpace(20);
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(0, 100, 120);
            doc.text("Caucoes / transitorias pagas pelo socio (creditadas ate serem devolvidas):", margin, y);
            doc.setTextColor(0);
            y += 2.5;
            autoTable(doc, {
              startY: y,
              head: [["Descrição", "Categoria (Plano de Contas)", "Data", "Tipo", "Valor"]],
              body: s.transitoryItems.map((e) => [
                e.description,
                e.category,
                e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
                e.sign > 0 ? "Caução" : "Devolução",
                `${e.sign > 0 ? "+" : "-"}${formatCurrency(e.amount)}`,
              ]),
              foot: [[
                { content: "Crédito líquido (após devoluções)", colSpan: 4, styles: { halign: "right" } },
                { content: formatCurrency(s.transitoryCredit), styles: { halign: "right" } },
              ]],
              margin: { left: margin + 4, right: margin },
              styles: { fontSize: 7.5, cellPadding: 1.4, overflow: "linebreak", valign: "top" },
              headStyles: { fillColor: [60, 130, 150] },
              footStyles: { fillColor: [220, 240, 245], textColor: [0, 80, 100], fontStyle: "bold" },
              columnStyles: {
                0: { cellWidth: 70 },               // Descrição (texto livre da transação)
                1: { cellWidth: 75 },               // Categoria — caminho hierárquico completo
                2: { cellWidth: 18, halign: "center" },
                3: { cellWidth: 18, halign: "center" },
                4: { halign: "right" },
              },
            });
            y = (doc as any).lastAutoTable.finalY + 1.5;
          }

          if (s.partnerExtras.length > 0) {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "italic");
            doc.text("Extras do sócio (pagas pela empresa, abatidas):", margin, y);
            y += 2.5;
            autoTable(doc, {
              startY: y,
              head: [["Descrição", "Cidade", "Categoria", "Data", "Valor"]],
              body: s.partnerExtras.map(e => [
                e.description,
                e.cityLabel,
                e.category,
                e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
                `-${formatCurrency(e.amount)}`,
              ]),
              foot: [[
                { content: "Total a abater", colSpan: 4, styles: { halign: "right" } },
                { content: `-${formatCurrency(s.totalPartnerExtras)}`, styles: { halign: "right" } },
              ]],
              margin: { left: margin + 4, right: margin },
              styles: { fontSize: 7.5, cellPadding: 1.4 },
              headStyles: { fillColor: [120, 60, 60] },
              footStyles: { fillColor: [250, 230, 230], textColor: [120, 0, 0], fontStyle: "bold" },
              columnStyles: { 4: { halign: "right" } },
            });
            y = (doc as any).lastAutoTable.finalY + 1.5;
          }

          y += 2;
        }
      }
    }

    // ===== 4a. CAUÇÕES PAGAS PELA MUNDO PROPÍCIO =====
    // A MP não tem secção própria em "4. Detalhes por Sócio", mas as suas cauções
    // (transitórias órfãs) precisam ser detalhadas para auditoria do caixa retido.
    {
        const houseSettlement = settlements.find((s) => s.isHouse);
      if (houseSettlement && houseSettlement.transitoryItems.length > 0) {
        // Mantém na mesma página de "4. Detalhes por Sócio"; só quebra se não couber o cabeçalho
        if (y > pageH - 40) {
          doc.addPage();
          y = margin;
        } else {
          y += 4;
        }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("4a. Cauções pagas pela Mundo Propício", margin, y);
        y += 5;
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(80);
        const houseNote = "Caucoes/transitorias pagas com o caixa da empresa, ainda nao devolvidas. Nao compoem o resultado do evento — regressam ao caixa da Mundo Propicio quando a entidade terceira que as reteve fizer a devolucao (ex: recinto/venue).";
        const hLines = doc.splitTextToSize(houseNote, tableWidth);
        doc.text(hLines, margin, y);
        y += hLines.length * 3 + 2;
        doc.setTextColor(0);
        autoTable(doc, {
          startY: y,
          head: [["Descrição", "Categoria (Plano de Contas)", "Data", "Tipo", "Valor"]],
          body: houseSettlement.transitoryItems.map((e) => [
            e.description,
            e.category,
            e.date ? format(new Date(e.date), "dd/MM/yyyy") : "",
            e.sign > 0 ? "Caução" : "Devolução",
            `${e.sign > 0 ? "+" : "-"}${formatCurrency(e.amount)}`,
          ]),
          foot: [[
            { content: "Total caixa retido (a recuperar)", colSpan: 4, styles: { halign: "right" } },
            { content: formatCurrency(houseSettlement.transitoryCredit), styles: { halign: "right" } },
          ]],
          margin: { left: margin, right: margin },
          tableWidth,
          styles: { fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
          headStyles: { fillColor: [60, 130, 150] },
          footStyles: { fillColor: [220, 240, 245], textColor: [0, 80, 100], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: tableWidth * 0.32 },
            1: { cellWidth: tableWidth * 0.36 },
            2: { cellWidth: tableWidth * 0.12, halign: "center" },
            3: { cellWidth: tableWidth * 0.10, halign: "center" },
            4: { halign: "right" },
          },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
    }

    // ===== 5. BILHETEIRA - RESUMOS (nova página) =====
    if (ticketBreakdown.length > 0) {
      doc.addPage();
      y = 16;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("5. Bilheteira - Totais Vendidos", margin, y);
      y += 6;

      // Larguras explícitas para a tabela de bilheteira (sem coluna s/IVA)
      const tbCol1 = 170; // descrição (cidade/dia/sessão)
      const tbColQ = 30;
      const tbColV = tableWidth - tbCol1 - tbColQ;

      const fmtRow = (label: string, qty: number, gross: number) => [
        label, qty.toString(), formatCurrency(gross),
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
          head: [[firstColLabel, "Qtd.", "Total c/IVA"]],
          body: groups.map((g) => fmtRow(g.key, g.quantity, g.totalGross)),
          foot: [fmtRow(
            "TOTAL",
            groups.reduce((s, g) => s + g.quantity, 0),
            groups.reduce((s, g) => s + g.totalGross, 0),
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
                  row: fmtRow(`    ${sess}`, a.quantity, a.totalGross),
                  style: "detail",
                });
                dayQty += a.quantity; dayGross += a.totalGross; dayNet += a.totalNet;
              });
              body.push({
                row: fmtRow(`  Subtotal ${day}`, dayQty, dayGross),
                style: "subday",
              });
              cityQty += dayQty; cityGross += dayGross; cityNet += dayNet;
            });
            body.push({
              row: fmtRow(`Subtotal ${city}`, cityQty, cityGross),
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
            head: [["Cidade / Data / Sessao", "Qtd.", "Total c/IVA"]],
            body: body.map((b) => b.row),
            foot: [fmtRow("TOTAL GERAL", grandQty, grandGross)],
            margin: { left: margin, right: margin },
            tableWidth,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [41, 41, 41], halign: "right" },
            footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
            columnStyles: {
              0: { cellWidth: tbCol1, halign: "left" },
              1: { cellWidth: tbColQ, halign: "right" },
              2: { cellWidth: tbColV, halign: "right" },
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

    // ===== 5. FECHO DE BILHETEIRA =====
    if (boxOfficeRows.length > 0) {
      ensureSpace(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("6. Fecho de Bilheteiras / Recintos", margin, y);
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

    // ===== 6. DESPESAS POR CATEGORIA (nova página; nível L2 ou L3 do plano) =====
    if (expenseByCategory.length > 0) {
      doc.addPage();
      y = 16;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const lvlLabel = expenseCategoryLevel === "l3" ? "(nível 3)" : "(nível 2)";
      doc.text(`7. Despesas por Categoria ${lvlLabel}`, margin, y);
      y += 5;

      // Larguras explícitas (uma única coluna de valor c/IVA)
      const expCol1 = 160; // descrição (L1/L2/L3)
      const expColC = 40;  // contagem (cabe "Lançamentos")
      const expColV = tableWidth - expCol1 - expColC;

      // Agregação consoante o nível escolhido
      // L2: agrupa em L1 → L2 (atual)
      // L3: agrupa em L1 → L2 → L3 (folha do plano)
      const byL1: Record<string, { l1Code: string; l1Name: string; rows: CategoryExpenseRow[] }> = {};
      expenseByCategory.forEach((r) => {
        const k = r.l1Code || "_";
        if (!byL1[k]) byL1[k] = { l1Code: r.l1Code, l1Name: r.l1Name, rows: [] };
        byL1[k].rows.push(r);
      });

      const body: { row: any[]; style: "l1" | "l2" | "l3" }[] = [];
      let grandCount = 0, grandGross = 0;

      Object.values(byL1)
        .sort((a, b) => a.l1Code.localeCompare(b.l1Code, undefined, { numeric: true }))
        .forEach((g) => {
          // Subtotal por L1
          const l1Count = g.rows.reduce((s, r) => s + r.count, 0);
          const l1Gross = g.rows.reduce((s, r) => s + r.amountGross, 0);
          body.push({
            row: [
              `${g.l1Code} ${g.l1Name}`.trim(),
              l1Count.toString(),
              formatCurrency(l1Gross),
            ],
            style: "l1",
          });

          // Agrupa filhas do L1 por L2
          const byL2: Record<string, CategoryExpenseRow[]> = {};
          g.rows.forEach((r) => {
            const k = r.l2Code || "_";
            if (!byL2[k]) byL2[k] = [];
            byL2[k].push(r);
          });

          Object.entries(byL2)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .forEach(([_, rowsL2]) => {
              const first = rowsL2[0];
              // Se L2 == L1 (categoria sem filho intermédio), saltar a linha L2 para não duplicar
              const skipL2Row = first.l2Code === g.l1Code && first.l2Name === g.l1Name;
              if (!skipL2Row) {
                const l2Count = rowsL2.reduce((s, r) => s + r.count, 0);
                const l2Gross = rowsL2.reduce((s, r) => s + r.amountGross, 0);
                body.push({
                  row: [
                    `    ${first.l2Code} ${first.l2Name}`.trim(),
                    l2Count.toString(),
                    formatCurrency(l2Gross),
                  ],
                  style: "l2",
                });
              }

              // Detalhe L3 — apenas se nível escolhido é L3 e L3 != L2
              if (expenseCategoryLevel === "l3") {
                rowsL2.forEach((r) => {
                  if (r.l3Code === r.l2Code && r.l3Name === r.l2Name) return; // sem nível 3 real
                  body.push({
                    row: [
                      `        ${r.l3Code} ${r.l3Name}`.trim(),
                      r.count.toString(),
                      formatCurrency(r.amountGross),
                    ],
                    style: "l3",
                  });
                });
              }
            });

          grandCount += l1Count;
          grandGross += l1Gross;
        });

      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Lançamentos", "Despesas"]],
        body: body.map((b) => b.row),
        foot: [["TOTAL",
          grandCount.toString(),
          formatCurrency(grandGross),
        ]],
        showFoot: "lastPage",
        margin: { left: margin, right: margin },
        tableWidth,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [41, 41, 41], halign: "right" },
        footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: "bold", halign: "right" },
        columnStyles: {
          0: { cellWidth: expCol1, halign: "left" },
          1: { cellWidth: expColC, halign: "right" },
          2: { cellWidth: expColV, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const meta = body[data.row.index];
          if (!meta) return;
          if (meta.style === "l1") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [230, 230, 230];
          } else if (meta.style === "l2") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [245, 245, 245];
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (includeLiquidityAppendix && externalSettlements.length > 0) {
      doc.addPage();
      y = 16;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("8. Análise Final de Liquidez da Distribuição", margin, y);
      y += 6;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      const intro = doc.splitTextToSize(
        "Esta folha opcional traduz a disponibilidade real de caixa no fecho: parte da receita ficou na Mundo Propício, parte das despesas foi suportada pelos sócios externos e a caução/transitória ainda retida reduz o montante disponível para reembolso e distribuição do resultado.",
        tableWidth,
      );
      doc.text(intro, margin, y);
      y += intro.length * 3.2 + 4;

      autoTable(doc, {
        startY: y,
        head: [["Passo de liquidez", "Valor"]],
        body: [
          ["Receita bruta efetivamente recebida nas vendas", formatCurrency(totalRevenueGross)],
          ["(-) IVA da receita bruta", formatCurrency(revenueIva)],
          ["(-) Despesas operacionais pagas pela Mundo Propício / empresa", formatCurrency(companyPaidOperationalCosts)],
          ["Caixa disponível antes das retenções transitórias", formatCurrency(cashBeforeReserve)],
          ["(-) Cauções / transitórias ainda retidas e sem disponibilidade", formatCurrency(retainedCash)],
          ["Caixa efetivamente disponível para distribuição agora", formatCurrency(cashAvailableForDistribution)],
        ],
        margin: { left: margin, right: margin },
        tableWidth,
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [41, 41, 41], halign: "right" },
        columnStyles: {
          0: { cellWidth: labelColW, halign: "left", fontStyle: "bold" },
          1: { cellWidth: valueColW, halign: "right" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 5;

      let remainingCash = cashAvailableForDistribution;
      const liquidityRows = externalSettlements.map((s) => {
        const reimbursableNow = Math.max(0, Math.min(s.totalPaidByPartner, remainingCash));
        remainingCash = Math.max(0, remainingCash - reimbursableNow);
        const reimbursablePending = Math.max(0, s.totalPaidByPartner - reimbursableNow);

        const resultDue = Math.max(0, s.partnerShare);
        const resultPayableNow = Math.max(0, Math.min(resultDue, remainingCash));
        remainingCash = Math.max(0, remainingCash - resultPayableNow);
        const resultPending = Math.max(0, resultDue - resultPayableNow);

        const totalDue = Math.max(0, s.totalPaidByPartner - s.totalPartnerExtras + resultDue);
        const totalNow = Math.max(0, reimbursableNow - s.totalPartnerExtras + resultPayableNow);
        const totalPending = Math.max(0, totalDue - totalNow);

        return {
          partnerName: s.partnerName,
          reimbursableNow,
          reimbursablePending,
          resultPayableNow,
          resultPending,
          totalDue,
          totalNow,
          totalPending,
        };
      });

      const formatLiquidityAmount = (value: number) => formatCurrency(value).replace(/\s*€/u, "").trim();

      autoTable(doc, {
        startY: y,
        head: [["Sócio", "Caixa\nDisponível (€)", "Despesas Pagas\n(Pagas pelo Sócio) (€)", "Resultado Evento\n(Lucro ou Prejuízo) (€)", "Total\n(€)", "Caixa Disponível\n(Liquidez) (€)", "Saldo Pendente\n(€)"]],
        body: liquidityRows.map((row) => [
          row.partnerName,
          formatLiquidityAmount(row.reimbursableNow),
          formatLiquidityAmount(row.reimbursableNow + row.reimbursablePending),
          formatLiquidityAmount(row.resultPayableNow + row.resultPending),
          formatLiquidityAmount(row.totalDue),
          formatLiquidityAmount(row.totalNow),
          formatLiquidityAmount(row.totalPending),
        ]),
        foot: [[
          "TOTAL",
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.reimbursableNow, 0)),
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.reimbursableNow + row.reimbursablePending, 0)),
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.resultPayableNow + row.resultPending, 0)),
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.totalDue, 0)),
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.totalNow, 0)),
          formatLiquidityAmount(liquidityRows.reduce((sum, row) => sum + row.totalPending, 0)),
        ]],
        margin: { left: margin, right: margin },
        tableWidth,
        styles: { fontSize: 7.4, cellPadding: 1.4 },
        headStyles: { fillColor: [41, 41, 41], halign: "right" },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 42, halign: "left" },
          1: { cellWidth: 19, halign: "right" },
          2: { cellWidth: 24, halign: "right" },
          3: { cellWidth: 24, halign: "right" },
          4: { cellWidth: 21, halign: "right" },
          5: { cellWidth: 22, halign: "right", fontStyle: "bold" },
          6: { cellWidth: 20, halign: "right", fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.column.index === 0) {
            data.cell.styles.halign = "left";
            return;
          }

          data.cell.styles.halign = "right";
          data.cell.styles.font = "courier";

          if (data.section === "head") {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      const outro = doc.splitTextToSize(
        "Lógica desta folha: primeiro abate-se a indisponibilidade de caixa das cauções/transitórias ainda retidas; depois prioriza-se o reembolso das despesas pagas pelos sócios externos; só o saldo remanescente suporta distribuição do resultado.",
        tableWidth,
      );
      doc.text(outro, margin, y);
      doc.setTextColor(0);
    }

    // (Item 7 "Detalhes por Sócio" foi movido para a 1.ª página, logo após o item 3.)


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
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            <Switch checked={includeLiquidityAppendix} onCheckedChange={setIncludeLiquidityAppendix} />
            <span>Incluir análise final</span>
          </label>
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
          <Select value={expenseCategoryLevel} onValueChange={(v) => setExpenseCategoryLevel(v as "l2" | "l3")}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Nível das despesas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="l2">Despesas: Nível 2 (grupo)</SelectItem>
              <SelectItem value="l3">Despesas: Nível 3 (detalhe)</SelectItem>
            </SelectContent>
          </Select>
          <FechoBasisSelector basis={basis} />
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Global summary — critério conforme seletor */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Receita (s/IVA)</p>
            <p className="text-xl font-bold font-mono text-success">{formatCurrency(totalRevenueNet)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Despesas ({basis.withVat ? "c/IVA" : "s/IVA"})
            </p>
            <p className="text-xl font-bold font-mono text-destructive">{formatCurrency(expenseBase)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Resultado</p>
            <p className={`text-xl font-bold font-mono ${resultBase >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(resultBase)}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{describeFechoBasis(basis)}</p>
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
                <TableHead className="text-right">Despesas</TableHead>
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
              {s.transitoryCredit > 0 || s.resultPendingByCash > 0 || s.equityContribution > 0 || s.transitoryOffset > 0 ? (
                <div className="flex items-center gap-1.5">
                  <Badge className={`text-xs ${s.operationalSettlement >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {s.operationalSettlement >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    Operacional {formatCurrency(Math.abs(s.operationalSettlement))}
                  </Badge>
                  <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-700 dark:text-cyan-400">
                    + Pendente {formatCurrency(s.resultPendingByCash + s.transitoryCredit + s.transitoryOffset)}
                  </Badge>
                  {s.equityContribution > 0 && (
                    <Badge className="text-xs bg-destructive/15 text-destructive">
                      Aporte {formatCurrency(s.equityContribution)}
                    </Badge>
                  )}
                </div>
              ) : s.settlement > 0 ? (
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
            <div className="grid gap-3 sm:grid-cols-8 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Participação no resultado</span>
                <p className={`font-mono font-bold ${s.partnerShare >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.partnerShare)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground" title="Parcela da quota do resultado já suportada por liquidez disponível">Repasse já líquido</span>
                <p className={`font-mono font-bold ${s.resultRepasseNow >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.resultRepasseNow)}</p>
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
                <span className="text-xs text-muted-foreground" title="Valor já liquidável agora">Acerto operacional</span>
                <p className={`font-mono font-bold text-lg ${s.operationalSettlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.operationalSettlement)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground" title="Quota do resultado sem liquidez + cauções/transitórias pendentes">Pendente de caixa</span>
                <p className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{formatCurrency(s.resultPendingByCash + s.transitoryCredit + s.transitoryOffset)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground" title="Aporte proporcional ao equity necessário para fechar o prejuízo">Aporte necessário</span>
                <p className="font-mono font-bold text-destructive">{formatCurrency(s.equityContribution)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground" title="Saldo total, incluindo pendências de caixa e devoluções futuras">Saldo total</span>
                <p className={`font-mono font-bold text-lg ${s.settlement >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(s.settlement)}</p>
              </div>
            </div>
            {(s.resultPendingByCash > 0 || s.transitoryCredit > 0 || s.equityContribution > 0 || s.transitoryOffset > 0) && (
              <p className="text-[11px] text-cyan-700 dark:text-cyan-400 bg-cyan-500/5 border border-cyan-500/20 rounded px-2 py-1.5">
                ℹ️ <strong>Acerto liquidável agora: {formatCurrency(s.operationalSettlement)}.</strong> No item 4, o fecho mostra separadamente
                {" "}{formatCurrency(s.resultPendingByCash)} do resultado ainda sem liquidez por desencaixe de caixa, {formatCurrency(s.transitoryCredit)} de
                cauções/transitórias ainda pendentes de devolução, {formatCurrency(s.transitoryOffset)} de prejuízo temporariamente coberto por essas cauções e {formatCurrency(s.equityContribution)} de aporte proporcional ao equity.
              </p>
            )}

            {s.paidExpenses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Despesas pagas pelo sócio:</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.paidExpenses.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.cityLabel}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={4} className="font-bold text-xs">Total</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatCurrency(s.totalPaidByPartner)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {s.transitoryItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  🛡️ {s.isHouse ? "Cauções / transitórias pagas pela Mundo Propício" : "Cauções / transitórias pagas pelo sócio"}
                  <span className="text-muted-foreground/70"> — entram no acerto até devolução pela entidade terceira que reteve o valor (não impactam resultado)</span>
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
                      <TableHead>Cidade</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.partnerExtras.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.cityLabel}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">−{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={4} className="font-bold text-xs">Total a abater</TableCell>
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
