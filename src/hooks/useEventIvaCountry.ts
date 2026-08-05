import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_IVA_COUNTRY,
  getIvaRatesForCountry,
  getDefaultIvaRateForCountry,
  type IvaRate,
} from "@/lib/iva";

/**
 * Resolve o país fiscal aplicável a um evento: `events.city_id → cities.country`.
 *
 * Regra (ver .lovable/memory/features/iva-espanha.md): as TAXAS de IVA
 * aplicáveis são as do país da CIDADE DO EVENTO. Sub-eventos usam a sua
 * própria cidade (nunca a do Master). Sem evento ou sem cidade → Portugal.
 *
 * Não altera moeda, `amount` (continua BASE sem IVA em EUR) nem RLS.
 */
export async function fetchEventIvaCountry(eventId: string | null | undefined): Promise<string> {
  if (!eventId) return DEFAULT_IVA_COUNTRY;
  const { data, error } = await supabase
    .from("events")
    .select("city_id, cities:city_id(country)")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return DEFAULT_IVA_COUNTRY;
  const country = (data as any)?.cities?.country as string | null | undefined;
  return country || DEFAULT_IVA_COUNTRY;
}

export interface EventIvaCountry {
  /** Nome do país (ex.: "Portugal", "Espanha"). */
  country: string;
  /** Taxas aplicáveis, ordenadas como no mapa do país. */
  rates: IvaRate[];
  /** Taxa normal do país (default dos seletores). */
  defaultRate: IvaRate;
  /** true quando o evento acontece fora de Portugal. */
  isForeign: boolean;
  isLoading: boolean;
}

export function useEventIvaCountry(eventId: string | null | undefined): EventIvaCountry {
  const { data: country = DEFAULT_IVA_COUNTRY, isLoading } = useQuery({
    queryKey: ["event-iva-country", eventId ?? null],
    queryFn: () => fetchEventIvaCountry(eventId),
    enabled: !!eventId,
    staleTime: 10 * 60 * 1000,
  });

  return {
    country,
    rates: getIvaRatesForCountry(country),
    defaultRate: getDefaultIvaRateForCountry(country),
    isForeign: country !== DEFAULT_IVA_COUNTRY,
    isLoading,
  };
}
