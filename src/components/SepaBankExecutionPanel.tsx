import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mustWrite } from "@/lib/supabase-write";
import { useSepaBankExecution } from "@/hooks/useSepaBankExecution";
import { BANK_EXEC_LABEL, stateByTransaction, type BeLineResult } from "@/lib/sepa/bank-execution";
import { formatCurrency } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Landmark, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * #37 ponto 3 — retorno do banco por linha da lista SEPA.
 * O casamento é SUGESTÃO; "Confirmar" grava em payment_list_bank_executions.
 * Nunca altera a transação (status/paid_amount continuam na liquidação).
 */
export default function SepaBankExecutionPanel({ listId }: { listId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useSepaBankExecution({ listId });
  const [saving, setSaving] = useState<string | null>(null);

  const byTx = useMemo(() => stateByTransaction(data?.results ?? []), [data]);
  const rows = Array.from(byTx.values());
  const counts = { executado: 0, por_executar: 0, sem_extrato: 0 };
  rows.forEach((r) => counts[r.state]++);
  const suggestions = rows.filter((r) => r.state === "executado" && !r.reused);

  if (isLoading || !data || data.exports.length === 0) return null;

  const confirm = async (items: BeLineResult[], key: string) => {
    setSaving(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      await mustWrite(
        supabase.from("payment_list_bank_executions").insert(
          items.map((r) => ({
            payment_list_id: listId,
            sepa_export_id: r.sepa_export_id,
            transaction_id: r.transaction_id,
            bank_statement_line_id: r.bank_line!.id,
            match_kind: r.match_kind ?? "lote",
            confirmed_by: u.user?.id,
          })) as any,
        ).select("id"),
        { expectRows: items.length },
      );
      toast.success(`${items.length} linha(s) confirmada(s) como executadas pelo banco.`);
      qc.invalidateQueries({ queryKey: ["sepa-bank-execution"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível confirmar.");
    } finally {
      setSaving(null);
    }
  };

  const tone = (s: BeLineResult["state"]) =>
    s === "executado" ? "default" : s === "por_executar" ? "destructive" : "secondary";

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2"><Landmark className="h-4 w-4" /> Retorno do banco (SEPA)</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="default">{counts.executado} executadas</Badge>
          <Badge variant="destructive">{counts.por_executar} por executar</Badge>
          <Badge variant="secondary">{counts.sem_extrato} sem extrato</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Sugestão pelo extrato importado (débito igual ao cêntimo até 10 dias depois da exportação). Confirmar não liquida nem altera a transação.
        {data.coverageFrom ? ` Extratos de ${data.coverageFrom} a ${data.coverageTo}.` : " Sem extratos importados."}
      </p>
      {suggestions.length > 0 && (
        <Button size="sm" variant="outline" disabled={saving !== null} onClick={() => confirm(suggestions, "all")}>
          <Check className="h-3.5 w-3.5 mr-1" /> Confirmar {suggestions.length} sugestão(ões)
        </Button>
      )}
      <div className="space-y-1 max-h-72 overflow-auto">
        {rows.map((r) => {
          const tx = data.txById.get(r.transaction_id) as any;
          return (
            <div key={r.transaction_id} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 py-1">
              <span className="truncate">{tx?.supplier_name ?? tx?.description ?? r.transaction_id.slice(0, 8)} · {formatCurrency(tx?.amount ?? 0)}</span>
              <span className="flex items-center gap-2 shrink-0">
                {r.bank_line && (
                  <span className="text-muted-foreground">{r.bank_line.booking_date} · {r.bank_line.description.slice(0, 32)} ({r.match_kind})</span>
                )}
                <Badge variant={tone(r.state) as any}>
                  {BANK_EXEC_LABEL[r.state]}{r.state === "executado" && !r.reused ? " · sugestão" : ""}
                </Badge>
                {r.state === "executado" && !r.reused && (
                  <Button size="sm" variant="ghost" className="h-6 px-2" disabled={saving !== null} onClick={() => confirm([r], r.transaction_id)}>
                    Confirmar
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ligação na transação: em que lista/linha do banco foi executada. */
export function TransactionBankExecution({ transactionId }: { transactionId: string }) {
  const { data } = useSepaBankExecution({ transactionId });
  const mine = (data?.results ?? []).filter((r) => r.transaction_id === transactionId);
  const best = stateByTransaction(mine).get(transactionId);
  if (!best) return null;
  return (
    <div className="text-xs flex flex-wrap items-center gap-2 rounded-md border border-border/50 p-2">
      <Landmark className="h-3.5 w-3.5" />
      <span>Banco (SEPA):</span>
      <Badge variant={best.state === "executado" ? "default" : best.state === "por_executar" ? "destructive" : "secondary"}>
        {BANK_EXEC_LABEL[best.state]}{best.state === "executado" && !best.reused ? " · sugestão" : ""}
      </Badge>
      {best.bank_line && <span className="text-muted-foreground">{best.bank_line.booking_date} · {best.bank_line.description.slice(0, 40)}</span>}
    </div>
  );
}
