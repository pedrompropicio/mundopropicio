import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, Plus, Lock, RotateCcw, FileDown, Trash2, Paperclip, Pencil } from "lucide-react";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CARD_SESSION_STATUS_LABELS,
  CARD_SESSION_STATUS_VARIANTS,
  formatCurrency,
  cardItemGross,
  invalidateCardSessionQueries,

  type CardSessionStatus,
} from "@/lib/card-session-helpers";
import { fetchCardAccountBalance } from "@/lib/card-account-balance";
import { CardLoadModal } from "@/components/cards/CardLoadModal";

import { NewCardExpenseModal } from "@/components/cards/NewCardExpenseModal";
import { ApproveCardItemModal } from "@/components/cards/ApproveCardItemModal";
import { CloseCardSessionModal } from "@/components/cards/CloseCardSessionModal";

type Tab = "expenses" | "queue" | "loads";

export default function CardSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, isManager, hasPermission, user } = useAuth();
  const canManage = isAdmin || isManager || hasPermission("card_manage");
  const canClose = isAdmin || isManager;

  const [tab, setTab] = useState<Tab>("expenses");
  const [loadOpen, setLoadOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<any | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<any | null>(null);
  const [approveItem, setApproveItem] = useState<any | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [docsTx, setDocsTx] = useState<{ id: string; description: string } | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingValue, setOpeningValue] = useState("");
  const [openingReason, setOpeningReason] = useState("");



  const { data: session } = useQuery({
    queryKey: ["card-session", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_sessions")
        .select("*, financial_accounts:card_account_id(id, name, initial_balance), events:primary_event_id(id, name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ["card-session-loads", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("card_session_loads")
        .select("*, source:source_account_id(name)")
        .eq("session_id", id!)
        .order("load_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["card-session-expenses", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, paid_amount, date, payment_date, event_id, category_id, supplier_id, company_id, events:event_id(name), account_categories:category_id(name, code)")

        .eq("card_session_id", id!)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["card-session-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("card_session_items")
        .select("*, events:event_id(name)")
        .eq("session_id", id!)
        .order("item_date", { ascending: false });
      return data ?? [];
    },
  });

  const expenseIds = (expenses as any[]).map((e) => e.id);
  const { data: docCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["card-session-expense-doc-counts", id, expenseIds.length],
    enabled: expenseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id")
        .in("transaction_id", expenseIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const d of data ?? []) map[(d as any).transaction_id] = (map[(d as any).transaction_id] ?? 0) + 1;
      return map;
    },
  });

  const cardAccountId = (session as any)?.financial_accounts?.id ?? (session as any)?.card_account_id ?? null;
  const { data: cardBalance } = useQuery({
    queryKey: ["card-account-balance", cardAccountId],
    enabled: !!cardAccountId,
    queryFn: () => fetchCardAccountBalance(cardAccountId as string),
  });

  const totalLoads = (loads as any[])
    .filter((l) => l.in_transaction_id)
    .reduce((s, l) => s + Number(l.amount), 0);
  const totalLoadsPending = (loads as any[])
    .filter((l) => !l.in_transaction_id)
    .reduce((s, l) => s + Number(l.amount), 0);
  const totalApproved = (expenses as any[]).reduce((s, e) => s + (Number(e.paid_amount) || cardItemGross(e)), 0);
  const pendingItems = (items as any[]).filter((i) => i.status === "submitted");
  // Cartão gasta SEMPRE o total c/IVA — amount na BD é base s/IVA.
  const totalPending = pendingItems.reduce((s, i) => s + cardItemGross(i), 0);
  const opening = Number(session?.opening_balance ?? 0);
  const theoretical = opening + totalLoads - totalApproved - totalPending;


  const expensesByEvent = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {};
    for (const e of expenses as any[]) {
      const key = e.event_id ?? "none";
      const name = e.events?.name ?? "Sem evento";
      if (!map[key]) map[key] = { name, amount: 0 };
      map[key].amount += Number(e.paid_amount) || cardItemGross(e);
    }
    return map;
  }, [expenses]);

  const transition = useMutation({
    mutationFn: async (newStatus: CardSessionStatus) => {
      const { error } = await supabase
        .from("card_sessions")
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Estado atualizado." });
      qc.invalidateQueries({ queryKey: ["card-session", id] });
      qc.invalidateQueries({ queryKey: ["card-sessions"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteLoad = useMutation({
    mutationFn: async (load: any) => {
      if (load.in_transaction_id) {
        throw new Error("Esta recarga já foi paga/liquidada. Elimine primeiro a transação de saída na Lista de Pagamento.");
      }
      if (!load.out_transaction_id) {
        // fallback: apagar só a linha
        const { error } = await supabase.from("card_session_loads").delete().eq("id", load.id);
        if (error) throw error;
        return;
      }
      // Apagar a transação OUT — o trigger trg_card_load_on_out_delete limpa card_session_loads
      const { error } = await supabase.from("transactions").delete().eq("id", load.out_transaction_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Recarga eliminada." });
      qc.invalidateQueries({ queryKey: ["card-session-loads", id] });
      qc.invalidateQueries({ queryKey: ["card-session", id] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  /**
   * Exclusão de despesa (só com sessão aberta).
   * - Bloqueia se a transação estiver numa lista de pagamento (FK NO ACTION).
   * - Apaga ficheiros do storage + transaction_documents (FK CASCADE).
   * - Item da equipa que gerou a despesa volta a 'submitted' (FK SET NULL deixaria
   *   um item "aprovado" sem transação).
   * - transaction_audit_log tem FK CASCADE → o registo vai para system_audit_log.
   */
  const deleteExpenseMut = useMutation({
    mutationFn: async (e: any) => {
      const { data: inLists } = await supabase
        .from("payment_list_items")
        .select("id")
        .eq("transaction_id", e.id)
        .limit(1);
      if (inLists && inLists.length > 0) {
        throw new Error("Esta despesa está numa lista de pagamento. Remova-a da lista antes de excluir.");
      }

      const { data: docs } = await supabase
        .from("transaction_documents")
        .select("file_url")
        .eq("transaction_id", e.id);
      const paths = (docs ?? [])
        .map((d: any) => d.file_url as string)
        .filter((p) => p && !p.startsWith("ref://") && !p.startsWith("http"));
      if (paths.length > 0) {
        await supabase.storage.from("transaction-documents").remove(paths);
      }

      const { data: linkedItems } = await supabase
        .from("card_session_items")
        .select("id")
        .eq("transaction_id", e.id);

      const gross = Number(e.paid_amount) || cardItemGross(e);
      if (e.company_id) {
        await supabase.from("system_audit_log").insert({
          entity_type: "card_session_expense",
          entity_id: e.id,
          action: "delete",
          changed_by: user?.email ?? "sistema",
          company_id: e.company_id,
          old_data: {
            description: e.description,
            amount: e.amount,
            iva_rate: e.iva_rate,
            paid_amount: e.paid_amount,
            total_gross: gross,
            date: e.date,
            event_id: e.event_id,
            category_id: e.category_id,
            supplier_id: e.supplier_id,
          },
          metadata: {
            card_session_id: id,
            reverted_item_ids: (linkedItems ?? []).map((i: any) => i.id),
          },
        } as any);
      }

      const { error } = await supabase.from("transactions").delete().eq("id", e.id);
      if (error) throw error;

      if (linkedItems && linkedItems.length > 0) {
        await supabase
          .from("card_session_items")
          .update({
            status: "submitted",
            transaction_id: null,
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: `Despesa excluída em ${new Date().toLocaleDateString("pt-PT")} — item devolvido à fila de aprovação.`,
          })
          .in("id", linkedItems.map((i: any) => i.id));
      }
    },
    onSuccess: () => {
      toast({ title: "Despesa excluída." });
      invalidateCardSessionQueries(qc, id);
      setDeleteExpense(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });



  if (!session) {
    return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;
  }

  const status = session.status as CardSessionStatus;
  const cardName = (session as any).financial_accounts?.name ?? "Cartão";
  const isLocked = status === "closed";
  // Editar/excluir despesas só com a sessão ABERTA (in_review/closed = leitura).
  const canEditExpenses = canManage && status === "open";


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate("/cartoes")} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCard className="h-6 w-6 text-primary" />
            {cardName} — {session.holder_name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge className={cn("border", CARD_SESSION_STATUS_VARIANTS[status])} variant="outline">
              {CARD_SESSION_STATUS_LABELS[status]}
            </Badge>
            {(session as any).events?.name && <span>Evento principal: {(session as any).events.name}</span>}
            <span>· Aberta em {new Date(session.opened_at).toLocaleDateString("pt-PT")}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && !isLocked && (
            <button onClick={() => setLoadOpen(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <Plus className="mr-1 inline h-4 w-4" /> Recarga
            </button>
          )}
          {canClose && status === "open" && (
            <button onClick={() => transition.mutate("in_review")} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 hover:bg-amber-500/20">
              Enviar para revisão
            </button>
          )}
          {canClose && status === "in_review" && (
            <button onClick={() => setCloseOpen(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Lock className="mr-1 inline h-4 w-4" /> Fechar sessão
            </button>
          )}
          {canClose && status !== "open" && !isLocked && (
            <button onClick={() => transition.mutate("open")} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <RotateCcw className="mr-1 inline h-4 w-4" /> Reabrir
            </button>
          )}
          {isLocked && (isAdmin) && (
            <button onClick={() => transition.mutate("open")} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <RotateCcw className="mr-1 inline h-4 w-4" /> Reabrir (admin)
            </button>
          )}
          {isLocked && (
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <FileDown className="mr-1 inline h-4 w-4" /> Imprimir / PDF
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="Disponível no cartão"
          value={cardBalance === undefined ? "—" : formatCurrency(cardBalance)}
          hint="Saldo real da conta (inclui ajustes)"
          tone={cardBalance !== undefined && cardBalance < 0 ? "warn" : undefined}
        />
        <Kpi
          label="Entregue"
          value={formatCurrency(opening + totalLoads)}
          hint={`Abertura ${formatCurrency(opening)} + ${loads.length} recarga(s)`}
          action={
            canEditOpening ? (
              <button
                type="button"
                aria-label="Editar saldo de abertura"
                title="Editar saldo de abertura"
                onClick={() => { setOpeningValue(String(opening)); setOpeningReason(""); setOpeningOpen(true); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
        <Kpi label="Gasto aprovado" value={formatCurrency(totalApproved)} hint={`${expenses.length} transação(ões)`} />
        <Kpi label="Pendente de aprovação" value={formatCurrency(totalPending)} hint={`${pendingItems.length} item(s)`} tone={pendingItems.length > 0 ? "warn" : undefined} />
        <Kpi
          label="Saldo teórico da sessão"
          value={formatCurrency(theoretical)}
          hint="Saldo de abertura + recargas − gasto aprovado − pendente. O saldo de abertura é editável enquanto a sessão está aberta."
        />
      </div>



      {/* Breakdown por evento */}
      {Object.keys(expensesByEvent).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Despesas por evento</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(expensesByEvent).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{v.name}</span>
                <span className="font-medium">{formatCurrency(v.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          <TabBtn active={tab === "expenses"} onClick={() => setTab("expenses")}>Despesas ({expenses.length})</TabBtn>
          <TabBtn active={tab === "queue"} onClick={() => setTab("queue")}>
            Fila de aprovação {pendingItems.length > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-600">{pendingItems.length}</span>}
          </TabBtn>
          <TabBtn active={tab === "loads"} onClick={() => setTab("loads")}>Recargas ({loads.length})</TabBtn>
        </div>
      </div>

      {tab === "expenses" && (
        <div className="space-y-2">
          {canManage && !isLocked && (
            <button onClick={() => setExpenseOpen(true)} className="mb-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              <Plus className="h-4 w-4" /> Nova despesa
            </button>
          )}
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem despesas registadas.</p>
          ) : (
            <div className="space-y-1">
              {(expenses as any[]).map((e) => {
                const count = (docCounts as Record<string, number>)[e.id] ?? 0;
                return (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{e.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.date} · {e.events?.name ?? "Sem evento"} · {e.account_categories?.code ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDocsTx({ id: e.id, description: e.description })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                          count > 0
                            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                        title={count > 0 ? `${count} anexo(s)` : "Anexar fatura/documento"}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {count > 0 ? count : "Anexar"}
                      </button>
                      {canEditExpenses && (
                        <>
                          <button
                            onClick={() => setEditExpense(e)}
                            title="Editar despesa"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteExpense(e)}
                            title="Excluir despesa"
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <div className="font-semibold">{formatCurrency(Number(e.paid_amount) || cardItemGross(e))}</div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "queue" && (
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem itens submetidos pela equipa.</p>
          ) : (
            (items as any[]).map((it) => (
              <div key={it.id} className={cn(
                "flex gap-3 rounded-lg border px-3 py-2 text-sm",
                it.status === "approved" ? "border-emerald-500/40 bg-emerald-500/5" :
                it.status === "rejected" ? "border-destructive/40 bg-destructive/5" :
                "border-amber-500/40 bg-amber-500/5",
              )}>
                {it.document_path && <CardItemThumb path={it.document_path} />}
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{it.supplier_name || it.description || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.item_date} · {it.events?.name ?? "Sem evento"} · {it.status}
                      {it.rejection_reason && <> · motivo: {it.rejection_reason}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(cardItemGross(it))}</span>
                    {canManage && it.status === "submitted" && !isLocked && (
                      <button
                        onClick={() => setApproveItem(it)}
                        className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                      >
                        Rever
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "loads" && (
        <div className="space-y-2">
          {canManage && !isLocked && (
            <button onClick={() => setLoadOpen(true)} className="mb-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
              <Plus className="h-4 w-4" /> Nova recarga
            </button>
          )}
          {loads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem recargas.</p>
          ) : (
            (loads as any[]).map((l) => {
              const canDelete = canManage && !isLocked && !l.in_transaction_id;
              return (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{l.source?.name ?? "—"} → {cardName}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.load_date}{l.notes ? ` · ${l.notes}` : ""}
                      {" · "}
                      {l.in_transaction_id
                        ? <span className="text-emerald-500">liquidada</span>
                        : <span className="text-amber-500">aguarda pagamento</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-emerald-500">+{formatCurrency(Number(l.amount))}</div>
                    {canDelete && (
                      <button
                        onClick={() => {
                          if (confirm("Eliminar esta recarga? A transação de saída pendente será também removida.")) {
                            deleteLoad.mutate(l);
                          }
                        }}
                        disabled={deleteLoad.isPending}
                        title="Eliminar recarga (só se ainda não foi paga)"
                        className="rounded-md border border-destructive/40 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {isLocked && session.closing_summary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo do fecho</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap text-[11px]">{JSON.stringify(session.closing_summary, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <CardLoadModal
        open={loadOpen}
        onOpenChange={setLoadOpen}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        cardName={cardName}
      />
      <NewCardExpenseModal
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        defaultEventId={session.primary_event_id}
      />
      <NewCardExpenseModal
        open={!!editExpense}
        onOpenChange={(v) => { if (!v) setEditExpense(null); }}
        sessionId={id!}
        cardAccountId={session.card_account_id}
        defaultEventId={session.primary_event_id}
        expense={editExpense}
      />
      {deleteExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass w-full max-w-md rounded-xl p-6">
            <h2 className="mb-2 text-lg font-semibold">Excluir despesa?</h2>
            <p className="text-sm text-muted-foreground">
              {deleteExpense.description} — <span className="font-semibold text-foreground">
                {formatCurrency(Number(deleteExpense.paid_amount) || cardItemGross(deleteExpense))}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              A transação e os anexos são eliminados definitivamente e o valor volta ao saldo da sessão.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteExpense(null)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteExpenseMut.mutate(deleteExpense)}
                disabled={deleteExpenseMut.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteExpenseMut.isPending ? "A excluir…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ApproveCardItemModal
        open={!!approveItem}
        onOpenChange={(v) => { if (!v) setApproveItem(null); }}
        item={approveItem}
        cardAccountId={session.card_account_id}
      />
      <CloseCardSessionModal
        open={closeOpen}
        onOpenChange={setCloseOpen}
        session={{
          id: session.id,
          card_account_id: session.card_account_id,
          card_name: cardName,
          opening_balance: opening,
          total_loads: totalLoads,
          total_approved_expenses: totalApproved,
          pending_items: pendingItems.length,
          expenses_by_event: expensesByEvent,
        }}
      />
      {docsTx && (
        <TransactionDocumentsModal
          transactionId={docsTx.id}
          transactionDescription={docsTx.description}
          onClose={() => {
            setDocsTx(null);
            qc.invalidateQueries({ queryKey: ["card-session-expense-doc-counts", id] });
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone, action }: { label: string; value: string; hint?: string; tone?: "warn"; action?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {action}
        </div>
        <p className={cn("mt-1 text-xl font-bold", tone === "warn" ? "text-amber-500" : "text-foreground")}>{value}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}


function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 pb-2 text-sm font-medium",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CardItemThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("card-documents")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) return <div className="h-14 w-14 shrink-0 animate-pulse rounded bg-muted" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="h-14 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted"
      onClick={(e) => e.stopPropagation()}
    >
      <img src={url} alt="Talão" className="h-full w-full object-cover" />
    </a>
  );
}
