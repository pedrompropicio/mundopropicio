// D-ERP277 — vídeos das edições no contrato público "history".
// Cada item sai só com { provider, title, url, poster_url }; nada mais do jsonb é exposto.

export const VIDEO_PROVIDERS = ["youtube", "instagram", "vimeo", "upload"] as const;
export type PublicVideo = { provider: (typeof VIDEO_PROVIDERS)[number]; title: string | null; url: string; poster_url: string | null };

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

export function publicVideos(raw: unknown): PublicVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicVideo[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const p = (v as any).provider;
    const url = httpsUrl((v as any).url);
    if (!VIDEO_PROVIDERS.includes(p) || !url) continue;
    const title = typeof (v as any).title === "string" && (v as any).title.trim() ? (v as any).title.trim() : null;
    out.push({ provider: p, title, url, poster_url: httpsUrl((v as any).poster_url) });
  }
  return out;
}

export function publicEditions(eds: any[] | null | undefined): any[] {
  return (eds ?? []).map((e) => ({ ...e, videos: publicVideos(e.videos) }));
}
