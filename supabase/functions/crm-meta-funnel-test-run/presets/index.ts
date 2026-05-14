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
