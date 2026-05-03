import { describe, it, expect } from "vitest";
import { isComboAllowed, coerceLotKind } from "../combo-gating";

describe("combo-gating: isComboAllowed", () => {
  it("permite Combo em festival multi-dia sem parent", () => {
    expect(
      isComboAllowed({ event_type: "festival", parent_event_id: null, event_dates_count: 3 }),
    ).toBe(true);
  });

  it("bloqueia Combo em festival de 1 dia", () => {
    expect(
      isComboAllowed({ event_type: "festival", parent_event_id: null, event_dates_count: 1 }),
    ).toBe(false);
  });

  it("bloqueia Combo em festival sem datas", () => {
    expect(
      isComboAllowed({ event_type: "festival", parent_event_id: null, event_dates_count: 0 }),
    ).toBe(false);
  });

  it("bloqueia Combo em evento simples (não-festival) multi-dia", () => {
    expect(
      isComboAllowed({ event_type: "simple", parent_event_id: null, event_dates_count: 3 }),
    ).toBe(false);
  });

  it("bloqueia Combo em sub-evento de turnê (parent_event_id presente)", () => {
    expect(
      isComboAllowed({
        event_type: "festival",
        parent_event_id: "tour-master-id",
        event_dates_count: 5,
      }),
    ).toBe(false);
  });

  it("bloqueia Combo em turnê master (tipo tour)", () => {
    expect(
      isComboAllowed({ event_type: "tour", parent_event_id: null, event_dates_count: 5 }),
    ).toBe(false);
  });

  it("bloqueia Combo quando event_type é null/undefined", () => {
    expect(isComboAllowed({ event_type: null, parent_event_id: null, event_dates_count: 3 })).toBe(false);
    expect(isComboAllowed({ event_type: undefined, parent_event_id: null, event_dates_count: 3 })).toBe(
      false,
    );
  });
});

describe("combo-gating: coerceLotKind", () => {
  const okGating = { event_type: "festival", parent_event_id: null, event_dates_count: 2 };

  it("mantém combo quando permitido", () => {
    expect(coerceLotKind("combo", okGating)).toBe("combo");
  });

  it("força simple quando o utilizador escolhe combo num evento simples 1 dia", () => {
    expect(
      coerceLotKind("combo", { event_type: "simple", parent_event_id: null, event_dates_count: 1 }),
    ).toBe("simple");
  });

  it("força simple num sub-evento de turnê mesmo se desired=combo", () => {
    expect(
      coerceLotKind("combo", {
        event_type: "festival",
        parent_event_id: "tour-master",
        event_dates_count: 5,
      }),
    ).toBe("simple");
  });

  it("força simple num festival de 1 dia mesmo se desired=combo", () => {
    expect(coerceLotKind("combo", { ...okGating, event_dates_count: 1 })).toBe("simple");
  });

  it("default seguro: valores inválidos viram simple", () => {
    expect(coerceLotKind(undefined, okGating)).toBe("simple");
    expect(coerceLotKind(null, okGating)).toBe("simple");
    expect(coerceLotKind("", okGating)).toBe("simple");
    expect(coerceLotKind("foo", okGating)).toBe("simple");
  });

  it("simple permanece simple em qualquer cenário", () => {
    expect(coerceLotKind("simple", okGating)).toBe("simple");
    expect(
      coerceLotKind("simple", {
        event_type: "simple",
        parent_event_id: null,
        event_dates_count: 1,
      }),
    ).toBe("simple");
  });
});

describe("combo-gating: matriz E2E de cenários do produto", () => {
  const cases: Array<{
    name: string;
    gating: { event_type: string | null; parent_event_id: string | null; event_dates_count: number };
    selectorVisible: boolean;
    savedAs: "simple" | "combo";
    desired: string;
  }> = [
    {
      name: "Festival multi-dia (3 dias) → selector visível, combo gravado",
      gating: { event_type: "festival", parent_event_id: null, event_dates_count: 3 },
      selectorVisible: true,
      savedAs: "combo",
      desired: "combo",
    },
    {
      name: "Festival 1 dia → selector escondido, força simple",
      gating: { event_type: "festival", parent_event_id: null, event_dates_count: 1 },
      selectorVisible: false,
      savedAs: "simple",
      desired: "combo",
    },
    {
      name: "Evento simples 1 dia (não-festival) → selector escondido, força simple",
      gating: { event_type: "simple", parent_event_id: null, event_dates_count: 1 },
      selectorVisible: false,
      savedAs: "simple",
      desired: "combo",
    },
    {
      name: "Turnê multi-cidade (sub-evento) → selector escondido, força simple",
      gating: { event_type: "festival", parent_event_id: "master-1", event_dates_count: 4 },
      selectorVisible: false,
      savedAs: "simple",
      desired: "combo",
    },
    {
      name: "Turnê master (tipo tour) → selector escondido, força simple",
      gating: { event_type: "tour", parent_event_id: null, event_dates_count: 6 },
      selectorVisible: false,
      savedAs: "simple",
      desired: "combo",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(isComboAllowed(c.gating)).toBe(c.selectorVisible);
      expect(coerceLotKind(c.desired, c.gating)).toBe(c.savedAs);
    });
  }
});
