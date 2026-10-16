// CRM policy mirrors #327: draft never replaces active, and unverified reads never enable writes.
export type ClubConfig = {
  site_id: string; event_id: string; status: "active"; version: string; effective_at: string | null;
  join_points: number; referral_points: number; referral_cap: number; crew_points: number;
  purchase_points: number; purchase_enabled: boolean; levels: Record<string, number>;
};
export const CONTROLLED_RULES = ["join_confirmed", "friend_joined", "crew_complete", "promo_lot_purchase"];
export function configReady(q: { isSuccess: boolean; isFetching: boolean; isError: boolean; data?: ClubConfig | null }, siteId: string) {
  return q.isSuccess && !q.isFetching && !q.isError && q.data !== undefined && (!q.data || q.data.site_id === siteId);
}
export function ruleSource(config: ClubConfig | null, rule: { rule_key: string; points: number }, eventId: string | null) {
  const controlled = CONTROLLED_RULES.includes(rule.rule_key);
  const keys: Record<string, keyof ClubConfig> = { join_confirmed: "join_points", friend_joined: "referral_points", crew_complete: "crew_points", promo_lot_purchase: "purchase_points" };
  const mismatch = !!config && config.event_id !== eventId && controlled;
  const unavailable = rule.rule_key === "friend_bought" || (rule.rule_key === "promo_lot_purchase" && !config?.purchase_enabled);
  return {
    points: config && controlled ? Number(config[keys[rule.rule_key]]) : rule.points,
    editable: !(config && controlled), version: config && controlled ? config.version : null,
    scope: config && controlled ? (rule.rule_key === "join_confirmed" ? "adesao" : "edicao") : null,
    cap: config && rule.rule_key === "friend_joined" ? config.referral_cap : null,
    available: !mismatch && !unavailable,
    status: mismatch ? "edicao_sem_config" : unavailable ? "sem_integracao" : "ok",
  };
}
export function crewRuleWrite(config: ClubConfig | null, v: { points: number; min: number; max: number; active: boolean }) {
  const base = { min_members: v.min, max_members: v.max, active: v.active };
  return config ? base : { ...base, points: v.points };
}
export function assertClubWrite(ready: boolean, config: ClubConfig | null, table: string, patch: Record<string, unknown>, structural = false) {
  if (!ready) throw new Error("Configuração do Clube não verificada. Tente novamente.");
  if (!config) return;
  if (structural || (table === "club_levels" && Object.keys(patch).some(k => k !== "benefit")))
    throw new Error("Níveis e identidades preservados pela configuração ativa.");
  if (table === "club_point_rules" && "rule_key" in patch) throw new Error("Identidade da regra protegida pela configuração ativa.");
}