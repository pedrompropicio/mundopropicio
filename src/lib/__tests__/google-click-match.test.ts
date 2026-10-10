import { describe, it, expect } from "vitest";
import {
  matchClickToLead,
  positiveConversionValue,
  MATCH_WINDOW_DAYS,
} from "../../../supabase/functions/_shared/google-click-match.ts";

const click = (o: Partial<Parameters<typeof matchClickToLead>[0]> = {}) => ({
  lead_capture_id: null, client_event_id: null, gclid: null, gbraid: null, wbraid: null, ...o,
});

describe("#62 casamento clique ↔ lead", () => {
  const byIdent = new Map([["gclid:G1", "lead-g"], ["wbraid:W1", "lead-w"]]);
  const byCei = new Map([["cei-1", "lead-c"]]);

  it("lead_capture_id já gravado ganha", () => {
    expect(matchClickToLead(click({ lead_capture_id: "L", gclid: "G1" }), byIdent, byCei))
      .toEqual({ leadId: "L", method: "lead_capture_id" });
  });
  it("gclid antes da sessão", () => {
    expect(matchClickToLead(click({ gclid: "G1", client_event_id: "cei-1" }), byIdent, byCei))
      .toEqual({ leadId: "lead-g", method: "click_identifier" });
  });
  it("wbraid/gbraid também casam", () => {
    expect(matchClickToLead(click({ wbraid: "W1" }), byIdent, byCei)?.leadId).toBe("lead-w");
  });
  it("client_event_id é o fallback marcado", () => {
    expect(matchClickToLead(click({ gclid: "X", client_event_id: "cei-1" }), byIdent, byCei))
      .toEqual({ leadId: "lead-c", method: "client_event_id" });
  });
  it("sem nada → null", () => {
    expect(matchClickToLead(click({ gclid: "X" }), byIdent, byCei)).toBeNull();
  });
  it("janela de 90 dias", () => expect(MATCH_WINDOW_DAYS).toBe(90));
});

describe("#62 valor da conversão", () => {
  it.each([["0", null], [0, null], ["", null], [null, null], ["abc", null], [-3, null]])(
    "%p → sem valor", (v, e) => expect(positiveConversionValue(v)).toBe(e),
  );
  it("positivo passa", () => {
    expect(positiveConversionValue("12,5")).toBe(12.5);
    expect(positiveConversionValue({ value: 8 })).toBe(8);
  });
});
