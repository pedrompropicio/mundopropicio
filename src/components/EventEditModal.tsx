import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CityVenueSelector } from "@/components/CityVenueSelector";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/mock-data";
import { formatCityLabel } from "@/lib/country";

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
  const [absorbsAdminCosts, setAbsorbsAdminCosts] = useState<boolean>(!!event.absorbs_admin_costs);
  const [adminWindowStart, setAdminWindowStart] = useState<string>(event.admin_window_start || "");
  const [adminWindowEnd, setAdminWindowEnd] = useState<string>(event.admin_window_end || "");

  const eventType = event.event_type || "simple";
  const isSplit = !!event.parent_event_id;
  const canAbsorb = !isSplit; // Só Single ou Master podem absorver (trigger DB também valida)

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
      (data ?? []).forEach((c: any) => { map[c.id] = formatCityLabel(c.name, c.state); });
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
          // Absorção de custos administrativos (só Single/Master)
          absorbs_admin_costs: canAbsorb ? absorbsAdminCosts : false,
          admin_window_start: canAbsorb && absorbsAdminCosts && adminWindowStart ? adminWindowStart : null,
          admin_window_end: canAbsorb && absorbsAdminCosts && adminWindowEnd ? adminWindowEnd : null,
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
    if (canAbsorb && absorbsAdminCosts) {
      if (!adminWindowStart || !adminWindowEnd) {
        toast({ title: "Defina a janela administrativa (início e fim)", variant: "destructive" });
        return;
      }
      if (adminWindowStart > adminWindowEnd) {
        toast({ title: "A data de início da janela tem de ser ≤ à data de fim", variant: "destructive" });
        return;
      }
    }
    updateMutation.mutate();
  };

  // Toggle absorção: ao ativar pela 1ª vez, sugerir janela default (10 meses antes + 2 depois da data do evento)
  const handleToggleAbsorb = (checked: boolean) => {
    setAbsorbsAdminCosts(checked);
    if (checked && date && (!adminWindowStart || !adminWindowEnd)) {
      const eventDate = new Date(date + "T00:00:00");
      const start = new Date(eventDate); start.setMonth(start.getMonth() - 10);
      const end = new Date(eventDate); end.setMonth(end.getMonth() + 2);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      setAdminWindowStart(fmt(start));
      setAdminWindowEnd(fmt(end));
    }
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
              <DatePicker value={date} onChange={setDate} />
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

          {/* BP Mode */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Modo BP</label>
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
                <span className="block font-semibold">BP Ativo</span>
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
                <span className="block font-semibold">BP Passivo</span>
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
                <div className="flex-1">
                  <DatePicker value={newFestivalDate} onChange={setNewFestivalDate} placeholder="Nova data…" />
                </div>
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

          {/* Absorção de Custos Administrativos */}
          {canAbsorb ? (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="ev_absorbs_admin"
                  checked={absorbsAdminCosts}
                  onChange={(e) => handleToggleAbsorb(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <label htmlFor="ev_absorbs_admin" className="text-xs leading-relaxed cursor-pointer flex-1">
                  <span className="font-semibold text-primary">Este evento absorve custos administrativos</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Para empresas de evento único: contas administrativas marcadas no Plano de Contas (Group 10) com despesas dentro da janela abaixo serão alocadas ao DRE deste evento, em vez do DRE empresarial anual.
                  </span>
                </label>
              </div>

              {absorbsAdminCosts && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Janela: início</label>
                    <DatePicker value={adminWindowStart} onChange={setAdminWindowStart} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Janela: fim</label>
                    <DatePicker value={adminWindowEnd} onChange={setAdminWindowEnd} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-[10px] text-muted-foreground">
              Sub-eventos (Splits) não podem absorver custos administrativos — só o evento Master ou eventos Single.
            </div>
          )}

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
