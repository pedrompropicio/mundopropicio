import { describe, expect, it } from "vitest";
import * as GW from "../../supabase/functions/newgang-portal/wallet-google";

const ISS = "3388000000012345678";
const M = { id: "6a6ac03e-9333-49dc-bf4a-e0488bad7777", member_no: 42, first_name: "Ana", points: 650, level: "Crew", crew: null };

describe("wallet: níveis Gang/Crew/Goat com legados", () => {
  it.each([
    ["Gang", "gang"], ["Elite", "crew"], ["Crew", "crew"], ["crew ", "crew"],
    ["Lenda", "goat"], ["Goat", "goat"], [null, "gang"], ["Novo", "gang"],
  ])("tier de %s = %s", (lvl, t) => expect(GW.levelTier(lvl as string | null)).toBe(t));

  it("legados mantêm o criativo v1", () => {
    for (const ready of [false, true]) {
      expect(GW.buildObject(ISS, { ...M, level: "Elite" }, { artworkReady: true, renamedArtworkReady: ready }).heroImage?.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.Elite);
      expect(GW.buildObject(ISS, { ...M, level: "Lenda" }, { artworkReady: true, renamedArtworkReady: ready }).heroImage?.sourceUri.uri).toBe(GW.WALLET_ARTWORK_URLS.Lenda);
    }
  });

  it.each([["Crew", "hero-crew-v1.png", "#170a2b"], ["Goat", "hero-goat-v1.png", "#050505"], ["Gang", "hero-gang-v1.png", "#0b1f14"]])(
    "com criativos novos, %s usa %s e preserva pontos/nível", (level, file, color) => {
      const o = GW.buildObject(ISS, { ...M, level }, { artworkReady: true, renamedArtworkReady: true });
      expect(decodeURIComponent(o.heroImage!.sourceUri.uri)).toContain(`/newgang/wallet/${file}`);
      expect(o.hexBackgroundColor).toBe(color);
      expect(o.heroImage!.contentDescription.defaultValue.value).toBe(`Clube Newgang · ${level}`);
      expect(o.loyaltyPoints.balance.int).toBe(650);
      expect(o.secondaryLoyaltyPoints.balance.string).toBe(level);
    });

  it("nomes novos nunca caem no criativo Gang", () => {
    for (const level of ["Crew", "Goat"]) {
      const uri = GW.buildObject(ISS, { ...M, level }, { artworkReady: true, renamedArtworkReady: false }).heroImage!.sourceUri.uri;
      expect(uri).not.toBe(GW.WALLET_ARTWORK_URLS.Gang);
    }
  });

  it("flag dos criativos renomeados desligada por defeito (SQL bloqueado)", () => {
    expect(GW.WALLET_RENAMED_ARTWORK_READY).toBe(false);
  });
});
