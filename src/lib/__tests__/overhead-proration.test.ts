import { describe, it, expect } from "vitest";
import { expandOverheadToSplits } from "../overhead-proration";

const events = [
  { id: "master-1", parent_event_id: null },
  { id: "split-a", parent_event_id: "master-1" },
  { id: "split-b", parent_event_id: "master-1" },
  { id: "split-c", parent_event_id: "master-1" },
  { id: "solo-1", parent_event_id: null },
];

describe("expandOverheadToSplits", () => {
  it("mantém overhead intacto em evento sem splits", () => {
    const out = expandOverheadToSplits(
      [{ id: "oh1", event_id: "solo-1", amount: 300 }],
      events,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("oh1");
    expect(out[0].event_id).toBe("solo-1");
    expect(Number(out[0].amount)).toBe(300);
    expect(out[0]._overhead_via_master).toBeUndefined();
  });

  it("expande overhead do Master em fatias ÷N para os splits, preservando o original", () => {
    const out = expandOverheadToSplits(
      [{ id: "oh-master", event_id: "master-1", amount: 900 }],
      events,
    );
    // 1 original + 3 fatias virtuais
    expect(out).toHaveLength(4);

    const original = out.find((o) => o.id === "oh-master")!;
    expect(original.event_id).toBe("master-1");
    expect(Number(original.amount)).toBe(900);
    expect(original._overhead_via_master).toBeUndefined();

    const slices = out.filter((o) => o._overhead_via_master);
    expect(slices).toHaveLength(3);
    for (const s of slices) {
      expect(Number(s.amount)).toBe(300); // 900 / 3
      expect(s._master_event_id).toBe("master-1");
      expect(s._split_share).toBeCloseTo(1 / 3);
      expect(s.id.startsWith("oh-master::split::")).toBe(true);
    }
    // Garante 1 fatia por split
    const splitIds = slices.map((s) => s.event_id).sort();
    expect(splitIds).toEqual(["split-a", "split-b", "split-c"]);
  });

  it("não expande overhead lançado num split (já é local)", () => {
    const out = expandOverheadToSplits(
      [{ id: "oh-local", event_id: "split-a", amount: 100 }],
      events,
    );
    expect(out).toHaveLength(1);
    expect(out[0].event_id).toBe("split-a");
    expect(out[0]._overhead_via_master).toBeUndefined();
  });

  it("Master sem splits: linha fica intacta (sem expansão)", () => {
    const eventsNoSplits = [{ id: "lonely-master", parent_event_id: null }];
    const out = expandOverheadToSplits(
      [{ id: "oh-x", event_id: "lonely-master", amount: 500 }],
      eventsNoSplits,
    );
    expect(out).toHaveLength(1);
    expect(Number(out[0].amount)).toBe(500);
  });

  it("aceita amount como string e divide corretamente", () => {
    const out = expandOverheadToSplits(
      [{ id: "oh", event_id: "master-1", amount: "1000" }],
      events,
    );
    const slices = out.filter((o) => o._overhead_via_master);
    expect(slices).toHaveLength(3);
    expect(Number(slices[0].amount)).toBeCloseTo(1000 / 3);
  });

  it("processa múltiplos overheads independentemente", () => {
    const out = expandOverheadToSplits(
      [
        { id: "oh1", event_id: "master-1", amount: 600 },
        { id: "oh2", event_id: "solo-1", amount: 200 },
      ],
      events,
    );
    // oh1: 1 + 3 = 4; oh2: 1
    expect(out).toHaveLength(5);
    const oh1Slices = out.filter((o) => o._master_event_id === "master-1");
    expect(oh1Slices).toHaveLength(3);
    expect(oh1Slices.every((s) => Number(s.amount) === 200)).toBe(true);
  });

  it("preserva campos arbitrários (category_id, description) nas fatias", () => {
    const out = expandOverheadToSplits(
      [
        {
          id: "oh",
          event_id: "master-1",
          amount: 300,
          description: "Assessoria de imprensa",
          category_id: "cat-juridico",
          iva_rate: 23,
          type: "expense",
        },
      ],
      events,
    );
    const slice = out.find((o) => o._overhead_via_master)!;
    expect(slice.description).toBe("Assessoria de imprensa");
    expect(slice.category_id).toBe("cat-juridico");
    expect(slice.iva_rate).toBe(23);
    expect(slice.type).toBe("expense");
  });
});
