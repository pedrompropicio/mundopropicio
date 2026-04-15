import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { exportPaymentListToExcel, exportPaymentListToPDF, groupPaymentItems } from "@/lib/export-payment-list";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Plus, ShieldCheck, ShieldX, FileSpreadsheet, FileText, Trash2, Eye, CheckSquare, Square, RotateCcw, MessageSquare, Send, Copy, AlertTriangle, Banknote,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ListStatus = "draft" | "pending_approval" | "approved" | "rejected" | "revision" | "partially_approved";

/** Hook: fetch approved forecasts for given event IDs and build a lookup by event+category */
function useForecastLookup(eventIds: string[]) {
  const uniqueEventIds = useMemo(() => [...new Set(eventIds.filter(Boolean))], [eventIds.join(",")]);
  const { data: forecasts = [] } = useQuery({
    queryKey: ["bp-forecasts-for-payment", uniqueEventIds],
    queryFn: async () => {
      if (uniqueEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("event_id, category_id, amount, description")
        .in("event_id", uniqueEventIds)
        .eq("type", "expense")
        .in("status", ["approved", "draft"]);
      if (error) throw error;
      return data;
    },
    enabled: uniqueEventIds.length > 0,
    staleTime: 60_000,
  });

  /** Check if a transaction amount exceeds the BP forecast for its event+category */
  const checkExceedsBP = useMemo(() => {
    return (eventId: string | null, categoryId: string | null, txAmount: number): { exceeds: boolean; forecastAmount?: number } => {
      if (!eventId || !categoryId) return { exceeds: false };
      const matching = forecasts.filter(
        (f: any) => f.event_id === eventId && f.category_id === categoryId
      );
      if (matching.length === 0) return { exceeds: false };
      const totalForecast = matching.reduce((s: number, f: any) => s + Number(f.amount), 0);
      return { exceeds: txAmount > totalForecast, forecastAmount: totalForecast };
    };
  }, [forecasts]);

  return checkExceedsBP;
}

/** Small warning badge for transactions exceeding BP */
function BPExceedsWarning({ forecastAmount, txAmount }: { forecastAmount: number; txAmount: number }) {
  const pct = forecastAmount > 0 ? ((txAmount / forecastAmount - 1) * 100).toFixed(0) : "∞";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Acima do BP
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Valor previsto no BP: {formatCurrency(forecastAmount)}</p>
          <p className="text-xs">Valor da transação: {formatCurrency(txAmount)} (+{pct}%)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const statusMap: Record<ListStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  pending_approval: { label: "Aguardando Aprovação", variant: "outline" },
  approved: { label: "Aprovada", variant: "default" },
  partially_approved: { label: "Parcialmente Aprovada", variant: "outline" },
  rejected: { label: "Rejeitada", variant: "destructive" },
  revision: { label: "Em Revisão", variant: "outline" },
};

export default function PaymentListsTab() {
  const { isAdmin, isManager, user } = useAuth();
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
    onError: () => {
      toast({ title: "Sem permissão para eliminar esta lista", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_lists")
        .update({
          status: "rejected",
          approved_by: user?.email ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      toast({ title: "Lista rejeitada." });
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

      {approveListId && (
        <ApproveModal
          listId={approveListId}
          onClose={() => setApproveListId(null)}
          onApproved={() => {
            setApproveListId(null);
            queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
          }}
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
                                onClick={() => setApproveListId(list.id)}
                                className="rounded p-1.5 text-emerald-500 hover:bg-emerald-500/10"
                                title="Aprovar (total ou parcial)"
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
                                onClick={() => rejectMutation.mutate(list.id)}
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
                          {((list.status === "draft" || list.status === "rejected" || list.status === "revision") || ((isAdmin || isManager) && (list.status === "approved" || list.status === "settled"))) && (
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

  // Filter state
  const [dateType, setDateType] = useState<"date" | "due_date">("date");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const { data: approvedTx = [], isLoading } = useQuery({
    queryKey: ["approved-transactions-for-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), suppliers(name, iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3), account_categories(code, name)")
        .eq("status", "approved")
        .eq("type", "expense")
        .is("parent_transaction_id", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Unique events for filter dropdown
  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    approvedTx.forEach((t: any) => {
      if (t.event_id && t.events?.name) map.set(t.event_id, t.events.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [approvedTx]);

  // Filtered transactions
  const filteredTx = useMemo(() => {
    return approvedTx.filter((t: any) => {
      // Event filter
      if (eventFilter !== "all" && t.event_id !== eventFilter) return false;

      // Date range filter
      const dateValue = dateType === "due_date" ? t.due_date : t.date;
      if (!dateValue && (dateFrom || dateTo)) return false;
      if (dateFrom && dateValue < dateFrom) return false;
      if (dateTo && dateValue > dateTo) return false;

      return true;
    });
  }, [approvedTx, dateType, dateFrom, dateTo, eventFilter]);

  // BP forecast check
  const checkExceedsBP = useForecastLookup(filteredTx.map((t: any) => t.event_id));

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredTx.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTx.map((t: any) => t.id)));
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
            <DatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Data…" />
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Filtrar por</label>
              <select
                value={dateType}
                onChange={(e) => setDateType(e.target.value as "date" | "due_date")}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="date">Data de Lançamento</option>
                <option value="due_date">Data de Vencimento</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">De</label>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="De…" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Até</label>
              <DatePicker value={dateTo} onChange={setDateTo} placeholder="Até…" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Evento</label>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todos os eventos</option>
                {eventOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          </div>
          {(dateFrom || dateTo || eventFilter !== "all") && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setEventFilter("all"); }}
              className="text-xs text-primary hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          Transações aprovadas ({filteredTx.length} de {approvedTx.length})
        </h3>

        {isLoading ? (
          <p className="py-4 text-center text-muted-foreground">A carregar…</p>
        ) : filteredTx.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            {approvedTx.length === 0 ? "Nenhuma transação aprovada disponível." : "Nenhuma transação corresponde aos filtros selecionados."}
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto border border-border/50 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-center w-8">
                    <Checkbox checked={selectedIds.size === filteredTx.length && filteredTx.length > 0} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-2 text-left font-medium">Descrição</th>
                  <th className="p-2 text-left font-medium hidden sm:table-cell">Categoria</th>
                  <th className="p-2 text-left font-medium hidden sm:table-cell">Evento</th>
                  <th className="p-2 text-left font-medium hidden md:table-cell">Fornecedor</th>
                  <th className="p-2 text-right font-medium">Valor c/IVA</th>
                  <th className="p-2 text-right font-medium hidden sm:table-cell">Já Pago</th>
                  <th className="p-2 text-right font-medium">Saldo</th>
                  <th className="p-2 text-left font-medium hidden lg:table-cell">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredTx.map((t: any) => {
                  const withIva = t.amount * (1 + (t.iva_rate ?? 23) / 100);
                  const paid = Number(t.paid_amount ?? 0);
                  const paidWithIva = paid * (1 + (t.iva_rate ?? 23) / 100);
                  const saldo = withIva - paidWithIva;
                  const hasPartial = paid > 0;
                  const bpCheck = checkExceedsBP(t.event_id, t.category_id, Number(t.amount));
                  return (
                    <tr key={t.id} className={`cursor-pointer transition-colors ${selectedIds.has(t.id) ? "bg-primary/5" : "hover:bg-muted/30"} ${bpCheck.exceeds ? "bg-destructive/5" : ""}`} onClick={() => toggleId(t.id)}>
                      <td className="p-2 text-center"><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleId(t.id)} /></td>
                      <td className="p-2">
                        <span className="font-medium">{t.description}</span>
                        {t.specification && <p className="text-[11px] text-muted-foreground">{t.specification}</p>}
                        {bpCheck.exceeds && (
                          <div className="mt-0.5"><BPExceedsWarning forecastAmount={bpCheck.forecastAmount!} txAmount={Number(t.amount)} /></div>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground text-xs hidden sm:table-cell">{t.account_categories ? `${t.account_categories.code} ${t.account_categories.name}` : "-"}</td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell">{t.events?.name ?? "-"}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{t.suppliers?.name ?? "-"}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(withIva)}</td>
                      <td className="p-2 text-right font-mono hidden sm:table-cell">{formatCurrency(paidWithIva)}</td>
                      <td className={`p-2 text-right font-mono font-semibold ${hasPartial ? "text-warning" : ""}`}>{formatCurrency(saldo)}</td>
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

/* ─── Copy Line Helper ─── */
function CopyLine({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Copiado!", description: `${label}: ${value}` });
    });
  };
  return (
    <p className="flex items-center gap-1.5 group">
      <span className="font-medium text-muted-foreground">{label}:</span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${bold ? "font-semibold" : ""}`}>{value}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-foreground"
        title={`Copiar ${label}`}
      >
        <Copy className="h-3 w-3" />
      </button>
    </p>
  );
}

/* ─── View Payment List Details ─── */
function ViewPaymentList({ listId, onClose }: { listId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);

  const toggleManualMark = async (itemId: string, current: boolean) => {
    await supabase
      .from("payment_list_items")
      .update({ manually_marked_paid: !current } as any)
      .eq("id", itemId);
    queryClient.invalidateQueries({ queryKey: ["payment-list-items", listId] });
  };

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
        .select("*, transactions(*, events(name), suppliers(name, iban), account_categories(code, name, parent_id))")
        .eq("payment_list_id", listId);
      if (error) throw error;
      return (data ?? []).filter((item: any) => !item.transactions?.parent_transaction_id);
    },
  });

  // BP forecast check for view
  const checkExceedsBP = useForecastLookup(items.map((i: any) => i.transactions?.event_id));

  const isApproved = list?.status === "approved" || list?.status === "partially_approved";

  const unpaidItems = items.filter((item: any) => {
    const tx = item.transactions;
    if (!tx) return false;
    const amount = Number(tx.amount);
    const paid = Number(tx.paid_amount ?? 0);
    return paid < amount && tx.status !== "paid";
  });

  const toggleTx = (txId: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTxIds.size === unpaidItems.length && unpaidItems.length > 0) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(unpaidItems.map((item: any) => item.transactions.id)));
    }
  };

  const handleBulkPayment = async () => {
    if (selectedTxIds.size === 0) return;
    if (!confirm(`Dar baixa em ${selectedTxIds.size} pagamento(s)? O valor total será marcado como pago.`)) return;

    setPaying(true);
    try {
      for (const txId of selectedTxIds) {
        const item = items.find((i: any) => i.transactions?.id === txId);
        const tx = item?.transactions;
        if (!tx) continue;
        const amount = Number(tx.amount);

        await supabase.from("transaction_audit_log").insert({
          transaction_id: txId,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "sistema",
          field_name: "Pagamento parcial",
          old_value: String(tx.paid_amount ?? 0),
          new_value: String(amount),
        });

        const pDate = list?.payment_date ?? new Date().toISOString().slice(0, 10);
        await supabase
          .from("transactions")
          .update({ paid_amount: amount, status: "paid", payment_date: pDate })
          .eq("id", txId);

        // Propagate payment to child split transactions
        const { data: children } = await supabase
          .from("transactions")
          .select("id, split_percentage, amount, iva_rate, paid_amount")
          .eq("parent_transaction_id", txId);

        if (children && children.length > 0) {
          for (const child of children) {
            const childAmount = Number(child.amount);
            await supabase
              .from("transactions")
              .update({ paid_amount: childAmount, status: "paid", payment_date: pDate })
              .eq("id", child.id);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["payment-list-items", listId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedTxIds(new Set());
      toast({ title: `${selectedTxIds.size} pagamento(s) processado(s) com sucesso!` });
    } catch (err: any) {
      toast({ title: "Erro ao processar pagamentos", description: err.message, variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const handleExport = async (format: "pdf" | "excel") => {
    if (!list || items.length === 0) return;
    try {
      const exportData = {
        title: list.title,
        payment_date: list.payment_date,
        approved_by: list.approved_by,
        approved_at: list.approved_at,
        items: items.map((item: any) => ({
          description: item.transactions?.description ?? "",
          specification: item.transactions?.specification ?? "",
          category: item.transactions?.account_categories ? `${item.transactions.account_categories.code} ${item.transactions.account_categories.name}` : "",
          event_name: item.transactions?.events?.name ?? "-",
          supplier_name: item.transactions?.suppliers?.name ?? "-",
          supplier_id: item.transactions?.supplier_id ?? null,
          iban: item.transactions?.suppliers?.iban ?? "-",
          amount: Number(item.transactions?.amount ?? 0),
          iva_rate: Number(item.transactions?.iva_rate ?? 23),
          paid_amount: Number(item.transactions?.paid_amount ?? 0),
          due_date: item.transactions?.due_date,
          date: item.transactions?.date ?? "",
          payment_method: item.transactions?.payment_method ?? "transfer",
          payment_entity: item.transactions?.payment_entity,
          payment_reference: item.transactions?.payment_reference,
          invoice_ref: item.transactions?.invoice_ref ?? null,
        })),
      };
      if (format === "pdf") await exportPaymentListToPDF(exportData);
      else exportPaymentListToExcel(exportData);
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyWhatsApp = () => {
    if (!list || items.length === 0) return;
    const lines: string[] = [];
    lines.push(`📋 *${list.title}*`);
    lines.push(`📅 Data: ${formatDate(list.payment_date)}`);
    if (list.approved_by) lines.push(`✅ Aprovada por: ${list.approved_by}`);
    lines.push("");

    items.forEach((item: any, idx: number) => {
      const tx = item.transactions;
      const amount = Number(tx?.amount ?? 0);
      const ivaRate = Number(tx?.iva_rate ?? 23);
      const withIva = amount * (1 + ivaRate / 100);
      const paid = Number(tx?.paid_amount ?? 0);
      const isPaid = paid >= amount || tx?.status === "paid";
      const status = isPaid ? "✅" : "⬜";
      const supplier = tx?.suppliers?.name ?? "-";
      const iban = tx?.suppliers?.iban ?? "-";
      const event = tx?.events?.name ?? "-";
      const desc = tx?.description ?? "-";
      const shortDesc = desc.length > 27 ? desc.substring(0, 24) + "..." : desc;
      const isRefPayment = tx?.payment_method === "service_payment" || tx?.payment_method === "state_payment";

      lines.push(`${status} *${idx + 1}.*`);
      lines.push(`Evento: ${event}`);
      if (tx?.account_categories) lines.push(`Categoria: ${tx.account_categories.code} ${tx.account_categories.name}`);
      if (isRefPayment) {
        lines.push(`Entidade: ${tx?.payment_entity ?? "-"}`);
        lines.push(`Referência: ${tx?.payment_reference ?? "-"}`);
      } else {
        lines.push(`IBAN: ${iban}`);
      }
      lines.push(`Fornecedor: ${supplier}`);
      lines.push(`Descrição: ${desc}`);
      if (tx?.specification) lines.push(`Especificação: ${tx.specification}`);
      lines.push(`Resumo: ${shortDesc}`);
      lines.push(`Valor: ${formatCurrency(withIva)}`);
      if (paid > 0 && !isPaid) {
        lines.push(`Saldo a pagar: ${formatCurrency(withIva - paid * (1 + ivaRate / 100))}`);
      }
      lines.push("───────────────");
    });

    const total = items.reduce((sum: number, item: any) => {
      const tx = item.transactions;
      const amount = Number(tx?.amount ?? 0);
      const ivaRate = Number(tx?.iva_rate ?? 23);
      return sum + amount * (1 + ivaRate / 100);
    }, 0);
    lines.push(`💰 *Total: ${formatCurrency(total)}*`);

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Copiado!", description: "Lista formatada copiada para a área de transferência. Cole no WhatsApp." });
    }).catch(() => {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{list?.title ?? "Lista de Pagamentos"}</h2>
            <p className="text-sm text-muted-foreground">{list?.payment_date ? formatDate(list.payment_date) : ""}</p>
          </div>
          {isApproved && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleCopyWhatsApp} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                <Copy className="h-4 w-4" /> WhatsApp
              </button>
              <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
                <FileText className="mr-1.5 h-4 w-4" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
              </Button>
            </div>
          )}
        </div>

        {list?.approved_by && (
          <p className="text-sm text-muted-foreground mb-3">
            Aprovada por: <span className="font-medium text-foreground">{list.approved_by}</span>
            {list.approved_at && ` em ${formatDate(list.approved_at)}`}
          </p>
        )}

        {/* Bulk payment bar */}
        {isApproved && unpaidItems.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 mb-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedTxIds.size === unpaidItems.length && unpaidItems.length > 0}
                onCheckedChange={toggleAll}
                className="border-sky-500 data-[state=checked]:bg-sky-600 data-[state=checked]:border-sky-600"
              />
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-sky-500" />
                {selectedTxIds.size > 0
                  ? `${selectedTxIds.size} de ${unpaidItems.length} para liquidar`
                  : `${unpaidItems.length} pagamento(s) pendente(s) de liquidação`}
              </span>
            </div>
            {selectedTxIds.size > 0 && (
              <button
                onClick={handleBulkPayment}
                disabled={paying}
                className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-sky-700 disabled:opacity-50"
              >
                <Banknote className="h-4 w-4" />
                {paying ? "A processar…" : `Liquidar (${selectedTxIds.size})`}
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="py-4 text-center text-muted-foreground">A carregar itens…</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">Sem itens nesta lista.</p>
        ) : (
          <div className="space-y-3">
             {items.map((item: any) => {
              const tx = item.transactions;
              const amount = Number(tx?.amount ?? 0);
              const ivaRate = Number(tx?.iva_rate ?? 23);
              const withIva = amount * (1 + ivaRate / 100);
              const paid = Number(tx?.paid_amount ?? 0);
              const isPaid = paid >= amount || tx?.status === "paid";
              const isSelectable = isApproved && !isPaid && tx;
              const bpCheck = checkExceedsBP(tx?.event_id, tx?.category_id, amount);
              const manuallyMarked = !!item.manually_marked_paid;

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border px-4 py-3 space-y-1 text-sm transition-colors ${
                    isPaid
                      ? "border-success/30 bg-success/5 opacity-70"
                      : manuallyMarked
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : selectedTxIds.has(tx?.id)
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/50 bg-muted/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {isApproved && unpaidItems.length > 0 && (
                      <div className="pt-0.5">
                        {isSelectable ? (
                          <Checkbox
                            checked={selectedTxIds.has(tx.id)}
                            onCheckedChange={() => toggleTx(tx.id)}
                            className="border-sky-500 data-[state=checked]:bg-sky-600 data-[state=checked]:border-sky-600"
                          />
                        ) : (
                          <span className="inline-flex h-4 w-4 items-center justify-center text-success">✓</span>
                        )}
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <CopyLine label="Evento" value={tx?.events?.name ?? "-"} />
                      {(tx?.payment_method === "service_payment" || tx?.payment_method === "state_payment") ? (
                        <>
                          <CopyLine label="Entidade Pgto" value={tx?.payment_entity ?? "-"} mono />
                          <CopyLine label="Referência" value={tx?.payment_reference ?? "-"} mono />
                        </>
                      ) : (
                        <CopyLine label="IBAN" value={tx?.suppliers?.iban ?? "-"} mono />
                      )}
                      <CopyLine label="Fornecedor" value={tx?.suppliers?.name ?? "-"} />
                      {tx?.account_categories && (
                        <CopyLine label="Categoria" value={`${tx.account_categories.code} ${tx.account_categories.name}`} />
                      )}
                      <CopyLine label="Descrição" value={tx?.description ?? "-"} bold />
                      {tx?.specification && (
                        <p className="text-xs text-muted-foreground pl-0.5">{tx.specification}</p>
                      )}
                      <CopyLine label="Valor" value={formatCurrency(withIva)} mono bold />
                      {bpCheck.exceeds && (
                        <BPExceedsWarning forecastAmount={bpCheck.forecastAmount!} txAmount={amount} />
                      )}
                      <div className="flex items-center gap-4 flex-wrap">
                        {paid > 0 && !isPaid && (
                          <>
                            <p className="text-xs text-muted-foreground">Pago: {formatCurrency(paid * (1 + ivaRate / 100))}</p>
                            <p className="text-sm font-semibold text-warning">Saldo a pagar: {formatCurrency(withIva - paid * (1 + ivaRate / 100))}</p>
                          </>
                        )}
                        {isPaid && (
                          <Badge variant="default" className="bg-success/15 text-success border-0">Pago</Badge>
                        )}
                        {!isPaid && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleManualMark(item.id, manuallyMarked); }}
                            className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 border transition-colors ${
                              manuallyMarked
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                            }`}
                            title={manuallyMarked ? "Desmarcar transferência" : "Marcar como transferido (apenas visual)"}
                          >
                            <Banknote className="h-3.5 w-3.5" />
                            {manuallyMarked ? "Transferido ✓" : "Marcar transferido"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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

/* ─── Approve Modal (partial / full) ─── */
function ApproveModal({
  listId,
  onClose,
  onApproved,
}: {
  listId: string;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["payment-list-items-approve", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_list_items")
        .select("*, transactions(*, events(name), suppliers(name), account_categories(code, name))")
        .eq("payment_list_id", listId);
      if (error) throw error;
      return (data ?? []).filter((item: any) => !item.transactions?.parent_transaction_id);
    },
  });

  // BP forecast check for approval
  const checkExceedsBP = useForecastLookup(items.map((i: any) => i.transactions?.event_id));

  // Auto-select all when items load
  useEffect(() => {
    if (items.length > 0) {
      setSelectedIds(new Set(items.map((item: any) => item.id)));
    }
  }, [items.length]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i: any) => i.id)));
  };

  const handleApprove = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione pelo menos uma conta.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const isPartial = selectedIds.size < items.length;

      if (isPartial) {
        // Remove unselected items from this list
        const removeIds = items.filter((i: any) => !selectedIds.has(i.id)).map((i: any) => i.id);
        if (removeIds.length > 0) {
          const { error: delErr } = await supabase
            .from("payment_list_items")
            .delete()
            .in("id", removeIds);
          if (delErr) throw delErr;
        }
      }

      // Mark list as approved (or partially_approved)
      const { error } = await supabase
        .from("payment_lists")
        .update({
          status: isPartial ? "partially_approved" : "approved",
          approved_by: user?.email ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", listId);
      if (error) throw error;

      toast({
        title: isPartial
          ? `Lista parcialmente aprovada (${selectedIds.size} de ${items.length} contas).`
          : "Lista totalmente aprovada!",
      });
      onApproved();
    } catch (err: any) {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-bold">Aprovar Lista de Pagamentos</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Selecione as contas que deseja aprovar. Pode aprovar todas (completa) ou apenas algumas (parcial).
        </p>

        {isLoading ? (
          <p className="py-4 text-center text-muted-foreground">A carregar itens…</p>
        ) : (
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border border-border/50 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-2 text-center w-8">
                    <Checkbox checked={selectedIds.size === items.length && items.length > 0} onCheckedChange={toggleAll} className="border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
                  </th>
                   <th className="p-2 text-left font-medium">Descrição</th>
                   <th className="p-2 text-left font-medium hidden sm:table-cell">Categoria</th>
                   <th className="p-2 text-left font-medium hidden sm:table-cell">Evento</th>
                   <th className="p-2 text-left font-medium hidden md:table-cell">Fornecedor</th>
                   <th className="p-2 text-right font-medium">Valor c/IVA</th>
                   <th className="p-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.map((item: any) => {
                  const tx = item.transactions;
                  const txAmount = Number(tx?.amount ?? 0);
                  const withIva = txAmount * (1 + Number(tx?.iva_rate ?? 23) / 100);
                  const paid = Number(tx?.paid_amount ?? 0);
                  const bpCheck = checkExceedsBP(tx?.event_id, tx?.category_id, txAmount);
                  return (
                    <tr
                      key={item.id}
                      className={`cursor-pointer transition-colors ${selectedIds.has(item.id) ? "bg-primary/5" : "hover:bg-muted/30"} ${bpCheck.exceeds ? "bg-destructive/5" : ""}`}
                      onClick={() => toggleId(item.id)}
                    >
                      <td className="p-2 text-center">
                        <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleId(item.id)} className="border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
                      </td>
                       <td className="p-2">
                         <span className="font-medium">{tx?.description}</span>
                         {tx?.specification && <p className="text-[11px] text-muted-foreground">{tx.specification}</p>}
                         {bpCheck.exceeds && (
                           <div className="mt-0.5"><BPExceedsWarning forecastAmount={bpCheck.forecastAmount!} txAmount={txAmount} /></div>
                         )}
                       </td>
                       <td className="p-2 text-muted-foreground text-xs hidden sm:table-cell">{tx?.account_categories ? `${tx.account_categories.code} ${tx.account_categories.name}` : "-"}</td>
                       <td className="p-2 text-muted-foreground hidden sm:table-cell">{tx?.events?.name ?? "-"}</td>
                       <td className="p-2 text-muted-foreground hidden md:table-cell">{tx?.suppliers?.name ?? "-"}</td>
                       <td className="p-2 text-right font-mono">{formatCurrency(withIva)}</td>
                       <td className="p-2 text-right font-mono font-semibold">{formatCurrency(withIva - paid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between mt-4 pt-4 border-t border-border/50 gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} de {items.length} selecionada(s)
            {selectedIds.size > 0 && selectedIds.size < items.length && (
              <Badge variant="outline" className="ml-2">Aprovação Parcial</Badge>
            )}
            {selectedIds.size === items.length && items.length > 0 && (
              <Badge variant="default" className="ml-2">Aprovação Completa</Badge>
            )}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">
              Cancelar
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting || selectedIds.size === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {selectedIds.size < items.length && selectedIds.size > 0 ? "Aprovar Selecionadas" : "Aprovar Todas"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}