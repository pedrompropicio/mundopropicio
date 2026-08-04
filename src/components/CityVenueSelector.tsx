import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { countryIsoToName, formatCityLabel, KNOWN_COUNTRY_NAMES } from "@/lib/country";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";

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

  // Busca sempre TODAS as cidades (uma só cache-key) e filtra no cliente conforme
  // o toggle — evita depender de refetch por mudança de queryKey.
  const { data: allCities = [], refetch: refetchCities } = useQuery({
    queryKey: ["cities", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cities" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const cities = useMemo(() => {
    if (showForeign || !countryName) return allCities;
    // A cidade já selecionada mantém-se na lista mesmo se for estrangeira.
    return allCities.filter((c: any) => c.country === countryName || c.id === cityId);
  }, [allCities, showForeign, countryName, cityId]);

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
    if (c.country && countryName && c.country !== countryName) return `${base} · ${c.country}`;
    return base;
  };

  const cityOptions: SearchableSelectOption[] = useMemo(
    () =>
      cities.map((c: any) => ({
        value: c.id,
        label: cityOptionLabel(c),
        searchText: [c.name, c.state, c.country].filter(Boolean).join(" "),
      })),
    [cities, countryName]
  );

  const venueOptions: SearchableSelectOption[] = useMemo(
    () => venues.map((v: any) => ({ value: v.id, label: v.name, searchText: v.address ?? undefined })),
    [venues]
  );


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
            <Button type="button" size="sm" onClick={handleCreateCity}>
              OK
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => { setShowNewCity(false); setNewCityState(""); setNewCityCountry(""); }} aria-label="Cancelar nova cidade">
              ✕
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <SearchableSelect
              options={cityOptions}
              value={cityId}
              onValueChange={onCityChange}
              placeholder="Selecionar cidade…"
              searchPlaceholder="Pesquisar cidade…"
              emptyMessage="Nenhuma cidade encontrada."
              className="flex-1 min-w-0"
              triggerClassName={compact ? "py-1.5" : undefined}
            />

            <Button
              type="button"
              onClick={() => setShowNewCity(true)}
              variant="secondary"
              size="icon"
              className="shrink-0"
              title="Criar nova cidade"
              aria-label="Criar nova cidade"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
        {countryName && (
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showForeign}
               onChange={(e) => {
                 const checked = e.target.checked;
                 setShowForeign(checked);
                 setShowNewCity(false);
                 setNewCityName("");
                 setNewCityState("");
                 setNewCityCountry("");
                 if (checked) void refetchCities();
               }}
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
            <Button type="button" size="sm" onClick={handleCreateVenue}>
              OK
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => setShowNewVenue(false)} aria-label="Cancelar novo local">
              ✕
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <SearchableSelect
              options={venueOptions}
              value={venueId}
              onValueChange={onVenueChange}
              disabled={!cityId}
              placeholder={cityId ? "Selecionar local…" : "Selecione uma cidade primeiro"}
              searchPlaceholder="Pesquisar sala/local…"
              emptyMessage="Nenhum local encontrado."
              className="flex-1 min-w-0"
              triggerClassName={compact ? "py-1.5" : undefined}
            />

            <Button
              type="button"
              onClick={() => setShowNewVenue(true)}
              disabled={!cityId}
              variant="secondary"
              size="icon"
              className="shrink-0"
              title="Novo local"
              aria-label="Criar novo local"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
