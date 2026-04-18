import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Banknote, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";

interface Props {
  officeId: string;
  officeName: string;
}

interface AdvanceForm {
  event_id: string;
  amount: string;
  advance_date: string;
  target_account_id: string;
  notes: string;
  create_transaction: boolean;
}

const emptyForm: AdvanceForm = {
  event_id: "",
  amount: "",
  advance_date: new Date().toISOString().slice(0, 10),
  target_account_id: "",
  notes: "",
  create_transaction: false,
};

export function TicketOfficeAdvancesPanel({ officeId, officeName }: Props) {
  const { user, isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<AdvanceForm>(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Eligible events: those assigned to this office
  const { data: assignedEvents = [] } = useQuery({
    queryKey: ["advance_eligible_events", officeId],
    queryFn: async () => {
      const { data: assigns } = await supabase
        .from("event_ticket_office_assignments")
        .select("event_id, events(id, name, date, status)")
        .eq("financial_account_id", officeId);
      const eventMap = new Map<string, any>();
      (assigns || []).forEach((a: any) => {
        if (a.events) eventMap.set(a.event_id, a.events);
      });
      return Array.from(eventMap.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["advance_target_accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .in("type", ["bank", "cash"])
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: advances = [], isLoading } = useQuery({
    queryKey: ["ticket_office_advances", officeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("*, events(id, name, date)")
        .eq("financial_account_id", officeId)
        .order("advance_date", { ascending: false });
      if (error) throw error;
      const list = data || [];
      const targetIds = Array.from(new Set(list.map((a: any) => a.target_account_id).filter(Boolean)));
      if (targetIds.length === 0) return list;
      const { data: targets } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .in("id", targetIds);
      const tMap = new Map((targets || []).map((t: any) => [t.id, t]));
      return list.map((a: any) => ({ ...a, target_account: a.target_account_id ? tMap.get(a.target_account_id) : null }));
    },
  });

  const groupedByEvent = useMemo(() => {
    const map = new Map<string, { event: any; items: any[]; total: number; pending: number }>();
    advances.forEach((a: any) => {
      const key = a.event_id;
      if (!map.has(key)) map.set(key, { event: a.events, items: [], total: 0, pending: 0 });
      const g = map.get(key)!;
      g.items.push(a);
      g.total += Number(a.amount);
      if (!a.settlement_id) g.pending += Number(a.amount);
    });
    return Array.from(map.values()).sort((a, b) =>
      (b.event?.date || "").localeCompare(a.event?.date || "")
    );
  }, [advances]);

  const totalPending = useMemo(
    () => advances.filter((a: any) => !a.settlement_id).reduce((s: number, a: any) => s + Number(a.amount), 0),
    [advances]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (a: any) => {
    setEditing(a);
    setForm({
      event_id: a.event_id,
      amount: String(a.amount),
      advance_date: a.advance_date,
      target_account_id: a.target_account_id ?? "",
      notes: a.notes ?? "",
      create_transaction: false,
    });
    setShowModal(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.event_id) throw new Error("Selecione o evento");
      const amount = Number(form.amount);
      if (!amount || amount <= 0) throw new Error("Indique um valor válido");
      if (!form.advance_date) throw new Error("Indique a data do adiantamento");

      let transactionId = editing?.transaction_id || null;

      // Optionally create the transfer transaction
      if (!editing && form.create_transaction) {
        if (!form.target_account_id) throw new Error("Selecione a conta destino para criar a transação");
        const { data: txn, error: txErr } = await (supabase as any)
          .from("transactions")
          .insert({
            type: "transfer",
            description: `Adiantamento bilheteira ${officeName}`,
            amount,
            paid_amount: amount,
            status: "paid",
            payment_date: form.advance_date,
            account_id: officeId,
            target_account_id: form.target_account_id,
            event_id: form.event_id,
          })
          .select("id")
          .single();
        if (txErr) throw txErr;
        transactionId = txn.id;
      }

      const payload: any = {
        event_id: form.event_id,
        financial_account_id: officeId,
        target_account_id: form.target_account_id || null,
        transaction_id: transactionId,
        amount,
        advance_date: form.advance_date,
        notes: form.notes || null,
      };

      if (editing) {
        const { error } = await (supabase as any)
          .from("event_ticket_office_advances")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        await logAudit({
          entity_type: "ticket_office_advance",
          entity_id: editing.id,
          action: "update",
          changed_by: getAuditUser(user),
          new_data: payload,
        });
      } else {
        payload.created_by = getAuditUser(user);
        const { data, error } = await (supabase as any)
          .from("event_ticket_office_advances")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        await logAudit({
          entity_type: "ticket_office_advance",
          entity_id: data.id,
          action: "create",
          changed_by: getAuditUser(user),
          new_data: payload,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_office_advances"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(editing ? "Adiantamento atualizado" : "Adiantamento registado");
      setShowModal(false);
      setEditing(null);
    },
    onError: (err: any) => toast.error("Erro", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const advance = advances.find((a: any) => a.id === id);
      if (advance?.settlement_id) {
        throw new Error("Não é possível eliminar um adiantamento já consumido num fecho. Estorne primeiro o fecho.");
      }
      const { error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        entity_type: "ticket_office_advance",
        entity_id: id,
        action: "delete",
        changed_by: getAuditUser(user),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_office_advances"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      toast.success("Adiantamento eliminado");
      setDeletingId(null);
    },
    onError: (err: any) => toast.error("Erro ao eliminar", { description: err.message }),
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Adiantamentos por Evento</h3>
          <p className="text-sm text-muted-foreground">
            Valores que esta bilheteira já transferiu para abater no fecho de cada evento.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo adiantamento
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase">Total registado</p>
          <p className="text-2xl font-mono font-bold mt-1">
            {formatCurrency(advances.reduce((s: number, a: any) => s + Number(a.amount), 0))}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase">Pendente de fecho</p>
          <p className="text-2xl font-mono font-bold mt-1 text-amber-500">{formatCurrency(totalPending)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Será abatido automaticamente nos fechos dos respetivos eventos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">A carregar…</p>
      ) : groupedByEvent.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          Sem adiantamentos registados nesta bilheteira.
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByEvent.map((g) => (
            <div key={g.event?.id || "?"} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold truncate">{g.event?.name ?? "—"}</h4>
                  <p className="text-xs text-muted-foreground">{g.event?.date ?? ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-lg">{formatCurrency(g.total)}</p>
                  {g.pending > 0 && (
                    <p className="text-[11px] text-amber-500">
                      {formatCurrency(g.pending)} por abater
                    </p>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-border/60 rounded-md border border-border">
                {g.items.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-3 p-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {new Date(a.advance_date).toLocaleDateString("pt-PT")}
                        </span>
                        {a.target_account?.name && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <ArrowRight className="h-3 w-3" /> {a.target_account.name}
                          </span>
                        )}
                        {a.settlement_id ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" /> Abatido no fecho
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">
                            <Banknote className="h-3 w-3" /> Pendente
                          </span>
                        )}
                      </div>
                      {a.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.notes}</p>
                      )}
                    </div>
                    <span className="font-mono font-semibold whitespace-nowrap">
                      {formatCurrency(Number(a.amount))}
                    </span>
                    {canManage && !a.settlement_id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(a.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(o) => !o && setShowModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar adiantamento" : "Novo adiantamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Evento *</Label>
              <select
                value={form.event_id}
                onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!!editing}
              >
                <option value="">Selecione…</option>
                {assignedEvents.map((ev: any) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} {ev.date ? `(${ev.date})` : ""}
                  </option>
                ))}
              </select>
              {assignedEvents.length === 0 && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Sem eventos atribuídos a esta bilheteira.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data *</Label>
                <DatePicker
                  value={form.advance_date}
                  onChange={(v) => setForm({ ...form, advance_date: v })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Conta de destino (opcional)</Label>
              <select
                value={form.target_account_id}
                onChange={(e) => setForm({ ...form, target_account_id: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Não especificada —</option>
                {bankAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Conta onde o valor foi creditado pela bilheteira.
              </p>
            </div>

            {!editing && (
              <label className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={form.create_transaction}
                  onChange={(e) => setForm({ ...form, create_transaction: e.target.checked })}
                  disabled={!form.target_account_id}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <p className="font-semibold">Criar também a transferência bancária</p>
                  <p className="text-muted-foreground">
                    Cria uma transação de transferência liquidada da bilheteira para a conta destino. Requer conta de destino.
                  </p>
                </div>
              </label>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Ex: parte do crédito de 12/03 referente a este evento"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Guardar" : "Registar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não elimina a transação bancária associada (se houver). O adiantamento deixa de ser
              considerado no fecho do evento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
