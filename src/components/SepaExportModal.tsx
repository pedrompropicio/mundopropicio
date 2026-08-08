import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, Landmark, Loader2, X } from "lucide-react";
import {
  buildPain001,
  checkSepaIban,
  compactDescriptionDeterministic,
  acceptCompaction,
  truncateUstrd,
  downloadXml,
  resolveExecutionDate,
  DEFAULT_DEBTOR_IBAN,
  SANTANDER_PT_BIC,
  USTRD_HARD_LIMIT,
  USTRD_TARGET,
  type IbanRejectReason,
} from "@/lib/sepa/pain001";
import { normalizeIban, formatIban } from "@/lib/iban";

export interface SepaCandidate {
  transactionId: string;
  creditorName: string;
  iban: string | null;
  /** valor em aberto (líquido a transferir, c/IVA − retenção) */
  amount: number;
  description: string;
  isReimbursement: boolean;
  /** motivo de exclusão já detetado a montante (ex.: sem valor em aberto) */
  preExcludeReason?: string;
}

interface Row extends SepaCandidate {
  remittance: string;
  excluded?: { reason: IbanRejectReason | "no_open_amount"; detail: string };
}

const REASON_LABEL: Record<string, string> = {
  missing: "Sem IBAN",
  invalid: "IBAN inválido",
  non_sepa: "IBAN fora da zona SEPA",
  no_open_amount: "Sem valor em aberto",
};

export default function SepaExportModal({
  listId,
  listTitle,
  listStatus,
  paymentDate,
  candidates,
  companyName,
  onClose,
}: {
  listId: string;
  listTitle: string;
  listStatus: string;
  paymentDate: string | null;
  candidates: SepaCandidate[];
  companyName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isTest = !(listStatus === "approved" || listStatus === "partially_approved");
  const executionDate = useMemo(() => resolveExecutionDate(paymentDate), [paymentDate]);
  const executionShifted = !!paymentDate && executionDate !== paymentDate;

  const { data: accounts = [] } = useQuery({
    queryKey: ["sepa-debtor-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, iban")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((a: any) => normalizeIban(a.iban).startsWith("PT"));
    },
  });

  const [debtorIban, setDebtorIban] = useState<string>("");
  useEffect(() => {
    if (debtorIban || accounts.length === 0) return;
    const preferred = accounts.find((a: any) => normalizeIban(a.iban) === DEFAULT_DEBTOR_IBAN);
    setDebtorIban(normalizeIban((preferred ?? accounts[0]).iban));
  }, [accounts, debtorIban]);

  // Linhas iniciais: resolução do IBAN + compactação determinística
  const [rows, setRows] = useState<Row[]>([]);
  const [compacting, setCompacting] = useState(false);

  useEffect(() => {
    const initial: Row[] = candidates.map((c) => {
      if (c.preExcludeReason) {
        return { ...c, remittance: "", excluded: { reason: "no_open_amount", detail: c.preExcludeReason } };
      }
      const check = checkSepaIban(c.iban);
      const remittance = compactDescriptionDeterministic(c.description);
      if (!check.ok) {
        return { ...c, remittance, excluded: { reason: check.reason!, detail: check.detail ?? "" } };
      }
      return { ...c, iban: check.iban, remittance };
    });
    setRows(initial);

    // Compactação por LLM só para os que continuam acima do alvo
    const longOnes = initial
      .filter((r) => !r.excluded && r.remittance.length > USTRD_TARGET)
      .map((r) => ({ id: r.transactionId, text: r.remittance }));
    if (longOnes.length === 0) return;

    let cancelled = false;
    setCompacting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    supabase.functions
      .invoke("sepa-compact-descriptions", { body: { items: longOnes, limit: USTRD_TARGET } })
      .then(({ data, error }) => {
        if (cancelled || error || !data?.results) return;
        const map = new Map<string, string>();
        for (const r of data.results as Array<{ id: string; text: string }>) {
          map.set(String(r.id), String(r.text));
        }
        setRows((prev) =>
          prev.map((r) => {
            const candidate = map.get(r.transactionId);
            if (!candidate) return r;
            const accepted = acceptCompaction(r.remittance, candidate, USTRD_TARGET);
            return accepted ? { ...r, remittance: accepted } : r;
          }),
        );
      })
      .catch(() => {
        /* fallback gracioso: fica a versão determinística */
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setCompacting(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const valid = rows.filter((r) => !r.excluded);
  const excluded = rows.filter((r) => r.excluded);
  const total = valid.reduce((s, r) => s + r.amount, 0);
  const selectedAccount = accounts.find((a: any) => normalizeIban(a.iban) === debtorIban);

  const handleGenerate = async () => {
    if (valid.length === 0 || !debtorIban) return;
    const out = buildPain001({
      listId,
      listTitle,
      debtorName: companyName,
      debtorIban,
      debtorBic: SANTANDER_PT_BIC,
      executionDate,
      listDate: paymentDate ?? null,

      isTest,
      rows: valid.map((r) => ({
        transactionId: r.transactionId,
        creditorName: r.creditorName,
        iban: r.iban!,
        amount: r.amount,
        remittance: truncateUstrd(r.remittance),
      })),
    });
    downloadXml(out.xml, out.fileName);

    // Histórico de exportações — guarda os ids EXATOS que entraram no XML, para
    // que o comprovativo do lote seja replicado só nessas transações.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payment_list_sepa_exports").insert({
        payment_list_id: listId,
        exported_by: userData?.user?.email ?? "sistema",
        file_name: out.fileName,
        msg_id: out.msgId,
        total_amount: Number(out.controlSum),
        n_transactions: out.numberOfTxs,
        transaction_ids: valid.map((r) => r.transactionId),
      } as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["payment_list_sepa_exports", listId] });
    } catch (err: any) {
      toast({
        title: "Ficheiro gerado, registo do histórico falhou",
        description: err?.message ?? "Não foi possível guardar o registo da exportação.",
        variant: "destructive",
      });
    }

    toast({
      title: "Ficheiro gerado",
      description: `${out.numberOfTxs} transferência(s) • soma de controlo ${out.controlSum} € • ${out.fileName}`,
    });
    onClose();
  };


  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="glass w-full sm:max-w-5xl rounded-xl p-4 sm:p-6 my-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <Landmark className="h-5 w-5 text-primary" /> Exportar ficheiro Santander
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              SEPA ISO 20022 pain.001.001.09 — {listTitle}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isTest && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Lista ainda não aprovada — ficheiro de teste.</strong> O nome do ficheiro leva o sufixo{" "}
              <code>_TESTE</code>.
            </span>
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Conta ordenante
            </label>
            <select
              value={debtorIban}
              onChange={(e) => setDebtorIban(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {accounts.length === 0 && <option value="">Sem contas com IBAN PT</option>}
              {accounts.map((a: any) => (
                <option key={a.id} value={normalizeIban(a.iban)}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {selectedAccount ? formatIban(normalizeIban(selectedAccount.iban)) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">Ordenante: {companyName}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Data de execução</p>
            <p className="font-mono text-base font-bold">{formatDate(executionDate)}</p>
            {executionShifted && (
              <p className="text-[11px] text-amber-500">
                Ajustada ({formatDate(paymentDate!)} → próximo dia útil)
              </p>
            )}
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              A exportar ({valid.length}/{rows.length})
            </p>
            <p className="font-mono text-base font-bold text-emerald-500">{formatCurrency(total)}</p>
          </div>
        </div>

        {compacting && (
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> A compactar descritivos longos…
          </p>
        )}

        <div className="mb-4 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Beneficiário</th>
                <th className="p-2 text-left">IBAN</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2 text-left">Descritivo (editável)</th>
              </tr>
            </thead>
            <tbody>
              {valid.map((r) => (
                <tr key={r.transactionId} className="border-t border-border/40 align-top">
                  <td className="p-2">
                    <span className="font-medium">{r.creditorName}</span>
                    {r.isReimbursement && (
                      <Badge variant="outline" className="ml-1.5 text-[10px]">
                        Reembolso
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 font-mono text-[11px]">{formatIban(r.iban!)}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(r.amount)}</td>
                  <td className="p-2">
                    <input
                      value={r.remittance}
                      maxLength={USTRD_HARD_LIMIT}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) => (x.transactionId === r.transactionId ? { ...x, remittance: e.target.value } : x)),
                        )
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                    />
                    <span
                      className={`text-[10px] ${r.remittance.length > USTRD_TARGET ? "text-amber-500" : "text-muted-foreground"}`}
                    >
                      {r.remittance.length}/{USTRD_HARD_LIMIT} caracteres
                    </span>
                  </td>
                </tr>
              ))}
              {valid.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    Nenhum item exportável nesta lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {excluded.length > 0 && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">
              Excluídos ({excluded.length})
            </p>
            <ul className="space-y-1 text-xs">
              {excluded.map((r) => (
                <li key={r.transactionId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.creditorName}</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(r.amount)}</span>
                  <Badge variant="destructive" className="text-[10px]">
                    {REASON_LABEL[r.excluded!.reason] ?? r.excluded!.detail}
                  </Badge>
                  {r.iban && <span className="font-mono text-[10px] text-muted-foreground">{r.iban}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={valid.length === 0 || !debtorIban}>
            <Download className="mr-1.5 h-4 w-4" /> Gerar ficheiro ({valid.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
