import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { countryIsoToName, formatCityLabel, KNOWN_COUNTRY_NAMES } from "@/lib/country";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface CityVenueSelectorProps {
  cityId: string;
  venueId: string;
  onCityChange: (id: string) => void;
  onVenueChange: (id: string) => void;
  compact?: boolean;
}

export function CityVenueSelector({ cityId, venueId, onCityChange, onVenueChange, compact }: CityVenueSelectorProps) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const countryName = countryIsoToName(company?.country); // 'Portugal' | 'Brasil' | 'Espanha' | null

  // Diálogo de criação de cidade (aberto a partir do rodapé do dropdown)
  const [newCityName, setNewCityName] = useState<string | null>(null);
  const [newCityCountry, setNewCityCountry] = useState(countryName ?? "Portugal");
  const [newCityState, setNewCityState] = useState("");
  const [saving, setSaving] = useState(false);
  const isBR = newCityCountry === "Brasil";

  const { data: allCities = [] } = useQuery({
    queryKey: ["cities", "all"],
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

  // Cidades do país da empresa primeiro (sem heading), depois estrangeiras
  // agrupadas por país e etiquetadas "Nome · País".
  const cityOptions: SearchableSelectOption[] = useMemo(() => {
    const local: SearchableSelectOption[] = [];
    const foreignByCountry = new Map<string, SearchableSelectOption[]>();

    for (const c of allCities as any[]) {
      const base = formatCityLabel(c.name, c.state);
      const isLocal = !countryName || c.country === countryName;
      const opt: SearchableSelectOption = {
        value: c.id,
        label: isLocal ? base : `${base} · ${c.country}`,
        searchText: [c.name, c.state, c.country].filter(Boolean).join(" "),
        group: isLocal ? undefined : c.country || "Outros países",
      };
      if (isLocal) local.push(opt);
      else {
        const key = c.country || "Outros países";
        if (!foreignByCountry.has(key)) foreignByCountry.set(key, []);
        foreignByCountry.get(key)!.push(opt);
      }
    }

    const foreign = [...foreignByCountry.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt"))
      .flatMap(([, items]) => items);

    return [...local, ...foreign];
  }, [allCities, countryName]);

  const venueOptions: SearchableSelectOption[] = useMemo(
    () => venues.map((v: any) => ({ value: v.id, label: v.name, searchText: v.address ?? undefined })),
    [venues]
  );

  const openCreateCity = (text: string) => {
    setNewCityName(text);
    setNewCityCountry(countryName ?? "Portugal");
    setNewCityState("");
  };

  const handleCreateCity = async () => {
    const name = (newCityName ?? "").trim();
    if (!name) return;
    if (isBR && newCityState.trim().length !== 2) return; // UF obrigatória no BR
    const state = isBR ? newCityState.trim().toUpperCase() : null;
    const country = newCityCountry;

    setSaving(true);
    try {
      const payload: any = { name, country };
      if (state) payload.state = state;

      const { data, error } = await supabase.from("cities" as any).insert(payload).select().single();
      if (error) {
        // Índice único: se já existir, seleciona a existente em vez de duplicar.
        let qy: any = (supabase.from("cities" as any).select("*") as any)
          .eq("country", country)
          .ilike("name", name);
        qy = state ? qy.eq("state", state) : qy.is("state", null);
        const { data: existing } = await qy.maybeSingle();
        if (existing) onCityChange((existing as any).id);
      } else {
        onCityChange((data as any).id);
      }
      await queryClient.invalidateQueries({ queryKey: ["cities"] });
      queryClient.invalidateQueries({ queryKey: ["cities_map"] });
      setNewCityName(null);
      setNewCityState("");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVenue = async (text: string) => {
    const name = text.trim();
    if (!name || !cityId) return;
    const { data, error } = await supabase
      .from("venues" as any)
      .insert({ name, city_id: cityId } as any)
      .select()
      .single();
    if (error) {
      const { data: existing } = await (supabase.from("venues" as any).select("*") as any)
        .eq("city_id", cityId)
        .ilike("name", name)
        .maybeSingle();
      if (existing) onVenueChange((existing as any).id);
    } else {
      onVenueChange((data as any).id);
    }
    await queryClient.invalidateQueries({ queryKey: ["venues", cityId] });
    queryClient.invalidateQueries({ queryKey: ["venues_map"] });
  };

  const inputClass = compact
    ? "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
    : "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Cidade */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Cidade</label>
        <SearchableSelect
          options={cityOptions}
          value={cityId}
          onValueChange={onCityChange}
          placeholder="Selecionar cidade…"
          searchPlaceholder="Pesquisar cidade…"
          emptyMessage="Nenhuma cidade encontrada."
          triggerClassName={compact ? "py-1.5" : undefined}
          onCreateOption={openCreateCity}
          createLabel={(t) => `Criar cidade "${t}"…`}
        />
      </div>

      {/* Sala / Local */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Sala / Local</label>
        <SearchableSelect
          options={venueOptions}
          value={venueId}
          onValueChange={onVenueChange}
          disabled={!cityId}
          placeholder={cityId ? "Selecionar local…" : "Selecione uma cidade primeiro"}
          searchPlaceholder="Pesquisar sala/local…"
          emptyMessage="Nenhum local encontrado."
          triggerClassName={compact ? "py-1.5" : undefined}
          onCreateOption={handleCreateVenue}
          createLabel={(t) => `Criar sala "${t}"…`}
        />
      </div>

      {/* Diálogo: país (e UF no Brasil) da nova cidade */}
      <Dialog open={newCityName !== null} onOpenChange={(o) => !o && setNewCityName(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar cidade “{newCityName}”</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">País</Label>
              <select
                value={newCityCountry}
                onChange={(e) => setNewCityCountry(e.target.value)}
                className={inputClass}
              >
                {KNOWN_COUNTRY_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            {isBR && (
              <div className="space-y-1.5">
                <Label className="text-xs">UF (2 letras)</Label>
                <input
                  value={newCityState}
                  onChange={(e) => setNewCityState(e.target.value.toUpperCase().slice(0, 2))}
                  className={`${inputClass} uppercase`}
                  placeholder="SP"
                  maxLength={2}
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewCityName(null)}>Cancelar</Button>
            <Button onClick={handleCreateCity} disabled={saving || (isBR && newCityState.trim().length !== 2)}>
              Criar cidade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
