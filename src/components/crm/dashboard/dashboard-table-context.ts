import { createContext, useContext } from "react";
import { DEFAULT_VISIBLE_COLUMNS, METRIC_COLUMNS, type MetricColumnDef } from "@/lib/crm/columns";
import { NO_SORT, type SortKey, type SortState } from "@/lib/crm/table-sort";

/**
 * Contexto da tabela do dashboard: colunas visíveis, parâmetros do drill-down
 * preguiçoso (conjuntos/anúncios) e estado de ordenação (Fase 2).
 */
export interface DashboardTableCtx {
  columns: MetricColumnDef[];
  companyId: string | null | undefined;
  adAccountId: string | null | undefined;
  currency: string;
  /** Janela do período seleccionado, em yyyy-MM-dd (fuso de Lisboa). */
  from: string;
  to: string;
  /** Ordenação do nível de campanha (não afecta conjuntos/anúncios). */
  sort: SortState;
  onSort: (key: SortKey) => void;
}

const fallback: DashboardTableCtx = {
  columns: METRIC_COLUMNS.filter((c) => DEFAULT_VISIBLE_COLUMNS.includes(c.id)),
  companyId: null,
  adAccountId: null,
  currency: "EUR",
  from: "",
  to: "",
  sort: NO_SORT,
  onSort: () => {},
};

export const DashboardTableContext = createContext<DashboardTableCtx>(fallback);

export function useDashboardTableCtx() {
  return useContext(DashboardTableContext);
}
