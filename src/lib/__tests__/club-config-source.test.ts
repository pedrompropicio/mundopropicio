import { describe, it, expect } from "vitest";
import { ClubConfig, configReady, ruleSource, crewRuleWrite, assertClubWrite } from "../club-config-source";
export const active: ClubConfig = { site_id: "site-a", event_id: "event-a", status: "active", version: "2027-v1", effective_at: null, join_points: 100, referral_points: 75, referral_cap: 750, crew_points: 100, purchase_points: 200, purchase_enabled: false, levels: { Gang: 0, Crew: 750, Goat: 3000 } };
describe("#327 CRM source", () => {
  it("inscrição 100 por adesão", () => expect(ruleSource(active, { rule_key: "join_confirmed", points: 999 }, "event-a")).toMatchObject({ points: 100, scope: "adesao", editable: false }));
  it("indicação 75 e teto 750 por edição", () => expect(ruleSource(active, { rule_key: "friend_joined", points: 150 }, "event-a")).toMatchObject({ points: 75, cap: 750, scope: "edicao" }));
  it("Crew 100 única por edição", () => expect(ruleSource(active, { rule_key: "crew_complete", points: 200 }, "event-a")).toMatchObject({ points: 100, scope: "edicao", editable: false }));
  it("compra 200 indisponível", () => expect(ruleSource(active, { rule_key: "promo_lot_purchase", points: 500 }, "event-a")).toMatchObject({ points: 200, available: false, status: "sem_integracao" }));
  it("compra indicada 300 indisponível", () => expect(ruleSource(active, { rule_key: "friend_bought", points: 300 }, "event-a")).toMatchObject({ points: 300, available: false }));
  it.each([["attended_year", 100], ["guess_correct", 50]])("preserva %s", (rule_key, points) => expect(ruleSource(active, { rule_key: String(rule_key), points: Number(points) }, "event-a")).toMatchObject({ points, editable: true }));
  it("grava mínimo 4/máximo 6/ativa sem points ignorado", () => expect(crewRuleWrite(active, { points: 999, min: 4, max: 6, active: true })).toEqual({ min_members: 4, max_members: 6, active: true }));
  it("antes do cutover mantém edição de 200", () => expect(crewRuleWrite(null, { points: 200, min: 4, max: 6, active: true })).toMatchObject({ points: 200 }));
  it("edição divergente falha fechada", () => expect(ruleSource(active, { rule_key: "crew_complete", points: 200 }, "event-b").available).toBe(false));
  it("loading/error/refetch/site stale não são editáveis", () => {
    const q = { isSuccess: true, isFetching: false, isError: false, data: active };
    expect(configReady(q, "site-a")).toBe(true);
    expect(configReady({ ...q, isFetching: true }, "site-a")).toBe(false);
    expect(configReady({ ...q, isError: true }, "site-a")).toBe(false);
    expect(configReady({ ...q, data: undefined }, "site-a")).toBe(false);
    expect(configReady(q, "site-b")).toBe(false);
  });
  it("protege nomes/limiares/direitos mas permite benefícios", () => {
    expect(active.levels).toEqual({ Gang: 0, Crew: 750, Goat: 3000 });
    expect(() => assertClubWrite(true, active, "club_levels", { min_points: 400 })).toThrow();
    expect(() => assertClubWrite(true, active, "club_levels", { name: "Outro" })).toThrow();
    expect(() => assertClubWrite(true, active, "club_levels", { benefit: "Preservado" })).not.toThrow();
  });
});