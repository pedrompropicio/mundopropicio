import { describe, expect, it } from "vitest";
import { buildHistory, HISTORY_LIMIT, shortName, VOID_LABEL } from "../../supabase/functions/newgang-portal/history";

const ME = "11111111-1111-1111-1111-111111111111";
const FRIEND = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const SUB = "44444444-4444-4444-4444-444444444444";
const sum = (h: { points: number }[]) => h.reduce((s, x) => s + x.points, 0);

const rows = [
  { rule_key: "join_confirmed", points: 50, ref_id: ME, created_at: "2026-10-01T10:00:00Z" },
  { rule_key: "friend_joined", points: 100, ref_id: FRIEND, created_at: "2026-10-02T10:00:00Z" },
  { rule_key: "friend_joined", points: 100, ref_id: OTHER, created_at: "2026-10-03T10:00:00Z" },
  { rule_key: "mission", points: 40, ref_id: SUB, created_at: "2026-10-04T10:00:00Z" },
  { rule_key: "attended_year", points: 200, ref_id: "2025", created_at: "2026-10-05T10:00:00Z" },
  { rule_key: "void", points: -40, ref_id: "Conta duplicada", created_at: "2026-10-06T10:00:00Z" },
  { rule_key: "regra_nova", points: 5, ref_id: null, created_at: "2026-10-07T10:00:00Z" },
];
const friends = [
  { id: FRIEND, first_name: "Ana Maria Silva", referred_by_member_id: ME },
  { id: OTHER, first_name: "Rui Costa", referred_by_member_id: "outro" },
];

describe("newgang history", () => {
  const h = buildHistory(ME, rows, { friends, missions: { [SUB]: "Partilha o cartaz" }, ruleLabels: { regra_nova: "Bónus" } });

  it("soma bate com o total e ordem mais recente primeiro", () => {
    expect(sum(h)).toBe(rows.reduce((s, r) => s + r.points, 0));
    expect(h[0].label).toBe("Bónus");
  });
  it("anulação negativa com motivo", () => {
    const v = h.find((x) => x.label === VOID_LABEL)!;
    expect(v.points).toBe(-40);
    expect(v.detail).toBe("Conta duplicada");
  });
  it("detalhes: amigo curto, missão, ano; nunca outro membro nem email", () => {
    expect(h.map((x) => x.detail)).toEqual(expect.arrayContaining(["Ana S.", "Partilha o cartaz", "2025"]));
    const txt = JSON.stringify(h);
    expect(txt).not.toContain("Rui");
    expect(txt).not.toContain("@");
    expect(txt).not.toContain(OTHER);
    expect(shortName("x@y.pt")).toBeNull();
  });
  it("mais de 100 movimentos: corta e agrega, soma mantém-se", () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ rule_key: "guess_correct", points: 10, ref_id: String(i), created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    const r = buildHistory(ME, many);
    expect(r.length).toBe(HISTORY_LIMIT + 1);
    expect(sum(r)).toBe(1300);
  });
});
