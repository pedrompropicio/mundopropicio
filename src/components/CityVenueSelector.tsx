import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";

interface CityVenueSelectorProps {
  cityId: string;
  venueId: string;
  onCityChange: (id: string) => void;
  onVenueChange: (id: string) => void;
  compact?: boolean;
}

export function CityVenueSelector({ cityId, venueId, onCityChange, onVenueChange, compact }: CityVenueSelectorProps) {
  const [showNewCity, setShowNewCity] = useState(false);
  const [showNewVenue, setShowNewVenue] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newVenueName, setNewVenueName] = useState("");
  const queryClient = useQueryClient();

  const { data: cities = [] } = useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cities" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["venues", cityId],
    queryFn: async () => {
      if (!cityId) return [];
      const { data, error } = await (supabase.from("venues" as any).select("*") as any)
        .eq("city_id", cityId)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!cityId,
  });

  const handleCreateCity = async () => {
    if (!newCityName.trim()) return;
    const { data, error } = await supabase.from("cities" as any).insert({ name: newCityName.trim() } as any).select().single();
    if (error) {
      // Might already exist
      const { data: existing } = await (supabase.from("cities" as any).select("*") as any).eq("name", newCityName.trim()).single();
      if (existing) {
        onCityChange(existing.id);
      }
    } else {
      onCityChange((data as any).id);
    }
    queryClient.invalidateQueries({ queryKey: ["cities"] });
    queryClient.invalidateQueries({ queryKey: ["cities_map"] });
    setNewCityName("");
    setShowNewCity(false);
  };

  const handleCreateVenue = async () => {
    if (!newVenueName.trim() || !cityId) return;
    const { data, error } = await supabase.from("venues" as any).insert({ name: newVenueName.trim(), city_id: cityId } as any).select().single();
    if (error) {
      const { data: existing } = await (supabase.from("venues" as any).select("*") as any)
        .eq("city_id", cityId)
        .eq("name", newVenueName.trim())
        .single();
      if (existing) {
        onVenueChange(existing.id);
      }
    } else {
      onVenueChange((data as any).id);
    }
    queryClient.invalidateQueries({ queryKey: ["venues", cityId] });
    queryClient.invalidateQueries({ queryKey: ["venues_map"] });
    setNewVenueName("");
    setShowNewVenue(false);
  };

  const inputClass = compact
    ? "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
    : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* City */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Cidade</label>
        {showNewCity ? (
          <div className="flex gap-2">
            <input
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              className={inputClass}
              placeholder="Nome da cidade"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateCity())}
            />
            <button type="button" onClick={handleCreateCity} className="rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              OK
            </button>
            <button type="button" onClick={() => setShowNewCity(false)} className="text-xs text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={cityId}
              onChange={(e) => onCityChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecionar cidade…</option>
              {cities.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCity(true)}
              className="shrink-0 rounded-lg bg-secondary p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              title="Nova cidade"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Venue */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Sala / Local</label>
        {showNewVenue ? (
          <div className="flex gap-2">
            <input
              value={newVenueName}
              onChange={(e) => setNewVenueName(e.target.value)}
              className={inputClass}
              placeholder="Nome da sala/local"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateVenue())}
            />
            <button type="button" onClick={handleCreateVenue} className="rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              OK
            </button>
            <button type="button" onClick={() => setShowNewVenue(false)} className="text-xs text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={venueId}
              onChange={(e) => onVenueChange(e.target.value)}
              className={inputClass}
              disabled={!cityId}
            >
              <option value="">{cityId ? "Selecionar local…" : "Selecione uma cidade primeiro"}</option>
              {venues.map((v: any) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewVenue(true)}
              disabled={!cityId}
              className="shrink-0 rounded-lg bg-secondary p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Novo local"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
