import { describe, expect, it } from "vitest";
import {
  STAGE_LABELS, filterEventsByStage, legacyReopenBlock, mapStageError, parseChecklist, stageActions, stageMapFromRows,
} from "@/lib/event-stage";

describe("P3 etiquetas", () => {
  it("pt-PT", () => {
    expect(STAGE_LABELS).toEqual({ planeamento: "Planeamento", em_curso: "Em curso", em_fecho: "Em fecho", fechado: "Fechado", historico: "Histórico", cancelado: "Cancelado" });
  });
  it("ignora estágios desconhecidos", () => {
    expect(stageMapFromRows([{ event_id: "a", stage: "fechado" }, { event_id: "b", stage: "x" }])).toEqual({ a: "fechado" });
  });
});

describe("P3 erros", () => {
  it("mapeia códigos do servidor", () => {
    expect(mapStageError({ message: "event_stage_act_on_master: 123" })).toMatch(/master/);
    expect(mapStageError({ message: "event_close_checklist_failed" })).toMatch(/pendências/);
    expect(mapStageError({ message: "event_already_closed" })).toBe("Este evento já está fechado.");
    expect(mapStageError({ message: "event_already_historical" })).toMatch(/histórico/);
    expect(mapStageError({ message: "event_stage_close_invalid" })).toMatch(/não permite/);
    expect(mapStageError({ code: "42501", message: "x" })).toMatch(/permissão/);
    expect(mapStageError({ message: "reason required" })).toBe("Indique o motivo da reabertura.");
  });
});

describe("P3 visibilidade", () => {
  const base = { isSubEvent: false, isAdmin: false, isManager: false, checklistOk: false };
  it("sub-evento sem ações", () => {
    expect(stageActions({ ...base, stage: "em_fecho", isSubEvent: true, isAdmin: true }).showPanel).toBe(false);
  });
  it("fechar: manager em fecho, ativo só com ok", () => {
    expect(stageActions({ ...base, stage: "em_fecho", isManager: true }).canClose).toBe(true);
    expect(stageActions({ ...base, stage: "em_fecho", isManager: true }).closeEnabled).toBe(false);
    expect(stageActions({ ...base, stage: "em_fecho", isManager: true, checklistOk: true }).closeEnabled).toBe(true);
    expect(stageActions({ ...base, stage: "em_curso", isAdmin: true, checklistOk: true }).canClose).toBe(false);
  });
  it("reabrir fecho e histórico só admin", () => {
    expect(stageActions({ ...base, stage: "fechado", isManager: true }).canReopenClosure).toBe(false);
    expect(stageActions({ ...base, stage: "fechado", isAdmin: true }).canReopenClosure).toBe(true);
    expect(stageActions({ ...base, stage: "fechado", isManager: true }).canMarkHistorical).toBe(false);
    expect(stageActions({ ...base, stage: "historico", isAdmin: true }).canUnmarkHistorical).toBe(true);
    expect(stageActions({ ...base, stage: "historico", isAdmin: true }).canMarkHistorical).toBe(false);
  });
  it("reabrir legado bloqueado em fechado/histórico", () => {
    expect(legacyReopenBlock("fechado")).toMatch(/Reabrir fecho/);
    expect(legacyReopenBlock("historico")).toMatch(/Remover de histórico/);
    expect(legacyReopenBlock("em_fecho")).toBeNull();
  });
});

describe("P3 checklist", () => {
  it("formato ok:false (Anitta)", () => {
    const c = parseChecklist({
      ok: false,
      cache: { ok: true, unfrozen: 0, configured_targets: 0 },
      bp_lines: { ok: false, count: 133, saldo_net: 1122040.98 },
      settlements: { ok: false, total: 3, unsealed_or_missing_snapshot: 3 },
      hard_blockers: { ok: true, count: 0, values: { card_sessions: [], camarim_sessions: [], circuit_accounts: [] } },
    });
    expect(c.ok).toBe(false);
    const by = Object.fromEntries(c.blocks.map((b) => [b.key, b]));
    expect(by.settlements.ok).toBe(false);
    expect(by.settlements.detail).toContain("3 por fazer");
    expect(by.bp_lines.detail).toContain("133 linhas");
    expect(by.hard_blockers.ok).toBe(true);
  });
  it("formato ok:true", () => {
    const c = parseChecklist({
      ok: true,
      cache: { ok: true, unfrozen: 0, configured_targets: 2 },
      bp_lines: { ok: true, count: 0, saldo_net: 0 },
      settlements: { ok: true, total: 2, unsealed_or_missing_snapshot: 0 },
      hard_blockers: { ok: true, count: 0, values: {} },
    });
    expect(c.ok).toBe(true);
    expect(c.blocks.every((b) => b.ok)).toBe(true);
  });
  it("hard blockers listados e falha fechada", () => {
    const c = parseChecklist({ ok: true, hard_blockers: { ok: false, count: 2, values: { card_sessions: ["a", "b"] } } });
    expect(c.ok).toBe(false);
    expect(c.blocks.find((b) => b.key === "hard_blockers")!.items).toEqual(["Sessões de cartão por fechar: 2"]);
    expect(parseChecklist(null).ok).toBe(false);
  });
});

describe("P3 filtro ocultar históricos", () => {
  const evs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const st = { a: "historico", b: "em_fecho", c: "fechado" } as const;
  it("oculta por defeito", () => {
    expect(filterEventsByStage(evs, st, { showHistorical: false }).map((e) => e.id)).toEqual(["b", "c"]);
  });
  it("mostra com o controlo", () => {
    expect(filterEventsByStage(evs, st, { showHistorical: true }).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  it("filtro por estágio", () => {
    expect(filterEventsByStage(evs, st, { showHistorical: true, selected: ["fechado"] }).map((e) => e.id)).toEqual(["c"]);
  });
});
