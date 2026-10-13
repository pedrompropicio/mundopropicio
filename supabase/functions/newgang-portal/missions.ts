// Missões do Clube (D-ERP272) — helpers puros partilhados com os testes.

export const PROOF_BUCKET = "club-proofs";
export const ASSET_BUCKET = "club-mission-assets";
export const PROOF_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** "@New.Gang" → "new.gang"; null se vazio; lança "handle" se o formato for inválido. */
export function normalizeHandle(raw: string | null | undefined, net: "instagram" | "tiktok"): string | null {
  if (raw == null) return null;
  let h = String(raw).trim().toLowerCase();
  const m = h.match(/(?:instagram\.com|tiktok\.com)\/@?([^/?#]+)/);
  if (m) h = m[1];
  h = h.replace(/^@+/, "");
  if (!h) return null;
  const ok = net === "instagram" ? /^[a-z0-9._]{1,30}$/.test(h) : /^[a-z0-9._]{2,24}$/.test(h);
  if (!ok) throw new Error("handle");
  return h;
}

/** Normaliza o link de prova para comparar duplicados: https, sem query/fragmento, sem barra final. */
export function normalizeProofUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  // Em youtube.com/watch o id do vídeo está na query.
  const keep = host.endsWith("youtube.com") && u.pathname === "/watch" && u.searchParams.get("v") ? `?v=${u.searchParams.get("v")}` : "";
  return `https://${host}${u.pathname.replace(/\/+$/, "")}${keep}`;
}

export function missionActive(m: { status: string; starts_at: string | null; ends_at: string | null }, now = new Date()) {
  return m.status === "ativa" && (!m.starts_at || new Date(m.starts_at) <= now) && (!m.ends_at || new Date(m.ends_at) > now);
}

/** Forma pública de uma missão (sem contagens nem campos internos). */
export function publicMission(m: any, publicUrl: (path: string) => string) {
  const out: Record<string, unknown> = {
    id: m.id, kind: m.kind, title: m.title, description: m.description ?? null, network: m.network,
    points: m.points, proof_type: m.proof_type, mention: m.mention ?? null, hashtag: m.hashtag ?? null,
    caption_suggestion: m.caption_suggestion ?? null,
    assets: (Array.isArray(m.assets) ? m.assets : []).filter((a: any) => a?.path)
      .map((a: any) => ({ url: publicUrl(a.path), type: a.type === "video" ? "video" : "imagem", name: a.name ?? null })),
    ends_at: m.ends_at ?? null,
  };
  if (m.kind === "desafio") {
    out.finalist_points = m.finalist_points ?? null;
    out.winner_points = m.winner_points ?? null;
    out.judging_until = m.judging_until ?? null;
  }
  return out;
}

export function missionsFrom(rows: any[] | null, publicUrl: (p: string) => string, now = new Date()) {
  return {
    missions: (rows ?? []).filter((m) => missionActive(m, now))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((m) => publicMission(m, publicUrl)),
  };
}
