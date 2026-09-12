import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  OPERATION_KEY_PATTERN,
  isValidOperationKey,
  normalizeOperationKeyInput,
  operationKeyRejectionReason,
} from "@/lib/operation-key";

describe("chave de operação (D-ERP45)", () => {
  it("aceita as chaves reais em uso", () => {
    for (const k of [
      "ACERTO-FOOD-IVETE-2026",
      "ACERTO-SSH-COALA-2026",
      "ACERTO-BARES-ANITTA-2026",
      "CAMARIM-9D81140A",
      "REVSHARE-TICKETLINE-ANITTA-2026",
    ]) {
      expect(isValidOperationKey(k)).toBe(true);
    }
  });

  it("recusa variantes silenciosas", () => {
    for (const k of ["acerto-food", "ACERTO FOOD 2026", "ACERTO_FOOD", "ACERTO", "ACERTO--FOOD", "ACERTO-"]) {
      expect(isValidOperationKey(k)).toBe(false);
    }
    // Só é recusada de vez a que nem depois de normalizada dá chave válida.
    expect(operationKeyRejectionReason("ACERTO")).toBeTruthy();
    expect(operationKeyRejectionReason("!!!")).toBeTruthy();
    expect(operationKeyRejectionReason("acerto food 2026")).toBeNull();
  });


  it("normaliza o que o utilizador escreve", () => {
    expect(normalizeOperationKeyInput("acerto food ivete 2026")).toBe("ACERTO-FOOD-IVETE-2026");
    expect(normalizeOperationKeyInput("acerto_food/ivete")).toBe("ACERTO-FOODIVETE");
    expect(normalizeOperationKeyInput("Acérto-Food")).toBe("ACERTO-FOOD");
  });

  it("mantém o espelho da edge function igual ao padrão do src", () => {
    const fn = readFileSync("supabase/functions/update-transaction/index.ts", "utf8");
    const m = fn.match(/const OPERATION_KEY_RE = (\/.*\/);/);
    expect(m, "espelho OPERATION_KEY_RE não encontrado").toBeTruthy();
    expect(m![1]).toBe(OPERATION_KEY_PATTERN.toString());
  });
});
