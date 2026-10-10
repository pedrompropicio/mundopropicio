/**
 * (#88) Pré-condições do Fecho: antes de apresentar um apuramento, dizer o que falta.
 * - "blocking": sem isto não há apuramento (o acerto com sócios não é mostrado).
 * - "warning": o apuramento aparece, mas com aviso por cima.
 */
export type FechoPrecondition = { key: string; level: "blocking" | "warning"; message: string };

export interface FechoPreconditionInput {
  revenue: number;
  hasTicketSales: boolean;
  bpExpenseLines: number;
  bpIncomeLines: number;
  partners: number;
  /** Evento é cidade de turnê (tem pai). */
  isTourCity: boolean;
  /** Nº de sócios registados no pai (só relevante se isTourCity). */
  parentPartners: number;
  expenses: number;
}

/** Abaixo desta cobertura (receita ÷ custo) o Fecho avisa que o apuramento parece incompleto. */
export const LOW_COVERAGE_RATIO = 0.5;

export function computeFechoPreconditions(i: FechoPreconditionInput): FechoPrecondition[] {
  const out: FechoPrecondition[] = [];
  if (i.partners === 0) {
    out.push({
      key: "no_partners",
      level: "blocking",
      message: i.isTourCity && i.parentPartners > 0
        ? "Esta cidade não tem sócios próprios. Os sócios da turnê aplicam-se ao consolidado do Master — o acerto faz-se no Fecho do Master."
        : "Sem sócios registados neste evento — não há acerto a apurar.",
    });
  }
  if (i.bpExpenseLines === 0) {
    out.push({ key: "no_bp", level: "blocking", message: "Sem BP aprovado (nenhuma linha de despesa aprovada) — o fecho é pelo BP (D-ERP3)." });
  }
  if (Math.abs(i.revenue) < 0.005) {
    out.push({ key: "no_revenue", level: "blocking", message: "Sem receita (nem bilheteira, nem receitas, nem linhas de receita no BP)." });
  }
  if (!i.hasTicketSales) {
    out.push({ key: "no_ticketing", level: "warning", message: "Sem vendas de bilheteira registadas — a receita vem só de transações/BP." });
  }
  if (i.bpIncomeLines === 0) {
    out.push({ key: "no_bp_income", level: "warning", message: "O BP não tem linhas de receita aprovadas." });
  }
  if (i.revenue > 0.005 && i.expenses > 0 && i.revenue / i.expenses < LOW_COVERAGE_RATIO) {
    const pct = Math.round((i.revenue / i.expenses) * 100);
    out.push({
      key: "low_coverage",
      level: "warning",
      message: `A receita cobre só ${pct}% do custo. Confirme se falta receita (bilheteira, patrocínios) ou se o BP está noutra moeda/escala antes de usar as quotas.`,
    });
  }
  return out;
}

export function hasBlockingPrecondition(list: FechoPrecondition[]): boolean {
  return list.some((p) => p.level === "blocking");
}
