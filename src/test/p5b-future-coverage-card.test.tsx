import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FutureCoverageView } from "@/components/financial-position/FutureCoverageCard";

const meta = { incompleto: false, motivo: null, nota_bp_provisorio: "BP provisório", notas: { necessidade: "n", aporte_mp: "a" } };
const total = { vendas_futuras: 1, despesas_pagas_futuras: 1, a_pagar_lancado_futuros: 1, a_pagar_sem_linha_futuros: 0, bp_por_lancar_futuros: 1,
  saido_minimo_total: null, aporte_socios_total: 1, aporte_mp_estimativa_total: 0, dinheiro_de_eventos_em_conta: 1, caixa_mp_adiantado_total: 0,
  necessidade: { com_sem_linha: 358035.96, sem_linha_cobre_bp: 195699 } };

describe("P5b cartão de cobertura", () => {
  it("mostra as duas leituras da necessidade lado a lado e a nota do BP provisório", () => {
    render(<FutureCoverageView data={{ meta, eventos: [], bilheteiras: [], total } as any} />);
    expect(screen.getByText("Necessidade — com faturas sem linha")).toBeTruthy();
    expect(screen.getByText("Necessidade — faturas sem linha cobrem BP")).toBeTruthy();
    expect(screen.getByText("BP provisório")).toBeTruthy();
  });
  it("bloco incompleto não mostra números", () => {
    render(<FutureCoverageView data={{ meta: { ...meta, incompleto: true }, eventos: null, bilheteiras: null, total: null } as any} />);
    expect(screen.getAllByText(/incompleto/).length).toBeGreaterThan(0);
  });
});
