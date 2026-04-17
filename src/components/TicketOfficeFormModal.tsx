import { useState, useMemo } from "react";
import { formatDatePT } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  office: any | null;
  onClose: () => void;
}

export function TicketOfficeFormModal({ office, onClose }: Props) {
  const isEditing = !!office;
  const queryClient = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManageAssignments = isAdmin || hasPermission("manage_accounts");

  const [name, setName] = useState(office?.name ?? "");
  const [contactName, setContactName] = useState(office?.contact_name ?? "");
  const [email, setEmail] = useState(office?.email_contact ?? "");
  const [phone, setPhone] = useState(office?.phone ?? "");
  const [notes, setNotes] = useState(office?.description ?? "");
  const [isActive, setIsActive] = useState(office?.is_active ?? true);
  const [eventSearch, setEventSearch] = useState("");

  // Fetch events for association (only confirmed/active)
  const { data: events = [] } = useQuery({
    queryKey: ["events_for_office_assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type, parent_event_id")
        .in("status", ["planning", "confirmed", "active"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && canManageAssignments,
  });

  // Fetch existing assignments for this office
  const { data: assignments = [] } = useQuery({
    queryKey: ["office_event_assignments", office?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("id, event_id")
        .eq("financial_account_id", office.id);
      if (error) throw error;
      return data;
    },
    enabled: isEditing && canManageAssignments && !!office?.id,
  });

  const assignedEventIds = useMemo(
    () => new Set(assignments.map((a: any) => a.event_id)),
    [assignments]
  );

  const filteredEvents = useMemo(() => {
    if (!eventSearch.trim()) return events;
    const q = eventSearch.toLowerCase();
    return events.filter((e: any) => e.name.toLowerCase().includes(q));
  }, [events, eventSearch]);

  const toggleAssignment = useMutation({
    mutationFn: async (eventId: string) => {
      const existing = assignments.find((a: any) => a.event_id === eventId);
      if (existing) {
        const { error } = await supabase
          .from("event_ticket_office_assignments")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("event_ticket_office_assignments")
          .insert({ event_id: eventId, financial_account_id: office.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office_event_assignments", office?.id] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_assignments_all"] });
      queryClient.invalidateQueries({ queryKey: ["to_event_assignments"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao alterar associação", { description: err.message });
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório");

      const payload = {
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email_contact: email.trim() || null,
        phone: phone.trim() || null,
        description: notes.trim() || null,
        is_active: isActive,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("financial_accounts")
          .update(payload)
          .eq("id", office.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_accounts")
          .insert({
            ...payload,
            type: "ticket_office",
            initial_balance: 0,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_offices"] });
      queryClient.invalidateQueries({ queryKey: ["financial_accounts"] });
      toast.success(isEditing ? "Bilheteira atualizada" : "Bilheteira criada");
      onClose();
    },
    onError: (err: any) => {
      toast.error("Erro", { description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Bilheteira" : "Nova Bilheteira"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="to-name">Nome *</Label>
            <Input id="to-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ticketline" />
          </div>
          <div>
            <Label htmlFor="to-contact">Contacto</Label>
            <Input id="to-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nome do contacto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="to-email">Email</Label>
              <Input id="to-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to-phone">Telefone</Label>
              <Input id="to-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="to-notes">Notas</Label>
            <Textarea id="to-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="to-active" />
            <Label htmlFor="to-active">Ativa</Label>
          </div>

          {/* Event associations - only when editing and user has permission */}
          {isEditing && canManageAssignments && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Eventos Associados</Label>
                <span className="text-xs text-muted-foreground">({assignedEventIds.size})</span>
              </div>

              {events.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar eventos..."
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}

              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/50 p-2">
                {filteredEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum evento encontrado</p>
                ) : (
                  filteredEvents.map((event: any) => {
                    const isAssigned = assignedEventIds.has(event.id);
                    return (
                      <label
                        key={event.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={isAssigned}
                          onCheckedChange={() => toggleAssignment.mutate(event.id)}
                          disabled={toggleAssignment.isPending}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{event.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDatePT(event.date)}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "A guardar…" : isEditing ? "Guardar" : "Criar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
