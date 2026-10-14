import { describe, expect, it } from "vitest";
import { crewErrorStatus, crewView, CREW_LINK } from "../../supabase/functions/newgang-portal/crews";
import { buildHistory } from "../../supabase/functions/newgang-portal/history";

const crew = { id: "c1", name: "A Gang", code: "Q9VT3F", owner_member_id: "m1", completed_at: "2026-10-13T00:00:00Z" };
const members = [
  { member_id: "m2", joined_at: "2026-10-02", first_name: "Bruno Costa", confirmed_at: "x" },
  { member_id: "m1", joined_at: "2026-10-01", first_name: "Ana Maria Silva", confirmed_at: "x" },
  { member_id: "m3", joined_at: "2026-10-03", first_name: null, confirmed_at: null },
];

describe("crews", () => {
  const v = crewView("newgangfestival.pt", crew, members, { min: 4, max: 6 });
  it("nomes curtos, dono, sem emails nem ids", () => {
    expect(v.members).toEqual([
      { short_name: "Ana S.", confirmed: true, is_owner: true },
      { short_name: "Bruno C.", confirmed: true, is_owner: false },
      { short_name: "Membro", confirmed: false, is_owner: false },
    ]);
    const t = JSON.stringify(v);
    expect(t).not.toContain("@");
    expect(t).not.toContain("m1");
    expect(v.invite_link).toBe("https://newgangfestival.pt/clube?crew=Q9VT3F");
    expect(v).toMatchObject({ min: 4, max: 6, completed: true });
  });
  it("erros → HTTP", () => {
    expect(crewErrorStatus("no_session")).toBe(401);
    expect(crewErrorStatus("crew_full")).toBe(409);
    expect(crewErrorStatus("already_in_crew")).toBe(409);
    expect(crewErrorStatus("crew_not_found")).toBe(404);
    expect(crewErrorStatus("crew_name")).toBe(400);
    expect(CREW_LINK("x.pt", "ABC234")).toBe("https://x.pt/clube?crew=ABC234");
  });
  it("history: Crew completa com nome da crew", () => {
    const h = buildHistory("m1", [{ rule_key: "crew_complete", points: 200, ref_id: "c1", created_at: "2026-10-13T00:00:00Z" }], { crews: { c1: "A Gang" } });
    expect(h[0]).toMatchObject({ label: "Crew completa", detail: "A Gang", points: 200 });
  });
});
