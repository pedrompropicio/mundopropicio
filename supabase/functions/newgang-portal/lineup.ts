// Lógica pura do line-up do portal (partilhada com os testes vitest).
// Regra de ouro: nenhuma saída contém totais nem contagens de atrações.

export type Reveal = {
  id: string;
  club_at: string;
  public_at: string;
  clues: string[] | null;
  status: string;
};

export type Act = {
  id: string;
  reveal_id: string | null;
  artist_name: string;
  artist_image_url: string | null;
  artist_bio_pt: string | null;
  artist_bio_en: string | null;
  category: string;
  video_url: string | null;
  listen_url: string | null;
  display_order: number | null;
};

const CATEGORY_ORDER: Record<string, number> = { headliner: 0, atracao: 1, convidado: 2 };

export function buildLineup(input: {
  reveals: Reveal[];
  acts: Act[];
  now: Date;
  isMember: boolean;
  lineupComplete: boolean;
}) {
  const { reveals, acts, now, isMember, lineupComplete } = input;
  const cut = (r: Reveal) => new Date(isMember ? r.club_at : r.public_at).getTime();
  const t = now.getTime();
  const scheduled = reveals.filter((r) => r.status === "agendada");
  const visible = scheduled.filter((r) => cut(r) <= t).sort((a, b) => cut(b) - cut(a));
  const visibleIds = new Set(visible.map((r) => r.id));
  const latestId = visible[0]?.id ?? null;

  const shape = (a: Act) => ({
    id: a.id,
    name: a.artist_name,
    image_url: a.artist_image_url,
    bio_pt: a.artist_bio_pt,
    bio_en: a.artist_bio_en,
    category: a.category,
    video_url: a.video_url,
    listen_url: a.listen_url,
    is_new: a.reveal_id === latestId,
  });
  const sortActs = (x: Act, y: Act) =>
    (CATEGORY_ORDER[x.category] ?? 9) - (CATEGORY_ORDER[y.category] ?? 9) ||
    (x.display_order ?? 0) - (y.display_order ?? 0) ||
    x.artist_name.localeCompare(y.artist_name);

  const shown = acts.filter((a) => a.reveal_id && visibleIds.has(a.reveal_id)).sort(sortActs);
  const latest = shown.filter((a) => a.reveal_id === latestId).map(shape);
  const confirmed = shown.map(shape);

  const next = scheduled.filter((r) => cut(r) > t).sort((a, b) => cut(a) - cut(b))[0] ?? null;
  const state = lineupComplete ? "completo" : visible.length > 0 ? "em_curso" : "expectativa";

  return {
    state,
    latest_reveal: latestId ? { at: isMember ? visible[0].club_at : visible[0].public_at, acts: latest } : null,
    confirmed,
    next_reveal: next && !lineupComplete
      ? {
          id: next.id,
          public_at: next.public_at,
          club_at: isMember ? next.club_at : null,
          clues: next.clues ?? [],
        }
      : null,
  };
}

const FORBIDDEN = /^(total|count|total_acts|acts_count|remaining)$/i;
/** Garante que nenhuma chave de total/contagem sai na resposta. */
export function assertNoTotals(obj: unknown): void {
  if (Array.isArray(obj)) return obj.forEach(assertNoTotals);
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN.test(k)) throw new Error(`chave proibida na resposta pública: ${k}`);
      assertNoTotals(v);
    }
  }
}

export function displayName(first: string | null, email: string): string {
  const f = (first ?? "").trim();
  if (!f) return email.slice(0, 1).toUpperCase() + ".";
  const parts = f.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
}
