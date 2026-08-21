import { createContext, useContext } from "react";
import { DEFAULT_VISIBLE_COLUMNS, METRIC_COLUMNS, type MetricColumnDef } from "@/lib/crm/columns";

/**
 * Contexto da tabela do dashboard (Fase 1): colunas visíveis + parâmetros
 * necessários ao drill-down preguiçoso (conjuntos/anúncios).
 */
export interface DashboardTableCtx {
  columns: MetricColumnDef[];
  companyId: string | null | undefined;
  adAccountId: string | null | undefined;
  currency: string;
  /** Janela do período seleccionado, em yyyy-MM-dd (fuso de Lisboa). */
  from: string;
  to: string;
}

const fallback: DashboardTableCtx = {
  columns: METRIC_COLUMNS.filter((c) => DEFAULT_VISIBLE_COLUMNS.includes(c.id)),
  companyId: null,
  adAccountId: null,
  currency: "EUR",
  from: "",
  to: "",
};

export const DashboardTableContext = createContext<DashboardTableCtx>(fallback);

export function useDashboardTableCtx() {
  return useContext(DashboardTableContext);
}
