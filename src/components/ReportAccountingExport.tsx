import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, AlertTriangle, CheckCircle2, History, FileArchive, Loader2 } from "lucide-react";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function ReportAccountingExport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [generated, setGenerated] = useState(false);

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : "";
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : "";

  // Fetch transactions in period with accounting docs info
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["accounting-export-tx", dateFromStr, dateToStr],
    queryFn: async () => {
      if (!dateFromStr || !dateToStr) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, description, amount, type, status, account_id, event_id, supplier_id, events(name), suppliers(name), financial_accounts:account_id(name)")
        .gte("date", dateFromStr)
        .lte("date", dateToStr)
        .not("account_id", "is", null)
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: generated && !!dateFromStr && !!dateToStr,
  });

  const txIds = useMemo(() => transactions.map((t: any) => t.id), [transactions]);

  // Fetch accounting docs for these transactions
  const { data: docMap = {} } = useQuery({
    queryKey: ["accounting-export-docs", txIds],
    queryFn: async () => {
      if (txIds.length === 0) return {};
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id, is_accounting, file_url, name")
        .in("transaction_id", txIds)
        .eq("is_accounting", true);
      if (error) throw error;
      const map: Record<string, { count: number; files: { url: string; name: string }[] }> = {};
      data.forEach((d: any) => {
        if (!map[d.transaction_id]) map[d.transaction_id] = { count: 0, files: [] };
        map[d.transaction_id].count++;
        map[d.transaction_id].files.push({ url: d.file_url, name: d.name });
      });
      return map;
    },
    enabled: generated && txIds.length > 0,
  });

  // Export history
  const { data: exportHistory = [] } = useQuery({
    queryKey: ["accounting-exports-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_exports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const lines = useMemo(() => {
    return transactions.map((t: any) => {
      const docs = (docMap as any)[t.id] || { count: 0, files: [] };
      return { ...t, accountingDocs: docs.count, files: docs.files, hasDocs: docs.count > 0 };
    });
  }, [transactions, docMap]);

  const withDocs = lines.filter((l) => l.hasDocs);
  const withoutDocs = lines.filter((l) => !l.hasDocs);
  const totalAmount = withDocs.reduce((s, l) => s + Number(l.amount), 0);
  const totalDocsCount = withDocs.reduce((s, l) => s + l.accountingDocs, 0);

  // Register export in history
  const registerExport = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounting_exports").insert({
        period_from: dateFromStr,
        period_to: dateToStr,
        exported_by: user?.email || "unknown",
        transaction_count: withDocs.length,
        document_count: totalDocsCount,
        pending_count: withoutDocs.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-exports-history"] });
    },
  });

  // Download individual file
  async function downloadFile(filePath: string, fileName: string) {
    const { data, error } = await supabase.storage
      .from("transaction-documents")
      .download(filePath);
    if (error) {
      toast.error("Erro ao descarregar ficheiro");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export all accounting docs as individual downloads + register
  async function handleExport() {
    if (withDocs.length === 0) {
      toast.error("Nenhuma transação com documentos contábeis para exportar.");
      return;
    }

    toast.info(`A iniciar download de ${totalDocsCount} documento(s)…`);

    // Download each file
    for (const line of withDocs) {
      for (const file of line.files) {
        await downloadFile(file.url, file.name);
      }
    }

    // Register export
    await registerExport.mutateAsync();
    toast.success(`Exportação registada: ${withDocs.length} transações, ${totalDocsCount} documentos.`);
  }

  const canGenerate = dateFrom && dateTo;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium flex items-center gap-2">
          Período de Exportação
          <HelpTooltip text={helpTexts.accountingExport} size={14} />
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="flex items-end">
            <button
              onClick={() => setGenerated(true)}
              disabled={!canGenerate}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Transações</p>
              <p className="mt-1 text-lg font-bold">{lines.length}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Com Docs Contábeis</p>
              <p className="mt-1 text-lg font-bold text-success">{withDocs.length}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem Docs (Pendentes)</p>
              <p className="mt-1 text-lg font-bold text-warning">{withoutDocs.length}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor Exportável</p>
              <p className="mt-1 text-lg font-bold">{formatCurrency(totalAmount)}</p>
            </div>
          </div>

          {/* Pendency alert */}
          {withoutDocs.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-medium">Atenção: {withoutDocs.length} transação(ões) sem documentos contábeis</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Estas transações não serão incluídas na exportação. Regularize as pendências no relatório de Pendências Documentais.
                </p>
              </div>
            </div>
          )}

          {/* Export button */}
          {isLoading ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground">A carregar…</p>
            </div>
          ) : withDocs.length > 0 ? (
            <div className="flex items-center justify-end gap-2">
              <Button onClick={handleExport} disabled={registerExport.isPending}>
                {registerExport.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                Exportar {totalDocsCount} documento(s) contábil(eis)
              </Button>
            </div>
          ) : (
            <div className="glass rounded-xl p-8 text-center space-y-2">
              <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
              <p className="text-muted-foreground font-medium">Nenhum documento contábil encontrado no período selecionado.</p>
            </div>
          )}

          {/* Transactions with docs table */}
          {withDocs.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Transações com documentos contábeis ({withDocs.length})
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-right">Valor (€)</TableHead>
                    <TableHead className="text-center">Docs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withDocs.map((line: any) => (
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
                      <TableCell className="text-right font-mono text-sm">
                        <span className={line.type === "income" ? "text-success" : "text-foreground"}>
                          {formatCurrency(Number(line.amount))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{line.accountingDocs}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Export history */}
      {exportHistory.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico de Exportações
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data Export.</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Exportado por</TableHead>
                <TableHead className="text-center">Transações</TableHead>
                <TableHead className="text-center">Documentos</TableHead>
                <TableHead className="text-center">Pendentes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exportHistory.map((exp: any) => (
                <TableRow key={exp.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDatePT(exp.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDatePT(exp.period_from)} — {formatDatePT(exp.period_to)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{exp.exported_by}</TableCell>
                  <TableCell className="text-center text-sm">{exp.transaction_count}</TableCell>
                  <TableCell className="text-center text-sm">{exp.document_count}</TableCell>
                  <TableCell className="text-center">
                    {exp.pending_count > 0 ? (
                      <Badge variant="outline" className="border-warning text-warning text-xs">{exp.pending_count}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-success text-success text-xs">0</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
