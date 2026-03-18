import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText, Download, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { exportDREToExcel, exportDREToPDF } from "@/lib/export-dre";

type TicketRevenueSource = "transactions" | "ticket_sales";

interface DRELine {
  label: string;
  amountExIva: number;
  ivaAmount: number;
  amountIncIva: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  indent?: boolean;
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
  ticketCategoryId: string | null
): DRELine[] {
  const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));

  // Determine if we should replace ticket revenue
  const useTicketSales = ticketRevenueSource === "ticket_sales";
  const eventZones = ticketZones.filter((z) => z.event_id === eventId);
  const hasTicketMgmt = eventZones.length > 0;

  // Filter transactions - if using ticket sales, exclude ticket category transactions from income
  let incomes = transactions.filter((t) => t.type === "income");
  let ticketIncomeExIva = 0;
  let ticketIncomeIncIva = 0;

  if (useTicketSales && hasTicketMgmt && ticketCategoryId) {
    // Remove ticket transactions from income list
    incomes = incomes.filter((t) => t.category_id !== ticketCategoryId);

    // Calculate ticket revenue from ticket_sales
    const eventLotIds = ticketLots
      .filter((l) => eventZones.some((z) => z.id === l.zone_id))
      .map((l) => l.id);
    const eventTicketSales = ticketSales.filter((s) => eventLotIds.includes(s.lot_id));
    ticketIncomeExIva = eventTicketSales.reduce((sum, s) => sum + Number(s.quantity) * Number(s.unit_price), 0);
    // Ticket sales IVA - use default 23% (same as system default)
    ticketIncomeIncIva = calcAmountWithIva(ticketIncomeExIva, 23);
  }

  const expenses = transactions.filter((t) => t.type === "expense");

  const aggregate = (txs: any[]) => {
    const byCat: Record<string, { exIva: number; iva: number; incIva: number }> = {};
    txs.forEach((t) => {
      const name = catMap[t.category_id] ?? "Sem categoria";
      const amt = Number(t.amount);
      const iva = Number(t.iva_rate ?? 23);
      const withIva = calcAmountWithIva(amt, iva);
      if (!byCat[name]) byCat[name] = { exIva: 0, iva: 0, incIva: 0 };
      byCat[name].exIva += amt;
      byCat[name].iva += withIva - amt;
      byCat[name].incIva += withIva;
    });
    return byCat;
  };

  const incByCat = aggregate(incomes);
  const expByCat = aggregate(expenses);

  // Add ticket sales as a category if using ticket_sales source
  if (useTicketSales && hasTicketMgmt && ticketIncomeExIva > 0) {
    const ticketLabel = "Venda de Bilhetes (Gestão)";
    incByCat[ticketLabel] = {
      exIva: ticketIncomeExIva,
      iva: ticketIncomeIncIva - ticketIncomeExIva,
      incIva: ticketIncomeIncIva,
    };
  }

  const totalIncEx = Object.values(incByCat).reduce((s, v) => s + v.exIva, 0);
  const totalIncInc = Object.values(incByCat).reduce((s, v) => s + v.incIva, 0);
  const totalExpEx = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpInc = expenses.reduce((s, t) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);

  const lines: DRELine[] = [];
  lines.push({ label: "RECEITAS", amountExIva: totalIncEx, ivaAmount: totalIncInc - totalIncEx, amountIncIva: totalIncInc, isTotal: true });
  Object.entries(incByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  lines.push({ label: "DESPESAS", amountExIva: totalExpEx, ivaAmount: totalExpInc - totalExpEx, amountIncIva: totalExpInc, isTotal: true });
  Object.entries(expByCat).sort((a, b) => b[1].exIva - a[1].exIva)
    .forEach(([name, val]) => lines.push({ label: name, amountExIva: val.exIva, ivaAmount: val.iva, amountIncIva: val.incIva, indent: true }));
  const resEx = totalIncEx - totalExpEx;
  const resInc = totalIncInc - totalExpInc;
  lines.push({ label: "RESULTADO LÍQUIDO", amountExIva: resEx, ivaAmount: resInc - resEx, amountIncIva: resInc, isGrandTotal: true });
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
      const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false });
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
      prev.length === events.length ? [] : events.map((e) => e.id)
    );
  };

  const activeEvents = selectedEventIds.length > 0
    ? events.filter((e) => selectedEventIds.includes(e.id))
    : events;

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
    const dre = buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, e.id, ticketCategoryId);
    const revLine = dre.find((l) => l.label === "RECEITAS");
    const expLine = dre.find((l) => l.label === "DESPESAS");
    const resLine = dre.find((l) => l.label === "RESULTADO LÍQUIDO");

    return {
      ...e,
      totalIncEx: revLine?.amountExIva ?? 0,
      totalIncInc: revLine?.amountIncIva ?? 0,
      totalExpEx: expLine?.amountExIva ?? 0,
      totalExpInc: expLine?.amountIncIva ?? 0,
      resultEx: resLine?.amountExIva ?? 0,
      resultInc: resLine?.amountIncIva ?? 0,
      txCount: evtTx.length,
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
            {selectedEventIds.length === events.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {events.filter((e) => !e.parent_event_id).map((e) => {
            const children = events.filter((c) => c.parent_event_id === e.id);
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
          {events.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos registados.</p>}
        </div>
        {selectedEventIds.length === 0 && events.length > 0 && (
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
        <button
          onClick={() => exportDREToPDF(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
        <button
          onClick={() => exportDREToExcel(activeEvents, transactions, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, ticketCategoryId)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
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
          const evtTx = transactions.filter((t: any) => t.event_id === evt.id);
          const dre = isOpen ? buildDRE(evtTx, categories, ticketRevenueSource, ticketZones, ticketLots, ticketSales, evt.id, ticketCategoryId) : [];

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
                          const rowClass = line.isGrandTotal
                            ? "border-t-2 border-primary/30 bg-primary/5"
                            : line.isTotal ? "bg-secondary/20" : "";
                          const labelClass = `${line.indent ? "pl-8" : ""} ${line.isTotal || line.isGrandTotal ? "font-bold text-xs uppercase tracking-wider" : "text-sm"}`;
                          const valClass = (amt: number) =>
                            `text-right font-mono ${line.isGrandTotal ? `text-base font-bold ${amt >= 0 ? "text-success" : "text-destructive"}` : line.isTotal ? "font-semibold" : "text-muted-foreground"}`;
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
