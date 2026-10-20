import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { X } from "lucide-react";
import { CacheContractsPanel } from "@/components/CacheContractsPanel";

/**
 * "Pagamento do cachê" a partir da linha 2.1.01 do BP. Mesmo painel do modal de cachê.
 * Linha com cachê configurado usa a configuração; sem configuração (única porta), o utilizador escolhe o artista
 * e a linha clicada fica como linha de cachê da cidade.
 */
export function CachePaymentDialog({ forecast, canEdit, onClose }: { forecast: any; canEdit: boolean; onClose: () => void }) {
  const { data: config, isLoading } = useQuery({
    queryKey: ["cache-payment-config", forecast.cache_config_id],
    enabled: !!forecast.cache_config_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_configs").select("*").eq("id", forecast.cache_config_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active-min"],
    enabled: !forecast.cache_config_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const options = useMemo(() => suppliers.map((s: any) => ({ value: s.id, label: s.name })), [suppliers]);
  const [artist, setArtist] = useState<string>("");

  const effectiveConfig = forecast.cache_config_id ? config : artist ? { supplier_id: artist, withholding_rate: 25 } : null;

  return (
    <OverlayLayer className="modal-safe-overlay fixed inset-0 flex items-center justify-center bg-background/80">
      <div className="manual-modal-shell w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl flex flex-col">
        <div className="manual-modal-header flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <h3 className="font-semibold text-foreground">Pagamento do cachê</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 py-3 space-y-3">
          {!forecast.cache_config_id && (
            <div className="px-3 space-y-1">
              <label className="text-xs text-muted-foreground">Artista deste cachê</label>
              <SearchableSelect options={options} value={artist} onValueChange={setArtist} placeholder="Escolher artista…" />
            </div>
          )}
          {forecast.cache_config_id && isLoading && <p className="px-3 text-xs text-muted-foreground">A carregar…</p>}
          {effectiveConfig && (
            <CacheContractsPanel
              key={effectiveConfig.supplier_id}
              eventId={forecast.event_id}
              config={effectiveConfig}
              canEdit={canEdit}
              initialLineChoices={forecast.cache_config_id ? undefined : { [forecast.event_id]: forecast.id }}
            />
          )}
        </div>
      </div>
    </OverlayLayer>
  );
}
