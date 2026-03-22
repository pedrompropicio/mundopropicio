import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText, FileSpreadsheet, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { exportDREToExcel, exportDREToPDF } from "@/lib/export-dre";
import { buildCategoryLookup, aggregateByHierarchyDRE } from "@/lib/category-hierarchy";

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
  calcBasis: string
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
    ticketIncomeExIva = eventTicketSales.reduce((sum, s) => sum + Number(s.quantity) * Number(s.unit_price), 0);
    ticketIncomeIncIva = calcAmountWithIva(ticketIncomeExIva, 23);
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

  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpIva, amountIncIva: totalExpInc, isTotal: true });
  expGroups.forEach((group) => {
    if (group.details.length > 1 || group.details[0]?.name !== group.groupName) {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, isGroupHeader: true });
      group.details.forEach((d) => lines.push({ label: d.name, amountExIva: d.base, ivaAmount: d.iva, amountIncIva: d.base + d.iva, indent: true }));
    } else {
      lines.push({ label: group.groupName, amountExIva: group.totalBase, ivaAmount: group.totalIva, amountIncIva: group.totalBase + group.totalIva, indent: true });
    }
  });

  const resEx = totalIncEx - totalExpEx;
  const resInc = totalIncInc - totalExpInc;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: resInc - resEx, amountIncIva: resInc, isGrandTotal: true });

  // Partner distribution section
  const eventPartners = partners.filter((p: any) => p.event_id === eventId);
  if (eventPartners.length > 0) {
    let totalDistribution = 0;
    eventPartners.forEach((p: any) => {
      let base: number;
      if (calcBasis === "gross_revenue") {
        base = totalIncEx;
      } else if (calcBasis === "net_result_gross_expenses") {
        // Receitas s/IVA - Despesas c/IVA, but per-partner flag can override
        const expBase = p.expense_includes_iva ? totalExpInc : totalExpInc;
        base = totalIncEx - expBase;
      } else {
        // net_result: Receitas s/IVA - Despesas s/IVA, per-partner flag can use c/IVA
        const expBase = p.expense_includes_iva ? totalExpInc : totalExpEx;
        base = totalIncEx - expBase;
      }
      const share = base * (Number(p.percentage) / 100);
      totalDistribution += share;
      const supplierName = p.suppliers?.name || "Sócio";
      lines.push({
        label: `  ${supplierName} (${Number(p.percentage).toFixed(1)}%)`,
        amountExIva: share,
        ivaAmount: 0,
        amountIncIva: share,
        isDistribution: true,
        indent: true,
      });
    });
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

  // Find the "Venda de Bilhetes" category ID
  const ticketCategoryId = categories.find(
    (c) => c.name.toLowerCase().includes("venda de bilhete") || c.name.toLowerCase().includes("bilhetes")
  )?.id ?? null;

  // Check if any selected event has ticket management
  const eventsWithTickets = events.filter((e) =>
    ticketZones.some((z) => z.event_id === e.id)
  );
  const hasAnyTicketMgmt = eventsWithTickets.length > 0;

  // Build proration map
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

  // Mutual exclusion: selecting parent deselects children and vice versa
  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      let next = [...prev, id];
      const children = childrenByParent[id];
      if (children) {
        // Selected a parent → remove all its children
        next = next.filter((x) => !children.includes(x));
      }
      const parentId = subEventParentMap[id];
      if (parentId) {
        // Selected a child → remove parent
        next = next.filter((x) => x !== parentId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEventIds((prev) =>
      prev.length === eventsWithTransactions.length ? [] : eventsWithTransactions.map((e) => e.id)
    );
  };

  // Only show events that have at least one approved/paid transaction (direct or via children/parent)
  const eventsWithTransactions = events.filter((e) => {
    const hasDirect = transactions.some((t: any) => t.event_id === e.id);
    if (hasDirect) return true;
    // Parent: check if any child has transactions
    const children = childrenByParent[e.id];
    if (children) return children.some((cid) => transactions.some((t: any) => t.event_id === cid));
    // Sub-event: check if parent has transactions
    const parentId = subEventParentMap[e.id];
    if (parentId) return transactions.some((t: any) => t.event_id === parentId);
    return false;
  });

  const activeEvents = selectedEventIds.length > 0
    ? eventsWithTransactions.filter((e) => selectedEventIds.includes(e.id))
    : eventsWithTransactions;

  // Helper: get effective transactions for an event (with proration)
  function getEffectiveTransactions(eventId: string) {
    let evtTx = transactions.filter((t: any) => t.event_id === eventId);
    const parentId = subEventParentMap[eventId];
    if (parentId) {
      // Sub-event: add prorated parent transactions
      const siblingCount = subCountByParent[parentId] || 1;
      const parentTx = transactions
        .filter((t: any) => t.event_id === parentId)
        .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount, _prorated: true }));
      evtTx = [...evtTx, ...parentTx];
    }
    const children = childrenByParent[eventId];
    if (children && children.length > 0) {
      // Parent event: consolidate all children transactions + direct
      children.forEach((childId) => {
        const childTx = transactions.filter((t: any) => t.event_id === childId);
        evtTx = [...evtTx, ...childTx];
      });
    }
    return evtTx;
  }

  const eventSummaries = activeEvents.map((e) => {
    const evtTx = getEffectiveTransactions(e.id);
    const calcBasis = (e as any).partner_calc_basis || "net_result";
    const dre = buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, e.id, ticketCategoryId, eventPartners, calcBasis);
    const revLine = dre.find((l) => l.label === "RECEITAS");
    const expLine = dre.find((l) => l.label === "DESPESAS");
    const resLine = dre.find((l) => l.label === "RESULTADO LÍQUIDO");
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

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportDREToExcel(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId)}
          disabled={activeEvents.length === 0}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportDREToPDF(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId)}
          disabled={activeEvents.length === 0}
        >
          <FileText className="mr-1.5 h-4 w-4" /> PDF
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const evtTx = getEffectiveTransactions(evt.id);
          const calcBasis = (evt as any).partner_calc_basis || "net_result";
          const dre = isOpen ? buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId, eventPartners, calcBasis) : [];

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
                              <TableCell className={valClass(line.amountExIva)}>{formatCurrency(Math.abs(line.amountExIva))}</TableCell>
                              <TableCell className={valClass(line.ivaAmount)}>{formatCurrency(Math.abs(line.ivaAmount))}</TableCell>
                              <TableCell className={valClass(line.amountIncIva)}>{formatCurrency(Math.abs(line.amountIncIva))}</TableCell>
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
    </div>
  );
}
