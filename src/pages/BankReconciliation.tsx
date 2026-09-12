/**
 * Conciliação Bancária — o lado do banco entra no sistema.
 *
 * O extrato é um FACTO EXTERNO com tabela própria (`bank_statements` /
 * `bank_statement_lines`). A conciliação só LIGA: nunca liquida, nunca muda
 * status, nunca escreve `paid_amount`. Os dois lados do desencontro têm o
 * mesmo peso — linhas do banco por explicar e transações dadas como pagas que
 * nunca saíram da conta.
 *
 * Uma linha por explicar PODE dar origem a um lançamento (D-ERP29), mas só
 * depois de as camadas falharem e SEMPRE com confirmação humana: a regra
 * (`bank_line_rules`) apenas pré-preenche o formulário.
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Upload, Link2, EyeOff, Loader2, Landmark, RefreshCw, PlusCircle, Trash2, X, Paperclip } from "lucide-react";
import BankLineDocumentsDialog from "@/components/bank/BankLineDocumentsDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { BankLineLaunchModal, type LaunchableLine } from "@/components/bank/BankLineLaunchModal";

import type { BankLineRule } from "@/lib/bank-statement/rules";
import {
  parseSantanderStatement,
  computeLineHash,
  extractBankRef,
  type ParsedStatement,
} from "@/lib/bank-statement/parse-santander";
import { fetchAccountTrueBalancesAsOf } from "@/lib/account-balance-rpc";
import { uploadToCompanyBucket } from "@/lib/storage";
import {
  reconcileStatement,
  findTransactionsWithoutBankLine,
  AMOUNT_WINDOW_DAYS,
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
  const [fileRef, setFileRef] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReconcileResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [manualLine, setManualLine] = useState<any | null>(null);
  /**
   * Conciliação manual: UMA linha do banco pode ser explicada por N transações
   * (caso real: 135.986,96 € = 108.789,56 + 27.197,40). Com uma só transação
   * grava-se `matched_transaction_id`; com N usa-se a ponte
   * `bank_line_transactions` e a coluna singular fica nula.
   */
  const [manualTxIds, setManualTxIds] = useState<string[]>([]);
  const [manualSaving, setManualSaving] = useState(false);

  /** Confirmação explícita para ligar a uma transação registada NOUTRA conta. */
  const [crossAccountAck, setCrossAccountAck] = useState(false);
  const [ignoreLine, setIgnoreLine] = useState<any | null>(null);
  /** Linha cujo diálogo de documentos está aberto (independente da conciliação). */
  const [docsLine, setDocsLine] = useState<any | null>(null);
  const [ignoreNote, setIgnoreNote] = useState("");
  /** Linhas selecionadas para dar UMA transação pela soma (TPA, comissões). */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [launchLines, setLaunchLines] = useState<LaunchableLine[] | null>(null);

  // Regras de lançamento: propõem o preenchimento, nunca criam nada.
  const { data: rules = [] } = useQuery({
    queryKey: ["bank-line-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_line_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BankLineRule[];
    },
    enabled: allowed,
  });

  const toLaunchable = (l: any): LaunchableLine => ({
    id: l.id,
    description: l.description,
    amount: Number(l.amount ?? 0),
    booking_date: l.booking_date,
    value_date: l.value_date ?? null,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-recon-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, initial_balance, initial_balance_date, skip_balance_check, is_active")
        .eq("is_active", true)
        .in("type", ["bank", "cash", "prepaid_card"])
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const account = useMemo(() => (accounts as any[]).find((a) => a.id === accountId), [accounts, accountId]);

  /**
   * Data de corte da conta (D-ERP25): o saldo implantado é o saldo ao FECHO
   * deste dia. Movimentos com data igual ou anterior já estão dentro dele —
   * não se conciliam, importam-se só para o histórico e para a cadeia de saldos.
   */
  const cutoff = account?.initial_balance_date ? String(account.initial_balance_date).slice(0, 10) : null;
  const isPreCutoff = (bookingDate: string) => !!cutoff && String(bookingDate).slice(0, 10) <= cutoff;


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

  /**
   * Candidatas de OUTRAS contas para a ligação MANUAL apenas (D-ERP35).
   * As camadas automáticas (lote SEPA, valor exacto, descrição) continuam
   * restritas a `txns` — a conta do extrato. Abrir o automático entre contas
   * esconderia precisamente o erro de conta que queremos ver.
   */
  const { data: crossAccountTxns = [] } = useQuery({
    queryKey: ["bank-recon-cross-txns", manualLine?.id, accountId],
    enabled: !!manualLine && !!accountId,
    queryFn: async () => {
      const target = Math.abs(Number(manualLine.amount ?? 0));
      const base = manualLine.value_date ?? manualLine.booking_date;
      const d = new Date(String(base).slice(0, 10) + "T00:00:00");
      const shift = (days: number) => {
        const x = new Date(d);
        x.setDate(x.getDate() + days);
        return x.toISOString().slice(0, 10);
      };
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, paid_amount, payment_date, date, account_id, financial_accounts(name)")
        .neq("account_id", accountId)
        .not("account_id", "is", null)
        .gte("paid_amount", target - 0.01)
        .lte("paid_amount", target + 0.01)
        .gte("payment_date", shift(-AMOUNT_WINDOW_DAYS))
        .lte("payment_date", shift(AMOUNT_WINDOW_DAYS))
        .order("payment_date")
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        account_name: t.financial_accounts?.name ?? "conta desconhecida",
      }));
    },
  });

  const crossAccountIds = useMemo(
    () => new Set((crossAccountTxns as any[]).map((t) => t.id)),
    [crossAccountTxns],
  );
  /** Transações escolhidas que estão registadas NOUTRA conta (aviso + confirmação). */
  const selectedCrossAccounts = useMemo(
    () => (crossAccountTxns as any[]).filter((t) => manualTxIds.includes(t.id)),
    [crossAccountTxns, manualTxIds],
  );


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

  /**
   * Ponte das conciliações manuais de N transações (`bank_line_transactions`).
   * É a SSOT desse caso: com N a coluna `matched_transaction_id` fica nula.
   */
  const savedLineIds = useMemo(() => (savedLines as any[]).map((l) => l.id), [savedLines]);

  const { data: bridgeRows = [] } = useQuery({
    queryKey: ["bank-recon-bridge", currentStatement?.id, savedLineIds.length],
    enabled: savedLineIds.length > 0,
    queryFn: async () => {
      const out: any[] = [];
      for (let i = 0; i < savedLineIds.length; i += 200) {
        const { data, error } = await supabase
          .from("bank_line_transactions")
          .select("id, line_id, transaction_id, transactions(description, paid_amount, payment_date, date)")
          .in("line_id", savedLineIds.slice(i, i + 200));
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    },
  });

  /**
   * Contagem de documentos por linha do extrato. O anexo é independente da
   * conciliação — vale em matched, unmatched e ignored.
   */
  const { data: docCountByLine = new Map<string, number>() } = useQuery({
    queryKey: ["bank_line_documents_counts", currentStatement?.id, savedLineIds.length],
    enabled: savedLineIds.length > 0,
    queryFn: async () => {
      const m = new Map<string, number>();
      for (let i = 0; i < savedLineIds.length; i += 200) {
        const { data, error } = await supabase
          .from("bank_line_documents")
          .select("id, line_id")
          .in("line_id", savedLineIds.slice(i, i + 200));
        if (error) throw error;
        (data ?? []).forEach((d: any) => m.set(d.line_id, (m.get(d.line_id) ?? 0) + 1));
      }
      return m;
    },
  });

  /** line_id → entradas da ponte. */
  const bridgeByLine = useMemo(() => {
    const m = new Map<string, any[]>();
    (bridgeRows as any[]).forEach((r) => {
      const arr = m.get(r.line_id) ?? [];
      arr.push(r);
      m.set(r.line_id, arr);
    });
    return m;
  }, [bridgeRows]);


  // ---- Triângulo do saldo -------------------------------------------------
  const txById = useMemo(() => new Map((txns as any[]).map((t) => [t.id, t])), [txns]);

  /**
   * Exportações SEPA irmãs: mesma lista de pagamento e mesmo total. A dupla
   * geração de um lote (dois `msg_id` com um minuto de diferença) é o MESMO
   * acontecimento — as suas transações contam como explicadas de uma vez.
   */
  const sepaSiblings = useMemo(() => {
    const byExport = new Map<string, ReconcileSepaExport[]>();
    (sepaExports as ReconcileSepaExport[]).forEach((e) => {
      const sibs = (sepaExports as ReconcileSepaExport[]).filter(
        (o) =>
          o.payment_list_id === e.payment_list_id &&
          Math.abs(Number(o.total_amount ?? 0) - Number(e.total_amount ?? 0)) <= 0.01,
      );
      byExport.set(e.id, sibs);
    });
    return byExport;
  }, [sepaExports]);

  const savedExplainedIds = useMemo(() => {
    const s = new Set<string>();
    // Uma linha IGNORADA não explica nada: filtra-se por status.
    (savedLines as any[]).forEach((l) => {
      if (l.status !== "matched") return;
      if (l.matched_transaction_id) s.add(l.matched_transaction_id);
      if (l.matched_sepa_export_id) {
        (sepaSiblings.get(l.matched_sepa_export_id) ?? []).forEach((e) =>
          (e.transaction_ids ?? []).forEach((id) => s.add(id)),
        );
      }
      // Terceiro ramo: conciliação manual de N transações, via ponte. Sem isto
      // o "Resto sem explicação" não fecha a zero.
      (bridgeByLine.get(l.id) ?? []).forEach((r) => s.add(r.transaction_id));
    });
    return s;
  }, [savedLines, sepaSiblings, bridgeByLine]);


  const unmatchedLines = (savedLines as any[]).filter((l) => l.status === "unmatched");
  const matchedLines = (savedLines as any[]).filter((l) => l.status === "matched");
  const ignoredLines = (savedLines as any[]).filter((l) => l.status === "ignored");
  // Anteriores ao corte: ficam à parte, só para o histórico.
  const preCutoffLines = (savedLines as any[]).filter((l) => l.status === "pre_cutoff");
  const preCutoffTotal = preCutoffLines.reduce((acc, l) => acc + Number(l.amount ?? 0), 0);

  /**
   * Por linha de lote SEPA conciliada: quantas exportações teve (dupla geração)
   * e a retenção na fonte (bruto do sistema − líquido do banco).
   */
  const sepaInfo = useMemo(() => {
    const m = new Map<string, { exportCount: number; systemGross: number; retention: number }>();
    (savedLines as any[]).forEach((l) => {
      if (l.status !== "matched" || !l.matched_sepa_export_id) return;
      const sibs = sepaSiblings.get(l.matched_sepa_export_id) ?? [];
      const ids = Array.from(new Set(sibs.flatMap((e) => (e.transaction_ids ?? []).filter(Boolean))));
      const systemGross =
        Math.round(
          ids.reduce((acc, id) => acc + Math.abs(Number(txById.get(id)?.paid_amount ?? 0)), 0) * 100,
        ) / 100;
      const retention = Math.round((systemGross - Math.abs(Number(l.amount ?? 0))) * 100) / 100;
      m.set(l.id, { exportCount: sibs.length, systemGross, retention: Math.abs(retention) > 0.01 ? retention : 0 });
    });
    return m;
  }, [savedLines, sepaSiblings, txById]);

  const retentionTotal = useMemo(
    () => Math.round(Array.from(sepaInfo.values()).reduce((a, i) => a + i.retention, 0) * 100) / 100,
    [sepaInfo],
  );

  const txWithoutLine = useMemo(() => {
    if (!currentStatement) return [] as ReconcileTransaction[];
    return findTransactionsWithoutBankLine(
      txns as ReconcileTransaction[],
      savedExplainedIds,
      currentStatement.period_from,
      currentStatement.period_to,
      cutoff,
    );
  }, [txns, savedExplainedIds, currentStatement, cutoff]);


  // ---- Confronto sistema × banco ------------------------------------------
  // O ecrã existe para tornar visível uma diferença. Confrontar abertura +
  // movimentos do próprio ficheiro dava sempre zero (o parser só aceita
  // extratos coerentes). O confronto certo é SISTEMA × BANCO.
  //
  // D-ERP36: o saldo do sistema vem do SERVIDOR (`account_true_balances_asof`).
  // Somado no cliente ficava acima do real para quem não tem `view_confidential`
  // (a policy RESTRICTIVE esconde as linhas confidenciais) e o triângulo
  // publicava a diferença ao cêntimo. A data é a mesma que o ecrã mostra:
  // `period_to` do extrato.
  const systemPeriodTo = currentStatement?.period_to
    ? String(currentStatement.period_to).slice(0, 10)
    : null;

  const { data: systemBalances } = useQuery({
    queryKey: ["bank-recon-system-balance", accountId, systemPeriodTo],
    enabled: !!accountId && !!systemPeriodTo,
    queryFn: () => fetchAccountTrueBalancesAsOf([accountId], systemPeriodTo),
  });

  const triangle = useMemo(() => {
    if (!currentStatement || !account || !systemBalances) return null;
    const periodTo = String(currentStatement.period_to ?? "").slice(0, 10);
    const system = systemBalances.get(account.id) ?? null;
    // NULL sem `skip_balance_check` = o utilizador não pode ver o saldo desta
    // conta. Nesse caso esconde-se o triângulo INTEIRO: é a diferença que
    // denuncia o valor escondido, não só o saldo.
    const balanceHidden = system === null && !account.skip_balance_check;
    const declared = Number(currentStatement.closing_balance ?? 0);
    const diff = system === null ? null : Math.round((system - declared) * 100) / 100;
    const unexplainedBank = (savedLines as any[])
      .filter((l) => l.status === "unmatched")
      .reduce((acc, l) => acc + Number(l.amount ?? 0), 0);
    const unexplainedSystem = txWithoutLine.reduce((acc, t) => acc + Number(t.paid_amount ?? 0), 0);
    // Decomposição da diferença (sistema − banco), parcela a parcela:
    //  · linha do banco por explicar: o banco moveu, o sistema não → −amount
    //  · transação sem movimento: o sistema moveu, o banco não → sinal do tipo
    // A retenção na fonte NÃO entra aqui: o saldo do sistema já sai líquido,
    // porque `fetchAccountCashAdjustments` desconta a retenção ao caixa. Mostra-se
    // à parte, para explicar porque é que o total do lote no banco (líquido) não
    // é igual ao bruto registado nas transações.
    const contribBank = Math.round(-unexplainedBank * 100) / 100;
    const contribSystem =
      Math.round(
        txWithoutLine.reduce(
          (acc, t: any) => acc + (t.type === "income" ? 1 : -1) * Number(t.paid_amount ?? 0),
          0,
        ) * 100,
      ) / 100;
    const contribRetention = 0;
    const residual =
      diff === null ? null : Math.round((diff - (contribBank + contribSystem)) * 100) / 100;
    return {
      system,
      balanceHidden,
      declared,
      diff,
      unexplainedBank,
      unexplainedSystem,
      contribBank,
      contribSystem,
      contribRetention,
      residual,
      periodTo,
    };
  }, [currentStatement, account, systemBalances, savedLines, txWithoutLine, retentionTotal]);

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
      setFileRef(file);
      // Só as linhas POSTERIORES ao corte entram nas camadas de conciliação.
      // A chave é o índice na lista completa, para o gravar voltar a casar.
      const lines = p.lines
        .map((l, i) => ({
          key: String(i),
          description: l.description,
          amount: l.amount,
          bookingDate: l.bookingDate,
          valueDate: l.valueDate,
        }))
        .filter((l) => !isPreCutoff(l.bookingDate));
      setPreview(
        reconcileStatement(lines, txns as ReconcileTransaction[], sepaExports as ReconcileSepaExport[]),
      );

    } catch (err: any) {
      setParsed(null);
      setPreview(null);
      toast.error(err?.message ?? "Ficheiro não reconhecido.");
    }
  }

  /** Linhas do ficheiro que já estão dentro do saldo implantado. */
  const preCutoffParsed = useMemo(
    () => (parsed ? parsed.lines.filter((l) => isPreCutoff(l.bookingDate)) : []),
    [parsed, cutoff],
  );
  const preCutoffParsedTotal = preCutoffParsed.reduce((acc, l) => acc + l.amount, 0);

  /**
   * O saldo implantado é o saldo ao FECHO da data de corte. Se o extrato cobre
   * essa data, compara-se com o `balance_after` da última linha até ao corte —
   * não com a abertura do ficheiro, que é o saldo ANTES dos movimentos do dia.
   * Só se o extrato começar depois do corte é que a abertura serve de referência.
   */
  const cutoffMismatch = useMemo(() => {
    if (!parsed || !cutoff) return null;
    const implanted = Number(account?.initial_balance ?? 0);
    const upTo = parsed.lines.filter((l) => l.bookingDate <= cutoff);
    let reference: number | null;
    let label: string;
    if (upTo.length > 0) {
      reference = upTo[upTo.length - 1].balanceAfter;
      label = "fecho da data de corte";
    } else {
      reference = parsed.openingBalance;
      label = "abertura do extrato";
    }
    if (reference === null) return null;
    const diff = Math.round((reference - implanted) * 100) / 100;
    return Math.abs(diff) <= 0.01 ? null : { diff, reference, implanted, label };
  }, [parsed, account, cutoff]);


  async function saveImport() {
    if (!parsed || !preview || !accountId || !fileRef) return;
    if (!parsed.coherent) {
      toast.error("Importação recusada: a cadeia de saldos do ficheiro não fecha.");
      return;
    }
    setSaving(true);
    try {
      // Hashes primeiro: são a identidade das linhas e a chave da guarda de
      // reimportação.
      const hashes: string[] = [];
      for (const l of parsed.lines) hashes.push(await computeLineHash(accountId, l));

      // Guarda de reimportação: um extrato da mesma conta, mesmo período, cujas
      // linhas já sejam estas. Sem isto, reimportar criava um extrato fantasma
      // com n_lines preenchido e zero linhas ligadas.
      const { data: existingLines } = await supabase
        .from("bank_statement_lines")
        .select("id, statement_id, line_hash")
        .eq("financial_account_id", accountId)
        .in("line_hash", hashes.slice(0, 500));
      const already = new Set((existingLines ?? []).map((l: any) => l.line_hash));
      const reusable = (statements as any[]).find(
        (st) =>
          st.period_from === parsed.periodFrom &&
          st.period_to === parsed.periodTo &&
          (existingLines ?? []).some((l: any) => l.statement_id === st.id),
      );
      const newCount = hashes.filter((h) => !already.has(h)).length;

      let stmtId: string;
      let createdNow = false;
      if (reusable && newCount === 0) {
        stmtId = reusable.id;
        toast.info(
          `Este extrato já tinha sido importado: ${already.size} linha(s) já existentes, 0 novas.`,
        );
      } else {
        // O extrato é um facto externo: o ficheiro original fica arquivado.
        let fileUrl: string | null = null;
        const up = await uploadToCompanyBucket(
          "bank-statements" as any,
          `${accountId}/${Date.now()}-${fileName}`,
          fileRef,
          { upsert: false },
        );
        if (up.error) toast.warning("Extrato importado, mas o ficheiro não ficou arquivado.");
        else fileUrl = up.path;

        const { data: stmt, error: e1 } = await supabase
          .from("bank_statements")
          .insert({
            financial_account_id: accountId,
            file_name: fileName,
            file_url: fileUrl,
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
        stmtId = stmt.id;
        createdNow = true;
      }

      const rows = [] as any[];
      for (let i = 0; i < parsed.lines.length; i++) {
        const l = parsed.lines[i];
        const m = preview.matches.get(String(i));
        rows.push({
          statement_id: stmtId,
          financial_account_id: accountId,
          booking_date: l.bookingDate,
          value_date: l.valueDate,
          description: l.description,
          amount: l.amount,
          balance_after: l.balanceAfter,
          raw: l.raw as any,
          line_hash: hashes[i],
          bank_ref: extractBankRef(l.description),
          // Anterior ao corte: entra para o histórico com estado próprio e fica
          // fora da conciliação, das contas por explicar e da decomposição.
          status: isPreCutoff(l.bookingDate) ? "pre_cutoff" : m ? "matched" : "unmatched",
          matched_transaction_id: m?.matched_transaction_id ?? null,
          matched_payment_list_id: m?.matched_payment_list_id ?? null,
          matched_sepa_export_id: m?.matched_sepa_export_id ?? null,
          matched_by: m ? `auto:${m.layer}` : null,
          matched_at: m ? new Date().toISOString() : null,

        });
      }

      // O line_hash é único por conta: as colisões são ignoradas em silêncio.
      const { error: e2 } = await (supabase as any)
        .from("bank_statement_lines")
        .upsert(rows, { onConflict: "financial_account_id,line_hash", ignoreDuplicates: true });
      if (e2) throw e2;

      // Se nenhuma linha ficou ligada ao extrato novo, ele não existe: apaga-se.
      if (createdNow) {
        const { count } = await supabase
          .from("bank_statement_lines")
          .select("id", { count: "exact", head: true })
          .eq("statement_id", stmtId);
        if (!count) {
          await supabase.from("bank_statements").delete().eq("id", stmtId);
          toast.info("Este extrato já tinha sido importado por inteiro — nada de novo a guardar.");
          setStatementId(reusable?.id ?? null);
          setParsed(null);
          setPreview(null);
          setFileRef(null);
          queryClient.invalidateQueries({ queryKey: ["bank-recon-statements", accountId] });
          return;
        }
      }

      toast.success(
        newCount === parsed.lines.length
          ? `Extrato importado: ${parsed.lines.length} linha(s).`
          : `Extrato importado: ${newCount} linha(s) novas, ${parsed.lines.length - newCount} já existentes.`,
      );
      setStatementId(stmtId);
      setParsed(null);
      setPreview(null);
      setFileRef(null);
      queryClient.invalidateQueries({ queryKey: ["bank-recon-statements", accountId] });
      queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", stmtId] });
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err?.message ?? "desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  /** Transações candidatas à ligação manual (conta do extrato + outras contas). */
  const manualCandidates = useMemo(() => {
    const m = new Map<string, any>();
    (txns as any[]).forEach((t) => m.set(t.id, t));
    (crossAccountTxns as any[]).forEach((t) => { if (!m.has(t.id)) m.set(t.id, t); });
    return m;
  }, [txns, crossAccountTxns]);

  const manualSelectedTotal = useMemo(
    () =>
      Math.round(
        manualTxIds.reduce((a, id) => a + Math.abs(Number(manualCandidates.get(id)?.paid_amount ?? 0)), 0) * 100,
      ) / 100,
    [manualTxIds, manualCandidates],
  );
  const manualTarget = manualLine ? Math.abs(Number(manualLine.amount ?? 0)) : 0;
  const manualDiff = Math.round((manualSelectedTotal - manualTarget) * 100) / 100;

  async function confirmManual() {
    if (!manualLine || manualTxIds.length === 0) return;
    // Não existe conciliação parcial: a soma dos pagos tem de bater com a linha.
    if (Math.abs(manualDiff) > 0.01) {
      toast.error("A soma não bate com a linha do banco.", {
        description: `Linha ${formatCurrency(manualTarget)} · transações ${formatCurrency(
          manualSelectedTotal,
        )} · diferença ${formatCurrency(manualDiff)}`,
      });
      return;
    }
    setManualSaving(true);
    try {
      const single = manualTxIds.length === 1;
      const { error } = await supabase
        .from("bank_statement_lines")
        .update({
          status: "matched",
          matched_transaction_id: single ? manualTxIds[0] : null,
          // Conciliar por cima de uma linha que era lote SEPA deixava os
          // apontadores lá e duplicava a contagem.
          matched_payment_list_id: null,
          matched_sepa_export_id: null,
          matched_by: `${single ? "manual" : "manual-multi"}:${user?.email ?? "sistema"}`,
          matched_at: new Date().toISOString(),
        })
        .eq("id", manualLine.id);
      if (error) throw error;

      // A ponte só existe para o caso de N.
      await supabase.from("bank_line_transactions").delete().eq("line_id", manualLine.id);
      if (!single) {
        const { error: e2 } = await supabase
          .from("bank_line_transactions")
          .insert(manualTxIds.map((id) => ({ line_id: manualLine.id, transaction_id: id })));
        if (e2) throw e2;
      }

      if (manualTxIds.some((id) => crossAccountIds.has(id))) {
        toast.warning("Linha conciliada com transação de OUTRA conta — verifique a conta da liquidação.");
      } else {
        toast.success(single ? "Linha conciliada." : `Linha conciliada com ${manualTxIds.length} transações.`);
      }
      setManualLine(null);
      setManualTxIds([]);
      setCrossAccountAck(false);
      queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", currentStatement?.id] });
      queryClient.invalidateQueries({ queryKey: ["bank-recon-bridge"] });
    } catch (err: any) {
      toast.error("Erro ao conciliar: " + (err?.message ?? "desconhecido"));
    } finally {
      setManualSaving(false);
    }
  }

  async function confirmIgnore() {
    if (!ignoreLine || !ignoreNote.trim()) return;
    const { error } = await supabase
      .from("bank_statement_lines")
      .update({
        status: "ignored",
        note: ignoreNote.trim(),
        // Uma linha ignorada não explica nada: os apontadores TÊM de sair, ou o
        // índice único continua a reservar a transação e a conciliação seguinte
        // sobre ela rebenta com violação de chave.
        matched_transaction_id: null,
        matched_payment_list_id: null,
        matched_sepa_export_id: null,
        matched_by: `ignored:${user?.email ?? "sistema"}`,
        matched_at: new Date().toISOString(),
      })
      .eq("id", ignoreLine.id);
    if (error) return toast.error("Erro ao ignorar: " + error.message);
    await supabase.from("bank_line_transactions").delete().eq("line_id", ignoreLine.id);
    toast.success("Linha marcada como ignorada.");
    setIgnoreLine(null);
    setIgnoreNote("");
    queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", currentStatement?.id] });
    queryClient.invalidateQueries({ queryKey: ["bank-recon-bridge"] });

  }

  /**
   * Voltar a conciliar sem reimportar: corre outra vez as camadas sobre as
   * linhas já gravadas. Não apaga nada, não toca nas conciliações MANUAIS nem
   * nas IGNORADAS, e deixa as anteriores ao corte de fora. Sem isto, corrigir
   * o motor obrigava a apagar e reimportar o extrato.
   */
  async function rerunReconcile() {
    if (!currentStatement) return;
    setRerunning(true);
    try {
      const lines = (savedLines as any[]).filter(
        (l) =>
          l.status === "unmatched" ||
          (l.status === "matched" && String(l.matched_by ?? "").startsWith("auto:")),
      );
      // Tudo o que está preso por uma linha fora desta passagem continua consumido
      // (manuais, ignoradas, pré-corte e as que originaram transação via "created:").
      const inPass = new Set(lines.map((l) => l.id));
      const preUsed = new Set<string>();
      (savedLines as any[]).forEach((l) => {
        if (inPass.has(l.id)) return;
        if (l.matched_transaction_id) preUsed.add(l.matched_transaction_id);
        if (l.created_transaction_id) preUsed.add(l.created_transaction_id);
        if (l.matched_sepa_export_id) {
          (sepaSiblings.get(l.matched_sepa_export_id) ?? []).forEach((e) =>
            (e.transaction_ids ?? []).forEach((id) => preUsed.add(id)),
          );
        }
        // Terceiro ramo: conciliações manuais de N (ponte). Sem isto, uma
        // transação já explicada voltava a ser candidata das camadas automáticas.
        (bridgeByLine.get(l.id) ?? []).forEach((r) => preUsed.add(r.transaction_id));
      });


      const result = reconcileStatement(
        lines.map((l) => ({
          key: l.id,
          description: l.description ?? "",
          amount: Number(l.amount ?? 0),
          bookingDate: String(l.booking_date).slice(0, 10),
          valueDate: l.value_date,
        })),
        txns as ReconcileTransaction[],
        sepaExports as ReconcileSepaExport[],
        { preUsedTransactionIds: preUsed },
      );

      const now = new Date().toISOString();
      for (const l of lines) {
        let m = result.matches.get(l.id);
        // Trava: nunca gravar transações já presas por outra linha (índice
        // único). Verifica TODOS os ids do match, não só o singular.
        if (m && (m.transactionIds ?? []).some((id) => preUsed.has(id))) m = undefined;

        const { error } = await supabase
          .from("bank_statement_lines")
          .update({
            status: m ? "matched" : "unmatched",
            matched_transaction_id: m?.matched_transaction_id ?? null,
            matched_payment_list_id: m?.matched_payment_list_id ?? null,
            matched_sepa_export_id: m?.matched_sepa_export_id ?? null,
            matched_by: m ? `auto:${m.layer}` : null,
            matched_at: m ? now : null,
          })
          .eq("id", l.id);
        if (error) throw error;
        // As linhas desta passagem deixam de ter conciliação manual de N: o
        // `on delete cascade` não cobre isto, porque a linha não é apagada.
        if ((bridgeByLine.get(l.id) ?? []).length > 0) {
          await supabase.from("bank_line_transactions").delete().eq("line_id", l.id);
        }
        (m?.transactionIds ?? []).forEach((id) => preUsed.add(id));
      }



      toast.success(
        `Reconciliação refeita: ${result.counts.sepa} lote(s) SEPA, ${result.counts.amount} por valor, ` +
          `${result.counts.description} por descrição, ${result.counts.unmatched} por explicar.`,
      );
      queryClient.invalidateQueries({ queryKey: ["bank-recon-lines", currentStatement.id] });
    } catch (err: any) {
      toast.error("Erro ao voltar a conciliar: " + (err?.message ?? "desconhecido"));
    } finally {
      setRerunning(false);
    }
  }


  if (!allowed) {
    return <p className="text-sm text-muted-foreground">Sem permissão para a Conciliação Bancária.</p>;
  }

  // O lote SEPA, a sua comissão e o seu imposto de selo partilham o código de
  // referência do banco: mostram-se agrupados. É só leitura — não lança nada.
  const refGroups = new Map<string, number>();
  (savedLines as any[]).forEach((l) => {
    if (!l.bank_ref) return;
    refGroups.set(l.bank_ref, (refGroups.get(l.bank_ref) ?? 0) + 1);
  });

  

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
                  No {cutoffMismatch.label} o extrato declara {formatCurrency(cutoffMismatch.reference)} e o sistema tem{" "}
                  {formatCurrency(cutoffMismatch.implanted)} implantados (diferença {formatCurrency(cutoffMismatch.diff)}).
                  Importa-se de qualquer forma, mas a data de corte ou o saldo implantado estão errados.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-2 text-sm md:grid-cols-3 lg:grid-cols-6">
            <div><p className="text-xs text-muted-foreground">Período</p><p>{formatDatePT(parsed.periodFrom)} → {formatDatePT(parsed.periodTo)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Linhas</p>
              <p>{parsed.lines.length}</p>
              <p className="text-[10px] text-muted-foreground">
                {preCutoffParsed.length} anteriores ao corte · {parsed.lines.length - preCutoffParsed.length} a conciliar
              </p>
            </div>
            <div><p className="text-xs text-muted-foreground">Lote SEPA</p><p>{preview.counts.sepa}</p></div>
            <div><p className="text-xs text-muted-foreground">Valor exato</p><p>{preview.counts.amount}</p></div>
            <div><p className="text-xs text-muted-foreground">Descrição</p><p>{preview.counts.description}</p></div>
            <div><p className="text-xs text-muted-foreground">Por explicar</p><p className="font-semibold text-warning">{preview.counts.unmatched}</p></div>
          </div>
          {preCutoffParsed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {preCutoffParsed.length} movimento(s) até {formatDatePT(cutoff)} ({formatCurrency(preCutoffParsedTotal)}) já
              estão dentro do saldo implantado: importam-se para o histórico, mas não se conciliam.
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={saveImport} disabled={saving || !parsed.coherent}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Gravar importação
            </Button>
            <Button variant="ghost" onClick={() => { setParsed(null); setPreview(null); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Sem permissão para ver o saldo desta conta: nada do triângulo aparece (D-ERP36) */}
      {currentStatement && triangle?.balanceHidden && (
        <p className="text-xs text-muted-foreground">
          Não tens permissão para ver saldos desta conta — o confronto entre o sistema e o banco não é mostrado.
        </p>
      )}

      {/* Confronto sistema × banco */}
      {currentStatement && triangle && !triangle.balanceHidden && (
        <div className="glass space-y-3 rounded-xl p-4 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Saldo do sistema a {formatDatePT(triangle.periodTo)}
              </p>
              <p className="text-lg font-bold">
                {triangle.system === null ? "Sem controlo de saldo" : formatCurrency(triangle.system)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Fonte única, com data de corte e ajustes de caixa
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo declarado pelo banco</p>
              <p className="text-lg font-bold">{formatCurrency(triangle.declared)}</p>
              <p className="text-[10px] text-muted-foreground">Saldo após a última linha do extrato</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Diferença</p>
              <p
                className={`text-lg font-bold ${
                  triangle.diff !== null && Math.abs(triangle.diff) > 0.01 ? "text-destructive" : "text-success"
                }`}
              >
                {triangle.diff === null ? "—" : formatCurrency(triangle.diff)}
              </p>
            </div>
          </div>
          <div className="grid gap-3 border-t border-border pt-3 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">
                Linhas do banco por explicar ({unmatchedLines.length})
              </p>
              <p className="font-semibold">{formatCurrency(triangle.unexplainedBank)}</p>
              <p className="text-[10px] text-muted-foreground">
                Pesa {formatCurrency(triangle.contribBank)} na diferença
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Transações sem movimento no banco ({txWithoutLine.length})
              </p>
              <p className="font-semibold">{formatCurrency(triangle.unexplainedSystem)}</p>
              <p className="text-[10px] text-muted-foreground">
                Pesa {formatCurrency(triangle.contribSystem)} na diferença
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Retenção na fonte (lotes SEPA)</p>
              <p className="font-semibold">{formatCurrency(retentionTotal)}</p>
              <p className="text-[10px] text-muted-foreground">
                Banco paga líquido, sistema registou bruto — já descontada no saldo do sistema, não pesa na diferença
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resto sem explicação</p>
              <p
                className={`font-semibold ${
                  triangle.residual !== null && Math.abs(triangle.residual) > 0.01
                    ? "text-destructive"
                    : "text-success"
                }`}
              >
                {triangle.residual === null ? "—" : formatCurrency(triangle.residual)}
              </p>
            </div>
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
          {currentStatement && (
            <Button size="sm" variant="outline" onClick={rerunReconcile} disabled={rerunning}>
              {rerunning ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Voltar a conciliar
            </Button>
          )}
        </div>
      )}

      {currentStatement && (
        <Tabs defaultValue="unmatched">
          <TabsList>
            <TabsTrigger value="matched">Conciliadas ({matchedLines.length})</TabsTrigger>
            <TabsTrigger value="unmatched">Linhas do banco por explicar ({unmatchedLines.length})</TabsTrigger>
            <TabsTrigger value="missing">Transações sem movimento no banco ({txWithoutLine.length})</TabsTrigger>
            <TabsTrigger value="rules">Regras ({(rules as BankLineRule[]).length})</TabsTrigger>
          </TabsList>

          <TabsContent value="matched" className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Data</TableHead><TableHead>Descrição do banco</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Valor</TableHead><TableHead className="w-[92px]">Camada</TableHead><TableHead className="max-w-[360px]">Ligada a</TableHead><TableHead className="sticky right-0 z-20 bg-background text-right shadow-[inset_1px_0_0_hsl(var(--border))]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{formatDatePT(l.booking_date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">
                      {l.description}
                      {l.bank_ref && refGroups.get(l.bank_ref)! > 1 && (
                        <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                          ref. {l.bank_ref} · {refGroups.get(l.bank_ref)} linhas
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${Number(l.amount) < 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell><Badge variant="outline">{LAYER_LABEL[String(l.matched_by ?? "").split(":")[1] ?? "manual"] ?? "Manual"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.matched_sepa_export_id ? (
                        <div className="space-y-0.5">
                          <p>Lote SEPA (lista de pagamento)</p>
                          {sepaInfo.get(l.id)?.exportCount! > 1 && (
                            <p className="text-warning">
                              Lote gerado {sepaInfo.get(l.id)!.exportCount}× (dupla geração) — tratado como um só
                            </p>
                          )}
                          {!!sepaInfo.get(l.id)?.retention && (
                            <p>
                              Sistema {formatCurrency(sepaInfo.get(l.id)!.systemGross)} bruto ·{" "}
                              <span className="text-foreground">
                                retenção na fonte {formatCurrency(sepaInfo.get(l.id)!.retention)}
                              </span>
                            </p>
                          )}
                        </div>
                      ) : (bridgeByLine.get(l.id) ?? []).length > 0 ? (
                        // Terceiro ramo: conciliação manual de N transações. O
                        // `matched_transaction_id` fica nulo — sem isto dava "—".
                        <div className="space-y-0.5">
                          <p className="text-foreground">
                            {(bridgeByLine.get(l.id) ?? []).length} transações ·{" "}
                            {formatCurrency(
                              Math.round(
                                (bridgeByLine.get(l.id) ?? []).reduce(
                                  (a, r) => a + Math.abs(Number(r.transactions?.paid_amount ?? 0)),
                                  0,
                                ) * 100,
                              ) / 100,
                            )}
                          </p>
                          {(bridgeByLine.get(l.id) ?? []).map((r) => (
                            <p key={r.id} className="max-w-[320px] truncate">
                              {formatCurrency(Math.abs(Number(r.transactions?.paid_amount ?? 0)))} ·{" "}
                              {r.transactions?.description ?? "(transação)"}
                            </p>
                          ))}
                        </div>
                      ) : (
                        txById.get(l.matched_transaction_id)?.description ?? "—"
                      )}

                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setDocsLine(l)}>
                        <Paperclip className="mr-1 h-3.5 w-3.5" />
                        {docCountByLine.get(l.id) ?? 0}
                      </Button>
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
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setDocsLine(l)}>
                        <Paperclip className="mr-1 h-3.5 w-3.5" />
                        {docCountByLine.get(l.id) ?? 0}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="unmatched" className="mt-3">
            {/* Várias linhas podem dar UMA transação pela soma (TPA, comissões de lote). */}
            {selectedIds.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm">
                <span>
                  {selectedIds.length} linha(s) selecionada(s) ·{" "}
                  <strong>
                    {formatCurrency(
                      unmatchedLines
                        .filter((l: any) => selectedIds.includes(l.id))
                        .reduce((a: number, l: any) => a + Number(l.amount ?? 0), 0),
                    )}
                  </strong>
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    setLaunchLines(
                      unmatchedLines.filter((l: any) => selectedIds.includes(l.id)).map(toLaunchable),
                    )
                  }
                >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" /> Lançar pela soma
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Data</TableHead><TableHead>Descrição do banco</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedLines.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nada por explicar.</TableCell></TableRow>
                )}
                {unmatchedLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(l.id)}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) => (v ? [...prev, l.id] : prev.filter((x) => x !== l.id)))
                        }
                      />
                    </TableCell>
                    <TableCell>{formatDatePT(l.booking_date)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">
                      {l.description}
                      {l.bank_ref && refGroups.get(l.bank_ref)! > 1 && (
                        <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                          ref. {l.bank_ref} · {refGroups.get(l.bank_ref)} linhas
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${Number(l.amount) < 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(Number(l.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setManualLine(l); setManualTxIds([]); setCrossAccountAck(false); }}>
                        <Link2 className="mr-1 h-3.5 w-3.5" /> Conciliar
                      </Button>
                      <Button size="sm" variant="outline" className="ml-1" onClick={() => setLaunchLines([toLaunchable(l)])}>
                        <PlusCircle className="mr-1 h-3.5 w-3.5" /> Lançar
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-1" onClick={() => { setIgnoreLine(l); setIgnoreNote(""); }}>
                        <EyeOff className="mr-1 h-3.5 w-3.5" /> Ignorar
                      </Button>
                      {/* O anexo vale em qualquer estado — durante a investigação é onde faz mais falta. */}
                      <Button size="sm" variant="outline" className="ml-1" onClick={() => setDocsLine(l)}>
                        <Paperclip className="mr-1 h-3.5 w-3.5" />
                        {docCountByLine.get(l.id) ?? 0}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="rules" className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              A regra propõe o preenchimento quando uma linha por explicar casa com o padrão. Nunca lança nada
              sozinha — quem confirma é a pessoa. Grava-se ao lançar uma linha à mão.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regra</TableHead><TableHead>Padrão</TableHead><TableHead>Ação</TableHead>
                  <TableHead className="text-right">Usos</TableHead><TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules as BankLineRule[]).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Ainda não há regras.</TableCell></TableRow>
                )}
                {(rules as BankLineRule[]).map((r) => (
                  <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs">{r.pattern}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {r.action === "create_income" ? "Receita" : r.action === "create_transfer" ? "Transferência" : "Despesa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.hits ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const { error } = await supabase
                            .from("bank_line_rules")
                            .update({ is_active: !r.is_active })
                            .eq("id", r.id);
                          if (error) toast.error(error.message);
                          else queryClient.invalidateQueries({ queryKey: ["bank-line-rules"] });
                        }}
                      >
                        {r.is_active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const { error } = await supabase.from("bank_line_rules").delete().eq("id", r.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success("Regra apagada.");
                            queryClient.invalidateQueries({ queryKey: ["bank-line-rules"] });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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

      {/* Anteriores ao corte — só para se perceber que estão lá e porquê */}
      {currentStatement && preCutoffLines.length > 0 && (
        <div className="glass rounded-xl p-4 text-sm opacity-80">
          <p className="font-medium">
            Anteriores ao corte ({preCutoffLines.length}) · {formatCurrency(preCutoffTotal)}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Movimentos até {formatDatePT(cutoff)} — já dentro do saldo implantado, por isso não se conciliam.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Descrição do banco</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preCutoffLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatDatePT(l.booking_date)}</TableCell>
                  <TableCell className="max-w-[420px] truncate">{l.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}



      {/* Lançar a partir da linha do banco — sempre com confirmação humana */}
      {launchLines && account && (
        <BankLineLaunchModal
          lines={launchLines}
          accountId={account.id}
          accountName={account.name}
          rules={rules as BankLineRule[]}
          onClose={() => setLaunchLines(null)}
          onDone={() => {
            setLaunchLines(null);
            setSelectedIds([]);
            queryClient.invalidateQueries({ queryKey: ["bank-recon-lines"] });
            queryClient.invalidateQueries({ queryKey: ["bank-recon-txns"] });
          }}
        />
      )}

      {/* Conciliação manual */}
      <Dialog open={!!manualLine} onOpenChange={(o) => !o && setManualLine(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Conciliar manualmente</DialogTitle></DialogHeader>
          {manualLine && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {formatDatePT(manualLine.booking_date)} · {manualLine.description} · {formatCurrency(Number(manualLine.amount))}
              </p>
              <div className="space-y-2">
                <Label>Transações</Label>
                {/* Selecção MÚLTIPLA: uma linha do banco pode ser explicada por
                    N transações. A soma tem de bater com a linha (±0,01 €). */}
                <SearchableSelect
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    setManualTxIds((prev) => (prev.includes(v) ? prev : [...prev, v]));
                    setCrossAccountAck(false);
                  }}
                  placeholder="Procurar e adicionar transação"
                  options={[
                    ...(txns as any[])
                      .filter((t) => !savedExplainedIds.has(t.id) && !manualTxIds.includes(t.id))
                      .map((t) => ({
                        value: t.id,
                        label: `${formatDatePT(t.payment_date ?? t.date)} · ${formatCurrency(Number(t.paid_amount ?? 0))} · ${t.description}`,
                        searchText: `${t.description ?? ""} ${t.paid_amount ?? ""}`,
                      })),
                    // Candidatas de OUTRAS contas: sempre depois e sempre com aviso.
                    ...(crossAccountTxns as any[])
                      .filter((t) => !savedExplainedIds.has(t.id) && !manualTxIds.includes(t.id))
                      .map((t) => ({
                        value: t.id,
                        label: `${formatDatePT(t.payment_date ?? t.date)} · ${formatCurrency(Number(t.paid_amount ?? 0))} · ${t.description}`,
                        description: `⚠ conta divergente — ${t.account_name}`,
                        searchText: `${t.description ?? ""} ${t.account_name ?? ""}`,
                      })),
                  ]}
                />
                {manualTxIds.length > 0 && (
                  <div className="rounded-lg border px-3 py-2 text-xs">
                    {/* Acima de 5 itens a lista rola; o total fica sempre fora da área de scroll. */}
                    <div className={`space-y-1 ${manualTxIds.length > 5 ? "max-h-52 overflow-y-auto pr-1" : ""}`}>
                      {manualTxIds.map((id) => {
                        const t = manualCandidates.get(id);
                        return (
                          <div key={id} className="flex items-start gap-2">
                            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug line-clamp-2">
                              {t?.description ?? "(transação)"}
                              {crossAccountIds.has(id) && (
                                <span className="ml-1 text-destructive">⚠ {t?.account_name}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-right font-medium tabular-nums">
                              {formatCurrency(Math.abs(Number(t?.paid_amount ?? 0)))}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => setManualTxIds((prev) => prev.filter((x) => x !== id))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`mt-1 border-t pt-1 font-medium ${Math.abs(manualDiff) > 0.01 ? "text-destructive" : "text-success"}`}>
                      Total {formatCurrency(manualSelectedTotal)} · linha {formatCurrency(manualTarget)} · diferença{" "}
                      {formatCurrency(manualDiff)}
                    </div>
                  </div>
                )}
              </div>
              {selectedCrossAccounts.length > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
                  <p className="font-semibold text-destructive">
                    Conta divergente — {selectedCrossAccounts.map((t) => t.account_name).join(", ")}
                  </p>
                  <p className="text-muted-foreground">
                    Estas transações estão registadas noutra conta. Se o dinheiro
                    saiu da conta deste extrato, a conta da liquidação está
                    provavelmente errada e deve ser corrigida.
                  </p>
                  <label className="flex items-start gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={crossAccountAck}
                      onChange={(e) => setCrossAccountAck(e.target.checked)}
                    />
                    Confirmo que quero ligar esta linha a transações de outra conta.
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">A ligação não altera a transação: não liquida nem muda valores.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualLine(null)}>Cancelar</Button>
            <Button
              onClick={confirmManual}
              disabled={
                manualTxIds.length === 0 ||
                manualSaving ||
                Math.abs(manualDiff) > 0.01 ||
                (selectedCrossAccounts.length > 0 && !crossAccountAck)
              }
            >
              {manualSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Ligar
            </Button>
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

      {/* Documentos de uma linha do banco — independente do estado de conciliação. */}
      <BankLineDocumentsDialog line={docsLine} onClose={() => setDocsLine(null)} />
    </div>
  );
}
