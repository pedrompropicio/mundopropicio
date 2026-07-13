import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { FUND_MOVE_LABELS, formatCurrency, type CamarimFundMoveType } from "@/lib/camarim-helpers";

interface Account {
  id: string;
  name: string;
  type: string;
}

interface ExistingMove {
  id: string;
  move_type: CamarimFundMoveType;
  amount: number;
  move_date: string;
  notes: string | null;
  financial_account_id: string | null;
}

interface AllMove {
  move_type: CamarimFundMoveType;
  amount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** Movimento existente para editar; quando null/undefined cria novo. */
  existing?: ExistingMove | null;
  /** Moeda da sessão (EUR/BRL/USD). */
  currency?: string;
  /** Caixa em mão actual (já gasto via adiantamento descontado), para validar devoluções. */
  cashOnHand?: number;
  /** Total já gasto via adiantamento — usado para sugerir devolução máxima. */
  spentFromAdvance?: number;
  /** Todos os movimentos (excluindo o que está a ser editado), para validar saldos. */
  allMoves?: AllMove[];
  onSaved?: () => void;
}

export function CamarimFundMoveModal({
  open,
  onOpenChange,
  sessionId,
  existing,
  currency = "EUR",
  cashOnHand,
  allMoves = [],
  onSaved,
}: Props) {
  const { user } = useAuth();
  const isEdit = !!existing;
  const [moveType, setMoveType] = useState<CamarimFundMoveType>("advance");
  const [amount, setAmount] = useState("");
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{
    title: string;
    advance_account_id: string | null;
    fund_holder_type: "employee" | "supplier";
    fund_holder_supplier_id: string | null;
    fund_holder_user_id: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("financial_accounts")
      .select("id,name,type")
      .eq("is_active", true)
      .eq("is_hidden", false)
      .in("type", ["bank", "cash"])
      .order("name")
      .then(({ data }) => setAccounts((data ?? []) as Account[]));

    void supabase
      .from("camarim_sessions" as any)
      .select("title, advance_account_id, fund_holder_type, fund_holder_supplier_id, fund_holder_user_id")
      .eq("id", sessionId)
      .single()
      .then(({ data }) => setSessionInfo((data ?? null) as any));
  }, [open, sessionId]);

  // Preencher campos quando abre em modo edição.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setMoveType(existing.move_type);
      setAmount(String(existing.amount));
      setMoveDate(existing.move_date);
      setNotes(existing.notes ?? "");
      setAccountId(existing.financial_account_id ?? "");
    } else {
      setMoveType("advance");
      setAmount("");
      setMoveDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setAccountId("");
    }
  }, [open, existing]);

  const numericAmount = Number(amount);
  const accountRequired =
    moveType === "advance" || moveType === "reinforcement" || moveType === "refund";

  // Cálculo do saldo previsto após este movimento (excluindo o próprio em edição).
  const sumIn = allMoves
    .filter((m) => m.move_type === "advance" || m.move_type === "reinforcement")
    .reduce((s, m) => s + Number(m.amount || 0), 0);
  const sumOut = allMoves
    .filter((m) => m.move_type === "refund")
    .reduce((s, m) => s + Number(m.amount || 0), 0);
  const advanceNet = sumIn - sumOut;

  // Aviso: devolução não pode exceder o líquido entregue.
  const refundExceedsNet =
    moveType === "refund" && numericAmount > 0 && numericAmount > advanceNet + 0.01;

  // Aviso: caixa em mão ficaria negativa após este movimento.
  const projectedCash =
    cashOnHand !== undefined
      ? moveType === "refund"
        ? cashOnHand - numericAmount
        : moveType === "advance" || moveType === "reinforcement"
          ? cashOnHand + numericAmount
          : cashOnHand
      : null;
  const cashWouldGoNegative = projectedCash !== null && projectedCash < -0.01;

  const handleSubmit = async () => {
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      toast({ variant: "destructive", title: "Valor inválido" });
      return;
    }
    if (accountRequired && !accountId) {
      toast({
        variant: "destructive",
        title: "Conta obrigatória",
        description: "Adiantamentos e reforços precisam de identificar a conta de origem do dinheiro.",
      });
      return;
    }
    if (refundExceedsNet) {
      toast({
        variant: "destructive",
        title: "Devolução superior ao entregue",
        description: `Já só restam ${formatCurrency(advanceNet, currency)} líquidos por devolver.`,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        move_type: moveType,
        amount: numericAmount,
        move_date: moveDate,
        currency,
        financial_account_id: accountId || null,
        notes: notes || null,
      };
      if (isEdit && existing) {
        const { error } = await supabase
          .from("camarim_fund_moves" as any)
          .update(payload as any)
          .eq("id", existing.id);
        if (error) throw error;
        toast({ title: "Movimento atualizado" });
      } else {
        // Novo movimento: cria também a transação financeira pendente
        // (a aprovar → Lista de Pagamento) ligada à conta-corrente da sessão.
        let transactionId: string | null = null;
        if (!sessionInfo?.advance_account_id) {
          throw new Error(
            "Sessão sem conta-corrente. Actualiza a página e tenta de novo (a conta é criada automaticamente).",
          );
        }
        if (accountRequired) {
          if (!accountId) {
            throw new Error("Conta bancária obrigatória para gerar a transferência.");
          }
          const isInflow = moveType === "advance" || moveType === "reinforcement";
          const bankAccount = accountId;
          const sessionAccount = sessionInfo.advance_account_id;
          const fromAcc = isInflow ? bankAccount : sessionAccount;
          const toAcc = isInflow ? sessionAccount : bankAccount;
          const label =
            moveType === "advance"
              ? "Adiantamento camarim"
              : moveType === "reinforcement"
                ? "Reforço camarim"
                : "Devolução camarim";
          const desc = `${label} — ${sessionInfo.title}`;
          const supplierIdForTx =
            sessionInfo.fund_holder_type === "supplier"
              ? sessionInfo.fund_holder_supplier_id
              : null;

          // Categoria 10.3 = transferências entre contas
          const { data: cat, error: catErr } = await supabase
            .from("account_categories")
            .select("id")
            .eq("code", "10.3")
            .maybeSingle();
          if (catErr) throw catErr;
          if (!cat) throw new Error("Categoria 10.3 (transferências) não encontrada.");

          // Par expense (saída) + income (entrada), ambos pending
          const { data: expTx, error: expErr } = await (supabase as any)
            .from("transactions")
            .insert({
              type: "expense",
              description: desc,
              amount: numericAmount,
              iva_rate: 0,
              category_id: cat.id,
              account_id: fromAcc,
              date: moveDate,
              status: "pending",
              payment_method: "transfer",
              currency,
              supplier_id: supplierIdForTx,
              specification: notes || null,
            })
            .select("id")
            .single();
          if (expErr) throw expErr;

          const { error: incErr } = await (supabase as any)
            .from("transactions")
            .insert({
              type: "income",
              description: desc,
              amount: numericAmount,
              iva_rate: 0,
              category_id: cat.id,
              account_id: toAcc,
              date: moveDate,
              status: "pending",
              payment_method: "transfer",
              currency,
              specification: notes || null,
            });
          if (incErr) throw incErr;
          transactionId = expTx.id;
        }

        const { error } = await supabase.from("camarim_fund_moves" as any).insert({
          session_id: sessionId,
          ...payload,
          transaction_id: transactionId,
          created_by: user?.id ?? null,
        } as any);
        if (error) throw error;
        toast({
          title: "Movimento registado",
          description: transactionId
            ? "Transação criada em estado 'a aprovar' — visível na Lista de Pagamento."
            : undefined,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar movimento de caixa" : "Movimento de caixa do camarim"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={moveType} onValueChange={(v) => setMoveType(v as CamarimFundMoveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FUND_MOVE_LABELS) as CamarimFundMoveType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {FUND_MOVE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor ({currency})</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Conta {accountRequired ? "" : "(opcional)"}
                {accountRequired && <span className="text-destructive"> *</span>}
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={accountRequired ? "Selecionar conta" : "Sem conta"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {(refundExceedsNet || cashWouldGoNegative) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                {refundExceedsNet && (
                  <p>
                    Devolução excede o líquido entregue ({formatCurrency(advanceNet, currency)}).
                  </p>
                )}
                {cashWouldGoNegative && projectedCash !== null && (
                  <p>
                    Caixa em mão ficaria em {formatCurrency(projectedCash, currency)}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Guardar" : "Registar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
