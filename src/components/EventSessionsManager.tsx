import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Check, X, Clock, Calendar, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/mock-data";
import { useAuth } from "@/contexts/AuthContext";
import HelpTooltip from "@/components/HelpTooltip";

interface Props {
  eventId: string;
  eventDate: string;
  eventStatus?: string;
}

interface SessionForm {
  date: string;
  label: string;
  start_time: string;
}

const emptyForm: SessionForm = { date: "", label: "", start_time: "" };

export function EventSessionsManager({ eventId, eventDate, eventStatus }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const canManage = (isAdmin || isManager) && eventStatus !== "completed";

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionForm>(emptyForm);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["event_sessions", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions" as any)
        .select("*")
        .eq("event_id", eventId)
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ form: f, id }: { form: SessionForm; id: string | null }) => {
      const payload = {
        event_id: eventId,
        date: f.date || eventDate,
        label: f.label || "Sessão",
        start_time: f.start_time || null,
        sort_order: id
          ? sessions.find((s: any) => s.id === id)?.sort_order ?? 1
          : sessions.length + 1,
      };
      if (id) {
        const { error } = await supabase.from("event_sessions" as any).update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_sessions" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["event_sessions", eventId] });
      toast({ title: vars.id ? "Sessão atualizada!" : "Sessão criada!" });
      cancel();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_sessions" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_sessions", eventId] });
      toast({ title: "Sessão eliminada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (s: any) => {
    setForm({ date: s.date, label: s.label, start_time: s.start_time || "" });
    setEditingId(s.id);
    setAdding(false);
  };

  const startAdd = () => {
    setForm({ ...emptyForm, date: eventDate });
    setAdding(true);
    setEditingId(null);
  };

  const copySessionMutation = useMutation({
    mutationFn: async (sourceSession: any) => {
      const { data: newSession, error: sessionError } = await supabase
        .from("event_sessions" as any)
        .insert({
          event_id: eventId,
          date: sourceSession.date,
          label: `${sourceSession.label} (cópia)`,
          start_time: sourceSession.start_time || null,
          sort_order: sessions.length + 1,
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;

      const { data: sessionZones, error: sessionZonesError } = await supabase
        .from("event_ticket_zones" as any)
        .select("id, name, total_capacity")
        .eq("event_id", eventId)
        .eq("session_id", sourceSession.id)
        .order("created_at");
      if (sessionZonesError) throw sessionZonesError;

      let zonesToCopy = sessionZones ?? [];

      if (zonesToCopy.length === 0) {
        const { data: fallbackZones, error: fallbackZonesError } = await supabase
          .from("event_ticket_zones" as any)
          .select("id, name, total_capacity")
          .eq("event_id", eventId)
          .is("session_id", null)
          .order("created_at");
        if (fallbackZonesError) throw fallbackZonesError;
        zonesToCopy = fallbackZones ?? [];
      }

      if (zonesToCopy.length === 0) {
        return { copiedZones: 0, copiedLots: 0 };
      }

      const zoneIds = zonesToCopy.map((zone: any) => zone.id);
      const { data: sourceLots, error: sourceLotsError } = await supabase
        .from("event_ticket_lots" as any)
        .select("zone_id, name, lot_number, price, quantity, iva_rate")
        .in("zone_id", zoneIds)
        .order("lot_number");
      if (sourceLotsError) throw sourceLotsError;

      const lotsByZoneId = new Map<string, any[]>();
      (sourceLots ?? []).forEach((lot: any) => {
        const currentLots = lotsByZoneId.get(lot.zone_id) ?? [];
        currentLots.push(lot);
        lotsByZoneId.set(lot.zone_id, currentLots);
      });

      let copiedLots = 0;

      for (const zone of zonesToCopy as any[]) {
        const { data: newZone, error: newZoneError } = await supabase
          .from("event_ticket_zones" as any)
          .insert({
            event_id: eventId,
            session_id: (newSession as any).id,
            name: zone.name,
            total_capacity: zone.total_capacity,
          })
          .select("id")
          .single();
        if (newZoneError) throw newZoneError;

        const lotsForZone = lotsByZoneId.get(zone.id) ?? [];
        if (lotsForZone.length > 0) {
          const { error: insertLotsError } = await supabase.from("event_ticket_lots" as any).insert(
            lotsForZone.map((lot: any) => ({
              zone_id: (newZone as any).id,
              name: lot.name,
              lot_number: lot.lot_number,
              price: lot.price,
              quantity: lot.quantity,
              iva_rate: lot.iva_rate,
            })),
          );
          if (insertLotsError) throw insertLotsError;
          copiedLots += lotsForZone.length;
        }
      }

      return { copiedZones: zonesToCopy.length, copiedLots };
    },
    onSuccess: ({ copiedZones, copiedLots }) => {
      queryClient.invalidateQueries({ queryKey: ["event_sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId] });
      toast({
        title: copiedZones > 0 ? "Sessão copiada com bilheteira!" : "Sessão copiada!",
        description:
          copiedZones > 0
            ? `${copiedZones} zona${copiedZones !== 1 ? "s" : ""} e ${copiedLots} lote${copiedLots !== 1 ? "s" : ""} copiados.`
            : "A sessão foi criada, mas não havia zonas/lotes para copiar.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao copiar sessão", description: err.message, variant: "destructive" });
    },
  });

  const copySession = (s: any) => {
    if (confirm("Copiar esta sessão incluindo todas as zonas, lotes, quantidades e preços?")) {
      copySessionMutation.mutate(s);
    }
  };

  const handleSave = () => {
    if (!form.label) {
      toast({ title: "Insira um nome para a sessão", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ form, id: editingId });
  };

  // Group sessions by date
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    sessions.forEach((s: any) => {
      const d = s.date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions]);

  const renderForm = () => (
    <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
          <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da Sessão *</label>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Ex: Sessão 1 — 15h"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") cancel();
            }}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário</label>
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saveMutation.isPending ? "A guardar…" : editingId ? "Atualizar" : "Criar Sessão"}
        </button>
        <button onClick={cancel} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" /> Sessões
          <HelpTooltip text="Sessões representam espetáculos individuais dentro de um evento. Cada sessão pode ter a sua própria bilheteira (zonas e lotes). Um evento pode ter múltiplas sessões no mesmo dia ou em dias diferentes." size={13} />
        </h3>
        {canManage && (
          <button
            onClick={startAdd}
            disabled={adding}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Nova Sessão
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">A carregar…</p>
      ) : sessions.length === 0 && !adding ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Sem sessões configuradas.</p>
          <p className="text-xs text-muted-foreground">Crie sessões para gerir bilhetes por espetáculo/horário.</p>
          {canManage && (
            <button onClick={startAdd} className="text-xs text-primary hover:underline">
              Criar primeira sessão →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, dateSessions]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">{formatDate(date)}</span>
                <span className="text-[10px] text-muted-foreground">({dateSessions.length} sessão{dateSessions.length !== 1 ? "ões" : ""})</span>
              </div>
              <div className="space-y-1.5 ml-5">
                {dateSessions.map((s: any) => {
                  if (editingId === s.id) return <div key={s.id}>{renderForm()}</div>;
                  return (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 hover:bg-muted/20 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium">{s.label}</span>
                        {s.start_time && (
                          <span className="text-xs text-muted-foreground">{s.start_time.slice(0, 5)}</span>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => copySession(s)} className="rounded p-1 hover:bg-secondary" title="Copiar sessão">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => startEdit(s)} className="rounded p-1 hover:bg-secondary" title="Editar">
                            <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                          <button
                            onClick={() => { if (confirm("Eliminar esta sessão? As zonas vinculadas perderão a associação.")) deleteMutation.mutate(s.id); }}
                            className="rounded p-1 hover:bg-destructive/20"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && renderForm()}
    </div>
  );
}
