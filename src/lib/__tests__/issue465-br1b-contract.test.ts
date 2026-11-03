import { describe, expect, it, vi } from "vitest";
import { computeInstallmentNets } from "../installment-nets";
import { buildMultiDiff, type ForecastSnapshot } from "../bp-version-multi-diff";
import { computeAccountBalance } from "../account-balance";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Dados sintéticos; estes módulos não executam o pipeline de persistência.
describe("#465 BR1b — bases das parcelas no helper usado pela criação/renegociação", () => {
  it("conserva quatro casas necessárias para reproduzir cada bruto PT", () => {
    const nets = computeInstallmentNets([8374.94, 8374.93], 13617.78, 1.23);
    expect(nets).toEqual([6808.8943, 6808.8857]);
    expect(nets[0] + nets[1]).toBeCloseTo(13617.78, 8);
    expect(nets.map(n => Math.round(n * 1.23 * 100) / 100)).toEqual([8374.94, 8374.93]);
  });

  it("mantém cêntimos das parcelas sem IVA sem transportar moeda ou FX", () => {
    expect(computeInstallmentNets([33.35, 33.34, 33.33], 100.02, 1)).toEqual([33.35, 33.34, 33.33]);
  });

  it("LACUNA: entradas incompatíveis acionam fallback e não garantem soma da base", () => {
    // Não é comportamento desejado: o chamador precisa de validar ambos os totais.
    const nets = computeInstallmentNets([50, 50], 90, 1);
    expect(nets).toEqual([50, 50]);
    expect(nets.reduce((sum, n) => sum + n, 0)).not.toBe(90);
  });
});

describe("#465 BR1b — leitura de snapshots, sem alegar freeze/restore", () => {
  const row: ForecastSnapshot = {
    id: "synthetic-line", type: "expense", description: "Linha sintética",
    specification: null, amount: 0, iva_rate: 0, status: "approved", category_id: null,
  };
  const versions = [{ id: "before", label: "Antes" }, { id: "after", label: "Depois" }];

  it("distingue linha presente de valor zero de linha ausente", () => {
    const result = buildMultiDiff({ versions, snapshotsByVersion: { before: [row], after: [] }, lookup: {} });
    expect(result.groups[0].rows[0].cells.map(c => c.amount)).toEqual([0, null]);
    expect(result.groups[0].rows[0].hasDifferences).toBe(true);
  });

  it("CORRIGIDO #467: alteração só no original/FX é visível na comparação real", () => {
    const before = { ...row, amount: 20, currency: "BRL", original_amount: 110, fx_rate: 0.181818, fx_rate_source: "fixture-a" };
    const after = { ...before, original_amount: 120, fx_rate: 0.166667, fx_rate_source: "fixture-b" };
    const result = buildMultiDiff({ versions, snapshotsByVersion: { before: [before], after: [after] }, lookup: {} });
    expect(result.groups[0].rows[0].cells.map(c => c.amount)).toEqual([20, 20]);
    expect(result.groups[0].rows[0].hasDifferences).toBe(true);
    // Prova somente da projeção do comparador, não de perda no JSON persistido.
  });
});

describe("#465 BR1b — saldo monetário com estados já derivados, sem executar estorno", () => {
  const account = { id: "synthetic-account", initial_balance: 200, initial_balance_date: "2026-10-01" };
  const partial = { account_id: account.id, type: "expense", paid_amount: 17.03, payment_date: "2026-10-02" };

  it("desconta pagamento parcial e soma ajustes de retenção/crédito uma vez", () => {
    expect(computeAccountBalance(account, [partial], new Map([[account.id, 2.01]]))).toBeCloseTo(184.98, 8);
  });

  it("devolve o saldo quando recebe paid_amount zero após estorno cash_refund", () => {
    expect(computeAccountBalance(account, [{ ...partial, paid_amount: 0 }])).toBe(200);
    // O helper não chama reverse_transaction nem prova que o servidor escreveu zero.
  });

  it("preserva saída no crédito do fornecedor e exclui outra conta e histórico", () => {
    expect(computeAccountBalance(account, [
      partial,
      { ...partial, paid_amount: 500, account_id: "other-synthetic-account" },
      { ...partial, paid_amount: 800, payment_date: "2026-10-01" },
    ])).toBeCloseTo(182.97, 8);
    expect(computeAccountBalance({ ...account, skip_balance_check: true }, [partial])).toBeNull();
  });
});
