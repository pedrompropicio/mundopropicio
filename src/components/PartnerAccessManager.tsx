import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Handshake } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface PartnerAccessManagerProps {
  eventId: string;
  eventName: string;
  subEvents?: { id: string; name: string; date: string }[];
}

export function PartnerAccessManager({ eventId, eventName, subEvents = [] }: PartnerAccessManagerProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Get partner users
  const { data: partnerUsers = [] } = useQuery({
    queryKey: ["partner_users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "partner");
      if (error) throw error;
      if (!roles?.length) return [];
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      if (pErr) throw pErr;
      return profiles ?? [];
    },
  });

  // Get current access for this event and sub-events
  const allEventIds = [eventId, ...subEvents.map((s) => s.id)];
  const { data: accessRecords = [], isLoading } = useQuery({
    queryKey: ["partner_event_access", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_event_access")
        .select("*")
        .in("event_id", allEventIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const addAccessMutation = useMutation({
    mutationFn: async () => {
      const idsToGrant = selectedEventIds.length > 0 ? selectedEventIds : [eventId];
      const inserts = idsToGrant.map((eid) => ({
        user_id: selectedUserId,
        event_id: eid,
        is_active: true,
      }));
      const { error } = await supabase.from("partner_event_access").upsert(inserts, { onConflict: "user_id,event_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      setSelectedUserId("");
      setSelectedEventIds([]);
      setShowAddForm(false);
      toast({ title: "Acesso concedido ao parceiro." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAccessMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("partner_event_access").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Acesso atualizado." });
    },
  });

  const removeAccessMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_event_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_event_access", eventId] });
      toast({ title: "Acesso removido." });
    },
  });

  // Group access by user
  const accessByUser = accessRecords.reduce<Record<string, any[]>>((acc, record) => {
    if (!acc[record.user_id]) acc[record.user_id] = [];
    acc[record.user_id].push(record);
    return acc;
  }, {});

  const getEventName = (eid: string) => {
    if (eid === eventId) return eventName;
    const sub = subEvents.find((s) => s.id === eid);
    return sub ? sub.name : "—";
  };

  const getUserName = (userId: string) => {
    const user = partnerUsers.find((u: any) => u.id === userId);
    return user ? `${user.full_name || ""} (${user.email})` : userId;
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Handshake className="h-4 w-4" /> Acesso de Parceiros
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Conceder Acesso
        </button>
      </div>

      {showAddForm && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Parceiro</label>
            <SearchableSelect
              options={partnerUsers.map((u: any) => ({ value: u.id, label: `${u.full_name || ""} — ${u.email}` }))}
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              placeholder="Selecione um parceiro..."
            />
            {partnerUsers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nenhum utilizador com perfil "Parceiro". Crie primeiro na gestão de utilizadores.</p>
            )}
          </div>

          {subEvents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Eventos / Cidades (deixe vazio para acesso total)</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedEventIds((prev) => prev.includes(eventId) ? prev.filter((i) => i !== eventId) : [...prev, eventId])}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedEventIds.includes(eventId) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {eventName} (Geral)
                </button>
                {subEvents.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedEventIds((prev) => prev.includes(sub.id) ? prev.filter((i) => i !== sub.id) : [...prev, sub.id])}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedEventIds.includes(sub.id) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => addAccessMutation.mutate()}
              disabled={!selectedUserId || addAccessMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addAccessMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Conceder
            </button>
            <button
              onClick={() => { setShowAddForm(false); setSelectedUserId(""); setSelectedEventIds([]); }}
              className="rounded-lg px-4 py-2 text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {Object.keys(accessByUser).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum parceiro tem acesso a este evento.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(accessByUser).map(([userId, records]) => (
            <div key={userId} className="glass rounded-xl p-4">
              <p className="text-sm font-semibold mb-2">{getUserName(userId)}</p>
              <div className="space-y-1.5">
                {records.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={r.is_active ? "text-foreground" : "text-muted-foreground line-through"}>{getEventName(r.event_id)}</span>
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {r.is_active ? "Ativo" : "Bloqueado"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleAccessMutation.mutate({ id: r.id, isActive: r.is_active })}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={r.is_active ? "Bloquear acesso" : "Ativar acesso"}
                      >
                        {r.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <button
                        onClick={() => { if (window.confirm("Remover acesso?")) removeAccessMutation.mutate(r.id); }}
                        className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
