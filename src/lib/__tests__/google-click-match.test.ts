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

import { pickClickForLeads } from "../../../supabase/functions/_shared/google-click-match.ts";

describe("#62 D-ERP260 partir dos leads", () => {
  const mk = (i: number, o: Record<string, unknown> = {}) => ({
    id: `c${String(i).padStart(6, "0")}`, captured_at: new Date(Date.UTC(2026, 7, 1) + i * 60000).toISOString(),
    lead_capture_id: null, client_event_id: `orphan-${i}`, gclid: `OLD${i}`, gbraid: null, wbraid: null, ...o,
  });
  const old = Array.from({ length: 5001 }, (_, i) => mk(i));
  const recent = mk(9999, { id: "recent", captured_at: "2026-10-12T10:00:00.000Z", gclid: "NEW1", client_event_id: "cei-new" });
  const lead = { id: "lead-new", client_event_id: "cei-new", raw: { gclid: "NEW1" } };

  it("defeito: >5.000 cliques antigos sem lead + 1 recente com lead → enfileira o recente", () => {
    const r = pickClickForLeads([lead], [...old, recent], new Set());
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0]).toMatchObject({ leadId: "lead-new", method: "click_identifier" });
    expect(r.picks[0].click.id).toBe("recent");
  });
  it("controlo: a lógica antiga (5.000 mais antigos) perdia-o", () => {
    const cut = [...old, recent].sort((a, b) => a.captured_at.localeCompare(b.captured_at)).slice(0, 5000);
    expect(pickClickForLeads([lead], cut, new Set()).picks).toHaveLength(0);
  });
  it("prioridade e já enfileirado", () => {
    const l2 = { id: "L2", client_event_id: "cei2", raw: null };
    const r = pickClickForLeads([lead, l2],
      [mk(1, { id: "a", lead_capture_id: "L2", client_event_id: null }), recent], new Set(["lead-new"]));
    expect(r.skippedExisting).toBe(1);
    expect(r.picks).toEqual([expect.objectContaining({ leadId: "L2", method: "lead_capture_id" })]);
  });
  it("clique sem identificador ignorado; lead sem clique conta", () => {
    const r = pickClickForLeads([lead], [{ ...recent, gclid: null }], new Set());
    expect(r.noClick).toBe(1);
  });
});
