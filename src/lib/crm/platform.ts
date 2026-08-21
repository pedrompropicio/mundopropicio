// Plataformas de tráfego pago do dashboard unificado (Fase 3B).
// A cor nunca vai sozinha na UI: vem sempre com o nome da plataforma em texto.
import type { CampaignRow, InsightRow } from "@/components/crm/dashboard/types";

export type AdPlatform = "meta" | "google";
export type PlatformFilter = "all" | AdPlatform;

export const PLATFORM_LABEL: Record<AdPlatform, string> = {
  meta: "Meta",
  google: "Google",
};

/** Tokens já validados para daltonismo (ver --chart-1/--chart-2 em index.css). */
export const PLATFORM_COLOR_VAR: Record<AdPlatform, string> = {
  meta: "hsl(var(--chart-1))",
  google: "hsl(var(--chart-2))",
};

export function platformOf(row: { platform?: AdPlatform | null } | null | undefined): AdPlatform {
  return row?.platform === "google" ? "google" : "meta";
}

export function matchesPlatform(
  row: { platform?: AdPlatform | null },
  filter: PlatformFilter,
): boolean {
  return filter === "all" || platformOf(row) === filter;
}

/** Separa campanhas por plataforma preservando a ordem. */
export function splitCampaignsByPlatform(campaigns: CampaignRow[]) {
  const meta: CampaignRow[] = [];
  const google: CampaignRow[] = [];
  for (const c of campaigns) (platformOf(c) === "google" ? google : meta).push(c);
  return { meta, google };
}

/** Moeda distinta encontrada num conjunto de linhas de insights (null se divergirem). */
export function singleCurrency(rows: InsightRow[], fallback?: string | null): string | null {
  const set = new Set<string>();
  for (const r of rows) if (r.currency) set.add(r.currency);
  if (set.size === 0) return fallback ?? null;
  if (set.size > 1) return null;
  return [...set][0];
}
