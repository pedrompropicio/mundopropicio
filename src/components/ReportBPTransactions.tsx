import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, AlertTriangle, Handshake, ReceiptText, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportBPTransactionsToPDF, type BPTransactionsPDFData } from "@/lib/export-bp-transactions";
import { ReportScenarioSelector } from "@/components/reports/ReportScenarioSelector";
import { useScenarioForecasts } from "@/hooks/useScenarioForecasts";

interface TransactionWithMeta {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  paid_amount: number;
  status: string;
  date: string;
  due_date: string | null;
  payment_date: string | null;
  category_id: string | null;
  supplier_id: string | null;
  event_id: string | null;
  pl_override_note: string | null;
  is_reimbursement: boolean;
  reimbursement_to: string | null;
  invoice_ref: string | null;
  supplierName?: string;
  isPartnerPaid?: boolean;
  partnerName?: string;
  isOutOfBP?: boolean;
}

interface CategoryGroup {
  groupName: string;
  groupCode: string;
  categories: CategoryLine[];
  totalForecast: number;
  totalActual: number;
}

interface CategoryLine {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  forecastAmount: number;
  actualAmount: number;
  forecastDetails: {
    id: string;
    amount: number;
    eventName: string;
    description: string;
    isOverhead: boolean;
    isViaMaster?: boolean;
    splitShare?: number;
    isRetroactiveOverride?: boolean;
    historicOverrides?: Array<Record<string, any>>;
  }[];
  transactions: TransactionWithMeta[];
}

interface Props {
  /** Pre-select an event when the report opens. Used by deep-links from EventForecast. */
  initialEventId?: string;
}

export default function ReportBPTransactions({ initialEventId }: Props = {}) {
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId ?? "");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  // When OFF (default), Previsto soma apenas BP `approved` (alinha com a vista
  // Previsão vs Real do evento). Quando ON, inclui também rascunhos (`draft`).
  const [includeDrafts, setIncludeDrafts] = useState(false);
  // Quando o evento selecionado é um sub-evento de turnê, este toggle controla
  // se as linhas oriundas de rateio Master (BP com master_forecast_id ou
  // transações com parent_transaction_id) entram no relatório. Por defeito
  // incluídas, para preservar a vista atual.
  const [includeMasterApportionment, setIncludeMasterApportionment] = useState(true);
  const [includeOverhead, setIncludeOverhead] = useState(false);
  const [includeTransitory, setIncludeTransitory] = useState(false);
  const [scenarioVersionId, setScenarioVersionId] = useState<string | null>(null);

  // Reset scenario when changing event
  useEffect(() => {
    setScenarioVersionId(null);
  }, [selectedEventId]);

  // If parent provides initialEventId after first render (e.g. async query param),
  // adopt it once. Manual user selection from the dropdown takes over from there.
  useEffect(() => {
    if (initialEventId && !selectedEventId) setSelectedEventId(initialEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId]);

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Group events: standalone first, then tours (parent + children indented)
  const groupedEventOptions = useMemo(() => {
    const parentEvents = events.filter((e: any) => !e.parent_event_id);
    const childMap: Record<string, any[]> = {};
    events.filter((e: any) => e.parent_event_id).forEach((e: any) => {
      if (!childMap[e.parent_event_id]) childMap[e.parent_event_id] = [];
      childMap[e.parent_event_id].push(e);
    });
    // Sort children by date
    Object.values(childMap).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));

    const result: { id: string; name: string; date: string; isTour: boolean; isChild: boolean }[] = [];
    parentEvents.forEach((p: any) => {
      const children = childMap[p.id];
      const isTour = !!children && children.length > 0;
      result.push({ id: p.id, name: p.name, date: p.date, isTour, isChild: false });
      if (children) {
        children.forEach((c: any) => {
          result.push({ id: c.id, name: c.name, date: c.date, isTour: false, isChild: true });
        });
      }
    });
    return result;
  }, [events]);

  const { data: activeForecasts = [] } = useQuery({
    queryKey: ["all-forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_forecasts").select("*").is("version_id", null);
      return data;
    },
  });

  const { data: scenarioForecasts = [] } = useScenarioForecasts(scenarioVersionId);

  // Merge: quando há cenário ativo, substituímos os forecasts dos eventos
  // cobertos pelo snapshot do cenário pelos do snapshot. Restantes eventos
  // continuam a ler a versão Ativa.
  const forecasts = useMemo(() => {
    if (!scenarioVersionId || (scenarioForecasts as any[]).length === 0) return activeForecasts;
    const scenarioEventIds = new Set((scenarioForecasts as any[]).map((f) => f.event_id));
    const filteredActive = (activeForecasts as any[]).filter((f) => !scenarioEventIds.has(f.event_id));
    return [...filteredActive, ...(scenarioForecasts as any[])];
  }, [activeForecasts, scenarioForecasts, scenarioVersionId]);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-with-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, suppliers(name)")
        .in("status", ["approved", "paid"])
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: partnerPaidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(supplier_id, suppliers(name))")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: reimbursementItems = [] } = useQuery({
    queryKey: ["reimbursement-note-items-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_note_items")
        .select("*, reimbursement_notes(code, employee_name, status)");
      if (error) throw error;
      return data;
    },
  });

  // Build lookup maps
  const partnerPaidMap = useMemo(() => {
    const map: Record<string, { partnerName: string }> = {};
    partnerPaidExpenses.forEach((ppe: any) => {
      const name = ppe.event_partners?.suppliers?.name ?? "Sócio";
      map[ppe.transaction_id] = { partnerName: name };
    });
    return map;
  }, [partnerPaidExpenses]);

  const reimbursementMap = useMemo(() => {
    const map: Record<string, { code: string; employeeName: string }> = {};
    reimbursementItems.forEach((ri: any) => {
      if (ri.reimbursement_notes) {
        map[ri.transaction_id] = {
          code: ri.reimbursement_notes.code,
          employeeName: ri.reimbursement_notes.employee_name,
        };
      }
    });
    return map;
  }, [reimbursementItems]);

  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    events.forEach((event: any) => {
      map[event.id] = event.name;
    });
    return map;
  }, [events]);

  // Get relevant event IDs (including child events for tours)
  const selectedEvent = events.find((e: any) => e.id === selectedEventId);
  const isSubEvent = !!selectedEvent?.parent_event_id;
  const parentEventId: string | null = selectedEvent?.parent_event_id ?? null;
  const relevantEventIds = useMemo(() => {
    if (!selectedEventId) return [];
    const childIds = events
      .filter((e: any) => e.parent_event_id === selectedEventId)
      .map((e: any) => e.id);
    return [selectedEventId, ...childIds];
  }, [selectedEventId, events]);

  // Quantos sub-eventos tem o Master (para calcular a proporção do rateio)
  const masterSplitsCount = useMemo(() => {
    if (!parentEventId) return 0;
    return events.filter((e: any) => e.parent_event_id === parentEventId).length;
  }, [parentEventId, events]);

  // Filter and enrich data for selected event
  const { groupedData, outOfBPTransactions, totalForecast, totalActual } = useMemo(() => {
    if (!selectedEventId || relevantEventIds.length === 0) {
      return { groupedData: [], outOfBPTransactions: [], totalForecast: 0, totalActual: 0 };
    }

    const lookup = buildCategoryLookup(categories as CategoryNode[]);

    // Filter forecasts for this event (expenses only). Por defeito apenas
    // `approved`, alinhando com a vista Previsão vs Real e o DRE. Toggle
    // "Incluir rascunhos" deixa-nos auditar também linhas em `draft`.
    const statusOk = (s: string) =>
      includeDrafts ? (s === "approved" || s === "draft") : s === "approved";

    // Linhas locais ao(s) evento(s) selecionado(s).
    // Em sub-eventos, removemos as linhas que já são fatias de rateio Master
    // (master_forecast_id presente) — elas serão substituídas por uma fatia
    // virtual proporcional vinda diretamente do BP do Master quando o toggle
    // "Incluir rateios Master" estiver ON.
    const localForecasts = forecasts.filter(
      (f: any) =>
        relevantEventIds.includes(f.event_id) &&
        f.type === "expense" &&
        statusOk(f.status) &&
        (includeOverhead || !f.is_overhead) &&
        (!isSubEvent || !f.master_forecast_id)
    );

    // Quando ON e o evento é um sub-evento, traz BP do Master e rateia ÷N.
    const masterForecastSlices: any[] = [];
    if (isSubEvent && includeMasterApportionment && parentEventId && masterSplitsCount > 0) {
      const masterForecasts = forecasts.filter(
        (f: any) =>
          f.event_id === parentEventId &&
          f.type === "expense" &&
          statusOk(f.status) &&
          (includeOverhead || !f.is_overhead)
      );
      masterForecasts.forEach((f: any) => {
        masterForecastSlices.push({
          ...f,
          id: `${f.id}::split::${selectedEventId}`,
          event_id: selectedEventId,
          amount: Number(f.amount) / masterSplitsCount,
          _from_master: true,
          _master_event_id: parentEventId,
          _split_share: 1 / masterSplitsCount,
        });
      });
    }

    const eventForecasts = [...localForecasts, ...masterForecastSlices];

    // Filter transactions for this event (expenses only, approved or paid).
    //
    // Sub-evento com toggle "Incluir rateios Master" ON: queremos incluir TODO
    // o realizado que pertence economicamente a este sub-evento, simétrico ao
    // Previsto:
    //  (a) TX locais lançadas direto no sub-evento (event_id === selectedEventId,
    //      sem parent_transaction_id) — sempre.
    //  (b) Fatias reais que o sistema de rateio multi-evento já criou no
    //      sub-evento via parent_transaction_id — mantemos (são o split correto,
    //      que pode não ser ÷N: pode ser proporcional ou manual).
    //  (c) TX lançadas direto no Master (event_id === parentEventId) — estas
    //      ainda não foram propagadas em fatias, então rateamos virtualmente ÷N.
    //
    // Sub-evento com toggle OFF: só (a) — tira-se (b) e (c).
    // Master/standalone: tudo o que tem event_id === selectedEventId (lógica
    // original via relevantEventIds).
    const localTxRaw = transactions.filter((t: any) => {
      if (t.type !== "expense") return false;
      if (!relevantEventIds.includes(t.event_id)) return false;
      if (!includeTransitory && t.is_transitory) return false;
      if (isSubEvent && t.parent_transaction_id && !includeMasterApportionment) {
        // Toggle OFF: descarta fatias de rateio Master
        return false;
      }
      return true;
    });

    // (c) TX lançadas direto no Master, rateadas ÷N quando ON e estamos num sub.
    const masterTxSlices: any[] = [];
    if (isSubEvent && includeMasterApportionment && parentEventId && masterSplitsCount > 0) {
      const masterTxs = transactions.filter(
        (t: any) =>
          t.event_id === parentEventId &&
          t.type === "expense" &&
          (includeTransitory || !t.is_transitory) &&
          !t.parent_transaction_id
      );
      masterTxs.forEach((t: any) => {
        masterTxSlices.push({
          ...t,
          id: `${t.id}::split::${selectedEventId}`,
          event_id: selectedEventId,
          amount: Number(t.amount) / masterSplitsCount,
          _from_master: true,
          _master_event_id: parentEventId,
          _split_share: 1 / masterSplitsCount,
        });
      });
    }

    const eventTransactions: TransactionWithMeta[] = [...localTxRaw, ...masterTxSlices].map((t: any) => {
      const pp = partnerPaidMap[t.id] ?? (t._from_master ? partnerPaidMap[t.id.split("::")[0]] : undefined);
      const ri = reimbursementMap[t.id] ?? (t._from_master ? reimbursementMap[t.id.split("::")[0]] : undefined);
      return {
        ...t,
        supplierName: t.suppliers?.name ?? null,
        isPartnerPaid: !!pp,
        partnerName: pp?.partnerName,
        reimbursementCode: ri?.code,
        reimbursementEmployee: ri?.employeeName,
      };
    });

    // Separate "Fora do BP" transactions
    const normalTransactions = eventTransactions.filter((t) => !t.pl_override_note);
    const outOfBP = eventTransactions.filter((t) => !!t.pl_override_note);

    // Group forecasts by L2 category
    const forecastByCategory: Record<string, number> = {};
    const overheadActualByCategory: Record<string, number> = {};
    const forecastDetailsByCategory: Record<string, CategoryLine["forecastDetails"]> = {};
    eventForecasts.forEach((f: any) => {
      const catId = f.category_id;
      if (!catId) return;
      forecastByCategory[catId] = (forecastByCategory[catId] ?? 0) + Number(f.amount);

      if (f.is_overhead) {
        overheadActualByCategory[catId] = (overheadActualByCategory[catId] ?? 0) + Number(f.amount);
        if (!forecastDetailsByCategory[catId]) forecastDetailsByCategory[catId] = [];
        const sourceEventId = (f._from_master ? f._master_event_id : f.event_id) ?? f.event_id;
        forecastDetailsByCategory[catId].push({
          id: String(f.id),
          amount: Number(f.amount),
          eventName: eventNameMap[sourceEventId] ?? "Evento",
          description: f.description ?? f.specification ?? "Linha de overhead",
          isOverhead: true,
          isViaMaster: !!f._from_master,
          splitShare: f._split_share ? Number(f._split_share) : undefined,
          isRetroactiveOverride: !!f.is_retroactive_override,
          historicOverrides: Array.isArray(f.historic_overrides) ? f.historic_overrides : [],
        });
      }
    });

    // Categorias que existem no BP approved (do evento) — usado para marcar
    // transações cuja categoria não foi orçada como "Fora do BP".
    const bpCategoryIds = new Set(Object.keys(forecastByCategory));
    eventTransactions.forEach((t) => {
      (t as any).isOutOfBP = !!t.category_id && !bpCategoryIds.has(t.category_id);
    });

    // Group transactions by category
    const transByCategory: Record<string, TransactionWithMeta[]> = {};
    normalTransactions.forEach((t) => {
      const catId = t.category_id ?? "_none";
      if (!transByCategory[catId]) transByCategory[catId] = [];
      transByCategory[catId].push(t);
    });

    // Build all category IDs that have either forecasts or transactions
    const allCatIds = new Set([
      ...Object.keys(forecastByCategory),
      ...Object.keys(transByCategory).filter((k) => k !== "_none"),
    ]);

    // Group by L2
    const groupMap: Record<string, CategoryGroup> = {};
    allCatIds.forEach((catId) => {
      const catInfo = lookup[catId];
      const groupName = catInfo?.groupName ?? "Sem categoria";
      const groupCode = catInfo?.groupCode ?? "Z";
      const catName = catInfo?.name ?? "Sem categoria";
      const catCode = catInfo?.code ?? "Z.Z";
      const forecast = forecastByCategory[catId] ?? 0;
      const catTrans = transByCategory[catId] ?? [];
      const actual = catTrans.reduce((s, t) => s + Number(t.amount), 0) + (overheadActualByCategory[catId] ?? 0);

      if (!groupMap[groupName]) {
        groupMap[groupName] = {
          groupName,
          groupCode,
          categories: [],
          totalForecast: 0,
          totalActual: 0,
        };
      }

      // Check if category already exists in group (from different catId mapping)
      const existingCat = groupMap[groupName].categories.find((c) => c.categoryId === catId);
      if (existingCat) {
        existingCat.forecastAmount += forecast;
        existingCat.actualAmount += actual;
        existingCat.forecastDetails.push(...(forecastDetailsByCategory[catId] ?? []));
        existingCat.transactions.push(...catTrans);
      } else {
        groupMap[groupName].categories.push({
          categoryId: catId,
          categoryName: catName,
          categoryCode: catCode,
          forecastAmount: forecast,
          actualAmount: actual,
          forecastDetails: forecastDetailsByCategory[catId] ?? [],
          transactions: catTrans,
        });
      }
      groupMap[groupName].totalForecast += forecast;
      groupMap[groupName].totalActual += actual;
    });

    // Handle transactions without category
    if (transByCategory["_none"]?.length) {
      const noCatTrans = transByCategory["_none"];
      const actual = noCatTrans.reduce((s, t) => s + Number(t.amount), 0);
      if (!groupMap["Sem categoria"]) {
        groupMap["Sem categoria"] = {
          groupName: "Sem categoria",
          groupCode: "Z",
          categories: [],
          totalForecast: 0,
          totalActual: 0,
        };
      }
      groupMap["Sem categoria"].categories.push({
        categoryId: "_none",
        categoryName: "Sem categoria",
        categoryCode: "—",
        forecastAmount: 0,
        actualAmount: actual,
        forecastDetails: [],
        transactions: noCatTrans,
      });
      groupMap["Sem categoria"].totalActual += actual;
    }

    // Sort groups and categories within
    const sorted = Object.values(groupMap)
      .map((g) => ({
        ...g,
        categories: g.categories.sort((a, b) => compareHierarchicalCodes(a.categoryCode, b.categoryCode)),
      }))
      .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));

    const tf = sorted.reduce((s, g) => s + g.totalForecast, 0);
    const ta = sorted.reduce((s, g) => s + g.totalActual, 0);

    return { groupedData: sorted, outOfBPTransactions: outOfBP, totalForecast: tf, totalActual: ta };
  }, [selectedEventId, relevantEventIds, forecasts, transactions, categories, partnerPaidMap, reimbursementMap, includeDrafts, includeOverhead, includeTransitory, isSubEvent, includeMasterApportionment, parentEventId, masterSplitsCount, eventNameMap]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allGroups = new Set(groupedData.map((g) => g.groupName));
    const allCats = new Set(groupedData.flatMap((g) => g.categories.map((c) => c.categoryId)));
    setExpandedGroups(allGroups);
    setExpandedCategories(new Set([...allCats, "_outofbp"]));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
    setExpandedCategories(new Set());
  };

  const statusLabel = (status: string) => {
    if (status === "paid") return "Pago";
    if (status === "approved") return "A pagar";
    return status;
  };

  const renderTransactionRow = (t: TransactionWithMeta) => {
    const totalWithIva = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const ri = reimbursementMap[t.id];
    return (
      <TableRow key={t.id} className="bg-muted/30 text-xs">
        <TableCell className="pl-12">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{t.description}</span>
            {t.specification && (
              <span className="text-muted-foreground">({t.specification})</span>
            )}
            {t.isPartnerPaid && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                    <Handshake className="h-3 w-3" /> Sócio
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{t.partnerName}</TooltipContent>
              </Tooltip>
            )}
            {t.is_reimbursement && (
              <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                <ReceiptText className="h-3 w-3" /> Reembolso
                {ri && <span className="ml-0.5">({(ri as any).code})</span>}
              </Badge>
            )}
            {t.pl_override_note && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] text-warning border-warning gap-0.5 px-1 py-0">
                    <AlertTriangle className="h-3 w-3" /> Bypass BP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t.pl_override_note}</TooltipContent>
              </Tooltip>
            )}
            {t.isOutOfBP && !t.pl_override_note && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] text-warning border-warning gap-0.5 px-1 py-0">
                    <AlertTriangle className="h-3 w-3" /> Fora do BP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Categoria não foi orçada no BP approved deste evento.
                </TooltipContent>
              </Tooltip>
            )}
            {(t as any)._from_master && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 border-primary/40 text-primary">
                    via Master ÷{masterSplitsCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Linha do Master rateada proporcionalmente
                  ({(((t as any)._split_share ?? 0) * 100).toFixed(1)}%) para este sub-evento.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{t.supplierName ?? "—"}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.date), "dd/MM/yyyy")}</TableCell>
        <TableCell className="text-right font-mono text-xs">{formatCurrency(Number(t.amount))}</TableCell>
        <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(totalWithIva)}</TableCell>
        <TableCell className="text-center">
          <Badge variant={t.status === "paid" ? "default" : "secondary"} className="text-[10px]">
            {statusLabel(t.status)}
          </Badge>
        </TableCell>
      </TableRow>
    );
  };

  const renderForecastDetailRow = (
    detail: CategoryLine["forecastDetails"][number],
    categoryId: string,
  ) => (
    <TableRow key={`${categoryId}::forecast::${detail.id}`} className="bg-secondary/20 text-xs">
      <TableCell className="pl-12">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>BP — {detail.description}</span>
          {detail.isOverhead && (
            <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 text-warning border-warning">
              Overhead
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
            {detail.eventName}
          </Badge>
          {detail.isViaMaster && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 border-primary/40 text-primary">
                  via Master
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Fatia virtual do Master
                {typeof detail.splitShare === "number" ? ` (${(detail.splitShare * 100).toFixed(1)}%)` : ""}.
              </TooltipContent>
            </Tooltip>
          )}
          {detail.isRetroactiveOverride && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 border-destructive text-destructive">
                  Fora do BP retroativo
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                A verba desta categoria foi reduzida numa nova versão do BP e há
                transação(ões) que deixaram de caber.
                {detail.historicOverrides && detail.historicOverrides.length > 0 && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {detail.historicOverrides.length} ocorrência(s) registada(s).
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">BP</TableCell>
        <TableCell className="text-right font-mono text-xs">{formatCurrency(detail.amount)}</TableCell>
        <TableCell className="text-right font-mono text-xs">{formatCurrency(detail.amount)}</TableCell>
      <TableCell className="text-center">
          <Badge variant="secondary" className="text-[10px]">Overhead</Badge>
      </TableCell>
    </TableRow>
  );

  const outOfBPActual = outOfBPTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const grandTotalForecast = totalForecast;
  const grandTotalActual = totalActual + outOfBPActual;

  const handleExportPDF = (mode: "synthetic" | "analytical") => {
    if (!selectedEvent) return;
    const pdfData: BPTransactionsPDFData = {
      eventName: selectedEvent.name,
      eventDate: selectedEvent.date,
      groupedData: groupedData as any,
      outOfBPTransactions: outOfBPTransactions as any,
      totalForecast,
      totalActual,
      includeOverhead,
    };
    exportBPTransactionsToPDF(pdfData, mode);
  };

  // Evento âncora para versões: Master se for sub, próprio caso contrário
  const scenarioAnchorEventId = parentEventId ?? (selectedEventId || null);

  return (
    <div className="space-y-4">
      <ReportScenarioSelector
        eventId={scenarioAnchorEventId}
        isMultiEvent={false}
        value={scenarioVersionId}
        onChange={setScenarioVersionId}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-80">
            <SelectValue placeholder="Selecionar evento…" />
          </SelectTrigger>
          <SelectContent>
            {groupedEventOptions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                <span className={e.isChild ? "pl-4" : ""}>
                  {e.isTour && "🎤 "}
                  {e.isChild && "↳ "}
                  {e.name} — {format(new Date(e.date), "dd/MM/yyyy")}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedEventId && (
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={expandAll} className="text-xs text-primary hover:underline">Expandir tudo</button>
            <button onClick={collapseAll} className="text-xs text-primary hover:underline">Colapsar tudo</button>
            <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeDrafts}
                onChange={(e) => setIncludeDrafts(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
              />
              Incluir rascunhos do BP
            </label>
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span>Overhead</span>
              <select
                value={includeOverhead ? "with" : "without"}
                onChange={(e) => setIncludeOverhead(e.target.value === "with")}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                title="Incluir ou excluir linhas de overhead no BP x Transações"
              >
                <option value="without">Sem overhead</option>
                <option value="with">Com overhead</option>
              </select>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span>Transitórias</span>
              <select
                value={includeTransitory ? "with" : "without"}
                onChange={(e) => setIncludeTransitory(e.target.value === "with")}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                title="Incluir ou excluir cauções e transitórias na auditoria do relatório"
              >
                <option value="without">Sem transitórias</option>
                <option value="with">Com transitórias</option>
              </select>
            </div>
            {isSubEvent && (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeMasterApportionment}
                  onChange={(e) => setIncludeMasterApportionment(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-primary"
                />
                Incluir rateios Master
              </label>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2 gap-1.5">
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportPDF("synthetic")}>
                  Sintético — Apenas totais por categoria
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF("analytical")}>
                  Analítico — Com detalhe das transações
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {selectedEventId && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria / Transação</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Previsto (s/IVA)</TableHead>
                <TableHead className="text-right">Realizado (s/IVA)</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group) => {
                const isGroupExpanded = expandedGroups.has(group.groupName);
                const variance = group.totalActual - group.totalForecast;
                return (
                  <React.Fragment key={group.groupName}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 font-semibold bg-muted/20"
                      onClick={() => toggleGroup(group.groupName)}
                    >
                      <TableCell className="flex items-center gap-1">
                        {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {group.groupCode} {group.groupName}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-mono">{formatCurrency(group.totalForecast)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(group.totalActual)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-medium ${variance > 0 ? "text-destructive" : variance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isGroupExpanded &&
                      group.categories.map((cat) => {
                        const isCatExpanded = expandedCategories.has(cat.categoryId);
                        const catVariance = cat.actualAmount - cat.forecastAmount;
                        return (
                          <React.Fragment key={cat.categoryId}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => toggleCategory(cat.categoryId)}
                            >
                              <TableCell className="pl-8 flex items-center gap-2 font-medium text-sm">
                                {cat.transactions.length > 0 || cat.forecastDetails.length > 0 ? (
                                  isCatExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="w-3.5" />
                                )}
                                <span className="inline-flex items-center gap-2">
                                  <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-muted-foreground">
                                    {cat.categoryCode}
                                  </code>
                                  <span>{cat.categoryName}</span>
                                </span>
                                {cat.forecastDetails.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 text-warning border-warning">
                                    Overhead {cat.forecastDetails.length > 1 ? `(${cat.forecastDetails.length})` : ""}
                                  </Badge>
                                )}
                                {cat.transactions.length > 0 && (
                                  <span className="text-xs text-muted-foreground">({cat.transactions.length})</span>
                                )}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(cat.forecastAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(cat.actualAmount)}</TableCell>
                              <TableCell className="text-center">
                                {cat.forecastDetails.length > 0 && cat.transactions.length === 0 ? (
                                  <Badge variant="secondary" className="text-[10px]">Overhead</Badge>
                                ) : (
                                  <span className={`text-xs ${catVariance > 0 ? "text-destructive" : catVariance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                    {catVariance > 0 ? "+" : ""}{formatCurrency(catVariance)}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                            {isCatExpanded && cat.forecastDetails.map((detail) => renderForecastDetailRow(detail, cat.categoryId))}
                            {isCatExpanded && cat.transactions.map(renderTransactionRow)}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })}

              {/* Fora do BP section */}
              {outOfBPTransactions.length > 0 && (
                <>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50 font-semibold bg-warning/10 border-l-4 border-l-warning"
                    onClick={() => toggleCategory("_outofbp")}
                  >
                    <TableCell className="flex items-center gap-1">
                      {expandedCategories.has("_outofbp") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Fora do BP ({outOfBPTransactions.length})
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right font-mono">—</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(outOfBPActual)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {expandedCategories.has("_outofbp") && outOfBPTransactions.map(renderTransactionRow)}
                </>
              )}

              {/* Grand total */}
              <TableRow className="font-bold border-t-2">
                <TableCell>TOTAL DESPESAS</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono">{formatCurrency(grandTotalForecast)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(grandTotalActual)}</TableCell>
                <TableCell className="text-center">
                  <span className={`text-sm font-bold ${grandTotalActual - grandTotalForecast > 0 ? "text-destructive" : grandTotalActual - grandTotalForecast < 0 ? "text-green-600" : ""}`}>
                    {grandTotalActual - grandTotalForecast > 0 ? "+" : ""}{formatCurrency(grandTotalActual - grandTotalForecast)}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {selectedEventId && groupedData.length === 0 && outOfBPTransactions.length === 0 && (
        <p className="text-center text-muted-foreground py-10">Nenhuma previsão ou transação de despesa encontrada para este evento.</p>
      )}
    </div>
  );
}
