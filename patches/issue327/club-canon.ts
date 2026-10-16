// #327 — Leituras canónicas do Clube (nível, conquistas, montra de regras). Módulo novo, sem rede própria:
// recebe a função rpc (sb.rpc) por injeção para poder ser testado sem base nem rede.
export type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export type MemberLevel = { points: number; level: string | null; protected: boolean; next_level: string | null; next_level_min: number | null };
export type Referrals = { status: "ok"; confirmed_friends: number; badges: { friends_3: boolean; friends_5: boolean } } | { status: "error" };
export type PublicRule = { rule_key: string; label: string; points: number; cap: number | null; scope: string | null };
export type RulesView = { rules: PublicRule[]; unavailable: Array<{ rule_key: string; label: string; status: string }>; edition: string | null; version: string | null };

/** Nível canónico (pontos + piso do cutover). Erro de RPC = erro explícito; linha vazia = membro sem pontos nem nível. */
export async function memberLevel(rpc: Rpc, memberId: string, cache?: Map<string, MemberLevel>): Promise<MemberLevel> {
  const hit = cache?.get(memberId);
  if (hit) return hit;
  const { data, error } = await rpc("club_member_level", { p_member: memberId });
  if (error) throw new Error("club_member_level: " + error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  const out: MemberLevel = {
    points: Number(row?.points ?? 0),
    level: (row?.level_name as string | null) ?? null,
    protected: row?.protected === true,
    next_level: (row?.next_level_name as string | null) ?? null,
    next_level_min: row?.next_level_min == null ? null : Number(row.next_level_min),
  };
  cache?.set(memberId, out);
  return out;
}

/** Conquistas 3/5: nunca devolve null em silêncio; em erro o UI recebe status "error". */
export async function referralProgress(rpc: Rpc, memberId: string): Promise<Referrals> {
  const { data, error } = await rpc("club_referral_progress", { p_member: memberId });
  const d = data as { confirmed_friends?: unknown; badges?: { friends_3?: unknown; friends_5?: unknown } } | null;
  if (error || !d || typeof d.confirmed_friends !== "number") return { status: "error" };
  return { status: "ok", confirmed_friends: d.confirmed_friends, badges: { friends_3: d.badges?.friends_3 === true, friends_5: d.badges?.friends_5 === true } };
}

/** Montra: só regras disponíveis aparecem como "ganha N"; as indisponíveis vêm à parte com o motivo (sem pontos). */
export function rulesView(rows: unknown): RulesView {
  const list = (Array.isArray(rows) ? rows : []) as Array<Record<string, any>>;
  const rules: PublicRule[] = [];
  const unavailable: RulesView["unavailable"] = [];
  for (const r of list) {
    if (r.available === true) rules.push({ rule_key: r.rule_key, label: r.label, points: Number(r.points), cap: r.cap == null ? null : Number(r.cap), scope: r.scope ?? null });
    else if (r.status !== "inativa") unavailable.push({ rule_key: r.rule_key, label: r.label, status: String(r.status ?? "indisponivel") });
  }
  rules.sort((a, b) => a.points - b.points || a.rule_key.localeCompare(b.rule_key));
  return { rules, unavailable, edition: list[0]?.event_id ?? null, version: list[0]?.config_version ?? null };
}

export async function rulesPublic(rpc: Rpc, siteId: string): Promise<RulesView> {
  const { data, error } = await rpc("club_rules_public", { p_site: siteId });
  if (error) throw new Error("club_rules_public: " + error.message);
  return rulesView(data);
}
