// #327 — Leituras canónicas do Clube (nível, conquistas, montra de regras). Módulo novo, sem rede própria:
// recebe a função rpc (sb.rpc) por injeção para poder ser testado sem base nem rede.
export type RpcError = { message: string; code?: string | null };
export type RpcResult = { data: unknown; error: RpcError | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export type MemberLevel = { points: number; level: string | null; protected: boolean; next_level: string | null; next_level_min: number | null };
export type Referrals = { status: "ok"; confirmed_friends: number; badges: { friends_3: boolean; friends_5: boolean } } | { status: "error" };
export type PublicRule = { rule_key: string; label: string; points: number; cap: number | null; scope: string | null };
export type RulesView = { rules: PublicRule[]; unavailable: Array<{ rule_key: string; label: string; status: string }>; edition: string | null; version: string | null };

/** Compatibilidade de reversão: SÓ "função inexistente" (PostgREST PGRST202 / Postgres 42883) conta como RPC ausente.
 *  Qualquer outro erro (rede, timeout, permissão, exceção SQL) continua a ser erro explícito — nunca cai para o cálculo antigo. */
export function isMissingRpc(error: RpcError | null | undefined): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883");
}
export type LegacyLevel = { name: string; min_points: number };
/** Fórmula antiga (soma + club_levels): usada apenas quando a RPC canónica deixou de existir (SQL revertido). */
export function levelFromPoints(points: number, levels: LegacyLevel[]): MemberLevel {
  const sorted = [...levels].sort((a, b) => a.min_points - b.min_points);
  const cur = [...sorted].reverse().find((l) => l.min_points <= points) ?? null;
  const nxt = sorted.find((l) => l.min_points > points) ?? null;
  return { points, level: cur?.name ?? null, protected: false, next_level: nxt?.name ?? null, next_level_min: nxt?.min_points ?? null };
}
export type LevelOpts = { cache?: Map<string, MemberLevel>; legacy?: () => Promise<MemberLevel> };

/** Nível canónico (pontos + piso do cutover). Erro de RPC = erro explícito; linha vazia = membro sem pontos nem nível.
 *  Com `legacy`: se e só se a RPC estiver ausente (reversão SQL concluída), usa a fórmula antiga. */
export async function memberLevel(rpc: Rpc, memberId: string, opts?: Map<string, MemberLevel> | LevelOpts): Promise<MemberLevel> {
  const o: LevelOpts = opts instanceof Map ? { cache: opts } : (opts ?? {});
  const cache = o.cache;
  const hit = cache?.get(memberId);
  if (hit) return hit;
  const { data, error } = await rpc("club_member_level", { p_member: memberId });
  if (error && isMissingRpc(error) && o.legacy) { const l = await o.legacy(); cache?.set(memberId, l); return l; }
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
  // RPC ausente (reversão) ou qualquer erro → "error": o UI esconde as conquistas, nunca mostra 0 inventado.
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

export async function rulesPublic(rpc: Rpc, siteId: string, legacy?: () => Promise<RulesView>): Promise<RulesView> {
  const { data, error } = await rpc("club_rules_public", { p_site: siteId });
  if (error && isMissingRpc(error) && legacy) return legacy();
  if (error) throw new Error("club_rules_public: " + error.message);
  return rulesView(data);
}
