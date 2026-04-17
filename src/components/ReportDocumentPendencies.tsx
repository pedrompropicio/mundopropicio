import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, FileSpreadsheet, AlertTriangle, CalendarIcon, CheckCircle2, XCircle } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn, formatDatePT } from "@/lib/utils";
import { utils, writeFile } from "xlsx";
import { applyPTNumberFormat } from "@/lib/excel-format";

export default function ReportDocumentPendencies() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "pending" | "ok">("pending");
  const [generated, setGenerated] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : "";
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : "";

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["doc-pendencies-tx", dateFromStr, dateToStr, selectedAccountId, selectedEventId],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, date, description, amount, type, status, account_id, event_id, supplier_id, events(name), suppliers(name), financial_accounts:account_id(name)")
        .order("date", { ascending: true });
      if (dateFromStr) q = q.gte("date", dateFromStr);
      if (dateToStr) q = q.lte("date", dateToStr);
      if (selectedAccountId) q = q.eq("account_id", selectedAccountId);
      if (selectedEventId) q = q.eq("event_id", selectedEventId);
      // Only transactions with a bank account (should have docs)
      q = q.not("account_id", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: generated,
  });

  const txIds = useMemo(() => transactions.map((t: any) => t.id), [transactions]);

  const { data: docMap = {} } = useQuery({
    queryKey: ["doc-pendencies-docs", txIds],
    queryFn: async () => {
      if (txIds.length === 0) return {};
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id, is_accounting")
        .in("transaction_id", txIds);
      if (error) throw error;
      const map: Record<string, { total: number; accounting: number }> = {};
      data.forEach((d: any) => {
        if (!map[d.transaction_id]) map[d.transaction_id] = { total: 0, accounting: 0 };
        map[d.transaction_id].total++;
        if (d.is_accounting) map[d.transaction_id].accounting++;
      });
      return map;
    },
    enabled: generated && txIds.length > 0,
  });

  const lines = useMemo(() => {
    return transactions.map((t: any) => {
      const docs = (docMap as any)[t.id] || { total: 0, accounting: 0 };
      return {
        ...t,
        totalDocs: docs.total,
        accountingDocs: docs.accounting,
        hasPendency: docs.accounting === 0,
      };
    });
  }, [transactions, docMap]);

  const filtered = useMemo(() => {
    if (filterMode === "pending") return lines.filter((l) => l.hasPendency);
    if (filterMode === "ok") return lines.filter((l) => !l.hasPendency);
    return lines;
  }, [lines, filterMode]);

  const totalPending = lines.filter((l) => l.hasPendency).length;
  const totalOk = lines.filter((l) => !l.hasPendency).length;
  const totalAmount = filtered.reduce((s, l) => s + Number(l.amount), 0);

  function handleExportExcel() {
    const rows = filtered.map((l) => ({
      Data: formatDatePT(l.date),
      Descrição: l.description,
      Evento: l.events?.name ?? "—",
      Fornecedor: l.suppliers?.name ?? "—",
      Conta: (l as any).financial_accounts?.name ?? "—",
      Tipo: l.type === "income" ? "Receita" : "Despesa",
      "Valor (€)": Number(l.amount),
      "Docs Contábeis": l.accountingDocs,
      "Total Docs": l.totalDocs,
      Status: l.hasPendency ? "⚠️ Pendente" : "✅ OK",
    }));
    const ws = utils.json_to_sheet(rows);
    applyPTNumberFormat(ws);
    ws["!cols"] = [
      { wch: 12 }, { wch: 35 }, { wch: 25 }, { wch: 25 }, { wch: 20 },
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Pendências");
    writeFile(wb, `pendencias-documentais-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium">Parâmetros de Auditoria</p>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Início</label>
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setGenerated(false); setDateFromOpen(false); }} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim</label>
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setGenerated(false); setDateToOpen(false); }} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta</label>
            <select
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setGenerated(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Todas</option>
              {accounts.filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento</label>
            <select
              value={selectedEventId}
              onChange={(e) => { setSelectedEventId(e.target.value); setGenerated(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Todos</option>
              {events.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setGenerated(true)}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Transações</p>
              <p className="mt-1 text-lg font-bold">{lines.length}</p>
            </div>
            <button
              onClick={() => setFilterMode("pending")}
              className={cn("glass rounded-xl p-4 text-left transition-all", filterMode === "pending" && "ring-2 ring-warning")}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pendentes</p>
              <p className="mt-1 text-lg font-bold text-warning">{totalPending}</p>
            </button>
            <button
              onClick={() => setFilterMode("ok")}
              className={cn("glass rounded-xl p-4 text-left transition-all", filterMode === "ok" && "ring-2 ring-success")}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Conformes</p>
              <p className="mt-1 text-lg font-bold text-success">{totalOk}</p>
            </button>
            <button
              onClick={() => setFilterMode("all")}
              className={cn("glass rounded-xl p-4 text-left transition-all", filterMode === "all" && "ring-2 ring-primary")}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor Total</p>
              <p className="mt-1 text-lg font-bold">{formatCurrency(totalAmount)}</p>
            </button>
          </div>

          {/* Export */}
          <div className="flex items-center justify-end gap-2">
            <HelpTooltip text={helpTexts.exportPendencies} side="left" size={14} />
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filtered.length === 0}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground">A carregar…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="text-muted-foreground font-medium">
                {filterMode === "pending" ? "Nenhuma pendência encontrada! 🎉" : "Sem transações para os filtros selecionados."}
              </p>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor (€)</TableHead>
                    <TableHead className="text-center">Docs</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((line: any) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDatePT(line.date)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{line.description}</p>
                        {line.suppliers?.name && (
                          <p className="text-xs text-muted-foreground">{line.suppliers.name}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.events?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(line as any).financial_accounts?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={line.type === "income" ? "text-success" : "text-foreground"}>
                          {formatCurrency(Number(line.amount))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs">
                          {line.accountingDocs > 0 ? (
                            <Badge variant="secondary" className="text-xs">{line.accountingDocs} contábil</Badge>
                          ) : (
                            <span className="text-muted-foreground">{line.totalDocs > 0 ? `${line.totalDocs} (não contábil)` : "0"}</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {line.hasPendency ? (
                          <Badge variant="outline" className="border-warning text-warning gap-1">
                            <AlertTriangle className="h-3 w-3" /> Pendente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-success text-success gap-1">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
