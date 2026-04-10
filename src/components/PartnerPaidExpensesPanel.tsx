import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";

interface Props {
  eventId: string;
  eventStatus: string;
}

export function PartnerPaidExpensesPanel({ eventId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canEdit = (isAdmin || isManager) && eventStatus !== "completed";
  const [showForm, setShowForm] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");

  // Event partners
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

  // Already-linked expenses
  const { data: paidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(suppliers(name)), transactions(description, amount, date, status, category_id, account_categories(name))")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Event transactions (expenses) available to link
  const { data: availableTransactions = [] } = useQuery({
    queryKey: ["partner-paid-available-tx", eventId],
    queryFn: async () => {
      // Get already-linked transaction IDs
      const { data: linked } = await supabase
        .from("partner_paid_expenses")
        .select("transaction_id")
        .eq("event_id", eventId);
      const linkedIds = (linked || []).map((l: any) => l.transaction_id);

      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, date, account_categories(name)")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []).filter((t: any) => !linkedIds.includes(t.id));
    },
    enabled: showForm,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId || !selectedTransactionId) throw new Error("Selecione sócio e despesa");
      const { error } = await supabase.from("partner_paid_expenses").insert({
        event_id: eventId,
        partner_id: selectedPartnerId,
        transaction_id: selectedTransactionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-available-tx", eventId] });
      setSelectedTransactionId("");
      toast({ title: "Despesa vinculada ao sócio" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_paid_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-paid-expenses", eventId] });
      queryClient.invalidateQueries({ queryKey: ["partner-paid-available-tx", eventId] });
      toast({ title: "Vinculação removida" });
    },
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
          <h3 className="text-sm font-semibold">Despesas Pagas por Sócios</h3>
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
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Despesa</label>
              <SearchableSelect
                options={availableTransactions.map((t: any) => ({
                  value: t.id,
                  label: `${t.description} — ${formatCurrency(Number(t.amount))}${t.account_categories?.name ? ` (${t.account_categories.name})` : ""}`,
                }))}
                value={selectedTransactionId}
                onValueChange={setSelectedTransactionId}
                placeholder="Selecionar despesa…"
                searchPlaceholder="Pesquisar…"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => addMutation.mutate()}
            disabled={!selectedPartnerId || !selectedTransactionId || addMutation.isPending}
          >
            Vincular
          </Button>
        </div>
      )}

      {/* Per-partner list */}
      {partners.map((partner: any) => {
        const expenses = byPartner[partner.id] || [];
        const total = expenses.reduce((s: number, pe: any) => s + Number(pe.transactions?.amount || 0), 0);

        return (
          <div key={partner.id} className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-muted/30">
              <span className="text-sm font-semibold">{partner.suppliers?.name} ({partner.percentage}%)</span>
              {expenses.length > 0 && (
                <span className="text-sm font-mono font-bold">{formatCurrency(total)}</span>
              )}
            </div>
            {expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma despesa vinculada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {canEdit && <TableHead className="w-[40px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((pe: any) => {
                    const tx = pe.transactions;
                    return (
                      <TableRow key={pe.id}>
                        <TableCell className="text-sm">{tx?.description || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{tx?.account_categories?.name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : ""}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(tx?.amount || 0))}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <button
                              onClick={() => removeMutation.mutate(pe.id)}
                              className="p-1 rounded hover:bg-destructive/10 transition-colors"
                              title="Desvincular"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
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
