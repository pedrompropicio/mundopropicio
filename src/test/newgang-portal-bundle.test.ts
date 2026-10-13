import { describe, expect, it } from "vitest";
import { assemblePublic, bundleFrom, lineupFrom } from "../../supabase/functions/newgang-portal/public";
import { assertNoTotals } from "../../supabase/functions/newgang-portal/lineup";

const act = (id: string, reveal: string | null, name: string) => ({
  id, reveal_id: reveal, artist_name: name, artist_image_url: null, artist_bio_pt: null, artist_bio_en: null,
  category: "atracao", video_url: null, listen_url: null, display_order: 0,
});
const row = {
  id: "S1", event_id: "E1", brand_key: "newgang", company_id: "C1",
  club_levels: [{ name: "Elite", min_points: 500, benefit: "x" }, { name: "Gang", min_points: 0, benefit: "y" }],
  club_point_rules: [{ rule_key: "b", label: "B", points: 150, active: true }, { rule_key: "a", label: "A", points: 100, active: true }, { rule_key: "z", label: "Z", points: 1, active: false }],
  events: {
    ticketing_url: "https://fever", event_trackers: [{ platform: "meta", tracker_id: "1" }],
    event_marketing: [{ ticket_lots: [{ n: 1 }], lineup_complete: false }],
    event_lineup_reveals: [
      { id: "R1", club_at: "2026-11-01T18:00:00Z", public_at: "2026-11-02T18:00:00Z", clues: [], status: "agendada" },
    ],
    event_lineups: [act("A1", "R1", "Orochi"), act("A2", null, "Secreto")],
  },
};
const pub = [{ id: "S1", domain: "newgangfestival.pt" }, { id: "OUTRO", domain: "newgangfestival.pt" }];
const eds = [{ year: 2026, brand_key: "newgang" }, { year: 2025, brand_key: "outra" }];
const now = new Date("2026-11-03T00:00:00Z");

describe("newgang-portal bundle", () => {
  it("bundle = site + lineup + history pedidos à parte", () => {
    const all = bundleFrom(assemblePublic({ site: true, lineup: true, history: true }, row, pub, eds), now);
    expect(all.site).toEqual(assemblePublic({ site: true }, row, pub, null).site);
    expect(all.lineup).toEqual(lineupFrom(assemblePublic({ lineup: true }, row, null, null).lineupRaw ?? null, false, now));
    expect(all.history).toEqual(assemblePublic({ history: true }, row, null, eds).history);
    expect(() => assertNoTotals(all)).not.toThrow();
  });

  it("formato do site: níveis/regras ordenados, regras inativas fora, site certo", () => {
    const s = assemblePublic({ site: true }, row, pub, null).site as any;
    expect(s.site.id).toBe("S1");
    expect(s.club.levels.map((l: any) => l.min_points)).toEqual([0, 500]);
    expect(s.club.rules).toEqual([{ rule_key: "a", label: "A", points: 100 }, { rule_key: "b", label: "B", points: 150 }]);
    expect(s.ticketing).toEqual({ url: "https://fever", lots: [{ n: 1 }] });
  });

  it("nenhum nome sai antes de public_at no bundle (line-up sempre público)", () => {
    const p = assemblePublic({ site: true, lineup: true, history: true }, row, pub, eds);
    // Depois de club_at mas antes de public_at: o membro veria, o bundle não.
    expect(bundleFrom(p, new Date("2026-11-02T12:00:00Z")).lineup.confirmed).toEqual([]);
    expect(bundleFrom(p, new Date("2026-11-02T18:00:00Z")).lineup.confirmed.map((x: any) => x.name)).toEqual(["Orochi"]);
    expect(JSON.stringify(bundleFrom(p, now))).not.toContain("Secreto");
  });
});
