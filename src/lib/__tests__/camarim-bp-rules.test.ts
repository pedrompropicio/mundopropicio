import { describe, it, expect } from "vitest";
import { itemBpLineError, itemTargetEvent, lineShortfalls, settlementPreview, shortfallMessage } from "@/lib/camarim-bp-rules";

// Caso real SM Lisboa (0403d64e): sessão single_event, sem Master.
const LISBOA = "95051bc2";
const TURNE = "5e56f568";
const lisboaLine = { id: "compras", event_id: LISBOA, description: "Compras - Camarim", specification: null, amount: 1000, realized: 0 };

describe("D-ERP264 — regras de BP nos itens de camarim", () => {
  it("recusa item com linha de outro evento", () => {
    const target = itemTargetEvent("local_city", { masterEventId: null, primaryEventId: LISBOA });
    const err = itemBpLineError({
      scope: "local_city", target, targetEventName: "SM - Lisboa", withBp: true, lines: [lisboaLine],
      selectedLine: { id: "da-turne", event_id: TURNE },
    });
    expect(err).toMatch(/não pertence ao BP do evento "SM - Lisboa"/);
    expect(itemBpLineError({ scope: "local_city", target, withBp: true, lines: [lisboaLine], selectedLine: lisboaLine })).toBeNull();
  });

  it("recusa master_common sem Master na sessão e sem linha no Master", () => {
    const semMaster = itemTargetEvent("master_common", { masterEventId: null, primaryEventId: LISBOA });
    expect(semMaster.eventId).toBeNull();
    expect(itemBpLineError({ scope: "master_common", target: semMaster, withBp: true, lines: [], selectedLine: null })).toMatch(/não tem evento Master/);

    const comMaster = itemTargetEvent("master_common", { masterEventId: TURNE, primaryEventId: LISBOA });
    expect(comMaster.eventId).toBe(TURNE);
    expect(
      itemBpLineError({ scope: "master_common", target: comMaster, targetEventName: "Turnê Simone Mendes 2026", withBp: true, lines: [], selectedLine: null }),
    ).toMatch(/não tem nenhuma linha 2\.6\.04/);
    // a linha da cidade não serve para a verba do Master
    expect(itemBpLineError({ scope: "master_common", target: comMaster, withBp: true, lines: [], selectedLine: lisboaLine })).toMatch(/não pertence/);
  });

  it("bloqueia a integração quando a linha do item não tem saldo, e diz quanto falta", () => {
    const line = { ...lisboaLine, amount: 100, realized: 80 };
    const sf = lineShortfalls([{ bp_forecast_id: "compras", base_amount: 30 }, { bp_forecast_id: null, base_amount: 999 }], [line]);
    expect(sf).toEqual([{ forecastId: "compras", label: "Compras - Camarim", falta: 10 }]);
    expect(shortfallMessage(sf[0])).toMatch(/faltam 10,00 €/);
    expect(lineShortfalls([{ bp_forecast_id: "compras", base_amount: 20 }], [line])).toEqual([]);
  });

  it("gasto acima do adiantamento não bloqueia: a MP reembolsa a diferença", () => {
    // Recebeu 200 €, gastou 1.500 € (muito acima da antiga tolerância de 50 €/10 %).
    const p = settlementPreview(200, 1500);
    expect(p.type).toBe("reinforcement");
    expect(p.balance).toBe(-1300);
    expect(p.message).toBe("A MP reembolsa 1300,00 € à gestora.");
  });

  it("pré-visualização do acerto com saldo positivo e zero", () => {
    expect(settlementPreview(500, 420.5)).toMatchObject({ type: "refund", balance: 79.5, message: "A gestora devolve 79,50 €." });
    expect(settlementPreview(100, 100).type).toBe("balanced");
  });
});

describe("D-ERP264 — regra (5) removida do ecrã da sessão", () => {
  it("CamarimSessionDetail já não bloqueia por gasto acima do adiantamento", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/pages/CamarimSessionDetail.tsx", "utf8");
    expect(src).not.toMatch(/diferença muito grande/);
    expect(src).not.toMatch(/advanceNet \* 0\.1/);
    expect(src).toMatch(/lineShortfalls\(/);
  });
});
