import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { effectiveBasisShortLabel, effectiveExpenseBasisLabel } from "@/lib/settlement-basis";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, UserCheck, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { calcTotalWithIva, calcIvaAmount, roundCents } from "@/lib/iva";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { isValidFechoTransaction, isTicketingRevenueTx } from "@/lib/fecho-filters";
import { isCapitalCategoryCode } from "@/lib/capital-branch";
import {
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  partnerUsesGrossExpenses,
  describePartnerExpenseBasis,
} from "@/lib/partner-calc-basis";

import { computeOutsideBpExcess, sumLines } from "@/lib/event-cost-basis";
import { useFechoBasis, describeFechoBasis } from "@/hooks/useFechoBasis";
import { FechoBasisSelector } from "@/components/FechoBasisSelector";
import { useEventSettlementEngine } from "@/hooks/useEventSettlementEngine";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";
import { collectSettlementExpenseDocLines } from "@/lib/event-settlement-inputs";
import { exportPartnerSettlementInternalPdf } from "@/lib/export-partner-settlement-internal-pdf";


import {
  fetchEventSettlements,
  fetchSettlementParticipants,
} from "@/lib/settlement-participants";
import {
  inferSettlesSettlementId,
  quotaOriginText,
  settlementDocFileName,
  settlementDocTitle,
} from "@/lib/settlement-doc-text";
import { PartnerCapitalPanel } from "@/components/PartnerCapitalPanel";
import PartnerDisbursementDetail from "@/components/PartnerDisbursementDetail";
import { PartnerPaidExpensesBPView } from "@/components/PartnerPaidExpensesBPView";
import { fetchPartnerExtras, ORIGIN_LABEL } from "@/lib/partner-extras";
import {
  exportPartnerStatementDocExcel,
  exportPartnerStatementDocPdf,
} from "@/lib/export-partner-statement-doc";
import { statementTerms, TRANSFER_IVA_RATE, type DocLocale, type PartnerStatementDocInput } from "@/lib/partner-statement-doc";
import { fetchExportBranding } from "@/lib/export-header";
import { exportDisbursementExcel } from "@/lib/export-partner-disbursement";
import {
  collectBpPaidLines,
  collectDisbursementAdjustments,
  collectRevenuesHeld,
  partnerAdvancedTotal,
  partnerDisbursement,
  partnerFinancingToReturn,
  sumLineAmounts,
  REVENUE_HELD_SOURCE_LABEL,
  type BpPaidLine,
  type PartnerAdjustment,
  type RevenueHeldRow,
} from "@/lib/partner-disbursement";



interface Props {
  eventId: string;
  eventName: string;
  /** IDs dos sub-eventos quando este é um Master de turnê (vazio em evento simples). */
  childEventIds?: string[];
}

interface PartnerSettlement {
  partnerId: string;
  partnerName: string;
  /** supplier_id do participante — usado para inferir o fechamento onde acerta. */
  supplierId: string | null;
  isHouse: boolean;
  percentage: number;
  lossPercentage: number | null;
  effectivePercentage: number;
  /** Override do sócio (null = herda a base contratual do evento). */
  expenseIncludesIva: boolean | null;
  /** Base efetiva aplicada ao apuramento deste sócio (true = c/IVA). */
  usesGrossExpenses: boolean;
  /** Rótulo curto: base + origem da regra (contrato do evento vs sócio). */
  expenseBasisLabel: string;

  calcBasis: string;
  revenue: number;
  expenses: number;
  result: number;
  partnerShare: number;
  paidExpenses: { description: string; amount: number; date: string; category: string; cityLabel: string }[];
  totalPaidByPartner: number;
  /** (g4 precisão) Linhas de BP pagas pelo sócio que nunca geraram transação (D-ERP14). */
  bpPaidLines: BpPaidLine[];
  totalBpPaidByPartner: number;
  /** Desembolso efectivo do sócio = transações pagas por ele + linhas de BP sem transação. */
  totalDisbursement: number;
  /** (g5) Receitas em poder do sócio (contas de acerto, contas dele, operações de terceiros). */
  revenuesHeld: RevenueHeldRow[];
  totalRevenuesHeld: number;
  /** (g5) Ajustes manuais ao desembolso (valor com sinal). */
  disbursementAdjustments: PartnerAdjustment[];
  totalDisbursementAdjustments: number;
  /** (g5) Financiamento a devolver = desembolso ± ajustes − receitas em poder. */
  financingToReturn: number;
  /** Já adiantado ao sócio = extras/adiantamentos + entradas nas contas de acerto. */
  totalAdvanced: number;
  partnerExtras: { origem?: "transacao" | "manual"; originLabel?: string; description: string; amount: number; date: string; category: string; cityLabel: string }[];
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
  /** (g4 adenda) Repasse facturado com IVA 23% (campo do participante). */
  transferWithVat: boolean;
  /** Base a transferir = parte do resultado + pagas pelo sócio − extras/adiantamentos. */
  transferBase: number;
  transferVat: number;
  transferTotal: number;
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

  // Modo de apuramento das quotas: por contrato de cada sócio (default) ou
  // pela regra geral do evento. Estado local, não persistido.
  type CalcMode = "contract" | "event";
  const [calcMode, setCalcMode] = useState<CalcMode>("contract");

  // Apuramento activo do Encontro de Contas (null = raiz).
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);

  // Export do PDF de um sócio: o fechamento é INFERIDO (onde ele acerta) — o
  // selector serve só para a peça interna (#146 (f) ponto 1). Quando o
  // fechamento inferido não é o activo, troca-se primeiro e o export corre no
  // efeito abaixo, já com os totais desse nó.
  const [pendingSoloKind, setPendingSoloKind] = useState<"pdf" | "xlsx">("pdf");
  const [pendingSoloPartnerId, setPendingSoloPartnerId] = useState<string | null>(null);


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

  // Motor dos apuramentos — dá o perímetro e a quota do pai do nó activo (#146 (e2)).
  const engine = useEventSettlementEngine(eventId);




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

  // Apuramentos do evento (separador do Encontro de Contas)
  const { data: eventSettlements = [], error: settlementsError } = useQuery({
    queryKey: ["event-settlements-fecho", eventId],
    queryFn: () => fetchEventSettlements([eventId]),
  });

  // Participantes — fonte de verdade (inclui a casa como linha real)
  const { data: allParticipants = [], error: participantsError } = useQuery({
    queryKey: ["event-settlement-participants-fecho", eventId],
    queryFn: () => fetchSettlementParticipants([eventId]),
  });

  const rootSettlementId = useMemo(() => {
    const root = (eventSettlements as any[]).find((s) => !s.parent_id) ?? (eventSettlements as any[])[0];
    return root?.id ?? null;
  }, [eventSettlements]);

  const activeSettlementId = selectedSettlementId ?? rootSettlementId;

  /** (g3/g13) Perímetro da raiz — base de qualquer documento do sócio. */
  const rootSettlementIds = useMemo(
    () => new Set((eventSettlements as any[]).filter((s) => !s.parent_id).map((s) => s.id as string)),
    [eventSettlements],
  );

  const partners = useMemo(
    () => (allParticipants as any[]).filter((p) => !activeSettlementId || p.settlement_id === activeSettlementId),
    [allParticipants, activeSettlementId],
  );

  // Event transactions (with category)
  const { data: transactions = [], error: transactionsError } = useQuery({
    queryKey: ["event-transactions-settlement", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, type, date, status, event_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, event_settlement_id, account_categories(name, code, parent_id)")
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
  const { data: paidExpenses = [], error: paidExpensesError } = useQuery({
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

  // (g5) Receitas em poder do sócio — contas de acerto do sócio, receitas do evento
  // em contas com partner_id, operações de terceiros retidas por ele e (g7) receitas
  // recebidas por encontro de contas marcadas com "Recebido por".
  const { data: revenuesHeldRaw = [], error: revenuesHeldError } = useQuery({
    queryKey: ["partner-revenues-held", allEventIdsKey],
    queryFn: async (): Promise<RevenueHeldRow[]> => {
      const [accRes, opsRes, compRes] = await Promise.all([
        supabase.from("financial_accounts").select("id, name, partner_id, type").not("partner_id", "is", null),
        supabase
          .from("event_third_party_operations")
          .select("id, name, operator_result, held_by_supplier_id, event_id")
          .in("event_id", allEventIds)
          .not("held_by_supplier_id", "is", null),
        supabase
          .from("transactions")
          .select("id, description, amount, date, event_id, status, reversed_at, held_by_supplier_id")
          .in("event_id", allEventIds)
          .eq("type", "income")
          .not("held_by_supplier_id", "is", null),
      ]);

      if (accRes.error) throw accRes.error;
      if (opsRes.error) throw opsRes.error;
      if (compRes.error) throw compRes.error;


      const accounts = accRes.data ?? [];
      const rows: RevenueHeldRow[] = [];

      if (accounts.length > 0) {
        const { data: txs, error: txErr } = await supabase
          .from("transactions")
          .select("id, description, amount, date, type, status, account_id, event_id, reversed_at")
          .in("account_id", accounts.map((a: any) => a.id))
          .in("event_id", allEventIds)
          .eq("type", "income");
        if (txErr) throw txErr;
        const byAccount = new Map(accounts.map((a: any) => [a.id, a]));
        for (const t of (txs ?? []) as any[]) {
          if (t.reversed_at || !(t.status === "paid" || t.status === "approved")) continue;
          const acc: any = byAccount.get(t.account_id);
          rows.push({
            id: t.id,
            partnerId: acc?.partner_id as string,
            // Não existe tipo próprio de conta de acerto: qualquer conta com
            // partner_id é conta de acerto do sócio.
            source: acc?.partner_id ? "settlement_account" : "partner_account",
            accountName: acc?.name || "—",
            description: t.description || "—",
            amount: Number(t.amount) || 0,
            date: t.date || "",
            eventId: t.event_id ?? null,
          });
        }
      }

      for (const op of (opsRes.data ?? []) as any[]) {
        rows.push({
          id: op.id,
          // Guardado por supplier_id — resolvido para o participante mais abaixo.
          partnerId: `supplier:${op.held_by_supplier_id}`,
          source: "third_party",
          accountName: op.name || "Operação de terceiros",
          description: "Resultado do operador",
          amount: Number(op.operator_result) || 0,
          date: "",
          eventId: op.event_id ?? null,
        });
      }

      // (g7) Receitas recebidas por encontro de contas em nome de um sócio.
      // Nunca têm conta, logo não há interseção com as contas de acerto acima.
      for (const t of (compRes.data ?? []) as any[]) {
        if (t.reversed_at || !(t.status === "paid" || t.status === "approved")) continue;
        rows.push({
          id: t.id,
          partnerId: `supplier:${t.held_by_supplier_id}`,
          source: "compensation",
          accountName: t.description || "Encontro de contas",
          description: t.description || "—",
          amount: Number(t.amount) || 0,
          date: t.date || "",
          eventId: t.event_id ?? null,
        });
      }
      return rows;
    },

  });

  // (g5) Sócios que não deduzem IVA em PT (doc_locale pt-BR) — desembolso valorizado c/IVA.
  const { data: grossDisbursementSupplierIds = [] } = useQuery({
    queryKey: ["suppliers-doc-locale-br"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id").eq("doc_locale", "pt-BR");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.id as string);
    },
  });

  // Extras do Sócio — união das duas naturezas (despesa paga pela empresa + registo manual).
  // Ambas abatem ao acerto do sócio e nenhuma é custo do evento.
  const { data: partnerAdvances = [], error: partnerAdvancesError } = useQuery({
    queryKey: ["partner-advance-expenses", allEventIdsKey],
    queryFn: () => fetchPartnerExtras(allEventIds),
  });

  // BP (forecast) for BP × Real reconciliation
  const { data: forecasts = [], error: forecastsError } = useQuery({
    queryKey: ["event-forecasts-settlement", allEventIdsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
          .select("id, event_id, description, type, amount, iva_rate, status, is_overhead, master_forecast_id, transaction_id, paying_partner_id, category_id, event_settlement_id, account_categories(name, code)")
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
  const { data: ticketBreakdown = [], error: ticketBreakdownError } = useQuery({
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
  const { data: ticketSales = [], error: ticketSalesError } = useQuery({
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

  // (g11) Nenhuma falha de leitura do Encontro de Contas pode ficar silenciosa:
  // um erro aqui significa números errados no ecrã, não apenas dados em falta.
  const settlementQueryErrors: Array<[unknown, string]> = [
    [settlementsError, "Não foi possível carregar os apuramentos do evento"],
    [participantsError, "Não foi possível carregar os sócios do apuramento"],
    [transactionsError, "Não foi possível carregar as transações do evento"],
    [paidExpensesError, "Não foi possível carregar as despesas pagas pelo sócio"],
    [revenuesHeldError, "Não foi possível carregar receitas em poder do sócio"],
    [partnerAdvancesError, "Não foi possível carregar os extras do sócio"],
    [forecastsError, "Não foi possível carregar o Business Plan"],
    [ticketBreakdownError, "Não foi possível carregar o detalhe de bilheteira"],
    [ticketSalesError, "Não foi possível carregar as vendas de bilheteira"],
  ];
  const settlementErrorKey = settlementQueryErrors
    .filter(([err]) => !!err)
    .map(([err, label]) => `${label}: ${(err as any)?.message ?? ""}`)
    .join(" | ");

  useEffect(() => {
    if (!settlementErrorKey) return;
    for (const msg of settlementErrorKey.split(" | ")) {
      const [label, detail] = msg.split(/: (.*)/s);
      toast({
        variant: "destructive",
        title: label,
        description: detail || "Os valores apresentados podem estar incompletos.",
      });
    }
  }, [settlementErrorKey]);

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

  const eventRevenueNet = (hasTicketSales ? ticketRevenueNet : 0)
    + revenueTxForTotals.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const eventRevenueGross = (hasTicketSales ? ticketRevenueGross : 0)
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

  const eventExpensesNet = sumLines(expenseSourceLines, false) + overheadNet + outsideBpNet;
  const eventExpensesGross = sumLines(expenseSourceLines, true) + overheadGross + outsideBpGross;

  // ── O Encontro de Contas calcula o APURAMENTO ACTIVO, não o evento (#146 (e2)) ──
  // Raiz = totais do evento menos as linhas marcadas com outros apuramentos.
  // Filho = só as suas linhas marcadas + quota do pai + activos adicionais das
  // operações de terceiros. Evento com um único apuramento e sem linhas marcadas
  // → totais do evento, exactamente como antes (paridade obrigatória).
  const activeNode = engine.result?.nodes.find((n) => n.id === activeSettlementId) ?? null;
  const useNodeTotals = !!activeNode && (eventSettlements as any[]).length > 1;
  const parentNode = activeNode?.parentId
    ? engine.result?.nodes.find((n) => n.id === activeNode.parentId) ?? null
    : null;

  const totalRevenueNet = useNodeTotals
    ? activeNode!.perimeter.revenueNet +
      activeNode!.additionalActiveTotal +
      (activeNode!.parentQuota ?? 0) +
      // (g1/g2) o IVA dedutível devolvido pelo fechamento acima é receita deste
      // fechamento — sem isto o ecrã mostrava a nota mas não somava o valor.
      activeNode!.vatReturnedIn
    : eventRevenueNet;
  // A receita é sempre s/IVA (D24): num nó, bruto = líquido.
  const totalRevenueGross = useNodeTotals ? totalRevenueNet : eventRevenueGross;
  const totalExpensesNet = useNodeTotals ? activeNode!.perimeter.expensesNet : eventExpensesNet;
  const totalExpensesGross = useNodeTotals ? activeNode!.perimeter.expensesGross : eventExpensesGross;


  const calcBasis = normalizePartnerCalcBasis(event?.partner_calc_basis);
  const revenueBase = getPartnerRevenueBase(totalRevenueNet);
  // VISTA (resumo global + PDF): o seletor c/IVA move o que se VÊ.
  const expenseBase = ignoresOperationalExpenses(calcBasis)
    ? 0
    : (basis.withVat ? totalExpensesGross : totalExpensesNet);
  const resultBase = revenueBase - expenseBase;
  // APURAMENTO (D-ERP4/D-ERP9): base contratual do evento — nunca o seletor.
  // Serve de omissão para os sócios sem regra própria e de âncora dos pools de
  // liquidez/caução (que são do evento, não de cada sócio).
  const expenseBaseEvent = ignoresOperationalExpenses(calcBasis)
    ? 0
    : (partnerUsesGrossExpenses(calcBasis, null) ? totalExpensesGross : totalExpensesNet);
  const resultBaseEvent = revenueBase - expenseBaseEvent;



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
    // que a secção "Despesas por Categoria" reflita o mesmo total de despesas do Resumo Financeiro.
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

  // ---- Partes do apuramento (a casa já vem como linha real; sem injeção) ----
  // A casa só entra quando tem quota residual (>0), como acontecia antes.
  const allPartners = (partners as any[]).filter(
    (p) => !p.isHouse || Number(p.percentage || 0) > 0.0001,
  );

  // Sem sócios: a mensagem sai no fim (a seguir a TODOS os hooks). Um `return`
  // aqui saltava o `useEffect` da exportação por sócio e rebentava a vista
  // ("Rendered more hooks than during the previous render").
  const hasNoPartners = allPartners.length === 0;


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
  // (g12) Rubrica de Nível 2 da categoria — usada só para agrupar o detalhe do desembolso.
  const categoryL2Label = (catId?: string | null): string => {
    if (!catId) return "Sem rubrica";
    const chain: Array<{ code: string; name: string }> = [];
    let cur = catByIdAll[catId];
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      chain.unshift({ code: cur.code, name: cur.name });
      if (!cur.parent_id) break;
      const parent = catByIdAll[cur.parent_id];
      if (!parent) break;
      cur = parent;
    }
    const node = chain[1] ?? chain[chain.length - 1];
    if (!node) return "Sem rubrica";
    return node.code ? `${node.code} ${node.name}` : node.name;
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
  // Movimentos do ramo 10.1 · Capital (AEP) NUNCA são cauções da casa — são aportes,
  // devoluções de aporte e distribuições de resultado. A exclusão é por RUBRICA (código),
  // logo não depende de a ponte partner_capital_moves estar preenchida.
  const isHouseTransitory = (t: any) =>
    !partnerLinkedTxIds.has(t.id) && !isCapitalCategoryCode(t.account_categories?.code);
  const houseTransitoryExpenses = transitoryTxsAll
    .filter((t: any) => t.type === "expense" && isHouseTransitory(t))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const houseTransitoryIncomes = transitoryTxsAll
    .filter((t: any) => t.type === "income" && isHouseTransitory(t))
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const houseTransitoryCredit = Math.max(0, houseTransitoryExpenses - houseTransitoryIncomes);
  const houseTransitoryItems = transitoryTxsAll
    .filter((t: any) => isHouseTransitory(t))
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
    // BASE EFETIVA DO SÓCIO: override do sócio, com o contrato do evento como omissão.
    // O seletor de vista (basis.withVat) NÃO entra aqui (D-ERP4/D-ERP9).
    // O modo de apuramento escolhido pelo utilizador pode forçar a regra geral do
    // evento ou respeitar o contrato individual. Em modo "contract", a casa
    // (Mundo Propício) apura sempre s/IVA por convenção da empresa gestora.
    const rawOverride = p.expense_includes_iva === null || p.expense_includes_iva === undefined
      ? null
      : !!p.expense_includes_iva;
    const override = calcMode === "event" ? null : (isHouse ? false : rawOverride);
    const usesGrossExpenses = partnerUsesGrossExpenses(calcBasis, override);
    // (g10) Num fechamento que devolve o IVA dedutível, a base EFETIVA é s/IVA.
    const expenseBasisLabel = isHouse && calcMode === "contract"
      ? "Despesas s/IVA · convenção da empresa gestora"
      : activeNode?.returnsParentDeductibleVat
        ? effectiveExpenseBasisLabel({ usesGrossExpenses, returnsParentDeductibleVat: true })
        : describePartnerExpenseBasis(calcBasis, override);

    const expenses = ignoresOperationalExpenses(calcBasis)
      ? 0
      : (usesGrossExpenses ? totalExpensesGross : totalExpensesNet);

    const result = ignoresOperationalExpenses(calcBasis) ? revenueBase : revenueBase - expenses;
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
              amount: usesGrossExpenses
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
          .filter((pe) => pe.partner_id === p.id && pe.kind !== "disbursement_adjustment")
          .map((pe) => ({
            origem: pe.origem,
            originLabel: ORIGIN_LABEL[pe.origem],
            description: pe.description,
            // Manual não tem IVA por definição — a base gross só se aplica à origem 'transacao'.
            amount: usesGrossExpenses && pe.origem === "transacao"
              ? calcTotalWithIva(Number(pe.amount), Number(pe.iva_rate || 0))
              : Number(pe.amount),
            date: pe.data || "",
            category: pe.category || "—",
            cityLabel: cityLabelByEvent[pe.event_id] || "—",
          }));
    const totalPartnerExtras = extrasForPartner.reduce((s, e) => s + e.amount, 0);

    // (g4 precisão / D-ERP14) Linhas de BP em nome do sócio que nunca viraram transação:
    // o fornecedor factura ao sócio e ele refactura à MP. Entram no desembolso efectivo.
    // (g5) Desembolso: s/IVA por defeito; c/IVA só quando o sócio não deduz IVA em PT.
    const disbursementGross = !!p.supplier_id && (grossDisbursementSupplierIds as string[]).includes(p.supplier_id);
    const paidTxIds = new Set(
      (paidExpenses as any[])
        .filter((pe) => pe.partner_id === p.id && pe.transaction_id)
        .map((pe) => pe.transaction_id as string),
    );
    const bpPaidLines = isHouse
      ? []
      : collectBpPaidLines(forecasts as any[], p.id, disbursementGross, cityLabelByEvent, paidTxIds);
    const totalBpPaidByPartner = sumLineAmounts(bpPaidLines);
    const totalDisbursement = partnerDisbursement(totalPaidByPartner, totalBpPaidByPartner);

    // (g5·B) Ajustes manuais ao desembolso.
    const disbursementAdjustments = isHouse
      ? []
      : collectDisbursementAdjustments(
          (partnerAdvances as any[]).map((e) => ({ ...e, kind: e.kind })),
          p.id,
          cityLabelByEvent,
        );
    const totalDisbursementAdjustments = sumLineAmounts(disbursementAdjustments);

    // (g5·C / issue #133) Receitas em poder do sócio (3 fontes).
    const heldRows = (revenuesHeldRaw as RevenueHeldRow[]).map((r) =>
      r.partnerId === `supplier:${p.supplier_id ?? ""}` ? { ...r, partnerId: p.id } : r,
    );
    const revenuesHeld = isHouse ? [] : collectRevenuesHeld(heldRows, p.id);
    const totalRevenuesHeld = sumLineAmounts(revenuesHeld);
    const financingToReturn = partnerFinancingToReturn(
      totalDisbursement,
      totalDisbursementAdjustments,
      totalRevenuesHeld,
    );
    const totalAdvanced = partnerAdvancedTotal(totalPartnerExtras);

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
      supplierId: p.supplier_id ?? null,
      isHouse,
      percentage: Number(p.percentage),
      lossPercentage: p.loss_percentage != null ? Number(p.loss_percentage) : null,
      effectivePercentage,
      expenseIncludesIva: override,
      usesGrossExpenses,
      expenseBasisLabel,
      calcBasis,
      revenue,
      expenses,
      result,
      partnerShare,
      paidExpenses: partnerExpenses,
      totalPaidByPartner,
      partnerExtras: extrasForPartner,
      totalPartnerExtras,
      bpPaidLines,
      totalBpPaidByPartner,
      totalDisbursement,
      revenuesHeld,
      totalRevenuesHeld,
      disbursementAdjustments,
      totalDisbursementAdjustments,
      financingToReturn,
      totalAdvanced,
      transitoryCredit: 0, // calculado abaixo
      transitoryItems,
      resultRepasseNow: 0,
      resultPendingByCash: 0,
      transitoryOffset: 0,
      equityContribution: 0,
      operationalSettlement: 0, // calculado abaixo
      transferWithVat: (p as any).transfer_with_vat === true,
      transferBase: 0,      // calculado abaixo
      transferVat: 0,
      transferTotal: 0,
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

  // Pools de liquidez/caução são do EVENTO — ancorados à base contratual, nunca ao seletor.
  const baseResult = ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBaseEvent;
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
    // (g4 adenda) Base a transferir ao sócio e IVA do repasse quando facturado.
    // Desembolso efectivo do sócio (transações + BP sem transação) e tudo o que já lhe
    // chegou (extras/adiantamentos + entradas nas contas de acerto).
    // (g5·D) parte + desembolso ± ajustes − receitas em poder − extras/adiantamentos.
    s.transferBase = roundCents(s.partnerShare + s.financingToReturn - s.totalAdvanced);
    s.transferVat =
      s.transferWithVat && s.transferBase > 0 ? calcIvaAmount(s.transferBase, TRANSFER_IVA_RATE) : 0;
    s.transferTotal = roundCents(s.transferBase + s.transferVat);
  });

  // ---- Reconciliação interna da posição real da Mundo Propício ----
  // A base de apresentação segue o contrato do evento (pode ser c/IVA quando há
  // sócios brasileiros), mas a posição real da empresa portuguesa é s/IVA. Este
  // bloco é leitura interna e não entra no PDF.
  const resultRealNet = revenueBase - totalExpensesNet;
  const externalShares = settlements
    .filter((s) => !s.isHouse)
    .reduce((a, s) => a + s.partnerShare, 0);
  const housePositionReal = resultRealNet - externalShares;
  const houseNominalShare = settlements.find((s) => s.isHouse)?.partnerShare ?? 0;
  const houseIvaGain = housePositionReal - houseNominalShare;
  // (g14) IVA pago e legalmente não dedutível: CUSTO real, informativo aqui.
  const vatNotReturnedTotal = engine.result?.house.vatNonRecoverableCost ?? 0;
  const vatNotReturnedLines = (engine.result?.nodes ?? [])
    .filter((n) => n.vatNotReturned !== 0)
    .flatMap((n) => n.vatNonRecoverableLines);

  const hasHouse = settlements.some((s) => s.isHouse);
  const showHouseInternalPosition = hasHouse && !ignoresOperationalExpenses(calcBasis);

  // Bases efetivas distintas no mesmo evento: contratos diferentes → não existe um
  // resultado único e a soma das quotas não fecha contra um único número. Informativo.
  const distinctExpenseBases = new Set(settlements.map((s) => s.usesGrossExpenses));
  const hasMixedExpenseBases = distinctExpenseBases.size > 1;
  const mixedBasesNote =
    "Sócios com bases de cálculo diferentes neste evento: a quota de cada um é calculada na base do respetivo contrato, pelo que não existe um resultado único e a soma das quotas não fecha contra um único total.";

  /**
   * (g15) RELATÓRIO INTERNO do Encontro de Contas — vista de staff.
   *
   * Não recalcula nada: junta os números das fontes únicas (motor dos
   * fechamentos, critério de custo do evento, desembolso do sócio) e entrega-os
   * ao gerador. A cascata prova-se contra o resultado do fechamento do motor.
   */
  function exportInternalReport() {
    const nodes = engine.result?.nodes ?? [];
    const rootNode = nodes.find((n) => !n.parentId) ?? null;
    const settlementName =
      (eventSettlements as any[]).find((s) => s.id === activeSettlementId)?.name ?? "Fechamento do evento";

    const rootTotals = rootNode
      ? {
          revenueNet: rootNode.perimeter.revenueNet,
          expensesNet: rootNode.perimeter.expensesNet,
          expensesGross: rootNode.perimeter.expensesGross,
          usesGrossExpenses: rootNode.nodeUsesGrossExpenses,
        }
      : {
          revenueNet: eventRevenueNet,
          expensesNet: eventExpensesNet,
          expensesGross: eventExpensesGross,
          usesGrossExpenses: partnerUsesGrossExpenses(calcBasis, null),
        };

    // Cadeia de nós acima do activo (igual à cascata do documento do sócio, g13),
    // aqui com os nomes visíveis porque é peça interna.
    const chain: typeof nodes = [];
    for (let cur = activeNode; cur?.parentId; cur = nodes.find((n) => n.id === cur!.parentId) ?? null) {
      chain.unshift(cur);
    }
    const cascadeSteps = chain.map((node) => {
      const parent = nodes.find((n) => n.id === node.parentId) ?? null;
      const baseValue =
        node.parentQuotaBasis === "net_result_gross_expenses" ? parent?.resultGross ?? 0 : parent?.resultNet ?? 0;
      return {
        baseValue,
        quotaPct: Number(node.parentSharePct ?? 0),
        quota: Number(node.parentQuota ?? 0),
        deductions: (parent?.participants ?? [])
          .filter((p) => p.kind !== "house")
          .map((p) => ({
            name: p.name,
            mode: p.mode,
            percentage: p.effectivePct,
            value: p.share,
          })),
      };
    });

    const exclusiveRevenues = (incomeTransactions as any[])
      .filter((tx: any) => tx.event_settlement_id && tx.event_settlement_id === activeSettlementId)
      .map((tx: any) => ({
        label: tx.description || tx.account_categories?.name || "—",
        value: Number(tx.amount) || 0,
      }));

    const nodeForTotals = activeNode ?? rootNode;
    const nodeResult = nodeForTotals
      ? nodeForTotals.nodeUsesGrossExpenses
        ? nodeForTotals.resultGross
        : nodeForTotals.resultNet
      : rootTotals.revenueNet - (rootTotals.usesGrossExpenses ? rootTotals.expensesGross : rootTotals.expensesNet);

    // Onde cada participante acerta (nome do fechamento) e o modo do participante.
    const settlementNameById = new Map<string, string>(
      (eventSettlements as any[]).map((s) => [s.id as string, (s.name as string) || "—"]),
    );
    const modeByParticipant = new Map<string, "settles" | "nominal">(
      (partners as any[]).map((p) => [p.id as string, (p.mode === "nominal" ? "nominal" : "settles")]),
    );
    const settlesAtOf = (supplierId: string | null) => {
      if (!supplierId) return settlementName;
      const hit = (allParticipants as any[]).find((p) => p.supplier_id === supplierId && p.mode === "settles");
      return hit ? settlementNameById.get(hit.settlement_id) ?? "—" : "—";
    };

    const distribution = settlements.map((s) => ({
      name: s.partnerName,
      isHouse: s.isHouse,
      mode: modeByParticipant.get(s.partnerId) ?? "settles",
      profitPct: s.percentage,
      lossPct: s.lossPercentage,
      basisLabel: s.expenseBasisLabel,
      share: s.partnerShare,
      settlesAt: s.isHouse ? settlementName : settlesAtOf(s.supplierId),
    }));

    const partnerBlocks = settlements
      .filter((s) => !s.isHouse)
      .map((s) => ({
        name: s.partnerName,
        mode: modeByParticipant.get(s.partnerId) ?? "settles",
        settlesAt: settlesAtOf(s.supplierId),
        profitPct: s.percentage,
        lossPct: s.lossPercentage,
        partnerShare: s.partnerShare,
        disbursement: s.totalDisbursement,
        adjustmentsTotal: s.totalDisbursementAdjustments,
        revenuesHeldTotal: s.totalRevenuesHeld,
        extrasTotal: s.totalAdvanced,
        transferBase: s.transferBase,
        transferWithVat: s.transferWithVat,
        transferVat: s.transferVat,
        transferTotal: s.transferTotal,
        bpLines: s.bpPaidLines.map((l) => ({
          rubrica: categoryL2Label(l.categoryId),
          description: l.description,
          cityLabel: l.cityLabel,
          hasTransaction: l.hasTransaction,
          amount: l.amount,
        })),
        bpTotal: s.totalBpPaidByPartner,
        paidExpenses: s.paidExpenses.map((e) => ({
          description: e.description,
          cityLabel: e.cityLabel,
          category: e.category,
          date: e.date,
          amount: e.amount,
        })),
        paidExpensesTotal: s.totalPaidByPartner,
        adjustments: s.disbursementAdjustments.map((a) => ({
          description: a.description,
          cityLabel: a.cityLabel,
          date: a.date,
          amount: a.amount,
        })),
        revenuesHeld: s.revenuesHeld.map((r) => ({
          sourceLabel: REVENUE_HELD_SOURCE_LABEL[r.source],
          accountName: r.accountName,
          description: r.description,
          date: r.date,
          amount: r.amount,
        })),
        extras: s.partnerExtras.map((e) => ({
          originLabel: e.originLabel,
          description: e.description,
          cityLabel: e.cityLabel,
          date: e.date,
          amount: e.amount,
        })),
        transitoryItems: s.transitoryItems,
        transitoryCredit: s.transitoryCredit,
      }));

    // Anexo A — bilheteira no agrupamento escolhido no ecrã.
    const groupLabel: Record<TicketGroupMode, string> = {
      sub_date_session: "Cidade / Data / Sessão",
      session: "Sessão",
      day: "Dia",
      zone: "Zona",
      lot: "Lote",
    };
    const keyOf = (r: TicketBreakdownRow) => {
      switch (ticketGroupMode) {
        case "session":
          return r.sessionLabel;
        case "day":
          return r.dayLabel;
        case "zone":
          return r.zoneName;
        case "lot":
          return r.lotName;
        default:
          return [r.cityName, r.dayLabel, r.sessionLabel].filter(Boolean).join(" · ");
      }
    };
    const ticketMap = new Map<string, { label: string; quantity: number; totalGross: number }>();
    (ticketBreakdown as TicketBreakdownRow[]).forEach((r) => {
      const k = keyOf(r) || "—";
      const cur = ticketMap.get(k) ?? { label: k, quantity: 0, totalGross: 0 };
      cur.quantity += r.quantity;
      cur.totalGross += r.totalGross;
      ticketMap.set(k, cur);
    });
    const ticketing = [...ticketMap.values()].sort((a, b) => a.label.localeCompare(b.label));

    // Anexo B — despesas por categoria NA BASE DO CRITÉRIO (não transações).
    const docLines = keepRootPerimeter(
      collectSettlementExpenseDocLines({
        events: subEvents as any[],
        transactions: transactions as any[],
        forecasts: forecasts as any[],
        ticketSales: ticketSales as any[],
        basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
      }),
      rootSettlementIds,
    );
    const levelsOf = (catId: string | null | undefined) => {
      const chainCats: any[] = [];
      let cur = catId ? catByIdAll[catId] : undefined;
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        chainCats.unshift(cur);
        if (!cur.parent_id) break;
        const parent = catByIdAll[cur.parent_id];
        if (!parent) break;
        cur = parent;
      }
      const l1 = chainCats[0];
      const l2 = chainCats[1] ?? chainCats[0];
      const l3 = chainCats[2] ?? chainCats[1] ?? chainCats[0];
      return { l1, l2, l3 };
    };
    const catMap = new Map<string, any>();
    for (const l of docLines) {
      const { l1, l2, l3 } = levelsOf(l.categoryId);
      const key = `${l1?.code ?? "_"}|${l2?.code ?? "_"}|${l3?.code ?? "_"}`;
      const row =
        catMap.get(key) ??
        {
          l1Code: l1?.code ?? "",
          l1Name: l1?.name ?? "Sem categoria",
          l2Code: l2?.code ?? "",
          l2Name: l2?.name ?? "Sem categoria",
          l3Code: l3?.code ?? "",
          l3Name: l3?.name ?? "Sem categoria",
          base: 0,
          iva: 0,
          total: 0,
        };
      const total = calcTotalWithIva(l.base, l.ivaRate);
      row.base += l.base;
      row.iva += total - l.base;
      row.total += total;
      catMap.set(key, row);
    }

    exportPartnerSettlementInternalPdf({
      eventName,
      settlementName,
      criterion: describeFechoBasis(basis),
      rootTotals,
      cascadeSteps,
      vatReturnedIn: activeNode?.vatReturnedIn ?? 0,
      exclusiveRevenues,
      exclusiveRevenuesTotal: activeNode?.perimeter.revenueNet ?? 0,
      exclusiveExpensesTotal: activeNode
        ? activeNode.nodeUsesGrossExpenses
          ? activeNode.perimeter.expensesGross
          : activeNode.perimeter.expensesNet
        : 0,
      thirdPartyOperations: (activeNode?.operations ?? [])
        .filter((o) => Math.abs(o.additionalActive) > 0.004)
        .map((o) => ({ label: o.name, value: o.additionalActive })),
      thirdPartyTotal: activeNode?.additionalActiveTotal ?? 0,
      addbacks: (activeNode?.addbacks ?? []).map((a) => ({ label: a.label, value: a.value })),
      addbackTotal: activeNode?.addbackIn ?? 0,
      nodeResult,
      distribution,
      partners: partnerBlocks,
      house: showHouseInternalPosition
        ? {
            resultRealNet,
            deductions: settlements
              .filter((s) => !s.isHouse)
              .map((s) => ({ name: s.partnerName, basisLabel: s.expenseBasisLabel, value: s.partnerShare })),
            positionReal: housePositionReal,
            nominalShare: houseNominalShare,
            ivaDeductibleGain: houseIvaGain,
            vatNonRecoverableCost: vatNotReturnedTotal,
            vatNonRecoverableLines: vatNotReturnedLines.map((l) => ({ label: l.label, vat: l.vat })),
          }
        : null,
      ticketing,
      ticketingGroupLabel: groupLabel[ticketGroupMode],
      expenseCategories: [...catMap.values()],
      expenseCategoryLevel,
    });
  }


  /**
   * (g4) DOCUMENTO DO SÓCIO — padrão da prestação de contas, estanque.
   * Só o destinatário aparece pelo nome; os restantes participantes colapsam
   * numa linha ("Sócios locais" ou "Mundo Propício" quando é o único outro).
   */
  async function buildSoloDocInput(
    row: PartnerSettlement,
    logoDataUrl?: string | null,
  ): Promise<PartnerStatementDocInput> {
    let locale: DocLocale = "pt-PT";
    if (row.supplierId) {
      const { data } = await supabase
        .from("suppliers")
        .select("doc_locale")
        .eq("id", row.supplierId)
        .maybeSingle();
      locale = (((data as any)?.doc_locale as DocLocale) ?? "pt-PT") as DocLocale;
    }
    const t = statementTerms(locale);

    // (g13) As despesas do documento vêm SEMPRE da mesma fonte dos totais do
    // evento (critério do Fecho: realizado ou previsto + excedido, overhead pelo
    // toggle) e do perímetro da raiz — nunca do apuramento do sócio.
    const expenseLines = keepRootPerimeter(
      collectSettlementExpenseDocLines({
        events: subEvents as any[],
        transactions: transactions as any[],
        forecasts: forecasts as any[],
        ticketSales: ticketSales as any[],
        basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
      }),
      rootSettlementIds,
    ).map((l) => ({
      categoryId: l.categoryId,
      description: l.description,
      base: l.base,
      ivaRate: l.ivaRate,
    }));

    // Receitas: bilheteira agregada por sessão/zona + restantes receitas linha a linha.
    const revenues = [
      ...(ticketBreakdown as TicketBreakdownRow[]).map((r) => ({
        origin: t.ticketing,
        description: [r.cityName, r.sessionLabel, r.zoneName, r.lotName].filter(Boolean).join(" · "),
        net: r.totalNet,
      })),
      // (g13) Só as receitas do evento: as exclusivas da sociedade aparecem na
      // conta do resultado, itemizadas, e nunca somadas às receitas do evento.
      ...keepRootPerimeter(revenueTxForTotals as any[], rootSettlementIds).map((tx: any) => ({
        origin: tx.account_categories?.name || "Outras receitas",
        description: tx.description || "—",
        net: Number(tx.amount) || 0,
      })),
    ];

    // (g13) CASCATA: quando o acordo do sócio apura sobre uma parte do resultado
    // do evento, a conta parte do resultado do evento e deduz, PELO NOME, as
    // partes dos sócios de cada acordo acima. Os sócios do mesmo acordo e os
    // acordos ao lado ou abaixo continuam invisíveis.
    const nodes = engine.result?.nodes ?? [];
    const chain: typeof nodes = [];
    for (let cur = activeNode; cur?.parentId; cur = nodes.find((n) => n.id === cur!.parentId) ?? null) {
      chain.unshift(cur);
    }
    const cascade =
      chain.length > 0
        ? {
            levels: chain.map((node) => {
              const parent = nodes.find((n) => n.id === node.parentId) ?? null;
              const baseValue =
                node.parentQuotaBasis === "net_result_gross_expenses"
                  ? parent?.resultGross ?? 0
                  : parent?.resultNet ?? 0;
              return {
                baseValue,
                quotaPct: Number(node.parentSharePct ?? 0),
                quota: Number(node.parentQuota ?? 0),
                deductions: (parent?.participants ?? [])
                  .filter((p) => p.kind !== "house" && p.name !== row.partnerName)
                  .map((p) => ({ name: p.name, percentage: p.effectivePct, value: p.share })),
              };
            }),
          }
        : null;

    const exclusiveRevenues = (incomeTransactions as any[])
      .filter((tx: any) => tx.event_settlement_id && tx.event_settlement_id === activeSettlementId)
      .map((tx: any) => ({
        label: tx.description || tx.account_categories?.name || "—",
        value: Number(tx.amount) || 0,
      }));

    const extras: Array<{ label: string; value: number; items?: Array<{ label: string; value: number }> }> = [];
    if (activeNode?.vatReturnedIn) extras.push({ label: "IVA dedutível recuperado", value: activeNode.vatReturnedIn });
    if (cascade && activeNode?.perimeter.revenueNet)
      extras.push({
        label: "Receitas exclusivas da sociedade",
        value: activeNode.perimeter.revenueNet,
        items: exclusiveRevenues,
      });
    // (g6) Custos do evento devolvidos a este fechamento (internos da sociedade).
    if (activeNode?.addbackIn)
      extras.push({
        label: "Custos internos da sociedade",
        value: activeNode.addbackIn,
      });
    if (activeNode?.additionalActiveTotal)
      extras.push({
        label: "Operações de terceiros — resultado adicional",
        value: activeNode.additionalActiveTotal,
        items: (activeNode.operations ?? [])
          .filter((o) => Math.abs(o.additionalActive) > 0.004)
          .map((o) => ({ label: o.name, value: o.additionalActive })),
      });

    return {
      locale,
      eventName,
      eventDate: (subEvents as any[]).find((se) => se.id === eventId)?.date ?? null,
      eventLocation: ((event as any)?.cities as any)?.name ?? null,
      logoDataUrl: logoDataUrl ?? null,
      recipientName: row.partnerName,
      paidByPartner: row.totalDisbursement,
      disbursementAdjustments: row.totalDisbursementAdjustments,
      revenuesHeld: row.revenuesHeld.map((r) => ({
        label: `${REVENUE_HELD_SOURCE_LABEL[r.source]} · ${r.accountName}`,
        value: r.amount,
      })),
      partnerExtras: row.totalPartnerExtras,
      partnerAdvances: 0,
      transferWithVat: row.transferWithVat,
      participants: settlements.map((s) => ({
        name: s.partnerName,
        percentage: s.effectivePercentage,
        isHouse: s.isHouse,
      })),
      categories: allCategories as any[],
      usesGrossExpenses: activeNode?.nodeUsesGrossExpenses ?? row.usesGrossExpenses,
      returnsDeductibleVat: activeNode?.returnsParentDeductibleVat ?? false,
      expenseLines,
      revenues,
      extras,
      cascade,
      resultOverride: row.result,
      recipientShareOverride: row.partnerShare,
    };
  }

  async function exportSoloDoc(row: PartnerSettlement, kind: "pdf" | "xlsx") {
    try {
      const branding = kind === "pdf" ? await fetchExportBranding() : null;
      const input = await buildSoloDocInput(row, branding?.logoDataUrl ?? null);
      if (kind === "pdf") exportPartnerStatementDocPdf(input);
      else await exportPartnerStatementDocExcel(input);
    } catch (err: any) {
      console.error(err);
    }
  }

  /** Pede o documento de um sócio no fechamento onde ele acerta. */
  function requestSoloPdf(row: PartnerSettlement, kind: "pdf" | "xlsx" = "pdf") {
    const inferred = inferSettlesSettlementId(allParticipants as any[], row.supplierId);
    if (!inferred || inferred === activeSettlementId) {
      void exportSoloDoc(row, kind);
      return;
    }
    setPendingSoloKind(kind);
    setSelectedSettlementId(inferred);
    // Guarda-se o fornecedor, não a linha: ao mudar de fechamento a linha é
    // outra (mesmo sócio, participação diferente).
    setPendingSoloPartnerId(row.supplierId ?? row.partnerId);
  }

  useEffect(() => {
    if (!pendingSoloPartnerId) return;
    const row =
      settlements.find((r) => r.supplierId === pendingSoloPartnerId) ??
      settlements.find((r) => r.partnerId === pendingSoloPartnerId);
    if (!row) {
      setPendingSoloPartnerId(null);
      return;
    }
    const inferred = inferSettlesSettlementId(allParticipants as any[], row.supplierId);
    if (inferred && inferred !== activeSettlementId) return;
    void exportSoloDoc(row, pendingSoloKind);
    setPendingSoloPartnerId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSoloPartnerId, activeSettlementId, settlements]);

  if (hasNoPartners) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold flex items-center gap-2">Encontro de Contas <HelpTooltip text={helpTexts.partnerSettlement} size={14} /></h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(eventSettlements as any[]).length > 1 && (
            <Select
              value={activeSettlementId ?? ""}
              onValueChange={(v) => setSelectedSettlementId(v)}
            >
              <SelectTrigger className="h-8 w-[260px] text-xs">
                <SelectValue placeholder="Fechamento" />
              </SelectTrigger>
              <SelectContent>
                {(eventSettlements as any[]).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.parent_id ? `↳ ${s.name}` : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          <Select value={calcMode} onValueChange={(v) => setCalcMode(v as CalcMode)}>
            <SelectTrigger className="h-8 w-[300px] text-xs">
              <SelectValue placeholder="Fechamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contract">Cálculo: por contrato de cada sócio</SelectItem>
              <SelectItem value="event">Cálculo: pela regra geral do evento</SelectItem>
            </SelectContent>
          </Select>
          <FechoBasisSelector basis={basis} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportInternalReport()}>Relatório completo (gestão)</DropdownMenuItem>
              {settlements.some((s) => !s.isHouse) && <DropdownMenuSeparator />}
              {settlements.filter((s) => !s.isHouse).map((s) => (
                <React.Fragment key={s.partnerId}>
                  <DropdownMenuItem onClick={() => requestSoloPdf(s, "pdf")}>
                    Prestação de contas · {s.partnerName} (PDF)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => requestSoloPdf(s, "xlsx")}>
                    Prestação de contas · {s.partnerName} (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void exportDisbursementExcel({
                        eventName,
                        partnerName: s.partnerName,
                        paidExpenses: s.paidExpenses,
                        totalPaidByPartner: s.totalPaidByPartner,
                        bpPaidLines: s.bpPaidLines,
                        totalBpPaidByPartner: s.totalBpPaidByPartner,
                        totalDisbursement: s.totalDisbursement,
                        adjustments: s.disbursementAdjustments,
                        totalAdjustments: s.totalDisbursementAdjustments,
                        revenuesHeld: s.revenuesHeld,
                        totalRevenuesHeld: s.totalRevenuesHeld,
                        financingToReturn: s.financingToReturn,
                      })
                    }
                  >
                    Desembolso de {s.partnerName} (Excel)
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Origem da quota — vista da EQUIPA (pode nomear o fechamento de origem).
          Nos documentos de sócio e no Portal usa-se `quotaOriginText` (#146 (f)). */}
      {activeNode?.parentId && parentNode && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
          <p className="font-semibold">
            {activeNode.name} <span className="font-normal text-muted-foreground">· origem: {parentNode.name}</span>
          </p>
          <p className="text-muted-foreground">
            {quotaOriginText(
              {
                parentResult:
                  activeNode.parentQuotaBasis === "net_result_gross_expenses"
                    ? parentNode.resultGross
                    : parentNode.resultNet,
                grossExpenses: activeNode.parentQuotaBasis === "net_result_gross_expenses",
                sharePct: activeNode.parentSharePct ?? 0,
                quota: activeNode.parentQuota ?? 0,
              },
              formatCurrency,
            )}
            {activeNode.additionalActiveTotal !== 0 && (
              <> · activos adicionais {formatCurrency(activeNode.additionalActiveTotal)}</>
            )}
          </p>
          {/* (g1) Regra "devolve o IVA dedutível do fechamento acima". */}
          {activeNode.vatReturnedIn !== 0 && (
            <p className="mt-1 text-muted-foreground">
              IVA dedutível devolvido: {formatCurrency(activeNode.vatReturnedIn)} — o IVA que{" "}
              {parentNode.name} suportou como custo é recuperado por este fechamento.
            </p>
          )}
          {/* (g6) Custos internos da sociedade devolvidos a este fechamento. */}
          {activeNode.addbackIn !== 0 && (
            <p className="mt-1 text-muted-foreground">
              Custos do evento devolvidos a este fechamento (internos da sociedade): +
              {formatCurrency(activeNode.addbackIn)} — contam no fechamento de cima e voltam por
              inteiro a este.
            </p>
          )}
        </div>
      )}

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
        {hasMixedExpenseBases && (
          <p className="mt-1 text-[10px] leading-snug text-amber-600 dark:text-amber-500">{mixedBasesNote}</p>
        )}
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

      {/* Capital do Sócio (AEP) — bloco INFORMATIVO, fora de qualquer soma do acerto */}
      <PartnerCapitalPanel eventId={eventId} summaryOnly />



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
              <span className="text-[10px] text-muted-foreground">{s.expenseBasisLabel}</span>
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
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
              {!s.isHouse && (
                <>
                  <div>
                    <span className="text-xs text-muted-foreground" title="Transações pagas pelo sócio + linhas de BP em nome dele sem transação">
                      Desembolso efectivo (+)
                    </span>
                    <p className="font-mono font-bold text-success">{formatCurrency(s.totalDisbursement)}</p>
                  </div>
                  {s.totalDisbursementAdjustments !== 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground" title="Ajustes manuais ao desembolso do sócio">
                        Ajustes ao desembolso (±)
                      </span>
                      <p className="font-mono font-bold">{formatCurrency(s.totalDisbursementAdjustments)}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-muted-foreground" title="Contas de acerto do sócio, receitas em contas dele e operações de terceiros retidas por ele">
                      Receitas em poder do sócio (−)
                    </span>
                    <p className="font-mono font-bold text-destructive">{formatCurrency(s.totalRevenuesHeld)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground" title="Desembolso ± ajustes − receitas em poder do sócio">
                      Financiamento a devolver
                    </span>
                    <p className="font-mono font-bold">{formatCurrency(s.financingToReturn)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground" title="Extras/adiantamentos ao sócio">
                      Já adiantado (−)
                    </span>
                    <p className="font-mono font-bold text-destructive">{formatCurrency(s.totalAdvanced)}</p>
                  </div>
                </>
              )}
              <div>
                <span className="text-xs text-muted-foreground">
                  {s.transferBase >= 0 ? "Base a transferir" : "Base a receber"}
                </span>
                <p className="font-mono font-bold">{formatCurrency(Math.abs(s.transferBase))}</p>
              </div>
              {s.transferWithVat && (
                <>
                  <div>
                    <span className="text-xs text-muted-foreground">IVA 23% sobre o repasse</span>
                    <p className="font-mono font-bold">{formatCurrency(s.transferVat)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {s.transferTotal >= 0 ? "Total a transferir" : "Total a receber"}
                    </span>
                    <p className={`font-mono font-bold text-lg ${s.transferTotal >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(Math.abs(s.transferTotal))}
                    </p>
                  </div>
                </>
              )}
              {!s.transferWithVat && (
                <span className="text-[11px] text-muted-foreground italic">Repasse sem IVA facturado.</span>
              )}
              {!s.isHouse && (s.totalBpPaidByPartner > 0 || s.totalRevenuesHeld > 0) && (
                <p className="w-full text-[11px] text-muted-foreground">
                  Inclui {formatCurrency(s.totalBpPaidByPartner)} de linhas do BP facturadas em nome do sócio
                  {s.revenuesHeld.length > 0 && (
                    <> e {formatCurrency(s.totalRevenuesHeld)} de receitas já em poder dele ({" "}
                    {Array.from(new Set(s.revenuesHeld.map((e) => e.accountName))).join(", ")})</>
                  )}.
                </p>
              )}
            </div>

            {/* (g12) Detalhe expansível — só apresentação, mesmas linhas do export de conferência. */}
            {!s.isHouse && (
              <PartnerDisbursementDetail
                bpPaidLines={s.bpPaidLines}
                totalBpPaidByPartner={s.totalBpPaidByPartner}
                paidExpenses={s.paidExpenses}
                totalPaidByPartner={s.totalPaidByPartner}
                totalDisbursement={s.totalDisbursement}
                adjustments={s.disbursementAdjustments}
                totalAdjustments={s.totalDisbursementAdjustments}
                revenuesHeld={s.revenuesHeld}
                totalRevenuesHeld={s.totalRevenuesHeld}
                financingToReturn={s.financingToReturn}
                extras={s.partnerExtras}
                totalAdvanced={s.totalAdvanced}
                partnerShare={s.partnerShare}
                transferBase={s.transferBase}
                transferWithVat={s.transferWithVat}
                transferVat={s.transferVat}
                transferTotal={s.transferTotal}
                l2LabelOf={categoryL2Label}
              />
            )}

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
                <p className="text-xs font-medium text-muted-foreground mb-1.5">🧳 Extras do sócio (abatidos no acerto):</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{e.originLabel}</TableCell>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.cityLabel}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.category}</TableCell>
                        <TableCell className="text-xs font-mono">{e.date ? format(new Date(e.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">−{formatCurrency(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-muted/30">
                      <TableCell colSpan={5} className="font-bold text-xs">Total a abater</TableCell>
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

    {showHouseInternalPosition && (
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold">Posição da Mundo Propício</span>
            <Badge variant="outline" className="text-[10px]">Interno</Badge>
          </div>
        </div>
        <div className="p-4">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-sm font-medium">Resultado do evento (s/IVA)</TableCell>
                <TableCell className="text-right font-mono font-bold">{formatCurrency(resultRealNet)}</TableCell>
              </TableRow>
              {settlements
                .filter((s) => !s.isHouse)
                .map((s) => (
                  <TableRow key={s.partnerId}>
                    <TableCell className="text-sm">
                      (−) {s.partnerName} · <span className="text-xs text-muted-foreground">{s.expenseBasisLabel}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-destructive">
                      −{formatCurrency(Math.abs(s.partnerShare))}
                    </TableCell>
                  </TableRow>
                ))}
              <TableRow className="border-t-2 border-border bg-muted/30">
                <TableCell className="text-sm font-semibold">Posição real</TableCell>
                <TableCell className={`text-right font-mono font-bold text-lg ${housePositionReal >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(housePositionReal)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs text-muted-foreground py-2">quota nominal</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                  {formatCurrency(houseNominalShare)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs text-muted-foreground py-2">IVA dedutível retido</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                  {formatCurrency(houseIvaGain)}
                </TableCell>
              </TableRow>
              {vatNotReturnedTotal !== 0 && (
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground py-2">
                    <details>
                      <summary className="cursor-pointer">IVA não recuperável (custo, fora da devolução)</summary>
                      <div className="mt-1 space-y-0.5">
                        {vatNotReturnedLines.map((l, i) => (
                          <div key={`${l.label}-${i}`} className="flex justify-between gap-4">
                            <span className="truncate">{l.label}</span>
                            <span className="font-mono">{formatCurrency(l.vat)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground py-2 align-top">
                    −{formatCurrency(vatNotReturnedTotal)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )}

    <PartnerPaidExpensesBPView eventId={eventId} eventName={eventName} />
  </div>
);
}
