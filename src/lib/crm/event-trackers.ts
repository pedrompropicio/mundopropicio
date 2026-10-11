// D-ERP248 — helpers puros de event_trackers e da exclusividade evento/música.
export type TrackerPlatform = "meta" | "google" | "tiktok";
export const TRACKER_PLATFORMS: TrackerPlatform[] = ["meta", "google", "tiktok"];

/** Um valor por plataforma no formulário: o tracker mais recente de cada uma. */
export function trackerRowsToForm(
  rows: Array<{ platform: string; tracker_id: string; updated_at?: string | null }>,
): Record<TrackerPlatform, string> {
  const out: Record<TrackerPlatform, string> = { meta: "", google: "", tiktok: "" };
  const best: Partial<Record<TrackerPlatform, string>> = {};
  for (const r of rows) {
    if (!TRACKER_PLATFORMS.includes(r.platform as TrackerPlatform)) continue;
    const p = r.platform as TrackerPlatform;
    const at = r.updated_at ?? "";
    if (best[p] === undefined || at > best[p]!) { best[p] = at; out[p] = r.tracker_id; }
  }
  return out;
}

/** Pixel Meta para o deploy: linha de event_trackers; sem linha ⇒ null (cai na campanha-fonte). */
export function pickMetaPixel(
  rows: Array<{ platform: string; tracker_id: string; updated_at?: string | null; tracker_metadata?: any }>,
): { pixel_id: string; custom_event_type: string } | null {
  const meta = rows.filter((r) => r.platform === "meta").sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  if (!meta.length) return null;
  return { pixel_id: meta[0].tracker_id, custom_event_type: String(meta[0].tracker_metadata?.custom_event_type ?? "PURCHASE") };
}

/** Uma campanha tem evento OU música, nunca os dois (espelho do CHECK tiktok_campaign_event_xor_song). */
export function campaignLinkIsValid(c: { linked_event_id: string | null; linked_song_id: string | null }): boolean {
  return !(c.linked_event_id && c.linked_song_id);
}
