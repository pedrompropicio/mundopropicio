// Extrato de pontos do membro ("me".history). Puro — testável sem base.
// Nunca devolve email nem dados de outros membros além do nome curto de amigos convidados pelo próprio.

export const HISTORY_LIMIT = 100;

export const RULE_LABELS: Record<string, string> = {
  join_confirmed: "Confirmaste a inscrição",
  friend_joined: "Um amigo entrou com o teu convite",
  friend_bought: "Um amigo comprou bilhete",
  promo_lot_purchase: "Compraste no lote especial",
  guess_correct: "Acertaste o palpite",
  attended_year: "Eu estive lá",
  mission: "Missão aprovada",
  mission_finalist: "Finalista do desafio",
  mission_winner: "Vencedor do desafio",
};
export const VOID_LABEL = "Pontos anulados";
export const OLDER_LABEL = "Movimentos anteriores";

export type PointRow = { rule_key: string; points: number; ref_id: string | null; created_at: string; reason?: string | null };
export type Friend = { id: string; first_name: string | null; referred_by_member_id: string | null };
export type HistoryItem = { at: string; points: number; label: string; detail: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ana Maria Silva" → "Ana S."; "Ana" → "Ana"; nunca devolve algo com "@". */
export function shortName(full: string | null | undefined): string | null {
  const w = (full ?? "").trim().split(/\s+/).filter((x) => x && !x.includes("@"));
  if (!w.length) return null;
  return w.length === 1 ? w[0] : `${w[0]} ${w[w.length - 1][0].toUpperCase()}.`;
}

// Anulação = movimento negativo (o ranking soma os valores tal como estão gravados).
/** Gerações de pontos após reaprovação: "<ref>#2" → "<ref>". */
export const baseRef = (ref: string) => ref.replace(/#\d+$/, "");

/** Ref base de uma linha (anulação "mission:<sub>#2" → "<sub>"). */
export const subjectRef = (r: PointRow) => baseRef(r.rule_key === "void" ? (r.ref_id ?? "").replace(/^[^:]*:/, "") : (r.ref_id ?? ""));

export const isVoid = (r: PointRow) => r.points < 0;

export function buildHistory(
  memberId: string,
  rows: PointRow[],
  opts: { ruleLabels?: Record<string, string>; friends?: Friend[]; missions?: Record<string, string> } = {},
): HistoryItem[] {
  const friends = new Map((opts.friends ?? []).filter((f) => f.referred_by_member_id === memberId).map((f) => [f.id, f]));
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const item = (r: PointRow): HistoryItem => {
    const ref = r.ref_id ?? "";
    if (isVoid(r)) return { at: r.created_at, points: r.points, label: VOID_LABEL, detail: r.reason ?? (ref && !ref.includes(":") && !UUID.test(ref) ? ref : null) };
    let detail: string | null = null;
    if (r.rule_key.startsWith("friend_")) detail = shortName(friends.get(ref)?.first_name);
    else if (r.rule_key.startsWith("mission")) detail = opts.missions?.[baseRef(ref)] ?? null;
    else if (r.rule_key === "attended_year") detail = /^\d{4}$/.test(ref) ? ref : null;
    return { at: r.created_at, points: r.points, label: RULE_LABELS[r.rule_key] ?? opts.ruleLabels?.[r.rule_key] ?? r.rule_key, detail };
  };
  const head = sorted.slice(0, HISTORY_LIMIT).map(item);
  const rest = sorted.slice(HISTORY_LIMIT);
  if (rest.length) {
    // Garante soma do history = points do "me" mesmo com >100 movimentos.
    const sum = rest.reduce((s, r) => s + r.points, 0);
    head.push({ at: rest[0].created_at, points: sum, label: OLDER_LABEL, detail: `${rest.length} movimentos` });
  }
  return head;
}
