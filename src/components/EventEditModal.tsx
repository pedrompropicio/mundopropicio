import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CityVenueSelector } from "@/components/CityVenueSelector";
import { formatDate } from "@/lib/mock-data";

interface EventEditModalProps {
  event: any;
  onClose: () => void;
}

export function EventEditModal({ event, onClose }: EventEditModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date);
  const [cityId, setCityId] = useState(event.city_id || "");
  const [venueId, setVenueId] = useState(event.venue_id || "");
  const [budget, setBudget] = useState(String(event.budget || ""));
  const [ticketsTotal, setTicketsTotal] = useState(String(event.tickets_total || ""));
  const [status, setStatus] = useState(event.status);
  const [plMode, setPlMode] = useState(event.pl_mode || "passive");

  const eventType = event.event_type || "simple";

  // Festival dates
  const { data: festivalDates = [] } = useQuery({
    queryKey: ["festival_dates_edit", event.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates" as any)
        .select("*")
        .eq("event_id", event.id)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: eventType === "festival",
  });

  const [localFestivalDates, setLocalFestivalDates] = useState<string[]>([]);
  const [newFestivalDate, setNewFestivalDate] = useState("");

  useEffect(() => {
    if (festivalDates.length > 0) {
      setLocalFestivalDates(festivalDates.map((fd: any) => fd.date));
    }
  }, [festivalDates]);

  // Venues map for location string
  const { data: venuesMap = {} } = useQuery({
    queryKey: ["venues_map"],
    queryFn: async () => {
      const { data } = await supabase.from("venues" as any).select("*");
      const map: Record<string, any> = {};
      (data ?? []).forEach((v: any) => { map[v.id] = v; });
      return map;
    },
  });

  const { data: citiesMap = {} } = useQuery({
    queryKey: ["cities_map"],
    queryFn: async () => {
      const { data } = await supabase.from("cities" as any).select("*");
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => { map[c.id] = c.name; });
      return map;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const venueName = venueId ? venuesMap[venueId]?.name : null;
      const cityName = cityId ? citiesMap[cityId] : null;
      const locationStr = [venueName, cityName].filter(Boolean).join(", ");

      const { error } = await supabase
        .from("events")
        .update({
          name,
          date,
          city_id: cityId || null,
          venue_id: venueId || null,
          location: locationStr || null,
          budget: parseFloat(budget) || 0,
          tickets_total: parseInt(ticketsTotal) || 0,
          status,
          pl_mode: plMode,
        } as any)
        .eq("id", event.id);
      if (error) throw error;

      // Update festival dates if applicable
      if (eventType === "festival") {
        // Delete existing
        await supabase.from("event_dates" as any).delete().eq("event_id", event.id);
        // Insert new
        if (localFestivalDates.length > 0) {
          const datesToInsert = localFestivalDates.map(d => ({
            event_id: event.id,
            date: d,
          }));
          const { error: dErr } = await supabase.from("event_dates" as any).insert(datesToInsert);
          if (dErr) throw dErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_detail", event.id] });
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["festival_dates", event.id] });
      toast({ title: "Evento atualizado com sucesso!" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !date) {
      toast({ title: "Preencha o nome e data do evento", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  const addFestivalDate = () => {
    if (newFestivalDate && !localFestivalDates.includes(newFestivalDate)) {
      setLocalFestivalDates([...localFestivalDates, newFestivalDate].sort());
      setNewFestivalDate("");
    }
  };

  const removeFestivalDate = (d: string) => {
    setLocalFestivalDates(localFestivalDates.filter(fd => fd !== d));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Editar Evento</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {eventType === "festival" ? "Data de Início *" : "Data *"}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="planning">Planeamento</option>
                <option value="active">Ativo</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          {/* P&L Mode */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Modo P&L</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlMode("active")}
                className={`rounded-lg border p-3 text-xs font-medium transition-all text-left ${
                  plMode === "active"
                    ? "border-success bg-success/10 text-success"
                    : "border-border bg-background text-muted-foreground hover:border-success/40"
                }`}
              >
                <span className="block font-semibold">P&L Ativo</span>
                <span className="block text-[10px] opacity-70 mt-0.5">Controla saldo por categoria</span>
              </button>
              <button
                type="button"
                onClick={() => setPlMode("passive")}
                className={`rounded-lg border p-3 text-xs font-medium transition-all text-left ${
                  plMode === "passive"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span className="block font-semibold">P&L Passivo</span>
                <span className="block text-[10px] opacity-70 mt-0.5">Transações livres</span>
              </button>
            </div>
          </div>

          {/* City / Venue */}
          {eventType !== "multi_day" && (
            <CityVenueSelector
              cityId={cityId}
              venueId={venueId}
              onCityChange={(id) => { setCityId(id); setVenueId(""); }}
              onVenueChange={(id) => setVenueId(id)}
            />
          )}

          {/* Festival dates */}
          {eventType === "festival" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Datas Adicionais do Festival</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  value={newFestivalDate}
                  onChange={(e) => setNewFestivalDate(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={addFestivalDate}
                  className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {localFestivalDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {localFestivalDates.map(d => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 text-purple-400 px-2.5 py-1 text-xs">
                      {formatDate(d)}
                      <button type="button" onClick={() => removeFestivalDate(d)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Orçamento (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Bilhetes (total)</label>
              <input
                type="number"
                min="0"
                value={ticketsTotal}
                onChange={(e) => setTicketsTotal(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {updateMutation.isPending ? "A guardar…" : "Guardar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
