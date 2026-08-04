import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { countryIsoToName, formatCityLabel } from "@/lib/country";

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
  const [showForeign, setShowForeign] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newCityState, setNewCityState] = useState("");
  const [newCityCountry, setNewCityCountry] = useState("");
  const [newVenueName, setNewVenueName] = useState("");
  const queryClient = useQueryClient();

  const { company } = useCompany();
  const countryName = countryIsoToName(company?.country); // 'Portugal' | 'Brasil' | 'Espanha' | null

  // País da nova cidade: com toggle ativo é escolhido; sem toggle é o da empresa.
  const effectiveNewCountry = showForeign
    ? (newCityCountry || countryName || "Portugal")
    : (countryName ?? "Portugal");
  const isBR = effectiveNewCountry === "Brasil";

  const { data: cities = [] } = useQuery({
    queryKey: ["cities", showForeign ? "all" : (countryName ?? "all")],
    queryFn: async () => {
      let q = supabase.from("cities" as any).select("*").order("name");
      if (countryName && !showForeign) q = q.eq("country", countryName);
      const { data, error } = await q;
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

  const cityOptionLabel = (c: any) => {
    const base = formatCityLabel(c.name, c.state);
    if (showForeign && c.country && c.country !== countryName) return `${base} · ${c.country}`;
    return base;
  };

  const handleCreateCity = async () => {
    const name = newCityName.trim();
    if (!name) return;
    if (isBR && newCityState.trim().length !== 2) return; // UF obrigatória no BR
    const state = isBR ? newCityState.trim().toUpperCase() : null;
    const country = effectiveNewCountry;

    const payload: any = { name, country };
    if (state) payload.state = state;

    const { data, error } = await supabase.from("cities" as any).insert(payload).select().single();
    if (error) {
      // Pode já existir — tenta procurar (case-insensitive + state)
      let qy: any = (supabase.from("cities" as any).select("*") as any)
        .eq("country", country)
        .ilike("name", name);
      qy = state ? qy.eq("state", state) : qy.is("state", null);
      const { data: existing } = await qy.maybeSingle();
      if (existing) onCityChange((existing as any).id);
    } else {
      onCityChange((data as any).id);
    }
    queryClient.invalidateQueries({ queryKey: ["cities"] });
    queryClient.invalidateQueries({ queryKey: ["cities_map"] });
    setNewCityName("");
    setNewCityState("");
    setNewCityCountry("");
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
        onVenueChange((existing as any).id);
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
            {showForeign && (
              <select
                value={effectiveNewCountry}
                onChange={(e) => setNewCityCountry(e.target.value)}
                className={`${inputClass} !w-32 shrink-0`}
              >
                {KNOWN_COUNTRY_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
            {isBR && (
              <input
                value={newCityState}
                onChange={(e) => setNewCityState(e.target.value.toUpperCase().slice(0, 2))}
                className={`${inputClass} !w-16 shrink-0 uppercase`}
                placeholder="UF"
                maxLength={2}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateCity())}
              />
            )}
            <button type="button" onClick={handleCreateCity} className="rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              OK
            </button>
            <button type="button" onClick={() => { setShowNewCity(false); setNewCityState(""); setNewCityCountry(""); }} className="text-xs text-muted-foreground hover:text-foreground">
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
                <option key={c.id} value={c.id}>{cityOptionLabel(c)}</option>
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
        {countryName && (
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showForeign}
              onChange={(e) => setShowForeign(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            Mostrar cidades de outros países
          </label>
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
