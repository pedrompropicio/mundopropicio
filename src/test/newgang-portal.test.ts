import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertNoTotals, buildLineup, type Act, type Reveal } from "../../supabase/functions/newgang-portal/lineup";
import { detectVideoProvider, scaledSize } from "@/lib/newgang-media";

const r = (id: string, club: string, pub: string, status = "agendada"): Reveal => ({
  id, club_at: club, public_at: pub, clues: [`pista ${id}`], status,
});
const a = (id: string, reveal: string | null, name: string, category = "atracao"): Act => ({
  id, reveal_id: reveal, artist_name: name, artist_image_url: null, artist_bio_pt: null, artist_bio_en: null,
  category, video_url: null, listen_url: null, display_order: 0,
});
const reveals = [
  r("R1", "2026-11-01T18:00:00Z", "2026-11-02T18:00:00Z"),
  r("R2", "2026-11-10T18:00:00Z", "2026-11-11T18:00:00Z"),
  r("R3", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z", "rascunho"),
];
const acts = [a("A1", "R1", "Orochi", "headliner"), a("A2", "R2", "Teto"), a("A3", "R2", "Chefin"), a("A4", null, "Secreto"), a("A5", "R3", "Rascunho")];
const run = (now: string, isMember: boolean, complete = false) =>
  buildLineup({ reveals, acts, now: new Date(now), isMember, lineupComplete: complete });

describe("newgang-portal lineup", () => {
  it("nenhum nome sai antes de public_at (público) nem de club_at (membro)", () => {
    expect(run("2026-11-01T17:59:00Z", true).confirmed).toEqual([]);
    expect(run("2026-11-02T17:59:00Z", false).confirmed).toEqual([]);
    expect(run("2026-11-01T18:00:00Z", true).confirmed.map((x) => x.name)).toEqual(["Orochi"]);
    expect(run("2026-11-02T18:00:00Z", false).confirmed.map((x) => x.name)).toEqual(["Orochi"]);
    expect(run("2026-11-10T18:30:00Z", false).confirmed.map((x) => x.name)).toEqual(["Orochi"]);
  });

  it("sem revelação ou em rascunho nunca é pública", () => {
    const names = run("2027-01-01T00:00:00Z", true).confirmed.map((x) => x.name);
    expect(names).not.toContain("Secreto");
    expect(names).not.toContain("Rascunho");
  });

  it("revelação com várias atrações marca todas como novas e a anterior deixa de ser", () => {
    const out = run("2026-11-11T19:00:00Z", false);
    expect(out.latest_reveal?.acts.map((x) => x.name).sort()).toEqual(["Chefin", "Teto"]);
    expect(out.confirmed.find((x) => x.name === "Orochi")?.is_new).toBe(false);
    expect(out.confirmed.filter((x) => x.is_new)).toHaveLength(2);
    expect(out.confirmed[0].name).toBe("Orochi"); // headliner primeiro
  });

  it("próxima revelação: data Clube só para membros; estados", () => {
    expect(run("2026-10-01T00:00:00Z", false).state).toBe("expectativa");
    const pub = run("2026-11-03T00:00:00Z", false);
    expect(pub.state).toBe("em_curso");
    expect(pub.next_reveal).toEqual({ id: reveals[1].id, public_at: reveals[1].public_at, club_at: null, clues: ["pista R2"] });
    expect(run("2026-11-03T00:00:00Z", true).next_reveal?.club_at).toBe(reveals[1].club_at);
    const done = run("2026-11-03T00:00:00Z", false, true);
    expect(done.state).toBe("completo");
    expect(done.next_reveal).toBeNull();
  });

  it("nenhuma resposta tem totais de atrações", () => {
    for (const t of ["2026-10-01T00:00:00Z", "2026-11-11T19:00:00Z"]) {
      const out = run(t, true);
      expect(() => assertNoTotals(out)).not.toThrow();
      expect(JSON.stringify(out)).not.toMatch(/"(total|count)/i);
    }
    expect(() => assertNoTotals({ x: [{ total: 3 }] })).toThrow();
  });
});

describe("pontos do Clube (garantias na base)", () => {
  const sql = readFileSync("supabase/migrations/20261013020500_0120_newgang_portal_sites_editions_club.sql", "utf8");
  it("razão idempotente: UNIQUE(member_id, rule_key, ref_id) + ON CONFLICT DO NOTHING", () => {
    expect(sql).toMatch(/UNIQUE\(member_id, rule_key, ref_id\)/);
    expect(sql).toMatch(/INSERT INTO club_points[\s\S]*ON CONFLICT DO NOTHING/);
  });
  it("convite só pontua na confirmação e nunca a si próprio", () => {
    const upsert = sql.slice(sql.indexOf("FUNCTION public.club_upsert_member"), sql.indexOf("FUNCTION public.club_confirm_member"));
    expect(upsert).not.toMatch(/club_award/);
    const confirm = sql.slice(sql.indexOf("FUNCTION public.club_confirm_member"), sql.indexOf("FUNCTION public.club_claim_attendance"));
    expect(confirm).toMatch(/friend_joined/);
    expect(confirm).toMatch(/referred_by_member_id <> p_member/);
  });
  it("email ou telefone repetido reutiliza o membro existente (não pontua de novo)", () => {
    expect(sql).toMatch(/club_members_site_email_uq ON public\.club_members\(site_id, lower\(trim\(email\)\)\)/);
    expect(sql).toMatch(/lower\(trim\(email\)\) = e\s+OR \(p_phone IS NOT NULL/);
  });
});

describe("media das edições", () => {
  it("aceita só YouTube, Instagram e Vimeo", () => {
    expect(detectVideoProvider("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
    expect(detectVideoProvider("https://youtu.be/abc123")).toBe("youtube");
    expect(detectVideoProvider("https://www.instagram.com/reel/Cx1/")).toBe("instagram");
    expect(detectVideoProvider("https://vimeo.com/12345")).toBe("vimeo");
    expect(detectVideoProvider("https://tiktok.com/@x/video/1")).toBeNull();
    expect(detectVideoProvider("http://youtu.be/abc")).toBeNull();
    expect(detectVideoProvider("nada")).toBeNull();
  });
  it("redimensiona para lado maior 1600", () => {
    expect(scaledSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(scaledSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
