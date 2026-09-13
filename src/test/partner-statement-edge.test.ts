/**
 * (g17-b) Teste de integração da edge function `partner-statement`.
 *
 * Corre só quando há um token de sessão real do utilizador de teste ligado ao
 * sócio RAFAEL LOBO (c4601931-29fd-43c3-96e6-d4f9ffee43a8):
 *   PARTNER_STATEMENT_TOKEN=<access_token> bunx vitest run partner-statement-edge
 * Sem token, o teste é ignorado (não há como mintar sessões de outros
 * utilizadores no ambiente de CI).
 */
import { describe, expect, it } from "vitest";

const TOKEN = process.env.PARTNER_STATEMENT_TOKEN ?? "";
const URL_BASE = process.env.VITE_SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EVENT_ID = "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"; // Anitta EDA 2026

const canRun = Boolean(TOKEN && URL_BASE && ANON);

describe.skipIf(!canRun)("partner-statement (sócio RAFAEL LOBO)", () => {
  it("devolve 200 com a parte e a cascata do sócio", async () => {
    const res = await fetch(`${URL_BASE}/functions/v1/partner-statement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_id: EVENT_ID }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const block = body.block;
    expect(block.partnerName).toBe("RAFAEL LOBO");
    expect(block.partnerPct).toBe(20);
    expect(Math.abs(block.nodeResult - 178840.04)).toBeLessThan(0.01);
    expect(Math.abs(block.partnerShare - 35768.01)).toBeLessThan(0.01);

    const cascade = JSON.stringify(block.cascade ?? body.doc?.cascade ?? []);
    expect(cascade).toContain("ANITTA");
    expect(cascade).toContain("70");
  });
});
