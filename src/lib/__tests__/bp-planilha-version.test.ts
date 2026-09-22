import { describe, expect, it } from "vitest";
import { getBPPlanilhaRpcVersionId, getBPPlanilhaVersionFilter } from "../bp-planilha-version";

describe("BP Planilha — seleção de versão", () => {
  it("usa IS NULL e envia null para o BP ativo", () => {
    expect(getBPPlanilhaVersionFilter(null)).toEqual({
      method: "is",
      column: "version_id",
      value: null,
    });
    expect(getBPPlanilhaRpcVersionId(null)).toBeNull();
  });

  it("usa EQ e envia o UUID do cenário selecionado", () => {
    const versionId = "11111111-2222-4333-8444-555555555555";
    expect(getBPPlanilhaVersionFilter(versionId)).toEqual({
      method: "eq",
      column: "version_id",
      value: versionId,
    });
    expect(getBPPlanilhaRpcVersionId(versionId)).toBe(versionId);
  });
});