import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { financialPositionFixture } from "./fixtures/financial-position";
import { explainCommitment, explainPayableTotal, explainStage, payableSplit, reconcile } from "@/lib/financial-position-explain";
import { ExplainButton, FinancialPositionGuideProvider, GuideButton } from "@/components/financial-position/ExplainSheet";

const zeroStage = () => ({ total: 0, bp: 0, bp_linhas: 0, linhas_contrato_cache: 0, sublinhas: { lancado: 0, confirmado: 0, por_rever: 0, ajustado: 0, partner_paid_fora_do_total: 0 }, sem_bp: { total: 0, n: 0 }, so_transacoes: { total: 0, n: 0 } });
/** Medição do Pedro em Live, 28/10/2026, MP, ano nulo (só para aceitação). */
function live20261028() {
  const d = financialPositionFixture();
  const em_curso = zeroStage(); em_curso.so_transacoes = { total: 245094.94, n: 1 }; em_curso.sublinhas.confirmado = 405583.36; em_curso.total = 650678.30;
  const em_fecho = zeroStage(); em_fecho.sublinhas.lancado = 338173.17; em_fecho.sem_bp = { total: 0.02, n: 1 }; em_fecho.total = 338173.19;
  const fechado = zeroStage(); fechado.sublinhas.lancado = 10795.73; fechado.sem_bp = { total: 17.89, n: 1 }; fechado.total = 10813.62;
  d.a_pagar.por_estagio = { em_curso, em_fecho, fechado, planeamento: zeroStage() };
  d.a_pagar.total = 999665.12;
  return d;
}

describe("#391 compromisso em transações", () => {
  it("valores de 28/10/2026: 594.081,75 + 405.583,36 reconcilia com 999.665,12 (±0,01)", () => {
    const d = live20261028();
    expect(payableSplit(d)).toEqual({ compromisso: 594081.75, bpPorLancar: 405583.36 });
    const r = reconcile(explainPayableTotal(d));
    expect(r.reconciled).toBe(true);
    expect(r.diff).toBe(0.01);
    expect(reconcile(explainCommitment(d)).reconciled).toBe(true);
  });
  it("estágio vazio: compromisso 0 e reconcilia", () => {
    const d = live20261028();
    const b = explainStage(d, "planeamento");
    expect(b.total).toBe(0);
    expect(reconcile(b)).toEqual({ reconciled: true, sum: 0, diff: 0 });
  });
  it("total que não reconcilia é sinalizado", () => {
    const d = live20261028();
    d.a_pagar.total = 1000000;
    const r = reconcile(explainPayableTotal(d));
    expect(r.reconciled).toBe(false);
    expect(r.diff).toBe(334.89);
  });
  it("max(0, …) e parcelas em falta", () => {
    expect(reconcile({ total: 0, clampZero: true, parts: [{ label: "a", value: 10 }, { label: "b", value: 50, sign: -1 }] }).reconciled).toBe(true);
    expect(reconcile({ total: 10, parts: [{ label: "a", value: null }] }).reconciled).toBe(false);
  });
});

describe("#391 ⓘ e guia", () => {
  const wrap = (ui: React.ReactNode) => render(<MemoryRouter><FinancialPositionGuideProvider>{ui}</FinancialPositionGuideProvider></MemoryRouter>);
  it("ⓘ abre por toque com a composição e fecha", async () => {
    wrap(<ExplainButton breakdown={explainPayableTotal(live20261028())} />);
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    expect(await screen.findByText("Compromisso em transações")).toBeInTheDocument();
    expect(screen.getByText("Reconciliado (±0,01)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close|fechar/i }));
    await waitFor(() => expect(screen.queryByText("Reconciliado (±0,01)")).not.toBeInTheDocument());
  });
  it("mostra não reconciliado", async () => {
    const d = live20261028(); d.a_pagar.total = 1;
    wrap(<ExplainButton breakdown={explainPayableTotal(d)} />);
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    expect(await screen.findByText(/Não reconciliado/)).toBeInTheDocument();
  });
  it("? abre o guia", async () => {
    wrap(<GuideButton />);
    fireEvent.click(screen.getByRole("button", { name: "Guia da Posição Financeira" }));
    expect(await screen.findByText("Como ler cada número")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Necessidade de financiamento" })).toBeInTheDocument();
  });
});
