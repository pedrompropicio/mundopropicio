import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, UserCheck, Check, X, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

interface Props {
  eventId: string;
  eventStatus: string;
}

export function PartnerPaidExpensesPanel({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager, role, user } = useAuth();
  const isEditor = role === "editor";
  const canApprove = (isAdmin || isManager) && eventStatus !== "completed";
  const canEdit = (isAdmin || isManager || isEditor) && eventStatus !== "completed";
  const [showForm, setShowForm] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Sub-events of this Master (if any) — for tour/multi-day
  const { data: subEventIds = [] } = useQuery({
    queryKey: ["sub-event-ids", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id")
        .eq("parent_event_id", eventId);
      if (error) throw error;
      return (data ?? []).map((e: any) => e.id);
    },
  });

  // Tree of events (master + subs) with names — for the tx list label
  const { data: eventNamesMap = new Map<string, string>() } = useQuery({
    queryKey: ["event-tree-names", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const ids = [eventId, ...subEventIds];
      const { data, error } = await supabase.from("events").select("id, name").in("id", ids);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((e: any) => m.set(e.id, e.name));
      return m;
    },
    enabled: subEventIds !== undefined,
  });

  // Event partners (only Master holds the partners)
  const { data: partners = [] } = useQuery({
    queryKey: ["event-partners", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_partners")
        .select("*, suppliers(name)")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Already-linked expenses across the whole tree
  const allTreeIds = [eventId, ...subEventIds];
  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses-tree", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(suppliers(name)), transactions(description, amount, date, status, event_id, category_id, account_categories(name))")
        .in("event_id", allTreeIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: allTreeIds.length > 0,
  });

  // Available transactions: Master + every sub-event
  const { data: availableTransactions = [] } = useQuery({
    queryKey: ["partner-paid-available-tx-tree", eventId, subEventIds.join(",")],
    queryFn: async () => {
      const { data: linked } = await supabase
        .from("partner_paid_expenses")
        .select("transaction_id")
        .in("event_id", allTreeIds);
      const linkedIds = new Set((linked || []).map((l: any) => l.transaction_id));

      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, date, event_id, account_categories(name)")
        .in("event_id", allTreeIds)
        .eq("type", "expense")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []).filter((t: any) => !linkedIds.has(t.id));
    },
    enabled: showForm && allTreeIds.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId || !selectedTransactionId) throw new Error("Selecione sócio e despesa");
      if (!paidDate) throw new Error("Indique a data de pagamento pelo sócio");

      // Discover the actual event_id of the chosen transaction (may be Master or a sub)
      const tx = availableTransactions.find((t: any) => t.id === selectedTransactionId);
      const txEventId = tx?.event_id ?? eventId;

      const proposeOnly = !canApprove;

      // 1) Create the link (editor → proposta pendente; admin/manager → aprovado já)
      const { error: linkErr } = await supabase.from("partner_paid_expenses").insert({
        event_id: txEventId,
        partner_id: selectedPartnerId,
        transaction_id: selectedTransactionId,
        paid_date: paidDate,
        status: proposeOnly ? "pending_approval" : "approved",
        proposed_by: user?.id ?? null,
        approved_by: proposeOnly ? null : user?.id ?? null,
        approved_at: proposeOnly ? null : new Date().toISOString(),
      } as any);
      if (linkErr) throw linkErr;

      // 2) Só o fluxo aprovado toca na transação
      if (!proposeOnly) {
        const { error: txErr } = await supabase
          .from("transactions")
          .update({ status: "paid", payment_date: paidDate })
          .eq("id", selectedTransactionId);
        if (txErr) throw txErr;
      }
      return { proposeOnly };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-available-tx-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-map-by-supplier"] });
      setSelectedTransactionId("");
      toast({
        title: res?.proposeOnly
          ? "Proposta criada — aguarda aprovação"
          : "Despesa vinculada e marcada como paga",
      });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_paid_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-available-tx-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-map-by-supplier"] });
      toast({ title: "Vinculação removida" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (pe: any) => {
      const { error } = await supabase
        .from("partner_paid_expenses")
        .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() } as any)
        .eq("id", pe.id);
      if (error) throw error;

      const tx = pe.transactions;
      if (tx && tx.status !== "paid") {
        await supabase.from("transaction_audit_log").insert({
          transaction_id: pe.transaction_id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "sistema",
          field_name: "Liquidação (aprovação de despesa paga por sócio)",
          old_value: String(tx.status ?? ""),
          new_value: `paid @ ${pe.paid_date}`,
        } as any);
      }

      const { error: txErr } = await supabase
        .from("transactions")
        .update({ status: "paid", payment_date: pe.paid_date })
        .eq("id", pe.transaction_id);
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-map-by-supplier"] });
      toast({ title: "Proposta aprovada — despesa marcada como paga" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_paid_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses-tree", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-available-tx-tree", eventId] });
      toast({ title: "Proposta rejeitada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  if (partners.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Sem sócios cadastrados neste evento. Adicione sócios no separador "Sócios" para utilizar esta funcionalidade.
      </div>
    );
  }

  // Group by partner
  const byPartner = partners.reduce<Record<string, any[]>>((acc, p: any) => {
    acc[p.id] = paidExpenses.filter((pe: any) => pe.partner_id === p.id);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold flex items-center gap-1.5">Despesas Pagas por Sócios <HelpTooltip text={helpTexts.partnerExpenses} size={13} /></h3>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Vincular Despesa
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && canEdit && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sócio</label>
              <SearchableSelect
                options={partners.map((p: any) => ({ value: p.id, label: `${p.suppliers?.name} (${p.percentage}%)` }))}
                value={selectedPartnerId}
                onValueChange={setSelectedPartnerId}
                placeholder="Selecionar sócio…"
                searchPlaceholder="Pesquisar…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Despesa <span className="text-muted-foreground/70">({availableTransactions.length} disponíveis)</span>
              </label>
              <SearchableSelect
                options={availableTransactions.map((t: any) => {
                  const evName = eventNamesMap.get?.(t.event_id);
                  const evTag = evName && t.event_id !== eventId ? ` · ${evName}` : "";
                  const cat = t.account_categories?.name ? ` (${t.account_categories.name})` : "";
                  return {
                    value: t.id,
                    label: `${t.description}${evTag} — ${formatCurrency(Number(t.amount))}${cat}`,
                  };
                })}
                value={selectedTransactionId}
                onValueChange={setSelectedTransactionId}
                placeholder="Selecionar despesa…"
                searchPlaceholder="Pesquisar por descrição, evento ou categoria…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data do pagamento pelo sócio</label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={!selectedPartnerId || !selectedTransactionId || !paidDate || addMutation.isPending}
              >
                {canApprove ? "Vincular e marcar como paga" : "Propor vinculação"}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A despesa permanece no evento original e continua a contar no resultado. O sócio é creditado pelo valor no Fecho de Parceiros.
            {!canApprove && " A tua proposta fica pendente de aprovação por um administrador/gestor e não altera a transação até lá."}
          </p>
        </div>
      )}

      {/* Per-partner list */}
      {partners.map((partner: any) => {
        const expenses = byPartner[partner.id] || [];
        const total = expenses
          .filter((pe: any) => pe.status !== "pending_approval")
          .reduce((s: number, pe: any) => s + Number(pe.transactions?.amount || 0), 0);
        const pendingCount = expenses.filter((pe: any) => pe.status === "pending_approval").length;

        return (
          <div key={partner.id} className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-muted/30">
              <span className="text-sm font-semibold">{partner.suppliers?.name} ({partner.percentage}%)</span>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                    {pendingCount} a aguardar aprovação
                  </Badge>
                )}
                {expenses.length > 0 && (
                  <span className="text-sm font-mono font-bold">{formatCurrency(total)}</span>
                )}
              </div>
            </div>
            {expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma despesa vinculada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {canEdit && <TableHead className="w-[40px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((pe: any) => {
                    const tx = pe.transactions;
                    const evName = tx?.event_id ? eventNamesMap.get?.(tx.event_id) : undefined;
                    return (
                      <TableRow key={pe.id}>
                        <TableCell className="text-sm">
                          {tx?.description || "—"}
                          {pe.status === "pending_approval" && (
                            <Badge variant="outline" className="ml-2 text-[10px] text-warning border-warning/40">
                              <Clock className="mr-1 h-3 w-3" /> Aguarda aprovação
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{evName || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{tx?.account_categories?.name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(tx?.amount || 0))}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {pe.status === "pending_approval" && canApprove && (
                                <>
                                  <button
                                    onClick={() => approveMutation.mutate(pe)}
                                    className="p-1 rounded hover:bg-success/10 transition-colors"
                                    title="Aprovar"
                                  >
                                    <Check className="h-3.5 w-3.5 text-success" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm("Rejeitar esta proposta? O vínculo é removido e a transação fica intocada.")) {
                                        rejectMutation.mutate(pe.id);
                                      }
                                    }}
                                    className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                    title="Rejeitar"
                                  >
                                    <X className="h-3.5 w-3.5 text-destructive" />
                                  </button>
                                </>
                              )}
                              {(canApprove || (pe.status === "pending_approval" && pe.proposed_by === user?.id)) && (
                                <button
                                  onClick={() => removeMutation.mutate(pe.id)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                  title="Desvincular"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        );
      })}
    </div>
  );
}
