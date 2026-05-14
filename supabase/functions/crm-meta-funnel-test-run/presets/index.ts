// Funnel Test 360 — registry de flow presets por bilheteira.
//
// **Como adicionar nova bilheteira (Blueticket, BOL, See Tickets, etc.):**
//   1. Criar `presets/<bilheteira>.ts` exportando `<BILHETEIRA>_PRESET: FlowPreset`
//   2. Importar e adicionar ao array `PRESETS` abaixo
//   3. Zero alterações ao `_puppeteer_script.ts` core
//
// O dispatch é puramente por hostname (lookup O(1) via map populado a
// import-time).

import type { FlowPreset } from "./types.ts";
import { TICKETLINE_PRESET } from "./ticketline.ts";

export { TICKETLINE_PRESET };
export type { FlowPreset, FlowStep } from "./types.ts";

/** Registry — adicionar novas bilheteiras aqui. */
const PRESETS: FlowPreset[] = [
  TICKETLINE_PRESET,
];

/** hostname → preset lookup, populado a import-time. */
const PRESETS_BY_DOMAIN: Record<string, FlowPreset> = (() => {
  const map: Record<string, FlowPreset> = {};
  for (const p of PRESETS) {
    const hosts = p.domains ?? [p.domain];
    for (const h of hosts) {
      map[h.toLowerCase()] = p;
    }
  }
  return map;
})();

/**
 * Devolve o preset que faz match com o hostname do URL, ou null se nenhuma
 * bilheteira suportada matchar.
 */
export function selectPreset(url: string): FlowPreset | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PRESETS_BY_DOMAIN[hostname] ?? null;
  } catch (_) {
    return null;
  }
}

/** Lista de nomes de bilheteiras suportadas (para mensagens de erro). */
export const SUPPORTED_PROVIDERS: string[] = PRESETS.map((p) => p.name);

/**
 * Lista canónica de provider IDs conhecidos pelo Funnel Test 360.
 * Inclui presets implementados (subset de PRESETS) + futuros que ainda não têm
 * preset mas são reconhecidos como bilheteira válida (ex: para classificação
 * de eventos em public.events.ticketing_provider antes do preset existir).
 *
 * **Deve manter-se alinhado** com o CHECK constraint em
 * `supabase/migrations/20260514170000_events_ticketing_url.sql`:
 *   `events_ticketing_provider_check` em public.events.
 *
 * Para adicionar novo provider:
 *  1. Adicionar string aqui
 *  2. Adicionar string no CHECK constraint (via nova migration)
 *  3. Eventualmente criar preset em `presets/<provider>.ts` + registrar em PRESETS
 */
export const PROVIDERS_KNOWN = [
  "ticketline",
  "blueticket",
  "bol",
  "see_tickets",
  "fnac_tickets",
  "eventbrite",
  "ingresse",
  "sympla",
  "other",
] as const;

export type ProviderId = (typeof PROVIDERS_KNOWN)[number];
