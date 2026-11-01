import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// #298 (decisão B): o Modelo B (cronograma de parcelas `planned` em
// `transaction_payments`) foi aposentado; o Modelo A (grupo de transações,
// `installment_group_id`) é a única via de parcelamento.

const SRC = join(process.cwd(), "src");
const SELF = "components/__tests__/installment-model-b-retired.test.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC)
  .map((p) => ({ rel: relative(SRC, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }))
  // types.ts é gerado a partir da base (fora do âmbito de src/ editável)
  .filter((f) => f.rel !== SELF && !f.rel.startsWith("integrations/supabase/"));

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("Modelo B de parcelamento aposentado (#298)", () => {
  it("o ficheiro do modal de marcar parcela planeada como paga não existe", () => {
    expect(existsSync(join(SRC, "components/MarkInstallmentPaidModal.tsx"))).toBe(false);
  });

  it("nenhuma referência à RPC update_planned_installments nem ao 'Cronograma de parcelas'", () => {
    const offenders = files.filter((f) => /update_planned_installments|Cronograma de parcelas|Gravar cronograma|Soma planeada/i.test(f.text));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("o PaymentTimeline já não escreve parcelas planned/cancelled", () => {
    const text = read("components/PaymentTimeline.tsx");
    expect(text).not.toMatch(/status:\s*["']cancelled["']/);
    expect(text).not.toMatch(/["']planned["']/);
  });
});

describe("Modelo A é o ponto de entrada do parcelamento (#298)", () => {
  it("criação: o toggle 'Pagar em parcelas' do formulário gera um installment_group_id", () => {
    const text = read("components/TransactionFormModal.tsx");
    expect(text).toContain("Pagar em parcelas");
    expect(text).toMatch(/installment_group_id:\s*installmentGroupId/);
    // não insere linhas planeadas em transaction_payments
    expect(text).not.toMatch(/status:\s*["']planned["']/);
  });

  it("edição: o modal abre o editor de grupo e a renegociação em parcelas", () => {
    const text = read("components/TransactionEditModal.tsx");
    expect(text).toContain("<TransactionInstallmentGroupEditor");
    expect(text).toContain("<TransactionRenegotiateInstallmentsModal");
    expect(text).toContain("useInstallmentGroup");
  });
});
