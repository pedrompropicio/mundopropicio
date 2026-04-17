import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { exportContasPagarToExcel, exportContasPagarToPDF } from "@/lib/export-contas-pagar";
import { FileSpreadsheet, FileText, Filter, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export default function ReportContasPagar() {
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "not_overdue">("all");
  const [balanceFilter, setBalanceFilter] = useState<"open" | "all">("open");
  const [pdfGroupByEvent, setPdfGroupByEvent] = useState(false);

  // Applied filters (only update when user clicks "Consultar")
  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [appliedDateFrom, setAppliedDateFrom] = useState<Date | undefined>(undefined);
  const [appliedDateTo, setAppliedDateTo] = useState<Date | undefined>(undefined);
  const [appliedDueFilter, setAppliedDueFilter] = useState<"all" | "overdue" | "not_overdue">("all");
  const [appliedBalanceFilter, setAppliedBalanceFilter] = useState<"open" | "all">("open");
  const [hasSearched, setHasSearched] = useState(false);

  const handleConsultar = () => {
    setAppliedEventIds(new Set(selectedEventIds));
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setAppliedDueFilter(dueFilter);
    setAppliedBalanceFilter(balanceFilter);
    setHasSearched(true);
  };

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["contas-pagar-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), suppliers(name, iban), account_categories(code, name)")
        .eq("type", "expense")
        .in("status", ["approved", "pending"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllEvents = () => {
    if (selectedEventIds.size === events.length) setSelectedEventIds(new Set());
    else setSelectedEventIds(new Set(events.map((e: any) => e.id)));
  };

  const filtered = useMemo(() => {
    if (!hasSearched) return [];
    const today = new Date().toISOString().slice(0, 10);
    let result = transactions;

    // Balance filter
    if (appliedBalanceFilter === "open") {
      result = result.filter((t: any) => {
        const amount = Number(t.amount) * (1 + (t.iva_rate ?? 23) / 100);
        const paid = Number(t.paid_amount ?? 0);
        return paid < amount;
      });
    }

    if (appliedEventIds.size > 0) {
      result = result.filter((t: any) => appliedEventIds.has(t.event_id));
    }

    if (appliedDateFrom) {
      const from = appliedDateFrom.toISOString().slice(0, 10);
      result = result.filter((t: any) => {
        const d = t.due_date ?? t.date;
        return d && d >= from;
      });
    }

    if (appliedDateTo) {
      const to = appliedDateTo.toISOString().slice(0, 10);
      result = result.filter((t: any) => {
        const d = t.due_date ?? t.date;
        return d && d <= to;
      });
    }

    // Due status filter
    if (appliedDueFilter === "overdue") {
      result = result.filter((t: any) => {
        const dueDate = t.due_date;
        return dueDate && dueDate < today;
      });
    } else if (appliedDueFilter === "not_overdue") {
      result = result.filter((t: any) => {
        const dueDate = t.due_date;
        return !dueDate || dueDate >= today;
      });
    }

    return result;
  }, [transactions, appliedEventIds, appliedDateFrom, appliedDateTo, appliedDueFilter, appliedBalanceFilter, hasSearched]);

  // Compute status
  const getStatus = (t: any) => {
    const amount = Number(t.amount);
    const paid = Number(t.paid_amount ?? 0);
    if (t.status === "paid" || paid >= amount) return "paid";
    if (t.status === "approved") return "approved";
    const todayStr = new Date().toISOString().slice(0, 10);
    if (t.due_date && t.due_date.slice(0, 10) < todayStr && t.status !== "paid") return "overdue";
    return "pending";
  };

  const statusLabel: Record<string, string> = {
    pending: "Aguardando",
    approved: "A Pagar",
    paid: "Pago",
    overdue: "Atrasado",
  };

  const statusClass: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-blue-500/15 text-blue-400",
    paid: "bg-success/15 text-success",
    overdue: "bg-destructive/15 text-destructive",
  };

  const totalWithIva = filtered.reduce((sum: number, t: any) => sum + Number(t.amount) * (1 + (t.iva_rate ?? 23) / 100), 0);
  const totalPaid = filtered.reduce((sum: number, t: any) => sum + Number(t.paid_amount ?? 0), 0);
  const totalBalance = totalWithIva - totalPaid;

  // Group by event when multiple events
  const groupedByEvent = useMemo(() => {
    if (appliedEventIds.size <= 1 && filtered.length > 0) {
      return [{ eventName: null, items: filtered }];
    }
    const map = new Map<string, { eventName: string; items: any[] }>();
    for (const t of filtered) {
      const eName = (t.events as any)?.name ?? "Sem evento";
      if (!map.has(eName)) map.set(eName, { eventName: eName, items: [] });
      map.get(eName)!.items.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.eventName.localeCompare(b.eventName));
  }, [filtered, appliedEventIds]);

  const handleExportExcel = () => {
    exportContasPagarToExcel({
      dateFrom: dateFrom ? format(dateFrom, "dd/MM/yyyy") : null,
      dateTo: dateTo ? format(dateTo, "dd/MM/yyyy") : null,
      eventNames: selectedEventIds.size > 0
        ? events.filter((e: any) => selectedEventIds.has(e.id)).map((e: any) => e.name)
        : null,
      items: filtered.map((t: any) => ({
        description: t.description,
        specification: t.specification,
        event_name: (t.events as any)?.name ?? "-",
        supplier_name: (t.suppliers as any)?.name ?? "-",
        iban: (t.suppliers as any)?.iban ?? "-",
        category_name: (t.account_categories as any) ? `${(t.account_categories as any).code} ${(t.account_categories as any).name}` : "-",
        amount: Number(t.amount),
        iva_rate: t.iva_rate ?? 23,
        paid_amount: Number(t.paid_amount ?? 0),
        due_date: t.due_date,
        date: t.date,
        status: statusLabel[getStatus(t)] ?? t.status,
      })),
    });
  };

  const handleExportPDF = () => {
    exportContasPagarToPDF({
      dateFrom: dateFrom ? format(dateFrom, "dd/MM/yyyy") : null,
      dateTo: dateTo ? format(dateTo, "dd/MM/yyyy") : null,
      eventNames: selectedEventIds.size > 0
        ? events.filter((e: any) => selectedEventIds.has(e.id)).map((e: any) => e.name)
        : null,
      groupByEvent: pdfGroupByEvent,
      items: filtered.map((t: any) => ({
        description: t.description,
        specification: t.specification,
        event_name: (t.events as any)?.name ?? "-",
        supplier_name: (t.suppliers as any)?.name ?? "-",
        iban: (t.suppliers as any)?.iban ?? "-",
        category_name: (t.account_categories as any) ? `${(t.account_categories as any).code} ${(t.account_categories as any).name}` : "-",
        amount: Number(t.amount),
        iva_rate: t.iva_rate ?? 23,
        paid_amount: Number(t.paid_amount ?? 0),
        due_date: t.due_date,
        date: t.date,
        status: statusLabel[getStatus(t)] ?? t.status,
      })),
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Event multi-select */}
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Eventos</label>
            <Popover modal={false}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <Filter className="mr-2 h-4 w-4" />
                  {selectedEventIds.size === 0
                    ? "Todos os eventos"
                    : `${selectedEventIds.size} evento(s) selecionado(s)`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 max-h-72 overflow-y-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
                  <Checkbox
                    checked={selectedEventIds.size === events.length && events.length > 0}
                    onCheckedChange={toggleAllEvents}
                  />
                  <span className="text-sm font-medium">Selecionar todos</span>
                </div>
                {events.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleEvent(e.id)}
                  >
                    <Checkbox checked={selectedEventIds.has(e.id)} onCheckedChange={() => toggleEvent(e.id)} />
                    <span className="text-sm">{e.name}</span>
                  </div>
                ))}
                <div className="border-t border-border/50 pt-2 mt-2 sticky bottom-0 bg-popover">
                  <PopoverClose asChild>
                    <Button variant="outline" size="sm" className="w-full">Fechar</Button>
                  </PopoverClose>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date from */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Vcto Início</label>
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Sem limite"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); }}
                  locale={pt}
                  className={cn("p-3 pointer-events-auto")}
                />
                {dateFrom && (
                  <div className="border-t border-border/50 p-2">
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDateFrom(undefined); setDateFromOpen(false); }}>Limpar</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Date to */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Vcto Fim</label>
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "Sem limite"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => { setDateTo(d); setDateToOpen(false); }}
                  locale={pt}
                  className={cn("p-3 pointer-events-auto")}
                />
                {dateTo && (
                  <div className="border-t border-border/50 p-2">
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDateTo(undefined); setDateToOpen(false); }}>Limpar</Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Due status filter */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Vencimento</label>
            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[140px] h-10"
            >
              <option value="all">Todas</option>
              <option value="overdue">Vencidas</option>
              <option value="not_overdue">Não vencidas</option>
            </select>
          </div>

          {/* Balance filter */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</label>
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[140px] h-10"
            >
              <option value="open">Com saldo aberto</option>
              <option value="all">Todas (incl. pagas)</option>
            </select>
          </div>

          {/* Consultar button */}
          <Button onClick={handleConsultar} className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Consultar
          </Button>

          {/* Export buttons */}
          <div className="flex items-center gap-3 ml-auto">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={pdfGroupByEvent}
                onCheckedChange={(v) => setPdfGroupByEvent(!!v)}
              />
              Quebrar por evento
            </label>
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filtered.length === 0}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filtered.length === 0}>
              <FileText className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Active filter summary */}
        {hasSearched && (
          <div className="mt-3 pt-3 border-t border-border/50 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Filtros aplicados: </span>
            {appliedDateFrom || appliedDateTo ? (
              <span>
                Período Vcto: {appliedDateFrom ? format(appliedDateFrom, "dd/MM/yyyy") : "—"} a {appliedDateTo ? format(appliedDateTo, "dd/MM/yyyy") : "—"}
              </span>
            ) : (
              <span>Sem filtro de data</span>
            )}
            {appliedEventIds.size > 0 && (
              <span>
                {" · "}Eventos: {events.filter((e: any) => appliedEventIds.has(e.id)).map((e: any) => e.name).join(", ")}
              </span>
            )}
            {appliedEventIds.size === 0 && <span>{" · "}Todos os eventos</span>}
            {appliedDueFilter !== "all" && (
              <span>{" · "}{appliedDueFilter === "overdue" ? "Apenas vencidas" : "Apenas não vencidas"}</span>
            )}
            {appliedBalanceFilter === "open" && <span>{" · "}Com saldo aberto</span>}
            {appliedBalanceFilter === "all" && <span>{" · "}Todas (incl. pagas)</span>}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Transações</p>
          <p className="mt-1 text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total c/IVA</p>
          <p className="mt-1 text-2xl font-bold text-warning">{formatCurrency(totalWithIva)}</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Já Pago</p>
          <p className="mt-1 text-2xl font-bold text-success">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Aberto</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{formatCurrency(totalBalance)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-5">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar…</p>
        ) : !hasSearched ? (
          <p className="py-8 text-center text-muted-foreground">Selecione os filtros e clique em "Consultar" para ver os resultados.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhuma conta a pagar encontrada com os filtros selecionados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  {groupedByEvent.length <= 1 && (
                    <th className="pb-3 text-left font-medium hidden sm:table-cell">Evento</th>
                  )}
                  <th className="pb-3 text-left font-medium hidden md:table-cell">Fornecedor</th>
                  <th className="pb-3 text-left font-medium hidden lg:table-cell">Conta</th>
                  <th className="pb-3 text-center font-medium hidden lg:table-cell">IVA</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-left font-medium">Data Vcto</th>
                  <th className="pb-3 text-right font-medium">Pago</th>
                  <th className="pb-3 text-right font-medium">Valor c/IVA</th>
                  <th className="pb-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {groupedByEvent.map((group) => {
                  const colSpan = groupedByEvent.length > 1 ? 9 : 10;
                  const groupWithIva = group.items.reduce((s: number, t: any) => s + Number(t.amount) * (1 + (t.iva_rate ?? 23) / 100), 0);
                  const groupPaid = group.items.reduce((s: number, t: any) => s + Number(t.paid_amount ?? 0), 0);
                  const groupBalance = groupWithIva - groupPaid;

                  return (
                    <React.Fragment key={group.eventName ?? "all"}>
                      {group.eventName && (
                        <tr className="bg-muted/30">
                          <td colSpan={colSpan} className="py-2.5 px-3 font-semibold text-foreground">
                            {group.eventName}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">({group.items.length} itens)</span>
                          </td>
                        </tr>
                      )}
                      {group.items.map((t: any) => {
                        const amount = Number(t.amount);
                        const ivaRate = t.iva_rate ?? 23;
                        const withIva = amount * (1 + ivaRate / 100);
                        const paid = Number(t.paid_amount ?? 0);
                        const balance = withIva - paid;
                        const cs = getStatus(t);

                        return (
                          <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="py-3 pr-4">
                              <p className="font-medium">{t.description}</p>
                              {t.specification && <p className="text-xs text-muted-foreground">{t.specification}</p>}
                            </td>
                            {groupedByEvent.length <= 1 && (
                              <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{(t.events as any)?.name ?? "—"}</td>
                            )}
                            <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{(t.suppliers as any)?.name ?? "—"}</td>
                            <td className="hidden py-3 pr-4 text-muted-foreground lg:table-cell">{(t.account_categories as any)?.name ?? "—"}</td>
                            <td className="hidden py-3 pr-4 text-center lg:table-cell">
                              <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{ivaRate}%</span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[cs] ?? "bg-secondary text-muted-foreground"}`}>
                                {statusLabel[cs] ?? cs}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                              {t.due_date ? formatDatePT(t.due_date) : "—"}
                            </td>
                            <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">{formatCurrency(paid)}</td>
                            <td className="py-3 text-right font-mono font-semibold text-warning whitespace-nowrap">{formatCurrency(withIva)}</td>
                            <td className="py-3 text-right font-mono font-semibold text-destructive whitespace-nowrap">{formatCurrency(balance)}</td>
                          </tr>
                        );
                      })}
                      {group.eventName && (
                        <tr className="bg-muted/20 border-t border-border/40">
                          <td colSpan={colSpan - 3} className="py-2 text-right text-xs font-medium text-muted-foreground">Subtotal {group.eventName}</td>
                          <td className="py-2 text-right font-mono text-xs text-muted-foreground">{formatCurrency(groupPaid)}</td>
                          <td className="py-2 text-right font-mono text-xs font-semibold text-warning">{formatCurrency(groupWithIva)}</td>
                          <td className="py-2 text-right font-mono text-xs font-semibold text-destructive">{formatCurrency(groupBalance)}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={groupedByEvent.length > 1 ? 6 : 7} className="py-3 text-right text-muted-foreground">Total Geral</td>
                  <td className="py-3 text-right font-mono text-success">{formatCurrency(totalPaid)}</td>
                  <td className="py-3 text-right font-mono text-warning">{formatCurrency(totalWithIva)}</td>
                  <td className="py-3 text-right font-mono text-destructive">{formatCurrency(totalBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
