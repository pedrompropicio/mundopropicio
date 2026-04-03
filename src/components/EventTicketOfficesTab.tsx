import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Store, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  eventId: string;
  eventDateId?: string | null;
  eventStatus?: string;
}

export function EventTicketOfficesTab({ eventId, eventDateId, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");
  const [addingOffice, setAddingOffice] = useState(false);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [commissionNotes, setCommissionNotes] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["event_ticket_office_assignments", eventId, eventDateId],
    queryFn: async () => {
      let q = supabase
        .from("event_ticket_office_assignments")
        .select("*, ticket_offices(id, name, contact_name, financial_account_id, financial_accounts:financial_account_id(id, name, initial_balance))")
        .eq("event_id", eventId);

      if (eventDateId) {
        q = q.eq("event_date_id", eventDateId);
      } else {
        q = q.is("event_date_id", null);
      }

      const { data, error } = await q.order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketOffices = [] } = useQuery({
    queryKey: ["ticket_offices_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_offices")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Get ticket sales per office for this event
  const { data: salesByOffice = [] } = useQuery({
    queryKey: ["ticket_sales_by_office", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("ticket_office_id, quantity, unit_price")
        .eq("zone_id", eventId); // This won't work directly - need to join through zones
      // For now return empty - we'll calculate from zones
      return [];
    },
    enabled: false, // Disable for now
  });

  const availableOffices = ticketOffices.filter(
    (to: any) => !assignments.some((a: any) => a.ticket_office_id === to.id)
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficeId) throw new Error("Selecione uma bilheteira");
      const { error } = await supabase.from("event_ticket_office_assignments").insert({
        event_id: eventId,
        ticket_office_id: selectedOfficeId,
        event_date_id: eventDateId || null,
        commission_notes: commissionNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      setAddingOffice(false);
      setSelectedOfficeId("");
      setCommissionNotes("");
      toast.success("Bilheteira associada ao evento");
    },
    onError: (err: any) => {
      toast.error("Erro", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ticket_office_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      setDeletingId(null);
      toast.success("Bilheteira desassociada");
    },
    onError: (err: any) => {
      toast.error("Erro", { description: err.message });
      setDeletingId(null);
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("event_ticket_office_assignments")
        .update({ commission_notes: notes.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      toast.success("Notas atualizadas");
    },
  });

  if (isLoading) return <p className="py-8 text-center text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Bilheteiras Associadas
        </h3>
        {canManage && (
          <button
            onClick={() => setAddingOffice(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Associar Bilheteira
          </button>
        )}
      </div>

      {assignments.length === 0 && !addingOffice ? (
        <div className="glass rounded-xl p-8 text-center space-y-2">
          <Store className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma bilheteira associada a este evento.</p>
          {canManage && (
            <button
              onClick={() => setAddingOffice(true)}
              className="text-xs text-primary hover:underline"
            >
              Associar bilheteira →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a: any) => (
            <div key={a.id} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{a.ticket_offices?.name}</span>
                  {a.is_conciliated && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      <CheckCircle2 className="h-3 w-3" /> Conciliada
                    </span>
                  )}
                </div>
                {canManage && !a.is_conciliated && (
                  <button
                    onClick={() => setDeletingId(a.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Commission notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Negociação de comissão</Label>
                <Textarea
                  value={a.commission_notes ?? ""}
                  onChange={(e) => {
                    // Local state update handled by react-query refetch
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== (a.commission_notes ?? "")) {
                      updateNotesMutation.mutate({ id: a.id, notes: e.target.value });
                    }
                  }}
                  placeholder="Descreva a negociação de comissão (ex: 5% sobre vendas online, mínimo 500€)"
                  rows={2}
                  className="mt-1 text-xs"
                  disabled={!canManage}
                  defaultValue={a.commission_notes ?? ""}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {addingOffice && (
        <div className="glass rounded-xl p-4 space-y-3 border border-primary/30">
          <h4 className="text-sm font-medium">Associar Bilheteira</h4>
          <div>
            <Label className="text-xs">Bilheteira *</Label>
            <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma bilheteira" />
              </SelectTrigger>
              <SelectContent>
                {availableOffices.map((to: any) => (
                  <SelectItem key={to.id} value={to.id}>{to.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notas de comissão</Label>
            <Textarea
              value={commissionNotes}
              onChange={(e) => setCommissionNotes(e.target.value)}
              placeholder="Descreva os termos da comissão"
              rows={2}
              className="mt-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!selectedOfficeId || addMutation.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {addMutation.isPending ? "A guardar…" : "Associar"}
            </button>
            <button
              onClick={() => { setAddingOffice(false); setSelectedOfficeId(""); setCommissionNotes(""); }}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desassociar bilheteira?</AlertDialogTitle>
            <AlertDialogDescription>
              A bilheteira será removida deste evento. As vendas registadas não serão eliminadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desassociar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
