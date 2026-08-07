import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCardSessionQueries } from "@/lib/card-session-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Lock } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/card-session-helpers";

interface SessionData {
  id: string;
  card_account_id: string;
  card_name: string;
  opening_balance: number;
  total_loads: number;
  total_approved_expenses: number;
  pending_items: number;
  expenses_by_event: Record<string, { name: string; amount: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionData;
}

export function CloseCardSessionModal({ open, onOpenChange, session }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const theoretical = session.opening_balance + session.total_loads - session.total_approved_expenses;
  const [confirmedBalance, setConfirmedBalance] = useState(String(theoretical.toFixed(2)));
  const [note, setNote] = useState("");
  const [createAdjustment, setCreateAdjustment] = useState(false);
  const [adjCategoryId, setAdjCategoryId] = useState<string>("");

  const diff = parseFloat(confirmedBalance) - theoretical;

  const { data: categories = [] } = useQuery({
    queryKey: ["l3-categories"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("account_categories").select("id, name, code, type, parent_id").eq("is_active", true);
      return data ?? [];
    },
  });

  const l3Options = useMemo(() => {
    const byId = new Map(categories.map((c: any) => [c.id, c]));
    const isL3 = (c: any) => {
      const p1 = byId.get(c.parent_id);
      if (!p1) return false;
      const p2 = byId.get((p1 as any).parent_id);
      return !!p2;
    };
    return categories
      .filter((c: any) => isL3(c))
      .sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""))
      .map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name} (${c.type})` }));
  }, [categories]);

  const close = useMutation({
    mutationFn: async () => {
      if (session.pending_items > 0) throw new Error("Existem itens pendentes de aprovação.");
      const confirmed = parseFloat(confirmedBalance);
      if (isNaN(confirmed)) throw new Error("Saldo real inválido.");

      // Ajuste opcional
      if (Math.abs(diff) > 0.01 && createAdjustment) {
        if (!adjCategoryId) throw new Error("Selecione a categoria do ajuste.");
        const amt = Math.abs(diff);
        const type = diff < 0 ? "expense" : "income"; // se diff < 0 sobra menos no cartão → despesa não registada
        const today = new Date().toISOString().split("T")[0];
        const { error } = await supabase.from("transactions").insert({
          description: `Ajuste fecho sessão cartão — ${session.card_name}`,
          type,
          amount: amt,
          iva_rate: 0,
          category_id: adjCategoryId,
          account_id: session.card_account_id,
          date: today,
          status: "paid",
          paid_amount: amt,
          payment_date: today,
          card_session_id: session.id,
        });
        if (error) throw error;
      }

      const summary = {
        opening_balance: session.opening_balance,
        total_loads: session.total_loads,
        total_approved_expenses: session.total_approved_expenses,
        theoretical_balance: theoretical,
        confirmed_balance: parseFloat(confirmedBalance),
        difference: diff,
        adjustment_created: Math.abs(diff) > 0.01 && createAdjustment,
        note: note.trim() || null,
        expenses_by_event: session.expenses_by_event,
        closed_by_user_id: user?.id ?? null,
        closed_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from("card_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user?.id ?? null,
          closing_balance_confirmed: parseFloat(confirmedBalance),
          closing_summary: summary,
        })
        .eq("id", session.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast({ title: "Sessão fechada." });
      invalidateCardSessionQueries(qc, session.id);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Fechar sessão de cartão</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {session.pending_items > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600">
            Existem <strong>{session.pending_items}</strong> item(s) pendentes de aprovação. Aprove ou rejeite antes de fechar.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <Row label="Saldo abertura" value={formatCurrency(session.opening_balance)} />
              <Row label="Recargas" value={formatCurrency(session.total_loads)} />
              <Row label="Despesas aprovadas" value={`− ${formatCurrency(session.total_approved_expenses)}`} />
              <hr className="my-2 border-border" />
              <Row label="Saldo teórico" value={formatCurrency(theoretical)} bold />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Saldo real conferido no cartão</label>
              <input
                type="number" step="0.01"
                value={confirmedBalance}
                onChange={(e) => setConfirmedBalance(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {Math.abs(diff) > 0.01 && (
                <p className={`mt-1 text-xs font-medium ${diff < 0 ? "text-destructive" : "text-emerald-500"}`}>
                  Diferença: {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                </p>
              )}
            </div>

            {Math.abs(diff) > 0.01 && (
              <div className="rounded-lg border border-border/60 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={createAdjustment} onChange={(e) => setCreateAdjustment(e.target.checked)} />
                  Criar transação de ajuste ({diff < 0 ? "despesa" : "receita"})
                </label>
                {createAdjustment && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs text-muted-foreground">Categoria do ajuste</label>
                    <SearchableSelect
                      options={l3Options}
                      value={adjCategoryId}
                      onValueChange={setAdjCategoryId}
                      placeholder="Selecionar…"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota / justificação</label>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <p className="text-xs text-muted-foreground">
              O saldo remanescente fica no cartão. A próxima sessão abre com esse saldo como opening_balance.
            </p>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => onOpenChange(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
              <button
                type="button"
                onClick={() => close.mutate()}
                disabled={close.isPending}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {close.isPending ? "A fechar…" : "Fechar sessão"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
