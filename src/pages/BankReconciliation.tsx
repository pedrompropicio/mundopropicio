/**
 * Conciliação Bancária — o lado do banco entra no sistema.
 *
 * O extrato é um FACTO EXTERNO com tabela própria (`bank_statements` /
 * `bank_statement_lines`). A conciliação só LIGA: nunca liquida, nunca muda
 * status, nunca escreve `paid_amount`. Os dois lados do desencontro têm o
 * mesmo peso — linhas do banco por explicar e transações dadas como pagas que
 * nunca saíram da conta.
 *
 * Este lote não cria transações a partir das linhas do banco (lote seguinte).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Upload, Link2, EyeOff, Loader2, Landmark } from "lucide-react";
import {
  parseSantanderStatement,
  computeLineHash,
  extractBankRef,
  type ParsedStatement,
} from "@/lib/bank-statement/parse-santander";
import {
  computeAccountBalance,
  fetchAccountCashAdjustments,
  buildAccountCutoffs,
  effectivePaymentDate,
} from "@/lib/account-balance";
import { uploadToCompanyBucket } from "@/lib/storage";
import {
  reconcileStatement,
  findTransactionsWithoutBankLine,
  type ReconcileResult,
  type ReconcileSepaExport,
  type ReconcileTransaction,
} from "@/lib/bank-statement/reconcile";

const PAGE = 1000;

/**
 * O PostgREST corta em 1000 linhas em silêncio. Sem paginar, o motor perde
 * candidatos e a lista inversa enche-se de falsos positivos.
 */
async function fetchAllPages<T>(
  run: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

const LAYER_LABEL: Record<string, string> = {
  sepa: "Lote SEPA",
  amount: "Valor exato",
  description: "Descrição",
  manual: "Manual",
};

export default function BankReconciliation() {
  const { isAdmin, hasPermission, user } = useAuth();
  const allowed = isAdmin || hasPermission("manage_bank_reconciliation");
  const queryClient = useQueryClient();

  const [accountId, setAccountId] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ReconcileResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [manualLine, setManualLine] = useState<any | null>(null);
  const [manualTxId, setManualTxId] = useState<string>("");
  const [ignoreLine, setIgnoreLine] = useState<any | null>(null);
  const [ignoreNote, setIgnoreNote] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-recon-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, initial_balance, initial_balance_date, is_active")
        .eq("is_active", true)
        .in("type", ["bank", "cash", "prepaid_card"])
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const account = useMemo(() => (accounts as any[]).find((a) => a.id === accountId), [accounts, accountId]);

  // Transações liquidadas na conta — universo do matching (nunca alteradas).
  const { data: txns = [] } = useQuery({
    queryKey: ["bank-recon-txns", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from("transactions")
          .select("id, description, paid_amount, payment_date, date, status, type, supplier_id, suppliers(name)")
          .eq("account_id", accountId)
          .gt("paid_amount", 0)
          .order("id")
          .range(from, to) as any,
      );
      return data.map((t: any) => ({ ...t, supplier_name: t.suppliers?.name ?? null }));
    },
  });

  const { data: sepaExports = [] } = useQuery({
    queryKey: ["bank-recon-sepa"],
    queryFn: async () => {
      return await fetchAllPages<any>((from, to) =>
        supabase
          .from("payment_list_sepa_exports")
          .select("id, payment_list_id, msg_id, total_amount, transaction_ids")
          .order("id")
          .range(from, to) as any,
      );
    },
  });

  // Extratos já importados nesta conta
  const { data: statements = [] } = useQuery({
    queryKey: ["bank-recon-statements", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .eq("financial_account_id", accountId)
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const currentStatement = useMemo(
    () => (statements as any[]).find((s) => s.id === statementId) ?? (statements as any[])[0] ?? null,
    [statements, statementId],
  );

  const { data: savedLines = [] } = useQuery({
    queryKey: ["bank-recon-lines", currentStatement?.id],
    enabled: !!currentStatement?.id,
    queryFn: async () => {
      return await fetchAllPages<any>((from, to) =>
        supabase
          .from("bank_statement_lines")
          .select("*")
          .eq("statement_id", currentStatement.id)
          .order("booking_date")
          .order("created_at")
          .range(from, to) as any,
      );
    },
  });

  // ---- Triângulo do saldo -------------------------------------------------
  const savedExplainedIds = useMemo(() => {
    const s = new Set<string>();
    // Uma linha IGNORADA não explica nada: filtra-se por status.
    (savedLines as any[]).forEach((l) => {
      if (l.status === "matched" && l.matched_transaction_id) s.add(l.matched_transaction_id);
    });
    (sepaExports as ReconcileSepaExport[]).forEach((e) => {
      const used = (savedLines as any[]).some((l) => l.status === "matched" && l.matched_sepa_export_id === e.id);
      if (used) (e.transaction_ids ?? []).forEach((id) => s.add(id));
    });
    return s;
  }, [savedLines, sepaExports]);

  const unmatchedLines = (savedLines as any[]).filter((l) => l.status === "unmatched");
  const matchedLines = (savedLines as any[]).filter((l) => l.status === "matched");
  const ignoredLines = (savedLines as any[]).filter((l) => l.status === "ignored");

  const txWithoutLine = useMemo(() => {
    if (!currentStatement) return [] as ReconcileTransaction[];
    return findTransactionsWithoutBankLine(
      txns as ReconcileTransaction[],
      savedExplainedIds,
      currentStatement.period_from,
      currentStatement.period_to,
    );
  }, [txns, savedExplainedIds, currentStatement]);

  // ---- Confronto sistema × banco ------------------------------------------
  // O ecrã existe para tornar visível uma diferença. Confrontar abertura +
  // movimentos do próprio ficheiro dava sempre zero (o parser só aceita
  // extratos coerentes). O confronto certo é SISTEMA × BANCO.
  const { data: cashAdjustments } = useQuery({
    queryKey: ["bank-recon-adjustments", accountId, currentStatement?.period_to],
    enabled: !!accountId && !!currentStatement?.period_to,
    queryFn: () =>
      fetchAccountCashAdjustments(
        [accountId],
        buildAccountCutoffs(accounts as any[]),
        { lte: currentStatement.period_to },
      ),
  });

  const triangle = useMemo(() => {
    if (!currentStatement || !account) return null;
    const periodTo = String(currentStatement.period_to ?? "").slice(0, 10);
    const upToPeriod = (txns as any[]).filter((t) => {
      const eff = effectivePaymentDate(t);
      return !eff || !periodTo || eff <= periodTo;
    });
    // Fonte única do saldo (D-ERP12/D-ERP25): mesma conta, mesma data de corte,
    // mesmos ajustes de caixa que o módulo Contas.
    const system = computeAccountBalance(
      account as any,
      upToPeriod.map((t) => ({ ...t, account_id: account.id })) as any,
      cashAdjustments ?? undefined,
    );
    const declared = Number(currentStatement.closing_balance ?? 0);
    const diff = system === null ? null : Math.round((system - declared) * 100) / 100;
    const unexplainedBank = (savedLines as any[])
      .filter((l) => l.status === "unmatched")
      .reduce((acc, l) => acc + Number(l.amount ?? 0), 0);
    const unexplainedSystem = txWithoutLine.reduce((acc, t) => acc + Number(t.paid_amount ?? 0), 0);
    return { system, declared, diff, unexplainedBank, unexplainedSystem, periodTo };
  }, [currentStatement, account, txns, cashAdjustments, savedLines, txWithoutLine]);

  // ---- Upload + pré-visualização -----------------------------------------
  async function onFile(file: File) {
    if (!accountId) {
      toast.error("Escolhe primeiro a conta.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const p = parseSantanderStatement(buf);
      setParsed(p);
      setFileName(file.name);
      const lines = p.lines.map((l, i) => ({
        key: String(i),
        description: l.description,
        amount: l.amount,
        bookingDate: l.bookingDate,
        valueDate: l.valueDate,
      }));
      setPreview(
        reconcileStatement(lines, txns as ReconcileTransaction[], sepaExports as ReconcileSepaExport[]),
      );
    } catch (err: any) {
      setParsed(null);
      setPreview(null);
      toast.error(err?.message ?? "Ficheiro não reconhecido.");
    }
  }

  const cutoffMismatch = useMemo(() => {
    if (!parsed || !account?.initial_balance_date) return null;
    if (parsed.openingBalance === null) return null;
    const implanted = Number(account.initial_balance ?? 0);
    const diff = Math.round((parsed.openingBalance - implanted) * 100) / 100;
    return Math.abs(diff) <= 0.01 ? null : { diff, opening: parsed.openingBalance, implanted };
  }, [parsed, account]);

  async function saveImport() {
    if (!parsed || !preview || !accountId) return;
    if (!parsed.coherent) {
      toast.error("Importação recusada: a cadeia de saldos do ficheiro não fecha.");
      return;
    }
    setSaving(true);
    try {
      const { data: stmt, error: e1 } = await supabase
        .from("bank_statements")
        .insert({
          financial_account_id: accountId,
          file_name: fileName,
          period_from: parsed.periodFrom,
          period_to: parsed.periodTo,
          opening_balance: parsed.openingBalance,
          closing_balance: parsed.closingBalance,
          n_lines: parsed.lines.length,
          imported_by: user?.email ?? "sistema",
        })
        .select("id")
        .single();
      if (e1) throw e1;

      const rows = [] as any[];
      for (let i = 0; i < parsed.lines.length; i++) {
        const l = parsed.lines[i];
        const hash = await computeLineHash(accountId, l);
        const m = preview.matches.get(String(i));
        rows.push({
          statement_id: stmt.id,
          financial_account_id: accountId,
          booking_date: l.bookingDate,
          value_date: l.valueDate,
          description: l.description,
          amount: l.amount,
          balance_after: l.balanceAfter,
          raw: l.raw as any,
          line_hash: hash,
          status: m ? "matched" : "unmatched",
          matched_transaction_id: m?.matched_transaction_id ?? null,
          matched_payment_list_id: m?.matched_payment_list_id ?? null,
          matched_sepa_export_id: m?.matched_sepa_export_id ?? null,
          matched_by: m ? `auto:${m.layer}` : null,
          matched_at: m ? new Date().toISOString() : null,
        });
      }

      // Reimportar o mesmo ficheiro não cria linhas novas: o line_hash é único
      // por conta, e as colisões são ignoradas em silêncio.
      const { error: e2 } = await (supabase as any)
        .from("bank_statement_lines")
        .upsert(rows, { onConflict: "financial_account_id,line_hash", ignoreDuplicates: true });
      if (e2) throw e2;

      toast.success(`Extrato importado: ${parsed.lines.length} linha(s).`);
      setStatementId(stmt.id);
      setParsed(null);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["bank-recon-statements", accountId] });
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err?.message ?? "desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmManual() {
    if (!manualLine || !manualTxId) return;
    const { error } = await supabase
      .from("bank_statement_lines")
      .update({
        status: "matched",
        matched_transaction_id: manualTxId,
        matched_by: `manual:${user?.email ?? "sistema"}`,
        matched_at: new Date().toISOString(),
      })
      .eq("id", manualLine.id);
    if (error) return toast.error("Erro ao conciliar: " + error.message);
    toast.success("Linha conciliada.");
    setManualLine(null);
    setManualTxId("");
    queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", currentStatement?.id] });
  }

  async function confirmIgnore() {
    if (!ignoreLine || !ignoreNote.trim()) return;
    const { error } = await supabase
      .from("bank_statement_lines")
      .update({
        status: "ignored",
        note: ignoreNote.trim(),
        matched_by: `ignored:${user?.email ?? "sistema"}`,
        matched_at: new Date().toISOString(),
      })
      .eq("id", ignoreLine.id);
    if (error) return toast.error("Erro ao ignorar: " + error.message);
    toast.success("Linha marcada como ignorada.");
    setIgnoreLine(null);
    setIgnoreNote("");
    queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", currentStatement?.id] });
  }

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">Sem permissão para a Conciliação Bancária.</p>;
  }

  const txById = new Map((txns as any[]).map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight lg:text-2xl">
          <Landmark className="h-5 w-5" /> Conciliação Bancária
        </h1>
        <p className="text-sm text-muted-foreground">
          O extrato do banco é um facto externo. A conciliação só liga — nunca altera transações.
        </p>
      </div>

      {/* Escolha da conta + upload */}
      <div className="glass grid gap-3 rounded-xl p-4 md:grid-cols-2">
        <div>
          <Label>Conta</Label>
          <Select value={accountId} onValueChange={(v) => { setAccountId(v); setStatementId(null); setParsed(null); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Escolher conta" /></SelectTrigger>
            <SelectContent>
              {(accounts as any[]).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {account?.initial_balance_date && (
            <p className="mt-1 text-xs text-muted-foreground">
              Saldo implantado a {formatDatePT(account.initial_balance_date)}: {formatCurrency(Number(account.initial_balance ?? 0))}
            </p>
          )}
        </div>
        <div>
          <Label>Ficheiro do extrato (Santander, tabulado Excel)</Label>
          <Input
            type="file"
            accept=".txt,.csv,.xls,.tsv"
            disabled={!accountId}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </div>
      </div>

      {/* Resumo antes de gravar */}
      {parsed && preview && (
        <div className="glass space-y-3 rounded-xl p-4">
          <h2 className="font-semibold">Resumo antes de gravar</h2>
          {!parsed.coherent && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Importação recusada — o ficheiro não fecha.</p>
                <p className="text-muted-foreground">{parsed.coherenceError}</p>
              </div>
            </div>
          )}
          {cutoffMismatch && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div>
                <p className="font-medium">Saldo do extrato não bate com o implantado.</p>
                <p className="text-muted-foreground">
                  O extrato abre em {formatCurrency(cutoffMismatch.opening)} e o sistema tem {formatCurrency(cutoffMismatch.implanted)} implantados
                  (diferença {formatCurrency(cutoffMismatch.diff)}). Importa-se de qualquer forma, mas a data de corte ou o saldo implantado estão errados.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-2 text-sm md:grid-cols-3 lg:grid-cols-6">
            <div><p className="text-xs text-muted-foreground">Período</p><p>{formatDatePT(parsed.periodFrom)} → {formatDatePT(parsed.periodTo)}</p></div>
            <div><p className="text-xs text-muted-foreground">Linhas</p><p>{parsed.lines.length}</p></div>
            <div><p className="text-xs text-muted-foreground">Lote SEPA</p><p>{preview.counts.sepa}</p></div>
            <div><p className="text-xs text-muted-foreground">Valor exato</p><p>{preview.counts.amount}</p></div>
            <div><p className="text-xs text-muted-foreground">Descrição</p><p>{preview.counts.description}</p></div>
            <div><p className="text-xs text-muted-foreground">Por explicar</p><p className="font-semibold text-warning">{preview.counts.unmatched}</p></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveImport} disabled={saving || !parsed.coherent}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Gravar importação
            </Button>
            <Button variant="ghost" onClick={() => { setParsed(null); setPreview(null); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Triângulo do saldo */}
      {currentStatement && triangle && (
        <div className="glass grid gap-3 rounded-xl p-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo de abertura do extrato</p>
            <p className="text-lg font-bold">{formatCurrency(triangle.opening)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Movimentos do período</p>
            <p className="text-lg font-bold">{formatCurrency(triangle.movements)}</p>
            <p className="text-[10px] text-muted-foreground">Conciliados: {formatCurrency(triangle.reconciled)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo do banco declarado</p>
            <p className="text-lg font-bold">{formatCurrency(triangle.declared)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Diferença por explicar</p>
            <p className={`text-lg font-bold ${Math.abs(triangle.diff) > 0.01 ? "text-destructive" : "text-success"}`}>
              {formatCurrency(triangle.diff)}
            </p>
          </div>
        </div>
      )}

      {/* Extratos importados */}
      {(statements as any[]).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Extratos:</span>
          {(statements as any[]).map((s) => (
            <button
              key={s.id}
              onClick={() => setStatementId(s.id)}
              className={`rounded-full border px-2 py-1 ${currentStatement?.id === s.id ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {formatDatePT(s.period_from)} → {formatDatePT(s.period_to)} · {s.n_lines} linhas
            </button>
          ))}
        </div>
      )}

      {currentStatement && (
        <Tabs defaultValue="unmatched">
          <TabsList>
            <TabsTrigger value="matched">Conciliadas ({matchedLines.length})</TabsTrigger>
            <TabsTrigger value="unmatched">Linhas do banco por explicar ({unmatchedLines.length})</TabsTrigger>
            <TabsTrigger value="missing">Transações sem movimento no banco ({txWithoutLine.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="matched" className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Descrição do banco</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead>Camada</TableHead><TableHead>Ligada a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{formatDatePT(l.booking_date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{l.description}</TableCell>
                    <TableCell className={`text-right ${Number(l.amount) < 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell><Badge variant="outline">{LAYER_LABEL[String(l.matched_by ?? "").split(":")[1] ?? "manual"] ?? "Manual"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.matched_sepa_export_id
                        ? "Lote SEPA (lista de pagamento)"
                        : txById.get(l.matched_transaction_id)?.description ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {ignoredLines.map((l) => (
                  <TableRow key={l.id} className="opacity-60">
                    <TableCell>{formatDatePT(l.booking_date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{l.description}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell><Badge variant="secondary">Ignorada</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="unmatched" className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Descrição do banco</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedLines.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Nada por explicar.</TableCell></TableRow>
                )}
                {unmatchedLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{formatDatePT(l.booking_date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{l.description}</TableCell>
                    <TableCell className={`text-right ${Number(l.amount) < 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setManualLine(l); setManualTxId(""); }}>
                        <Link2 className="mr-1 h-3.5 w-3.5" /> Conciliar
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-1" onClick={() => { setIgnoreLine(l); setIgnoreNote(""); }}>
                        <EyeOff className="mr-1 h-3.5 w-3.5" /> Ignorar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="missing" className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Transações marcadas como pagas nesta conta, no período do extrato, sem qualquer movimento no banco.
              É a classe de erro dos Bombeiros: dinheiro dado como pago que nunca saiu.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data efetiva</TableHead><TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txWithoutLine.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Todas as transações pagas têm movimento no banco.</TableCell></TableRow>
                )}
                {txWithoutLine.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDatePT(t.payment_date ?? t.date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{t.description}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{formatCurrency(Number(t.paid_amount ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      )}

      {/* Conciliação manual */}
      <Dialog open={!!manualLine} onOpenChange={(o) => !o && setManualLine(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conciliar manualmente</DialogTitle></DialogHeader>
          {manualLine && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {formatDatePT(manualLine.booking_date)} · {manualLine.description} · {formatCurrency(Number(manualLine.amount))}
              </p>
              <div>
                <Label>Transação</Label>
                <Select value={manualTxId} onValueChange={setManualTxId}>
                  <SelectTrigger><SelectValue placeholder="Escolher transação" /></SelectTrigger>
                  <SelectContent>
                    {(txns as any[])
                      .filter((t) => !savedExplainedIds.has(t.id))
                      .slice(0, 300)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {formatDatePT(t.payment_date ?? t.date)} · {formatCurrency(Number(t.paid_amount ?? 0))} · {t.description}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">A ligação não altera a transação: não liquida nem muda valores.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualLine(null)}>Cancelar</Button>
            <Button onClick={confirmManual} disabled={!manualTxId}>Ligar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ignorar com nota obrigatória */}
      <Dialog open={!!ignoreLine} onOpenChange={(o) => !o && setIgnoreLine(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar linha como ignorada</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <Label>Nota (obrigatória)</Label>
            <Input value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} placeholder="Porque é que esta linha não tem contrapartida no sistema" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIgnoreLine(null)}>Cancelar</Button>
            <Button onClick={confirmIgnore} disabled={!ignoreNote.trim()}>Ignorar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
