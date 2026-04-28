import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, ExternalLink, Lock, Receipt, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/camarim-helpers";

interface IntegrationSummary {
  generated_at?: string;
  generated_by?: string;
  currency?: string;
  consolidated_groups?: number;
  consolidated_transaction_ids?: string[];
  items_integrated?: number;
  total_items?: number;
  total_base?: number;
  total_iva?: number;
  total_amount?: number;
  by_origin?: { advance?: number; card?: number; out_of_pocket?: number };
  settlement?: {
    advance_net?: number;
    spent_from_advance?: number;
    balance?: number;
    type?: "balanced" | "refund" | "reinforcement";
    transaction_id?: string | null;
  };
  parked_remaining?: number;
  error_count?: number;
  errors?: string[];
}

interface Props {
  summary: IntegrationSummary | null;
  transactionIds: string[];
  integratedAt: string | null;
  currency: string;
}

interface TxRow {
  id: string;
  description: string;
  amount: number;
  type: string;
  status: string;
  date: string;
}

export function CamarimIntegrationSummary({
  summary,
  transactionIds,
  integratedAt,
  currency,
}: Props) {
  const navigate = useNavigate();
  const [showTxs, setShowTxs] = useState(false);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);

  const openTxList = async () => {
    setShowTxs(true);
    if (txs.length > 0 || transactionIds.length === 0) return;
    setLoadingTxs(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,description,amount,type,status,date")
      .in("id", transactionIds);
    setTxs(((data ?? []) as TxRow[]).sort((a, b) => a.date.localeCompare(b.date)));
    setLoadingTxs(false);
  };

  const goToTx = (id: string) => {
    navigate(`/transactions?highlight=${id}`);
  };

  const cur = summary?.currency ?? currency ?? "EUR";

  return (
    <>
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Sessão integrada
            </span>
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
              <Lock className="h-3 w-3" /> Bloqueada para edição
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Integrada em{" "}
            <strong>
              {integratedAt
                ? new Date(integratedAt).toLocaleString("pt-PT", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </strong>
            {summary?.generated_by ? ` por ${summary.generated_by}` : ""}. Esta sessão já não pode ser
            alterada — para qualquer correção contacta um administrador.
          </p>

          {summary && (
            <>
              {/* Totais */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Itens" value={String(summary.items_integrated ?? 0)} />
                <Stat label="Transações" value={String(summary.consolidated_groups ?? 0)} />
                <Stat
                  label="Total base"
                  value={formatCurrency(summary.total_base ?? 0, cur)}
                />
                <Stat
                  label="Total geral"
                  value={formatCurrency(summary.total_amount ?? 0, cur)}
                  emphasis
                />
              </div>

              {/* Por origem */}
              <div className="rounded-md border border-border bg-background/60 p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Por origem de pagamento
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Adiantamento: </span>
                    <strong className="tabular-nums">
                      {formatCurrency(summary.by_origin?.advance ?? 0, cur)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cartão: </span>
                    <strong className="tabular-nums">
                      {formatCurrency(summary.by_origin?.card ?? 0, cur)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reembolso: </span>
                    <strong className="tabular-nums">
                      {formatCurrency(summary.by_origin?.out_of_pocket ?? 0, cur)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Acerto */}
              {summary.settlement && (summary.settlement.advance_net ?? 0) > 0 && (
                <div className="rounded-md border border-border bg-background/60 p-2.5 text-xs">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Acerto de adiantamento
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      Líquido entregue:{" "}
                      <strong className="tabular-nums">
                        {formatCurrency(summary.settlement.advance_net ?? 0, cur)}
                      </strong>
                    </div>
                    <div>
                      Gasto via adiant.:{" "}
                      <strong className="tabular-nums">
                        {formatCurrency(summary.settlement.spent_from_advance ?? 0, cur)}
                      </strong>
                    </div>
                  </div>
                  <p className="mt-1.5">
                    {summary.settlement.type === "balanced" && (
                      <span className="text-emerald-600">✓ Equilibrado, sem acerto.</span>
                    )}
                    {summary.settlement.type === "reinforcement" && (
                      <span className="text-destructive">
                        Reforço a pagar à equipa:{" "}
                        <strong>
                          {formatCurrency(Math.abs(summary.settlement.balance ?? 0), cur)}
                        </strong>
                      </span>
                    )}
                    {summary.settlement.type === "refund" && (
                      <span className="text-emerald-600">
                        Devolução à empresa:{" "}
                        <strong>
                          {formatCurrency(Math.abs(summary.settlement.balance ?? 0), cur)}
                        </strong>
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Erros / parqueados */}
              {((summary.error_count ?? 0) > 0 || (summary.parked_remaining ?? 0) > 0) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Avisos
                  </div>
                  {(summary.parked_remaining ?? 0) > 0 && (
                    <p className="mt-1">
                      {summary.parked_remaining} item(ns) parqueado(s) ficaram para próxima sessão.
                    </p>
                  )}
                  {(summary.errors ?? []).length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {summary.errors!.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {summary.errors!.length > 5 && (
                        <li>… mais {summary.errors!.length - 5}</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              onClick={openTxList}
              disabled={transactionIds.length === 0}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Ver transações geradas ({transactionIds.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTxs} onOpenChange={setShowTxs}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transações geradas pela integração</DialogTitle>
            <DialogDescription>
              Clica numa transação para abri-la na lista financeira.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {loadingTxs ? (
              <p className="py-4 text-center text-sm text-muted-foreground">A carregar…</p>
            ) : txs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sem transações vinculadas.
              </p>
            ) : (
              txs.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => goToTx(tx.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5 text-left transition hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tx.description}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{tx.date}</span>
                      <span>·</span>
                      <Badge variant="outline" className="h-4 text-[9px]">
                        {tx.status}
                      </Badge>
                      <Badge variant="outline" className="h-4 text-[9px]">
                        {tx.type === "expense" ? "Despesa" : "Receita"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={
                        tx.type === "expense"
                          ? "text-sm font-semibold text-destructive tabular-nums"
                          : "text-sm font-semibold text-emerald-600 tabular-nums"
                      }
                    >
                      {tx.type === "expense" ? "-" : "+"}
                      {formatCurrency(tx.amount, cur)}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={emphasis ? "text-base font-bold tabular-nums" : "text-sm font-semibold tabular-nums"}>
        {value}
      </p>
    </div>
  );
}
