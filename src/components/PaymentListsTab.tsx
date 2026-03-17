import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { exportPaymentListToExcel, exportPaymentListToPDF } from "@/lib/export-payment-list";
import {
  Plus, ShieldCheck, ShieldX, FileSpreadsheet, FileText, Trash2, Eye, CheckSquare, RotateCcw, MessageSquare, Send,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type ListStatus = "draft" | "pending_approval" | "approved" | "rejected" | "revision" | "partially_approved";

const statusMap: Record<ListStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  pending_approval: { label: "Aguardando Aprovação", variant: "outline" },
  approved: { label: "Aprovada", variant: "default" },
  partially_approved: { label: "Parcialmente Aprovada", variant: "outline" },
  rejected: { label: "Rejeitada", variant: "destructive" },
  revision: { label: "Em Revisão", variant: "outline" },
};

export default function PaymentListsTab() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewListId, setViewListId] = useState<string | null>(null);
  const [revisionListId, setRevisionListId] = useState<string | null>(null);
  const [approveListId, setApproveListId] = useState<string | null>(null);
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ["payment-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      toast({ title: "Lista eliminada!" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("payment_lists")
        .update({
          status,
          approved_by: user?.email ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      toast({ title: status === "approved" ? "Lista aprovada!" : "Lista rejeitada." });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("payment_lists")
        .update({
          status: "revision",
          revision_notes: notes,
          approved_by: user?.email ?? null,
          approved_at: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      setRevisionListId(null);
      toast({ title: "Lista enviada para revisão." });
    },
  });

  const resubmitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_lists")
        .update({ status: "pending_approval", revision_notes: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      toast({ title: "Lista reenviada para aprovação!" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Crie listas de pagamentos diários e envie para aprovação do admin</p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Lista</span>
        </button>
      </div>

      {showCreate && (
        <CreatePaymentList
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
          }}
        />
      )}

      {viewListId && (
        <ViewPaymentList listId={viewListId} onClose={() => setViewListId(null)} />
      )}

      {revisionListId && (
        <RevisionModal
          listId={revisionListId}
          onClose={() => setRevisionListId(null)}
          onSubmit={(notes) => revisionMutation.mutate({ id: revisionListId, notes })}
          isPending={revisionMutation.isPending}
        />
      )}

      <div className="glass rounded-xl p-5">
        {listsLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar…</p>
        ) : lists.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhuma lista criada. Clique em "Nova Lista" para começar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Título</th>
                  <th className="pb-3 text-left font-medium">Data Pagamento</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-left font-medium hidden sm:table-cell">Criado por</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {lists.map((list: any) => {
                  const st = statusMap[list.status as ListStatus] ?? statusMap.draft;
                  return (
                    <tr key={list.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3">
                        <span className="font-medium">{list.title}</span>
                        {list.status === "revision" && list.revision_notes && (
                          <div className="mt-1 flex items-start gap-1.5 rounded-md bg-accent/50 px-2 py-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{list.revision_notes}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3">{formatDate(list.payment_date)}</td>
                      <td className="py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{list.created_by}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewListId(list.id)} className="rounded p-1.5 hover:bg-muted" title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </button>
                          {isAdmin && list.status === "pending_approval" && (
                            <>
                              <button
                                onClick={() => statusMutation.mutate({ id: list.id, status: "approved" })}
                                className="rounded p-1.5 text-emerald-500 hover:bg-emerald-500/10"
                                title="Aprovar"
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setRevisionListId(list.id)}
                                className="rounded p-1.5 text-amber-500 hover:bg-amber-500/10"
                                title="Enviar para revisão"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => statusMutation.mutate({ id: list.id, status: "rejected" })}
                                className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                                title="Rejeitar"
                              >
                                <ShieldX className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {list.status === "revision" && (
                            <button
                              onClick={() => resubmitMutation.mutate(list.id)}
                              className="rounded p-1.5 text-primary hover:bg-primary/10"
                              title="Reenviar para aprovação"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {(list.status === "draft" || list.status === "rejected" || list.status === "revision") && (
                            <button
                              onClick={() => { if (confirm("Eliminar esta lista?")) deleteMutation.mutate(list.id); }}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Create Payment List Modal ─── */
function CreatePaymentList({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(`Pagamentos ${new Date().toLocaleDateString("pt-PT")}`);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: approvedTx = [], isLoading } = useQuery({
    queryKey: ["approved-transactions-for-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), suppliers(name)")
        .eq("status", "approved")
        .eq("type", "expense")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === approvedTx.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(approvedTx.map((t: any) => t.id)));
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione pelo menos uma transação.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: list, error: listErr } = await supabase
        .from("payment_lists")
        .insert({ title, payment_date: paymentDate, status: asDraft ? "draft" : "pending_approval", created_by: user?.email ?? "sistema" })
        .select("id")
        .single();
      if (listErr) throw listErr;

      const items = [...selectedIds].map((txId) => ({ payment_list_id: list.id, transaction_id: txId }));
      const { error: itemsErr } = await supabase.from("payment_list_items").insert(items);
      if (itemsErr) throw itemsErr;

      toast({ title: asDraft ? "Lista guardada como rascunho." : "Lista enviada para aprovação!" });
      onCreated();
    } catch (err: any) {
      toast({ title: "Erro ao criar lista", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Nova Lista de Contas a Pagar</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Data de Pagamento</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>

        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          Selecione as contas "A Pagar" ({approvedTx.length} disponíveis)
        </h3>

        {isLoading ? (
          <p className="py-4 text-center text-muted-foreground">A carregar…</p>
        ) : approvedTx.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">Nenhuma transação aprovada (A Pagar) disponível.</p>
        ) : (
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto border border-border/50 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-center w-8">
                    <Checkbox checked={selectedIds.size === approvedTx.length && approvedTx.length > 0} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-2 text-left font-medium">Descrição</th>
                  <th className="p-2 text-left font-medium hidden sm:table-cell">Evento</th>
                  <th className="p-2 text-left font-medium hidden md:table-cell">Fornecedor</th>
                  <th className="p-2 text-right font-medium">Valor c/IVA</th>
                  <th className="p-2 text-right font-medium hidden sm:table-cell">Já Pago</th>
                  <th className="p-2 text-left font-medium hidden lg:table-cell">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {approvedTx.map((t: any) => {
                  const withIva = t.amount * (1 + (t.iva_rate ?? 23) / 100);
                  return (
                    <tr key={t.id} className={`cursor-pointer transition-colors ${selectedIds.has(t.id) ? "bg-primary/5" : "hover:bg-muted/30"}`} onClick={() => toggleId(t.id)}>
                      <td className="p-2 text-center"><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleId(t.id)} /></td>
                      <td className="p-2 font-medium">{t.description}</td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{t.events?.name ?? "-"}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{t.suppliers?.name ?? "-"}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(withIva)}</td>
                      <td className="p-2 text-right font-mono hidden sm:table-cell">{formatCurrency(Number(t.paid_amount))}</td>
                      <td className="p-2 hidden lg:table-cell">{t.due_date ? formatDate(t.due_date) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between mt-4 pt-4 border-t border-border/50 gap-2">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selecionada(s)</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">Cancelar</button>
            <button onClick={() => handleSubmit(true)} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50">Guardar Rascunho</button>
            <button onClick={() => handleSubmit(false)} disabled={submitting} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <CheckSquare className="h-4 w-4" /> Enviar para Aprovação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View Payment List Details ─── */
function ViewPaymentList({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { data: list } = useQuery({
    queryKey: ["payment-list", listId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_lists").select("*").eq("id", listId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["payment-list-items", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_list_items")
        .select("*, transactions(*, events(name), suppliers(name))")
        .eq("payment_list_id", listId);
      if (error) throw error;
      return data;
    },
  });

  const handleExport = (format: "pdf" | "excel") => {
    if (!list || items.length === 0) return;
    const exportData = {
      title: list.title,
      payment_date: list.payment_date,
      approved_by: list.approved_by,
      approved_at: list.approved_at,
      items: items.map((item: any) => ({
        description: item.transactions?.description ?? "",
        event_name: item.transactions?.events?.name ?? "-",
        supplier_name: item.transactions?.suppliers?.name ?? "-",
        amount: Number(item.transactions?.amount ?? 0),
        iva_rate: Number(item.transactions?.iva_rate ?? 23),
        paid_amount: Number(item.transactions?.paid_amount ?? 0),
        due_date: item.transactions?.due_date,
        date: item.transactions?.date,
      })),
    };
    if (format === "pdf") exportPaymentListToPDF(exportData);
    else exportPaymentListToExcel(exportData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{list?.title ?? "Lista de Pagamentos"}</h2>
            <p className="text-sm text-muted-foreground">{list?.payment_date ? formatDate(list.payment_date) : ""}</p>
          </div>
          {list?.status === "approved" && (
            <div className="flex gap-2">
              <button onClick={() => handleExport("pdf")} className="flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">
                <FileText className="h-4 w-4" /> PDF
              </button>
              <button onClick={() => handleExport("excel")} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
            </div>
          )}
        </div>

        {list?.approved_by && (
          <p className="text-sm text-muted-foreground mb-3">
            Aprovada por: <span className="font-medium text-foreground">{list.approved_by}</span>
            {list.approved_at && ` em ${formatDate(list.approved_at)}`}
          </p>
        )}

        {isLoading ? (
          <p className="py-4 text-center text-muted-foreground">A carregar itens…</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">Sem itens nesta lista.</p>
        ) : (
          <div className="overflow-x-auto border border-border/50 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground bg-muted">
                  <th className="p-2 text-left font-medium">#</th>
                  <th className="p-2 text-left font-medium">Descrição</th>
                  <th className="p-2 text-left font-medium hidden sm:table-cell">Evento</th>
                  <th className="p-2 text-left font-medium hidden md:table-cell">Fornecedor</th>
                  <th className="p-2 text-right font-medium">Valor c/IVA</th>
                  <th className="p-2 text-right font-medium hidden sm:table-cell">Já Pago</th>
                  <th className="p-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.map((item: any, i: number) => {
                  const tx = item.transactions;
                  const withIva = Number(tx?.amount ?? 0) * (1 + Number(tx?.iva_rate ?? 23) / 100);
                  const paid = Number(tx?.paid_amount ?? 0);
                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2 font-medium">{tx?.description}</td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{tx?.events?.name ?? "-"}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{tx?.suppliers?.name ?? "-"}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(withIva)}</td>
                      <td className="p-2 text-right font-mono hidden sm:table-cell">{formatCurrency(paid)}</td>
                      <td className="p-2 text-right font-mono font-semibold">{formatCurrency(withIva - paid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t border-border/50">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Revision Modal ─── */
function RevisionModal({
  listId,
  onClose,
  onSubmit,
  isPending,
}: {
  listId: string;
  onClose: () => void;
  onSubmit: (notes: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold">Enviar para Revisão</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Adicione comentários sobre o que precisa ser corrigido na lista antes de reenviá-la.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Descreva o que precisa ser revisto…"
          rows={4}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!notes.trim()) {
                return;
              }
              onSubmit(notes.trim());
            }}
            disabled={isPending || !notes.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Enviar para Revisão
          </button>
        </div>
      </div>
    </div>
  );
}
