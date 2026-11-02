import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import type { CompanyLocale } from "@/lib/company-locale";
import {
  DEFAULT_IVA_COUNTRY,
  getIvaRatesForCountries,
  getDefaultIvaRateForCountries,
  type IvaRate,
} from "@/lib/iva";

/**
 * Resolve o(s) país(es) fiscal(is) aplicáveis a um evento.
 *
 * Regra (ver .lovable/memory/features/iva-espanha.md):
 * A política da empresa prevalece sobre as taxas geográficas no hook.
 * 1. Evento com `city_id` → país dessa cidade.
 * 2. Evento sem cidade que é master de turnê → países distintos das cidades
 *    dos sub-eventos (`parent_event_id = id`). Um só país → esse país; países
 *    mistos → união ordenada das taxas, default PT.
 * 3. Sem evento, sem cidade e sem sub-eventos com cidade → Portugal.
 *
 * Esta leitura só resolve metadados geográficos; não altera valores nem RLS.
 */
export async function fetchEventIvaCountries(eventId: string | null | undefined): Promise<string[]> {
  if (!eventId) return [DEFAULT_IVA_COUNTRY];

  const { data, error } = await supabase
    .from("events")
    .select("city_id, cities:city_id(country)")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return [DEFAULT_IVA_COUNTRY];

  const own = (data as any)?.cities?.country as string | null | undefined;
  if (own) return [own];

  // Master de turnê: a cidade vive nos sub-eventos.
  const { data: subs } = await supabase
    .from("events")
    .select("city_id, cities:city_id(country)")
    .eq("parent_event_id", eventId);

  const countries = Array.from(
    new Set(
      (subs ?? [])
        .map((s: any) => s?.cities?.country as string | null | undefined)
        .filter((c): c is string => !!c),
    ),
  );

  return countries.length ? countries : [DEFAULT_IVA_COUNTRY];
}

/** Retrocompatível: devolve um único país (o primeiro resolvido). */
export async function fetchEventIvaCountry(eventId: string | null | undefined): Promise<string> {
  const countries = await fetchEventIvaCountries(eventId);
  return countries[0] ?? DEFAULT_IVA_COUNTRY;
}

export interface EventIvaCountry {
  /** Política efetiva; contexto indisponível mantém as regras legadas. */
  ivaPolicy: CompanyLocale["ivaPolicy"];
  /** Nome do país (ex.: "Portugal", "Espanha"). Em turnê mista, o primeiro. */
  country: string;
  /** Todos os países envolvidos (turnê multi-país pode ter vários). */
  countries: string[];
  /** Taxas aplicáveis (união quando há vários países). */
  rates: IvaRate[];
  /** Taxa normal a usar como default dos seletores. */
  defaultRate: IvaRate;
  /** true quando há pelo menos um país fora de Portugal. */
  isForeign: boolean;
  isLoading: boolean;
}

export function useEventIvaCountry(eventId: string | null | undefined): EventIvaCountry {
  const locale = useCompanyLocale();
  const ivaPolicy = locale.status === "available" ? locale.ivaPolicy : "pt";
  const noIva = ivaPolicy === "none";
  const { data: countries = [DEFAULT_IVA_COUNTRY], isLoading } = useQuery({
    queryKey: ["event-iva-country", eventId ?? null],
    queryFn: () => fetchEventIvaCountries(eventId),
    enabled: !!eventId && !noIva,
    staleTime: 10 * 60 * 1000,
  });

  return {
    ivaPolicy,
    country: countries[0] ?? DEFAULT_IVA_COUNTRY,
    countries,
    rates: noIva ? [0] : getIvaRatesForCountries(countries),
    defaultRate: noIva ? 0 : getDefaultIvaRateForCountries(countries),
    isForeign: countries.some((c) => c !== DEFAULT_IVA_COUNTRY),
    isLoading: !noIva && isLoading,
  };
}
