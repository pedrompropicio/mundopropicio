import { describe, it, expect } from "vitest";
import {
  isOutsideRootPerimeter,
  keepRootPerimeter,
  pickOutsideRootPerimeter,
} from "../settlement-perimeter";

const ROOT = "root-1";
const CHILD = "child-1";

describe("isOutsideRootPerimeter", () => {
  it("linha marcada com fechamento filho sai do resultado", () => {
    expect(isOutsideRootPerimeter({ event_settlement_id: CHILD }, ROOT)).toBe(true);
  });
  it("linha marcada com a raiz fica", () => {
    expect(isOutsideRootPerimeter({ event_settlement_id: ROOT }, ROOT)).toBe(false);
  });
  it("linha sem marca fica", () => {
    expect(isOutsideRootPerimeter({ event_settlement_id: null }, ROOT)).toBe(false);
    expect(isOutsideRootPerimeter({}, ROOT)).toBe(false);
  });
  it("sem raízes conhecidas, qualquer marca sai", () => {
    expect(isOutsideRootPerimeter({ event_settlement_id: CHILD }, null)).toBe(true);
  });
  it("aceita várias raízes (Master + Splits)", () => {
    expect(isOutsideRootPerimeter({ event_settlement_id: "r2" }, [ROOT, "r2"])).toBe(false);
  });
});

describe("keepRootPerimeter / pickOutsideRootPerimeter", () => {
  const lines = [
    { id: "a", event_settlement_id: null },
    { id: "b", event_settlement_id: ROOT },
    { id: "c", event_settlement_id: CHILD },
  ];
  it("separa as duas metades sem perder linhas", () => {
    expect(keepRootPerimeter(lines, ROOT).map((l) => l.id)).toEqual(["a", "b"]);
    expect(pickOutsideRootPerimeter(lines, ROOT).map((l) => l.id)).toEqual(["c"]);
  });
});
