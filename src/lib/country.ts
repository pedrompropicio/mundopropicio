// Mapeamento ISO (companies.country: 'PT'/'BR') → nome usado em cities.country
// ('Portugal'/'Brasil'). Centralizado para o CityVenueSelector e outros sítios.

export const COUNTRY_ISO_TO_NAME: Record<string, string> = {
  PT: "Portugal",
  BR: "Brasil",
};

/** Devolve o nome de país a usar em cities.country, ou null se não mapear
 *  (nesse caso o seletor mostra todas as cidades como fallback). */
export function countryIsoToName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return COUNTRY_ISO_TO_NAME[iso.toUpperCase()] ?? null;
}

/** Formato de apresentação de cidade: "Cidade - UF" quando há state, senão "Cidade". */
export function formatCityLabel(name: string, state?: string | null): string {
  const s = (state ?? "").trim();
  return s ? `${name} - ${s}` : name;
}
