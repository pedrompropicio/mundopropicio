import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText, FileSpreadsheet, Info, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { exportDREToExcel, exportDREToPDF } from "@/lib/export-dre";
import { buildCategoryLookup, aggregateByHierarchyDRE } from "@/lib/category-hierarchy";
import { Switch } from "@/components/ui/switch";

type TicketRevenueSource = "transactions" | "ticket_sales";

interface DRELine {
  label: string;
  amountExIva: number;
  ivaAmount: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  isGroupHeader?: boolean;
  indent?: boolean;
  isDistribution?: boolean;
  isRetained?: boolean;
  isExpenseSide?: boolean;
  isPartnerExtra?: boolean;
  isPartnerNet?: boolean;
}

function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

function buildDRE(
  transactions: any[],
  categories: any[],
  ticketRevenueSource: TicketRevenueSource,
  ticketZones: any[],
  ticketLots: any[],
  ticketSales: any[],
  eventId: string,
  ticketCategoryId: string | null,
  partners: any[],
  calcBasis: string,
  parentEventId?: string | null,
  closingCosts?: any[],
  partnerExtras?: any[]
): DRELine[] {
  const lookup = buildCategoryLookup(categories);

  const useTicketSales = ticketRevenueSource === "ticket_sales";
  const eventZones = ticketZones.filter((z) => z.event_id === eventId);
  const hasTicketMgmt = eventZones.length > 0;

  let incomes = transactions.filter((t) => t.type === "income");
  let ticketIncomeExIva = 0;
  let ticketIncomeIncIva = 0;

  if (useTicketSales && hasTicketMgmt && ticketCategoryId) {
    incomes = incomes.filter((t) => t.category_id !== ticketCategoryId);
    const eventLotIds = ticketLots
      .filter((l) => eventZones.some((z) => z.id === l.zone_id))
      .map((l) => l.id);
    const eventTicketSales = ticketSales.filter((s) => eventLotIds.includes(s.lot_id));
    // Prices include IVA (6% for tickets) — extract net and gross
    const ticketGross = eventTicketSales.reduce((sum, s) => sum + Number(s.quantity) * Number(s.unit_price), 0);
    const ticketNet = eventTicketSales.reduce((sum, s) => {
      const lot = ticketLots.find((l) => l.id === s.lot_id);
      const rate = Number((lot as any)?.iva_rate ?? 6);
      return sum + Number(s.quantity) * (Number(s.unit_price) / (1 + rate / 100));
    }, 0);
    ticketIncomeExIva = ticketNet;
    ticketIncomeIncIva = ticketGross;
  }

  const expenses = transactions.filter((t) => t.type === "expense");

  const incGroups = aggregateByHierarchyDRE(incomes, lookup, calcAmountWithIva);
  const expGroups = aggregateByHierarchyDRE(expenses, lookup, calcAmountWithIva);

  if (useTicketSales && hasTicketMgmt && ticketIncomeExIva > 0) {
    incGroups.push({
      groupName: "Venda de Bilhetes (Gestão)",
      groupCode: "0.0",
      totalBase: ticketIncomeExIva,
      totalIva: ticketIncomeIncIva - ticketIncomeExIva,
      details: [{ name: "Venda de Bilhetes (Gestão)", code: "0.0.01", base: ticketIncomeExIva, iva: ticketIncomeIncIva - ticketIncomeExIva }],
    });
  }

  const totalIncEx = incGroups.reduce((s, g) => s + g.totalBase, 0);
  const totalIncIva = incGroups.reduce((s, g) => s + g.totalIva, 0);
  const totalIncInc = totalIncEx + totalIncIva;
  const totalExpEx = expGroups.reduce((s, g) => s + g.totalBase, 0);
  const totalExpIva = expGroups.reduce((s, g) => s + g.totalIva, 0);
  const totalExpInc = totalExpEx + totalExpIva;

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, ivaAmount: totalIncIva, amountIncIva: totalIncInc, isTotal: true });
  incGroups.forEach((group) => {
    if (group.details.length > 1 || group.details[0]?.name !== group.groupName) {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, isGroupHeader: true });
      group.details.forEach((d) => lines.push({ label: d.name, amountExIva: d.base, ivaAmount: d.iva, amountIncIva: d.base + d.iva, indent: true }));
    } else {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, indent: true });
    }
  });

  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpIva, amountIncIva: totalExpInc, isTotal: true, isExpenseSide: true });
  expGroups.forEach((group) => {
    if (group.details.length > 1 || group.details[0]?.name !== group.groupName) {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, isGroupHeader: true, isExpenseSide: true });
      group.details.forEach((d) => lines.push({ label: d.name, amountExIva: d.base, ivaAmount: d.iva, amountIncIva: d.base + d.iva, indent: true, isExpenseSide: true }));
    } else {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, indent: true, isExpenseSide: true });
    }
  });

  // Closing costs (internal costs for partner view)
  const eventClosingCosts = (closingCosts || []).filter((cc: any) => cc.event_id === eventId);
  let totalClosingCosts = 0;
  if (eventClosingCosts.length > 0) {
    totalClosingCosts = eventClosingCosts.reduce((s: number, cc: any) => s + Number(cc.amount), 0);
    lines.push({ label: "CUSTOS DE FECHO", amountExIva: totalClosingCosts, ivaAmount: 0, amountIncIva: totalClosingCosts, isTotal: true, isExpenseSide: true });
    eventClosingCosts.forEach((cc: any) => {
      const catLabel = cc.account_categories ? `${cc.account_categories.code} - ${cc.account_categories.name}` : "";
      const label = catLabel ? `${cc.description} (${catLabel})` : cc.description;
      lines.push({ label, amountExIva: Number(cc.amount), ivaAmount: 0, amountIncIva: Number(cc.amount), indent: true, isExpenseSide: true });
    });
  }

  // Always: Resultado Líquido = Receitas s/IVA - Despesas s/IVA - Custos de Fecho
  const resEx = totalIncEx - totalExpEx - totalClosingCosts;
  const resInc = totalIncInc - totalExpInc - totalClosingCosts;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: 0, amountIncIva: 0, isGrandTotal: true });

  // Partner distribution section — sub-events inherit from parent
  const resolvedPartnerId = parentEventId || eventId;
  const eventPartners = partners.filter((p: any) => p.event_id === resolvedPartnerId);
  if (eventPartners.length > 0) {
    let totalDistribution = 0;

    eventPartners.forEach((p: any) => {
      let base: number;
      if (calcBasis === "gross_revenue") {
        base = totalIncEx;
      } else if (p.expense_includes_iva) {
        base = totalIncEx - totalExpInc - totalClosingCosts;
      } else {
        base = resEx;
      }
      const share = base * (Number(p.percentage) / 100);
      const supplierName = p.suppliers?.name || "Sócio";
      const ivaLabel = p.expense_includes_iva ? ` (base: ${formatCurrency(totalIncEx)} - ${formatCurrency(totalExpInc)} = ${formatCurrency(base)})` : "";
      lines.push({
        label: `  ${supplierName} (${Number(p.percentage).toFixed(1)}%)${ivaLabel}`,
        amountExIva: share,
        ivaAmount: 0,
        amountIncIva: share,
        isDistribution: true,
        indent: true,
      });

      // Partner extras (deducted from this partner's share)
      const pExtras = (partnerExtras || []).filter((ex: any) => ex.partner_id === p.id);
      let partnerExtraTotal = 0;
      if (pExtras.length > 0) {
        pExtras.forEach((ex: any) => {
          const exAmount = Number(ex.amount);
          partnerExtraTotal += exAmount;
          lines.push({
            label: `      (-) ${ex.description}`,
            amountExIva: -exAmount,
            ivaAmount: 0,
            amountIncIva: -exAmount,
            isPartnerExtra: true,
            indent: true,
          });
        });
        const netShare = share - partnerExtraTotal;
        lines.push({
          label: `    Líquido ${supplierName}`,
          amountExIva: netShare,
          ivaAmount: 0,
          amountIncIva: netShare,
          isPartnerNet: true,
          indent: true,
        });
      }

      totalDistribution += share;
    });
    // MP retained = real net result (s/IVA) minus total distributed
    // (extras don't change total distribution — they just redistribute within partner)
    const retained = resEx - totalDistribution;
    lines.push({
      label: "RESULTADO MUNDO PROPÍCIO",
      amountExIva: retained,
      ivaAmount: 0,
      amountIncIva: retained,
      isRetained: true,
    });
  }

  return lines;
}

export default function ReportDRE() {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [ticketRevenueSource, setTicketRevenueSource] = useState<TicketRevenueSource>("transactions");
  const [showPartnerView, setShowPartnerView] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").in("status", ["approved", "paid"]).order("date", { ascending: false });
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

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ticket-zones-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["ticket-lots-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_lots").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["ticket-sales-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_sales").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: eventPartners = [] } = useQuery({
    queryKey: ["event-partners-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_partners").select("*, suppliers(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: closingCosts = [] } = useQuery({
    queryKey: ["closing-costs-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_closing_costs").select("*, account_categories(code, name)");
      if (error) throw error;
      return data;
    },
    enabled: showPartnerView,
  });

  const { data: partnerExtras = [] } = useQuery({
    queryKey: ["partner-extras-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_partner_extras").select("*");
      if (error) throw error;
      return data;
    },
    enabled: showPartnerView,
  });

  const ticketCategoryId = categories.find(
    (c) => c.name.toLowerCase().includes("venda de bilhete") || c.name.toLowerCase().includes("bilhetes")
  )?.id ?? null;

  const eventsWithTickets = events.filter((e) =>
    ticketZones.some((z) => z.event_id === e.id)
  );
  const hasAnyTicketMgmt = eventsWithTickets.length > 0;

  const subEventParentMap: Record<string, string> = {};
  const subCountByParent: Record<string, number> = {};
  const childrenByParent: Record<string, string[]> = {};
  events.forEach((e: any) => {
    if (e.parent_event_id) {
      subEventParentMap[e.id] = e.parent_event_id;
      subCountByParent[e.parent_event_id] = (subCountByParent[e.parent_event_id] || 0) + 1;
      if (!childrenByParent[e.parent_event_id]) childrenByParent[e.parent_event_id] = [];
      childrenByParent[e.parent_event_id].push(e.id);
    }
  });

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      let next = [...prev, id];
      const children = childrenByParent[id];
      if (children) next = next.filter((x) => !children.includes(x));
      const parentId = subEventParentMap[id];
      if (parentId) next = next.filter((x) => x !== parentId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEventIds((prev) =>
      prev.length === eventsWithTransactions.length ? [] : eventsWithTransactions.map((e) => e.id)
    );
  };

  const eventsWithTransactions = events.filter((e) => {
    const hasDirect = transactions.some((t: any) => t.event_id === e.id);
    if (hasDirect) return true;
    const children = childrenByParent[e.id];
    if (children) return children.some((cid) => transactions.some((t: any) => t.event_id === cid));
    const parentId = subEventParentMap[e.id];
    if (parentId) return transactions.some((t: any) => t.event_id === parentId);
    return false;
  });

  const expandedActiveEvents = (() => {
    const base = selectedEventIds.length > 0
      ? eventsWithTransactions.filter((e) => selectedEventIds.includes(e.id))
      : eventsWithTransactions;
    const result: typeof base = [];
    base.forEach((e) => {
      const children = childrenByParent[e.id];
      if (children && children.length > 0) {
        const childEvents = eventsWithTransactions.filter((c) => children.includes(c.id));
        childEvents.forEach((c) => {
          if (!result.some((r) => r.id === c.id)) result.push(c);
        });
      } else {
        if (!result.some((r) => r.id === e.id)) result.push(e);
      }
    });
    return result;
  })();

  const selectedParentIds = (() => {
    const ids = selectedEventIds.length > 0 ? selectedEventIds : eventsWithTransactions.map((e) => e.id);
    return ids.filter((id) => childrenByParent[id] && childrenByParent[id].length > 0);
  })();

  const activeEvents = expandedActiveEvents;

  function getEffectiveTransactions(eventId: string) {
    let evtTx = transactions.filter((t: any) => t.event_id === eventId);
    const parentId = subEventParentMap[eventId];
    if (parentId) {
      const siblingCount = subCountByParent[parentId] || 1;
      const parentTx = transactions
        .filter((t: any) => t.event_id === parentId)
        .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount, _prorated: true }));
      evtTx = [...evtTx, ...parentTx];
    }
    const children = childrenByParent[eventId];
    if (children && children.length > 0) {
      children.forEach((childId) => {
        const childTx = transactions.filter((t: any) => t.event_id === childId);
        evtTx = [...evtTx, ...childTx];
      });
    }
    return evtTx;
  }

  const eventSummaries = activeEvents.map((e) => {
    const evtTx = getEffectiveTransactions(e.id);
    const parentEvt = (e as any).parent_event_id ? events.find((pe) => pe.id === (e as any).parent_event_id) : null;
    const calcBasis = parentEvt ? (parentEvt as any).partner_calc_basis || "net_result" : (e as any).partner_calc_basis || "net_result";
    const dre = buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, e.id, ticketCategoryId, eventPartners, calcBasis, (e as any).parent_event_id, showPartnerView ? closingCosts : [], showPartnerView ? partnerExtras : []);
    const revLine = dre.find((l) => l.label === "RECEITAS");
    const expLine = dre.find((l) => l.label === "DESPESAS");
    const resLine = dre.find((l) => l.isGrandTotal);
    const retainedLine = dre.find((l) => l.isRetained);

    return {
      ...e,
      totalIncEx: revLine?.amountExIva ?? 0,
      totalIncInc: revLine?.amountIncIva ?? 0,
      totalExpEx: expLine?.amountExIva ?? 0,
      totalExpInc: expLine?.amountIncIva ?? 0,
      resultEx: resLine?.amountExIva ?? 0,
      resultInc: resLine?.amountIncIva ?? 0,
      retainedEx: retainedLine?.amountExIva ?? null,
      txCount: evtTx.length,
      hasPartners: !!retainedLine,
    };
  });

  const globalIncEx = eventSummaries.reduce((s, e) => s + e.totalIncEx, 0);
  const globalIncInc = eventSummaries.reduce((s, e) => s + e.totalIncInc, 0);
  const globalExpEx = eventSummaries.reduce((s, e) => s + e.totalExpEx, 0);
  const globalExpInc = eventSummaries.reduce((s, e) => s + e.totalExpInc, 0);
  const globalResultEx = globalIncEx - globalExpEx;
  const globalResultInc = globalIncInc - globalExpInc;

  const globalPartnerShares: Record<string, { name: string; total: number }> = {};
  let globalTotalDistribution = 0;
  let globalRetainedSum = 0;
  let hasAnyRetained = false;
  eventSummaries.forEach((evt) => {
    const evtTx = getEffectiveTransactions(evt.id);
    const parentEvt = (evt as any).parent_event_id ? events.find((pe) => pe.id === (evt as any).parent_event_id) : null;
    const calcBasis = parentEvt ? (parentEvt as any).partner_calc_basis || "net_result" : (evt as any).partner_calc_basis || "net_result";
    const dre = buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, eventPartners, calcBasis, (evt as any).parent_event_id, showPartnerView ? closingCosts : [], showPartnerView ? partnerExtras : []);
    dre.filter((l) => l.isDistribution).forEach((l) => {
      const key = l.label.trim();
      if (!globalPartnerShares[key]) globalPartnerShares[key] = { name: key, total: 0 };
      globalPartnerShares[key].total += l.amountExIva;
      globalTotalDistribution += l.amountExIva;
    });
    const retainedLine = dre.find((l) => l.isRetained);
    if (retainedLine) {
      globalRetainedSum += retainedLine.amountExIva;
      hasAnyRetained = true;
    }
  });
  const hasGlobalPartners = Object.keys(globalPartnerShares).length > 0;
  const globalRetained = hasAnyRetained ? globalRetainedSum : globalResultEx - globalTotalDistribution;

  const toggle = (id: string) => setExpandedEvent((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      {/* Event selector */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Selecionar Eventos</p>
          <button onClick={toggleAll} className="text-xs text-primary hover:underline">
            {selectedEventIds.length === eventsWithTransactions.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {eventsWithTransactions.filter((e) => !e.parent_event_id).map((e) => {
            const children = eventsWithTransactions.filter((c) => c.parent_event_id === e.id);
            const isParent = children.length > 0;
            return (
              <div key={e.id}>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedEventIds.includes(e.id)}
                    onCheckedChange={() => toggleEvent(e.id)}
                  />
                  <span className={isParent ? "font-semibold" : ""}>{e.name}</span>
                  {isParent && <span className="text-xs text-muted-foreground">(consolidado)</span>}
                </label>
                {isParent && (
                  <div className="ml-6 mt-1 flex flex-col gap-1">
                    {children.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedEventIds.includes(c.id)}
                          onCheckedChange={() => toggleEvent(c.id)}
                        />
                        <span className="text-muted-foreground">↳ {c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {eventsWithTransactions.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos com transações registadas.</p>}
        </div>
        {selectedEventIds.length === 0 && eventsWithTransactions.length > 0 && (
          <p className="text-xs text-muted-foreground">Nenhum evento selecionado — a mostrar todos.</p>
        )}
      </div>

      {/* Ticket revenue source selector */}
      {hasAnyTicketMgmt && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Fonte de receita de bilhetes</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Alguns eventos possuem gestão de bilheteira. Escolha a fonte dos dados de receita de bilhetes:
          </p>
          <RadioGroup
            value={ticketRevenueSource}
            onValueChange={(v) => setTicketRevenueSource(v as TicketRevenueSource)}
            className="flex flex-col gap-2 sm:flex-row sm:gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="transactions" id="dre-src-tx" />
              <Label htmlFor="dre-src-tx" className="text-sm cursor-pointer">
                Transações registadas
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="ticket_sales" id="dre-src-ts" />
              <Label htmlFor="dre-src-ts" className="text-sm cursor-pointer">
                Vendas da gestão de bilhetes
              </Label>
            </div>
          </RadioGroup>
          {ticketRevenueSource === "ticket_sales" && (
            <p className="text-xs text-muted-foreground italic">
              Eventos com bilheteira: {eventsWithTickets.map((e) => e.name).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch id="partner-view" checked={showPartnerView} onCheckedChange={setShowPartnerView} />
          <Label htmlFor="partner-view" className="text-sm cursor-pointer flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Visão Sócio
          </Label>
          {showPartnerView && (
            <span className="text-xs text-muted-foreground">(inclui custos de fecho internos)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportDREToExcel(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId, eventPartners, events)}
          disabled={activeEvents.length === 0}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportDREToPDF(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId, eventPartners, events)}
          disabled={activeEvents.length === 0}
        >
          <FileText className="mr-1.5 h-4 w-4" /> PDF
        </Button>
        </div>
      </div>

      <div className={`grid gap-4 ${hasGlobalPartners ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Receitas</p>
          <p className="mt-1 text-lg font-bold text-success">{formatCurrency(globalIncEx)}</p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalIncInc)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Despesas</p>
          <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(globalExpEx)}</p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalExpInc)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Líquido</p>
          <p className={`mt-1 text-lg font-bold ${globalResultEx >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(globalResultEx)}
          </p>
          <p className="text-xs text-muted-foreground">c/ IVA: {formatCurrency(globalResultInc)}</p>
        </div>
        {hasGlobalPartners && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado MP</p>
            <p className={`mt-1 text-lg font-bold ${globalRetained >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(globalRetained)}
            </p>
            <div className="mt-1 space-y-0.5">
              {Object.values(globalPartnerShares).map((p, i) => (
                <p key={i} className="text-xs text-amber-500 truncate">
                  {p.name}: {formatCurrency(p.total)}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const evtTx = getEffectiveTransactions(evt.id);
          const parentEvtDetail = (evt as any).parent_event_id ? events.find((pe) => pe.id === (evt as any).parent_event_id) : null;
          const calcBasis = parentEvtDetail ? (parentEvtDetail as any).partner_calc_basis || "net_result" : (evt as any).partner_calc_basis || "net_result";
          const dre = isOpen ? buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, eventPartners, calcBasis, (evt as any).parent_event_id, showPartnerView ? closingCosts : [], showPartnerView ? partnerExtras : []) : [];

          return (
            <div key={evt.id} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(evt.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/30"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <FileText className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{evt.name}</p>
                  <p className="text-xs text-muted-foreground">{evt.txCount} transações</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-sm">
                  <span className="text-success font-mono">{formatCurrency(evt.totalIncEx)}</span>
                  <span className="text-warning font-mono">{formatCurrency(evt.totalExpEx)}</span>
                  <span className={`font-mono font-bold ${evt.resultEx >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(evt.resultEx)}
                  </span>
                  {evt.hasPartners && evt.retainedEx !== null && (
                    <span className={`font-mono text-xs ${evt.retainedEx >= 0 ? "text-success/70" : "text-destructive/70"}`}>
                      (MP: {formatCurrency(evt.retainedEx)})
                    </span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4">
                  {evtTx.length === 0 && ticketRevenueSource === "transactions" ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem transações para este evento.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rubrica</TableHead>
                          <TableHead className="text-right">S/ IVA (€)</TableHead>
                          <TableHead className="text-right">IVA (€)</TableHead>
                          <TableHead className="text-right">C/ IVA (€)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dre.map((line, i) => {
                          const rowClass = line.isRetained
                            ? "border-t-2 border-accent/40 bg-accent/10"
                            : line.isDistribution
                            ? "bg-amber-500/5"
                            : line.isGrandTotal
                            ? "border-t-2 border-primary/30 bg-primary/5"
                            : line.isTotal ? "bg-secondary/20"
                            : line.isGroupHeader ? "bg-secondary/10 border-t border-border/20" : "";
                          const labelClass = `${line.indent ? "pl-10" : line.isGroupHeader ? "pl-5" : ""} ${line.isTotal || line.isGrandTotal || line.isRetained ? "font-bold text-xs uppercase tracking-wider" : line.isDistribution ? "text-sm italic text-muted-foreground" : line.isGroupHeader ? "font-semibold text-sm" : "text-sm"}`;
                          const valClass = (amt: number) =>
                            `text-right font-mono ${line.isRetained ? `text-base font-bold ${amt >= 0 ? "text-success" : "text-destructive"}` : line.isDistribution ? "text-sm text-amber-500" : line.isGrandTotal ? `text-base font-bold ${amt >= 0 ? "text-success" : "text-destructive"}` : line.isTotal ? "font-semibold" : line.isGroupHeader ? "font-semibold text-sm" : "text-muted-foreground"}`;

                          return (
                            <TableRow key={i} className={rowClass}>
                              <TableCell className={labelClass}>{line.label}</TableCell>
                              <TableCell className={valClass(line.amountExIva)}>{formatCurrency(line.amountExIva)}</TableCell>
                              {line.isGrandTotal || line.isDistribution || line.isRetained ? (
                                <>
                                  <TableCell />
                                  <TableCell />
                                </>
                              ) : (
                                <>
                                  <TableCell className={valClass(line.ivaAmount)}>{formatCurrency(line.ivaAmount)}</TableCell>
                                  <TableCell className={valClass(line.amountIncIva)}>{formatCurrency(line.amountIncIva)}</TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {eventSummaries.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Sem eventos registados.</p>
        )}
      </div>

      {/* Tour summary panels for selected parent events */}
      {selectedParentIds.map((parentId) => {
        const parentEvt = events.find((e) => e.id === parentId);
        if (!parentEvt) return null;
        const childIds = childrenByParent[parentId] || [];
        const childSummaries = eventSummaries.filter((s) => childIds.includes(s.id));
        if (childSummaries.length === 0) return null;

        const tourIncEx = childSummaries.reduce((s, c) => s + c.totalIncEx, 0);
        const tourExpEx = childSummaries.reduce((s, c) => s + c.totalExpEx, 0);
        const tourResultEx = tourIncEx - tourExpEx;
        const calcBasis = (parentEvt as any).partner_calc_basis || "net_result";

        // Compute partner distribution for the tour
        const tourPartners = eventPartners.filter((p: any) => p.event_id === parentId);
        let tourTotalDistribution = 0;
        const tourExpInc = childSummaries.reduce((s, c) => s + c.totalExpInc, 0);
        const tourPartnerShares = tourPartners.map((p: any) => {
          let base: number;
          if (calcBasis === "gross_revenue") {
            base = tourIncEx;
          } else if (p.expense_includes_iva) {
            base = tourIncEx - tourExpInc;
          } else {
            base = tourIncEx - tourExpEx;
          }
          const share = base * (Number(p.percentage) / 100);
          tourTotalDistribution += share;
          const partnerBase = p.expense_includes_iva ? tourIncEx - tourExpInc : tourIncEx - tourExpEx;
          const ivaLabel = p.expense_includes_iva ? ` (base: ${formatCurrency(tourIncEx)} - ${formatCurrency(tourExpInc)} = ${formatCurrency(partnerBase)})` : "";
          return { name: `${p.suppliers?.name || "Sócio"}${ivaLabel}`, percentage: Number(p.percentage), share };
        });
        // MP retained from the real net result (s/IVA)
        const tourRetained = tourResultEx - tourTotalDistribution;

        return (
          <div key={`tour-summary-${parentId}`} className="glass rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Resumo da Turnê — {parentEvt.name}</p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sub-evento</TableHead>
                  <TableHead className="text-right">Receitas S/IVA</TableHead>
                  <TableHead className="text-right">Despesas S/IVA</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {childSummaries.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-right font-mono text-success">{formatCurrency(c.totalIncEx)}</TableCell>
                    <TableCell className="text-right font-mono text-warning">{formatCurrency(c.totalExpEx)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${c.resultEx >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(c.resultEx)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-primary/30 bg-primary/5">
                  <TableCell className="font-bold text-sm">TOTAL TURNÊ</TableCell>
                  <TableCell className="text-right font-mono font-bold text-success">{formatCurrency(tourIncEx)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-warning">{formatCurrency(tourExpEx)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${tourResultEx >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(tourResultEx)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {tourPartners.length > 0 && (
              <div className="border-t border-border/30 pt-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Distribuição de Resultados</p>
                {tourPartnerShares.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground italic">{p.name} ({p.percentage.toFixed(1)}%)</span>
                    <span className="font-mono text-amber-500">{formatCurrency(p.share)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm border-t border-accent/40 pt-2">
                  <span className="font-bold">RESULTADO MUNDO PROPÍCIO</span>
                  <span className={`font-mono font-bold ${tourRetained >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(tourRetained)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
