// P7a — contratos do sócio no ecrã: só mocks, nenhuma chamada a Live.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";

const rpc = vi.fn();
const uiState = vi.hoisted(() => ({ frozenValues: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => ({ result: null, isLoading: false }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "partner-payment-participant" ? { frozen_at: "2026-10-27", frozen_values: uiState.frozenValues } : undefined,
    refetch: vi.fn(),
  }),
}));

import {
  buildFreezeValues, buildShareOrigin, readFrozenOrigin, shareOriginRows, emptyContractForm, mapPartnerContractError, partnerContractEditBlock, partnerContractsApi, validateContractForm,
} from "@/lib/partner-contracts";
import { TRANSITORY_REASON_LABELS, transitoryReasonLabel, MANUAL_TRANSITORY_REASONS } from "@/lib/transitory-reason";
import type { ParticipantResult, SettlementNodeResult } from "@/lib/event-settlement-engine";
import { PartnerPaymentDialog } from "@/components/PartnerPaymentDialog";

const anitta: ParticipantResult = {
  id: "p1", settlementId: "s1", name: "ANITTA", kind: "partner", mode: "settles", profitPct: 55, lossPct: null, effectivePct: 55,
  usesGrossExpenses: true, effectiveUsesGrossExpenses: true, share: 418598.654, shareNet: 400000.004, paidByPartner: 10.005, extras: 2, settlementAmount: 418606.66,
};
const form = (o: Partial<ReturnType<typeof emptyContractForm>> = {}) => ({ ...emptyContractForm("sup"), gross: "1000", due: "2026-11-30", withholding: false, ...o });
const ctx = { available: 418598.65, activeCount: 0, replacing: false, advancesTotal: 0 };
const node = (overrides: Partial<SettlementNodeResult> = {}): SettlementNodeResult => ({
  id: "s1", name: "Fechamento", parentId: "root", depth: 1, isSealed: false,
  parentQuota: 760576.69, parentQuotaBasis: "net_result_gross_expenses", parentSharePct: 100,
  perimeter: { revenueNet: 0, expensesNet: 0, expensesGross: 0, bpLines: 0, txLines: 0, isRoot: false },
  resultNet: 760576.69, resultGross: 760576.69, moneyNet: 760576.69, childQuotasNet: 0,
  participants: [anitta], operations: [], additionalActiveTotal: 0, vatReturnedIn: 0, vatReturnedOut: 0,
  vatNonRecoverable: 0, vatNonRecoverableLines: [], vatNotReturned: 0, vatReducedIn: 0, addbackIn: 0, addbacks: [],
  nodeUsesGrossExpenses: true, returnsParentDeductibleVat: false, effectiveUsesGrossExpenses: true, ...overrides,
});

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: "ok", error: null }); });

describe("congelar com valores do motor", () => {
  it("share_amount = share do motor com 2 casas e restantes chaves", () => {
    expect(buildFreezeValues(anitta, node())).toEqual({ share_amount: 418598.65, share: 418598.65, share_net: 400000, effective_pct: 55,
      uses_gross_expenses: true, settlement_id: "s1", origin: {
        parent_quota: 760576.69, vat_returned_in: 0, addback_in: 0, additional_actives_total: 0, additional_actives: [],
        exclusive_revenue: 0, expenses_in_perimeter: 0, result_basis_gross: true, result_amount: 760576.69,
      } });
  });
  it("envia os valores do motor ao freeze, nunca de um campo", async () => {
    await partnerContractsApi.freeze("p1", anitta, node(), " nota ");
    expect(rpc).toHaveBeenCalledWith("freeze_settlement_participant", { _participant_id: "p1", _values: buildFreezeValues(anitta, node()), _note: "nota" });
  });
});

describe("P7b — origem da parte", () => {
  it("não grava pagas, extras nem acerto, mesmo quando não são zero", () => {
    const snapshot = buildFreezeValues(anitta, node());
    for (const key of ["paid_by_partner", "extras", "settlement_amount"]) expect(snapshot).not.toHaveProperty(key);
    expect(snapshot.origin.result_amount).toBe(760576.69);
  });
  it("MP + EIN: parcelas 602.712,43 e parte 50% 301.356,22, detalhes não duplicados", () => {
    const n = node({ parentQuota: 119599.61, vatReturnedIn: 262469.05, additionalActiveTotal: 148393.25,
      perimeter: { ...node().perimeter, revenueNet: 72250.52 }, resultGross: 602712.43,
      operations: [
        { operationId: "a", name: "Operação A", kind: "bar", mode: "fee", value: 100000, alreadyUpstream: 0, additionalActive: 100000 },
        { operationId: "b", name: "Operação B", kind: "bar", mode: "fee", value: 48393.25, alreadyUpstream: 0, additionalActive: 48393.25 },
        { operationId: "z", name: "Sem adicional", kind: "bar", mode: "fee", value: 0, alreadyUpstream: 0, additionalActive: 0 },
      ] });
    const p = { ...anitta, effectivePct: 50, share: 301356.22 };
    const snapshot = buildFreezeValues(p, n);
    expect(snapshot.origin).toEqual({ parent_quota: 119599.61, vat_returned_in: 262469.05, addback_in: 0,
      additional_actives_total: 148393.25, additional_actives: [{ name: "Operação A", value: 100000 }, { name: "Operação B", value: 48393.25 }],
      exclusive_revenue: 72250.52, expenses_in_perimeter: 0, result_basis_gross: true, result_amount: 602712.43 });
    expect(snapshot.share_amount).toBe(301356.22);
    expect(Math.round(snapshot.origin.result_amount * snapshot.effective_pct) / 100).toBe(301356.22);
    expect(shareOriginRows(snapshot.origin).find((r) => r.key === "other")).toBeUndefined();
  });
  it("Rafael Lobo: quota 179.399,42 e parte 20% 35.879,88", () => {
    const snapshot = buildFreezeValues({ ...anitta, effectivePct: 20, share: 35879.88 }, node({ parentQuota: 179399.42, resultGross: 179399.42 }));
    expect(snapshot.origin.parent_quota).toBe(179399.42);
    expect(snapshot.origin.result_amount).toBe(179399.42);
    expect(snapshot.share_amount).toBe(35879.88);
    expect(Math.round(snapshot.origin.result_amount * snapshot.effective_pct) / 100).toBe(35879.88);
  });
  it("s/IVA usa resultNet menos vatReturnedOut, não a base efetiva de apresentação", () => {
    const origin = buildShareOrigin({ ...anitta, usesGrossExpenses: false }, node({ resultNet: 1000, vatReturnedOut: 230, resultGross: 800 }));
    expect(origin.result_amount).toBe(770);
    expect(origin.result_basis_gross).toBe(false);
  });
  it("despesas seguem a base do nó e custos devolvidos entram como parcela", () => {
    const n = node({ parentQuota: 1000, addbackIn: 100, resultGross: 854,
      perimeter: { ...node().perimeter, expensesGross: 246, expensesNet: 200 } });
    expect(buildShareOrigin(anitta, n).expenses_in_perimeter).toBe(246);
    const rows = shareOriginRows(buildShareOrigin(anitta, n));
    expect(rows.find((r) => r.key === "expenses")?.value).toBe(-246);
    expect(rows.find((r) => r.key === "addback")?.value).toBe(100);
    expect(buildShareOrigin(anitta, { ...n, nodeUsesGrossExpenses: false }).expenses_in_perimeter).toBe(200);
  });
  it.each([0.01, -230])("diferença %s é conservada em Outros / arredondamentos", (difference) => {
    const rows = shareOriginRows(buildShareOrigin(anitta, node({ parentQuota: 1000, resultGross: 1000 + difference })));
    expect(rows.find((r) => r.key === "other")?.value).toBe(difference);
    expect(rows.filter((r) => !r.detail && r.key !== "result").reduce((sum, r) => sum + Math.round(r.value * 100), 0)).toBe(Math.round((1000 + difference) * 100));
  });
  it("raiz sem quota mostra receitas/despesas existentes e resultado, incluindo zero", () => {
    const n = node({ parentId: null, parentQuota: null, resultGross: 0,
      perimeter: { ...node().perimeter, isRoot: true, revenueNet: 100, expensesGross: 100 } });
    const rows = shareOriginRows(buildShareOrigin(anitta, n));
    expect(rows.map((r) => r.key)).toEqual(["revenue", "expenses", "result"]);
    expect(rows.find((r) => r.key === "result")?.value).toBe(0);
  });
  it("origem congelada é a gravada, independente do motor atual", () => {
    const snapshot = buildFreezeValues(anitta, node());
    expect(readFrozenOrigin(snapshot)).toEqual(snapshot.origin);
    expect(readFrozenOrigin({ origin: [] })).toBeNull();
  });
  it("congelação antiga sem origin abre o diálogo sem erro nem RPC", () => {
    uiState.frozenValues = { share_amount: 418598.65, paid_by_partner: 10, extras: 2, settlement_amount: 418606.65 };
    expect(readFrozenOrigin(uiState.frozenValues)).toBeNull();
    try {
      expect(() => render(createElement(PartnerPaymentDialog, { open: true, onOpenChange: vi.fn(), eventId: "ev", participantId: "p1", supplierId: "sup", partnerName: "ANITTA" }))).not.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });
});

describe("criar contrato", () => {
  it("sem retenção: taxa e data nulas", async () => {
    await partnerContractsApi.create("p1", form(), "k1");
    expect(rpc).toHaveBeenCalledWith("create_partner_payment_contract", expect.objectContaining({ _gross: 1000, _wh_applies: false, _wh_rate: null, _wh_due: null, _due: "2026-11-30", _key: "k1", _advance_ids: [] }));
  });
  it("com retenção: taxa e data enviadas", async () => {
    await partnerContractsApi.create("p1", form({ withholding: true, whRate: "25", whDue: "2026-12-20" }), "k2");
    expect(rpc).toHaveBeenCalledWith("create_partner_payment_contract", expect.objectContaining({ _wh_applies: true, _wh_rate: 25, _wh_due: "2026-12-20" }));
  });
});

describe("validações", () => {
  it("retenção sem resposta recusada (sem pré-seleção)", () => {
    expect(emptyContractForm().withholding).toBeNull();
    expect(validateContractForm(form({ withholding: null }), ctx)).toMatch("retenção");
  });
  it("vencimento obrigatório", () => expect(validateContractForm(form({ due: "" }), ctx)).toMatch("vencimento"));
  it("soma acima da parte recusada", () => expect(validateContractForm(form({ gross: "418598.66" }), ctx)).toMatch("parte congelada"));
  it("5.º contrato recusado", () => expect(validateContractForm(form(), { ...ctx, activeCount: 4 })).toMatch("Máximo de 4"));
  it("substituir não conta como novo", () => expect(validateContractForm(form(), { ...ctx, activeCount: 4, replacing: true })).toBeNull());
  it("retenção exige taxa e data", () => {
    expect(validateContractForm(form({ withholding: true, whRate: "", whDue: "2026-12-01" }), ctx)).toMatch("Taxa");
    expect(validateContractForm(form({ withholding: true, whRate: "25", whDue: "" }), ctx)).toMatch("data da retenção");
  });
  it("retenção + adiantamentos > bruto recusado", () => expect(validateContractForm(form({ withholding: true, whRate: "25", whDue: "2026-12-01" }), { ...ctx, advancesTotal: 800 })).toMatch("saldo negativo"));
  it("bruto com 3 casas recusado", () => expect(validateContractForm(form({ gross: "10.005" }), ctx)).toMatch("Valor bruto"));
});

describe("mapeamento de erros", () => {
  it.each([
    ["parte_excedida", "ultrapassa a parte"],
    ["limite_contratos: máximo 4", "Máximo de 4"],
    ["contrato_com_pagamento: estorne primeiro pelos fluxos normais", "tem pagamentos"],
    ["beneficiario_diferente: confirme explicitamente", "confirme explicitamente"],
    ["socio_nao_congelado", "congelado"],
    ["Sócio com contratos de pagamento ativos: cancele-os primeiro", "cancele-os antes de descongelar"],
  ])("%s", (raw, expected) => expect(mapPartnerContractError({ message: raw })).toContain(expected));
  it("erro desconhecido nunca aparece cru", () => expect(mapPartnerContractError({ message: "XX000 boom stack" })).toBe("Não foi possível concluir a operação. Tente de novo."));
  it("a RPC lança a mensagem mapeada", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "parte_excedida" } });
    await expect(partnerContractsApi.create("p1", form(), "k")).rejects.toThrow("ultrapassa a parte congelada");
  });
});

describe("cancelar, ligar adiantamento, descongelar", () => {
  it("cancelar envia o motivo", async () => {
    await partnerContractsApi.cancel("c1", "erro");
    expect(rpc).toHaveBeenCalledWith("cancel_partner_payment_contract", { _contract_id: "c1", _reason: "erro" });
  });
  it("ligar adiantamento com confirmação explícita", async () => {
    await partnerContractsApi.attach("c1", "a1", true);
    expect(rpc).toHaveBeenCalledWith("attach_partner_advance_to_contract", { _contract_id: "c1", _advance_tx_id: "a1", _confirm_beneficiary: true });
  });
  it("descongelar recusado com contratos ativos mostra pt-PT", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Sócio com contratos de pagamento ativos: cancele-os primeiro" } });
    await expect(partnerContractsApi.unfreeze("p1", "rever")).rejects.toThrow("O sócio tem contratos ativos: cancele-os antes de descongelar.");
  });
});

describe("transações de contrato e etiqueta do motivo", () => {
  it("edição de valor/rubrica/fornecedor/evento bloqueada; resto livre", () => {
    const t = { partner_contract_id: "c1", amount: 750, category_id: "cat", supplier_id: "sup", event_id: "ev" };
    expect(partnerContractEditBlock(t, { amount: "750.00", category_id: "cat", supplier_id: "sup", event_id: "ev" })).toBeNull();
    for (const k of ["amount", "category_id", "supplier_id", "event_id"] as const)
      expect(partnerContractEditBlock(t, { ...t, [k]: k === "amount" ? "751" : "x" })).toMatch("só se alteram no contrato");
    expect(partnerContractEditBlock({ ...t, partner_contract_id: null }, { amount: "1" })).toBeNull();
  });
  it("Distribuição de resultado: etiqueta, não escolhível à mão, valor preservado", () => {
    expect(TRANSITORY_REASON_LABELS.distribuicao_resultado).toBe("Distribuição de resultado");
    expect(transitoryReasonLabel("distribuicao_resultado")).toBe("Distribuição de resultado");
    expect(MANUAL_TRANSITORY_REASONS).not.toContain("distribuicao_resultado");
  });
});
