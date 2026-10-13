// Montagem pura das leituras públicas (site / lineup / history / bundle), partilhada com os testes.
import { buildLineup, type Act, type Reveal } from "./lineup.ts";

export type Want = { site?: boolean; lineup?: boolean; history?: boolean };
export type LineupRaw = { reveals: Reveal[]; acts: Act[]; lineupComplete: boolean } | null;
export const EMPTY_LINEUP = { state: "expectativa", latest_reveal: null, confirmed: [], next_reveal: null };

export function lineupFrom(raw: LineupRaw, isMember: boolean, now = new Date()) {
  if (!raw) return EMPTY_LINEUP;
  return buildLineup({ ...raw, now, isMember });
}

const one = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** row = portal_sites com embeds; pubRows = portal_sites_public do domínio; eds = festival_editions_public. */
export function assemblePublic(want: Want, row: any, pubRows: any[] | null, eds: any[] | null) {
  const ev = row.event_id ? row.events : null;
  const em = ev ? one(ev.event_marketing) : null;
  const out: { site?: unknown; lineupRaw?: LineupRaw; history?: unknown } = {};
  if (want.site) {
    const levels = [...(row.club_levels ?? [])].sort((a: any, b: any) => a.min_points - b.min_points);
    const rules = (row.club_point_rules ?? []).filter((r: any) => r.active)
      .sort((a: any, b: any) => a.points - b.points).map(({ active: _a, ...r }: any) => r);
    out.site = {
      site: (pubRows ?? []).find((r: any) => r.id === row.id) ?? null,
      trackers: ev ? (ev.event_trackers ?? []) : [],
      ticketing: ev ? { url: ev.ticketing_url ?? null, lots: em?.ticket_lots ?? null } : null,
      club: { levels, rules },
    };
  }
  if (want.lineup) {
    out.lineupRaw = ev ? {
      reveals: ev.event_lineup_reveals ?? [],
      acts: (ev.event_lineups ?? []).filter((a: any) => a.reveal_id != null),
      lineupComplete: !!em?.lineup_complete,
    } : null;
  }
  if (want.history) out.history = { editions: (eds ?? []).filter((e: any) => e.brand_key === row.brand_key) };
  return out;
}

/** Resposta da ação "bundle": line-up sempre público. */
export function bundleFrom(p: ReturnType<typeof assemblePublic>, now = new Date()) {
  return { site: p.site, lineup: lineupFrom(p.lineupRaw ?? null, false, now), history: p.history };
}
