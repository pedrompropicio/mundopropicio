import { useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useBankMovementGroups } from "@/hooks/useBankMovementGroups";
import { groupStatementLines, type StatementRenderItem } from "@/lib/statement-grouping";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Landmark, Lock, CalendarIcon, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { exportBankStatementToPDF, exportBankStatementToExcel } from "@/lib/export-bank-statement";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn, formatDatePT } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { countsAfterCutoff, effectivePaymentDate, buildAccountCutoffs, fetchAccountCashAdjustments } from "@/lib/account-balance";

export default function ReportBankStatement() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(searchParams.get("conta") ?? "");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  // ?conta=<id>&auto=1 abre o extrato já preenchido (vem da composição do saldo).
  const [generated, setGenerated] = useState(
    !!searchParams.get("conta") && searchParams.get("auto") === "1",
  );
  const [docsModal, setDocsModal] = useState<{ id: string; description: string } | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : "";
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : "";

  // Critério de data ÚNICO: todo o relatório (período, corte, ordenação) usa a
  // data efetiva COALESCE(payment_date, date), como os outros consumidores da
  // fonte única. Por isso a query não filtra por `date` — o período é aplicado
  // em memória sobre a data efetiva.
  const { data: transactions = [] } = useQuery({
    queryKey: ["bank-statement-tx", selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), suppliers(name)")
        .eq("account_id", selectedAccountId);
      if (error) throw error;
      return data;
    },
    enabled: generated && !!selectedAccountId,
  });

  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);
  const canSeeBalance = selectedAccount && (isAdmin || selectedAccount.balance_visible_to_all);
  const isUncontrolledBalance = selectedAccount?.skip_balance_check ?? false;
  const balanceCutoff = (selectedAccount as any)?.initial_balance_date ?? null;

  function handleGenerate() {
    if (!selectedAccountId) return;
    setGenerated(true);
  }

  // Ajustes de caixa (retenção na fonte + crédito de fornecedor): entram no
  // saldo da fonte única computeAccountBalance, por isso têm de entrar aqui
  // também — senão o Saldo Final do Extrato diverge do módulo Contas.
  const { data: cashAdj } = useQuery({
    queryKey: ["bank-statement-adj", selectedAccountId, dateFromStr, dateToStr, balanceCutoff],
    queryFn: async () => {
      const cutoffs = buildAccountCutoffs([{ id: selectedAccountId, initial_balance_date: balanceCutoff }]);
      const [before, inPeriod] = await Promise.all([
        dateFromStr
          ? fetchAccountCashAdjustments([selectedAccountId], cutoffs, { lt: dateFromStr })
          : Promise.resolve(new Map<string, number>()),
        fetchAccountCashAdjustments([selectedAccountId], cutoffs, {
          gte: dateFromStr || undefined,
          lte: dateToStr || undefined,
        }),
      ]);
      return {
        before: before.get(selectedAccountId) ?? 0,
        inPeriod: inPeriod.get(selectedAccountId) ?? 0,
      };
    },
    enabled: generated && !!selectedAccountId,
  });

  const txIdsForDocs = useMemo(() => transactions.map((t: any) => t.id), [transactions]);

  const { data: docCounts = {} } = useQuery({
    queryKey: ["tx-doc-counts-bs", txIdsForDocs],
    queryFn: async () => {
      if (txIdsForDocs.length === 0) return {};
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id")
        .in("transaction_id", txIdsForDocs);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((d: any) => { counts[d.transaction_id] = (counts[d.transaction_id] || 0) + 1; });
      return counts;
    },
    enabled: generated && txIdsForDocs.length > 0,
  });

  // Saldo de abertura: initial_balance (saldo ao FECHO da data de corte, quando
  // definida) + movimentos posteriores ao corte e anteriores à Data Início +
  // ajustes de caixa do mesmo intervalo.
  const openingBalance = (() => {
    if (!canSeeBalance || !selectedAccount) return 0;
    let bal = Number(selectedAccount.initial_balance ?? 0);
    if (dateFromStr) {
      transactions.forEach((t: any) => {
        if (!countsAfterCutoff(t, balanceCutoff)) return;
        const eff = effectivePaymentDate(t);
        if (!eff || eff >= dateFromStr) return;
        const amt = Number(t.paid_amount ?? 0);
        if (t.type === "income") bal += amt;
        else bal -= amt;
      });
      bal += cashAdj?.before ?? 0;
    }
    return bal;
  })();

  // Linhas do extrato: o corte vale em TODAS as linhas (o anterior ao corte já
  // está no initial_balance) e o período é sobre a data efetiva. Valor por
  // `paid_amount`, para o relatório e o módulo Contas darem o mesmo número.
  const lines = (() => {
    if (!generated || !canSeeBalance) return [];
    let runningBalance = openingBalance;
    const out = transactions
      .filter((t: any) => {
        if (!countsAfterCutoff(t, balanceCutoff)) return false;
        const eff = effectivePaymentDate(t);
        if (dateFromStr && (!eff || eff < dateFromStr)) return false;
        if (dateToStr && (!eff || eff > dateToStr)) return false;
        return true;
      })
      .sort((a: any, b: any) => effectivePaymentDate(a).localeCompare(effectivePaymentDate(b)))
      .map((t: any) => {
        const amount = Number(t.paid_amount ?? 0);
        const isIncome = t.type === "income";
        if (isIncome) runningBalance += amount;
        else runningBalance -= amount;
        return {
          ...t,
          date: effectivePaymentDate(t) || t.date,
          runningBalance,
          signedAmount: isIncome ? amount : -amount,
        };
      });

    // Linha própria e identificada: o utilizador tem de ver de onde vem a
    // diferença face ao movimento bancário.
    const adj = cashAdj?.inPeriod ?? 0;
    if (adj !== 0) {
      runningBalance += adj;
      out.push({
        id: "__cash_adjustments__",
        date: dateToStr || out[out.length - 1]?.date || "",
        description: "Ajustes de caixa (retenção na fonte + crédito de fornecedor)",
        events: null,
        suppliers: null,
        runningBalance,
        signedAmount: adj,
      } as any);
    }
    return out;
  })();


  const closingBalance = lines.length > 0 ? lines[lines.length - 1].runningBalance : openingBalance;
  const totalIncome = lines.filter((l) => l.signedAmount > 0).reduce((s, l) => s + l.signedAmount, 0);
  const totalExpense = lines.filter((l) => l.signedAmount < 0).reduce((s, l) => s + Math.abs(l.signedAmount), 0);

  // ---- Consolidação de movimentos do banco (apenas apresentação) ----------
  // O `lines` acima é canónico e NÃO é tocado: saldo final, totais e as duas
  // exportações continuam a sair dele. Aqui só se decide o que se desenha.
  const { consolidateBankMovements, setConsolidateBankMovements } = useUserPreferences();
  const bankGroups = useBankMovementGroups(selectedAccountId, generated && !!canSeeBalance);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Anexos do MOVIMENTO do banco (D-ERP41): vivem em `bank_line_documents`,
  // pendurados na linha do extrato, não nas transações. Só os grupos de fonte
  // `bank` têm linha; os de fonte `sepa` (recurso) não têm e ficam sem clip.
  const bankLineIdsForDocs = useMemo(
    () =>
      Array.from(bankGroups.groups.values())
        .filter((g) => g.source === "bank")
        .map((g) => g.groupId.slice("bank:".length))
        .sort(),
    [bankGroups.groups],
  );

  const { data: bankLineDocCounts = {} } = useQuery({
    queryKey: ["bank-line-doc-counts-bs", bankLineIdsForDocs],
    enabled: generated && bankLineIdsForDocs.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < bankLineIdsForDocs.length; i += 200) {
        const { data, error } = await (supabase as any)
          .from("bank_line_documents")
          .select("line_id")
          .in("line_id", bankLineIdsForDocs.slice(i, i + 200));
        if (error) throw error;
        (data ?? []).forEach((d: any) => {
          counts[d.line_id] = (counts[d.line_id] || 0) + 1;
        });
      }
      return counts;
    },
  });

  const renderItems: StatementRenderItem<any>[] = useMemo(() => {
    if (!consolidateBankMovements || bankGroups.groups.size === 0) {
      return lines.map((line: any) => ({ kind: "tx" as const, line }));
    }
    return groupStatementLines(lines as any[], {
      getId: (l: any) => l.id,
      getAmount: (l: any) => Number(l.signedAmount ?? 0),
      getRunningBalance: (l: any) => Number(l.runningBalance ?? 0),
      getDate: (l: any) => String(l.date ?? ""),
      getEventName: (l: any) => l.events?.name ?? null,
      byTx: bankGroups.byTx,
      groups: bankGroups.groups,
    });
  }, [lines, consolidateBankMovements, bankGroups]);

  return (
    <>
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium">Parâmetros do Extrato</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta *</label>
            <select
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setGenerated(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Selecionar conta…</option>
              {accounts.filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
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
              onClick={handleGenerate}
              disabled={!selectedAccountId}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {/* Not authorized message */}
      {generated && selectedAccount && !canSeeBalance && (
        <div className="glass rounded-xl p-8 text-center space-y-3">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground font-medium">Sem autorização para visualizar o saldo desta conta</p>
          <p className="text-xs text-muted-foreground">
            O saldo desta conta está restrito. Contacte um administrador para obter acesso.
          </p>
        </div>
      )}

      {/* Results */}
      {generated && canSeeBalance && (
        <>
          {/* Data de implantação do saldo inicial (D-ERP25) */}
          {balanceCutoff && (
            <p className="text-xs text-muted-foreground">
              Saldo implantado a {formatDatePT(balanceCutoff)}:{" "}
              {isUncontrolledBalance ? "Não controlado" : formatCurrency(Number(selectedAccount?.initial_balance ?? 0))}
            </p>
          )}

          {/* Export buttons + consolidação (a exportação é SEMPRE plana) */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={consolidateBankMovements}
                onCheckedChange={setConsolidateBankMovements}
              />
              <Layers className="h-3.5 w-3.5" />
              <span>Consolidar movimentos do banco</span>
              {bankGroups.degraded && (
                <span className="text-warning">(dados de conciliação indisponíveis)</span>
              )}
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportBankStatementToExcel(selectedAccount!, lines, openingBalance, closingBalance, dateFromStr, dateToStr, isUncontrolledBalance)}
              disabled={lines.length === 0}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportBankStatementToPDF(selectedAccount!, lines, openingBalance, closingBalance, dateFromStr, dateToStr, isUncontrolledBalance)}
              disabled={lines.length === 0}
            >
              <FileText className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>



          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Inicial</p>
              {isUncontrolledBalance ? (
                <p className="mt-1 text-sm italic text-muted-foreground">Saldo não controlado</p>
              ) : (
                <p className={`mt-1 text-lg font-bold ${openingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(openingBalance)}
                </p>
              )}
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Entradas</p>
              <p className="mt-1 text-lg font-bold text-success">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Saídas</p>
              <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(totalExpense)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Final</p>
              {isUncontrolledBalance ? (
                <p className="mt-1 text-sm italic text-muted-foreground">Saldo não controlado</p>
              ) : (
                <p className={`mt-1 text-lg font-bold ${closingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(closingBalance)}
                </p>
              )}
            </div>
          </div>

          {/* Statement table */}
          {lines.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Landmark className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Sem movimentos para o período selecionado.</p>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-center w-10">
                      <Paperclip className="h-3.5 w-3.5 mx-auto" />
                    </TableHead>
                    <TableHead className="text-right">Entrada (€)</TableHead>
                    <TableHead className="text-right">Saída (€)</TableHead>
                    <TableHead className="text-right">Saldo (€)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="bg-secondary/20">
                    <TableCell className="font-medium text-xs">{dateFromStr || "—"}</TableCell>
                    <TableCell colSpan={2} className="font-bold text-xs uppercase tracking-wider">Saldo Inicial</TableCell>
                    <TableCell />
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : openingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {isUncontrolledBalance ? "N/C" : formatCurrency(openingBalance)}
                    </TableCell>
                  </TableRow>

                  {renderItems.map((item) => {
                    if (item.kind === "group-header") {
                      const expanded = expandedGroups.has(item.groupId);
                      const showVisibleVsTotal = item.totalChildCount > item.childCount;
                      const diverges = Math.abs(item.divergence) > 0.01;
                      return (
                        <TableRow
                          key={`grp-${item.groupId}`}
                          className="cursor-pointer border-l-2 border-l-primary bg-primary/5 hover:bg-primary/10"
                          onClick={() => toggleGroup(item.groupId)}
                        >
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDatePT(item.date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              <p className="text-sm font-semibold">{item.description}</p>
                              <Badge variant="secondary" className="text-[10px] shrink-0">
                                {showVisibleVsTotal
                                  ? `${item.childCount}/${item.totalChildCount} transações`
                                  : `${item.childCount} transações`}
                              </Badge>
                            </div>
                            {item.bankAmount != null && (
                              <p className={`text-xs ${diverges ? "text-warning" : "text-muted-foreground"}`}>
                                Banco: {formatCurrency(item.bankAmount)}
                                {diverges && ` · diferença ${formatCurrency(item.divergence)} (retenção na fonte)`}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.eventLabel}</TableCell>
                          <TableCell />
                          <TableCell className="text-right font-mono text-sm">
                            {item.total > 0 ? (
                              <span className="text-success">{formatCurrency(item.total)}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {item.total < 0 ? (
                              <span className="text-warning">{formatCurrency(Math.abs(item.total))}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm font-semibold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : item.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                            {isUncontrolledBalance ? "N/C" : formatCurrency(item.runningBalance)}
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const isChild = item.kind === "group-child";
                    if (isChild && !expandedGroups.has(item.groupId)) return null;
                    const line: any = item.line;
                    return (
                      <TableRow key={line.id} className={isChild ? "bg-muted/10" : undefined}>
                        <TableCell className={`text-sm whitespace-nowrap ${isChild ? "pl-8 text-muted-foreground" : ""}`}>
                          {formatDatePT(line.date)}
                        </TableCell>
                        <TableCell className={isChild ? "pl-4" : undefined}>
                          <p className="text-sm font-medium">{line.description}</p>
                          {line.suppliers?.name && (
                            <p className="text-xs text-muted-foreground">{line.suppliers.name}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.events?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {(docCounts as Record<string, number>)[line.id] ? (
                            <button
                              onClick={() => setDocsModal({ id: line.id, description: line.description })}
                              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                              title="Ver documentos anexados"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              <span className="font-medium">{(docCounts as Record<string, number>)[line.id]}</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.signedAmount > 0 ? (
                            <span className="text-success">{formatCurrency(line.signedAmount)}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.signedAmount < 0 ? (
                            <span className="text-warning">{formatCurrency(Math.abs(line.signedAmount))}</span>
                          ) : "—"}
                        </TableCell>
                        {/* Filha de grupo: célula de saldo VAZIA. Um saldo
                            intra-grupo não corresponde a posição nenhuma no banco. */}
                        <TableCell className={`text-right font-mono text-sm font-semibold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : line.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                          {isChild ? "" : isUncontrolledBalance ? "N/C" : formatCurrency(line.runningBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Closing balance row */}
                  <TableRow className="border-t-2 border-primary/30 bg-primary/5">
                    <TableCell className="font-medium text-xs">{dateToStr || "—"}</TableCell>
                    <TableCell colSpan={2} className="font-bold text-xs uppercase tracking-wider">Saldo Final</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono font-semibold text-success">{formatCurrency(totalIncome)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-warning">{formatCurrency(totalExpense)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : closingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {isUncontrolledBalance ? "N/C" : formatCurrency(closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>

    {docsModal && (
      <TransactionDocumentsModal
        transactionId={docsModal.id}
        transactionDescription={docsModal.description}
        onClose={() => setDocsModal(null)}
      />
    )}
  </>
  );
}
