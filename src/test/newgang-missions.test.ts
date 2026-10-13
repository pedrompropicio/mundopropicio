import { describe, expect, it } from "vitest";
import { missionsFrom, normalizeHandle, normalizeProofUrl, publicMission, submitErrorStatus } from "../../supabase/functions/newgang-portal/missions";
import { assertNoTotals } from "../../supabase/functions/newgang-portal/lineup";

const pu = (p: string) => `https://cdn/${p}`;
const base = { status: "ativa", starts_at: null, ends_at: null, sort: 0, assets: [], points: 40, network: "instagram", proof_type: "link" };
const now = new Date("2026-11-01T12:00:00Z");

describe("missões — API pública", () => {
  it("só ativas dentro do prazo; sem contagens nem campos internos", () => {
    const rows = [
      { ...base, id: "A", kind: "postar", title: "A", approval: "automatica", assets: [{ path: "c/m/1.jpg", type: "imagem", name: "x" }] },
      { ...base, id: "F", kind: "postar", title: "Fora", ends_at: "2026-10-31T00:00:00Z" },
      { ...base, id: "R", kind: "postar", title: "Rasc", status: "rascunho" },
      { ...base, id: "D", kind: "desafio", title: "D", finalist_points: 100, winner_points: 300, judging_until: null, sort: 1 },
    ];
    const r = missionsFrom(rows, pu, now);
    expect(r.missions.map((m: any) => m.id)).toEqual(["A", "D"]);
    expect(r.missions[0]).not.toHaveProperty("approval");
    expect(r.missions[0]).not.toHaveProperty("finalist_points");
    expect((r.missions[0] as any).assets[0].url).toBe("https://cdn/c/m/1.jpg");
    expect(r.missions[1]).toMatchObject({ finalist_points: 100, winner_points: 300 });
    expect(() => assertNoTotals(r)).not.toThrow();
    expect(JSON.stringify(r)).not.toMatch(/"(count|total|submissions)"/);
  });
  it("publicMission devolve só o contrato", () => {
    expect(Object.keys(publicMission({ ...base, id: "x", kind: "postar", title: "t" }, pu)).sort()).toEqual(
      ["assets", "caption_suggestion", "description", "ends_at", "hashtag", "id", "kind", "mention", "network", "points", "proof_type", "title"]);
  });
});

describe("missões — normalização", () => {
  it("handles sem @, minúsculas, formato validado", () => {
    expect(normalizeHandle("@New.Gang_", "instagram")).toBe("new.gang_");
    expect(normalizeHandle("https://www.instagram.com/NewGang/", "instagram")).toBe("newgang");
    expect(normalizeHandle("", "tiktok")).toBeNull();
    expect(() => normalizeHandle("mau handle!", "instagram")).toThrow();
    expect(() => normalizeHandle("a", "tiktok")).toThrow();
  });
  it("link de prova: mesma publicação = mesmo link (sem query, fragmento ou barra final)", () => {
    expect(normalizeProofUrl("https://www.Instagram.com/p/ABC/?igsh=1#x")).toBe("https://www.instagram.com/p/ABC");
    expect(normalizeProofUrl("https://youtube.com/watch?v=Q1&t=3")).toBe("https://youtube.com/watch?v=Q1");
    expect(normalizeProofUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("missões — estado HTTP dos erros da RPC", () => {
  it("sessão inválida → 401 (não 400), como nas outras ações com token", () => {
    expect(submitErrorStatus("no_session")).toBe(401);
    expect(submitErrorStatus("closed")).toBe(409);
    expect(submitErrorStatus("already_submitted")).toBe(409);
    expect(submitErrorStatus("duplicate")).toBe(409);
    expect(submitErrorStatus("url")).toBe(400);
    expect(submitErrorStatus("proof_type")).toBe(400);
  });
});
