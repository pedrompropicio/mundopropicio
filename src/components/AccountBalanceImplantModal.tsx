/**
 * Implantação de saldo de uma conta financeira (só admin).
 *
 * Semântica: `initial_balance` é o saldo da conta ao FECHO de
 * `initial_balance_date`. Movimentos com data efetiva
 * (COALESCE(payment_date, date)) igual ou anterior a essa data já estão
 * dentro dele e por isso deixam de somar — é isso que evita dupla contagem.
 *
 * O modal nunca implanta valores por si: mostra lado a lado o saldo que o
 * sistema calcula hoje e o que passará a calcular, e grava quem implantou e
 * quando no log de auditoria.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { logAudit, getAuditUser } from "@/lib/audit";
import {
  computeAccountBalance,
  fetchAccountCashAdjustments,
  buildAccountCutoffs,
} from "@/lib/account-balance";
import { invalidateCardSessionQueries } from "@/lib/card-session-helpers";

interface Props {
  account: any;
  onClose: () => void;
}

export default function AccountBalanceImplantModal({ account, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cutoff, setCutoff] = useState<string>(account.initial_balance_date ?? "");
  // Só pré-preenche o saldo quando já existe uma implantação (data de corte
  // definida). Em contas por implantar o campo abre vazio para ninguém gravar
  // zero por engano.
  const [balance, setBalance] = useState<string>(
    account.initial_balance_date ? String(account.initial_balance ?? 0) : ""
  );

  useEffect(() => {
    setCutoff(account.initial_balance_date ?? "");
    setBalance(account.initial_balance_date ? String(account.initial_balance ?? 0) : "");
  }, [account.id]);

  const { data: txs = [] } = useQuery({
    queryKey: ["account-implant-txs", account.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, paid_amount, date, payment_date")
        .eq("account_id", account.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ajustes com a configuração atual e com a configuração a implantar.
  const { data: adjNow } = useQuery({
    queryKey: ["account-implant-adj", account.id, account.initial_balance_date ?? ""],
    queryFn: () => fetchAccountCashAdjustments([account.id], buildAccountCutoffs([account])),
  });
  const { data: adjNext } = useQuery({
    queryKey: ["account-implant-adj-next", account.id, cutoff],
    queryFn: () =>
      fetchAccountCashAdjustments(
        [account.id],
        new Map([[account.id, cutoff || null]])
      ),
  });

  const currentBalance = computeAccountBalance(account, txs as any, adjNow);
  const nextAccount = {
    ...account,
    initial_balance: parseFloat(balance.replace(",", ".")) || 0,
    initial_balance_date: cutoff || null,
  };
  const nextBalance = computeAccountBalance(nextAccount, txs as any, adjNext);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // `.select()` confirma que a linha foi realmente escrita: sem isto, um
      // update travado por RLS devolve sucesso vazio e o modal fechava sem
      // nada ter sido gravado.
      const { data, error } = await supabase
        .from("financial_accounts")
        .update({
          initial_balance: nextAccount.initial_balance,
          initial_balance_date: nextAccount.initial_balance_date,
        })
        .eq("id", account.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nada foi gravado — sem permissão para alterar esta conta.");
      }

      await logAudit({
        entity_type: "financial_account",
        entity_id: account.id,
        action: "implant_balance",
        changed_by: getAuditUser(user),
        old_data: {
          initial_balance: Number(account.initial_balance ?? 0),
          initial_balance_date: account.initial_balance_date ?? null,
          computed_balance: currentBalance,
        },
        new_data: {
          initial_balance: nextAccount.initial_balance,
          initial_balance_date: nextAccount.initial_balance_date,
          computed_balance: nextBalance,
        },
        metadata: { account_name: account.name, implanted_at: new Date().toISOString() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-tx-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-cash-adjustments"] });
      invalidateCardSessionQueries(queryClient);
      toast({ title: "Saldo implantado." });
      onClose();
    },
    onError: (err: any) =>
      toast({
        title: "Erro ao implantar saldo",
        description: err?.message ?? "Não foi possível gravar. Tenta de novo.",
        variant: "destructive",
      }),
  });

  const fmt = (v: number | null) => (v === null ? "Saldo não controlado" : formatCurrency(v));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Implantar saldo — {account.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            O saldo indicado é o saldo da conta ao fecho do dia escolhido. Tudo o que
            aconteceu até esse dia deixa de somar — passa a estar dentro deste valor.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="implant-date">Data de corte</Label>
              <DatePicker id="implant-date" value={cutoff} onChange={setCutoff} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="implant-balance">Saldo nessa data (€)</Label>
              <Input
                id="implant-balance"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="glass rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Sistema calcula hoje</p>
              <p className="mt-1 font-mono text-base font-bold">{fmt(currentBalance)}</p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Depois de implantar</p>
              <p className="mt-1 font-mono text-base font-bold text-primary">{fmt(nextBalance)}</p>
            </div>
          </div>

          {!cutoff && (
            <p className="text-xs text-warning">
              Sem data de corte, o valor indicado soma-se a todos os movimentos já lançados.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "A gravar…" : "Implantar saldo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
