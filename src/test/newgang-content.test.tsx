import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { NewgangContentFields } from "@/pages/crm-admin/sites/NewgangSite";
import { NEWGANG_CONTENT_KEYS, cleanNewgangContent } from "@/lib/newgang-content";

describe("Site Newgang — textos do separador Geral", () => {
  it("tem as 25 chaves do contrato do site, todas no ecrã", () => {
    expect(NEWGANG_CONTENT_KEYS).toHaveLength(25);
    const { container } = render(<NewgangContentFields content={{}} onChange={() => {}} />);
    for (const k of NEWGANG_CONTENT_KEYS) expect(container.querySelector(`[name="${k}"]`), k).not.toBeNull();
    expect(container.querySelector('textarea[name="ranking_prizes"]')).not.toBeNull();
    expect(container.querySelector('input[name="hero_date"]')?.getAttribute("placeholder")).toBe("25 de março de 2027");
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
  });
  it("campo vazio não grava a chave", () => {
    expect(cleanNewgangContent({ hero_date: "", hero_venue: "   ", club_cta: "Entra", ranking_prizes: "1.º VIP" }))
      .toEqual({ club_cta: "Entra", ranking_prizes: "1.º VIP" });
  });
});
