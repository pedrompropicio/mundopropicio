// Colunas configuráveis da tabela do Dashboard Meta Live (Fase 1).
// A escolha do utilizador é guardada em localStorage.
import { useCallback, useEffect, useMemo, useState } from "react";

export type MetricColumnId =
  | "spend"
  | "revenue"
  | "conversions"
  | "cpa"
  | "ticket"
  | "cpc"
  | "ctr"
  | "cpm"
  | "freq"
  | "reach"
  | "impressions"
  | "cpp"
  | "uniqueClicks"
  | "uniqueCtr"
  | "viewContent"
  | "addToCart"
  | "initiateCheckout";

export interface MetricColumnDef {
  id: MetricColumnId;
  label: string;
  /** Tooltip opcional no cabeçalho. */
  tooltip?: string;
}

/** Ordem canónica das colunas de métricas (aplica-se aos 3 níveis). */
export const METRIC_COLUMNS: MetricColumnDef[] = [
  { id: "spend", label: "Investido" },
  { id: "revenue", label: "Receita" },
  { id: "conversions", label: "Conv." },
  { id: "cpa", label: "CPA", tooltip: "Investimento ÷ compras." },
  { id: "ticket", label: "Ticket", tooltip: "Receita ÷ compras (ticket médio)." },
  { id: "cpc", label: "CPC" },
  { id: "ctr", label: "CTR" },
  { id: "cpm", label: "CPM", tooltip: "Custo por mil impressões." },
  { id: "freq", label: "Freq.", tooltip: "Média ponderada por impressões. Google não fornece — mostra “—”." },
  {
    id: "reach",
    label: "Alcance",
    tooltip:
      "Soma do alcance diário — NÃO é deduplicado: a mesma pessoa pode ser contada em vários dias/linhas.",
  },
  { id: "impressions", label: "Impr." },
  { id: "cpp", label: "CPP", tooltip: "Custo por mil pessoas alcançadas (alcance não deduplicado)." },
  { id: "uniqueClicks", label: "Cliq. únicos" },
  {
    id: "uniqueCtr",
    label: "CTR único",
    tooltip:
      "Cliques únicos ÷ alcance (definição do Meta). Como o alcance somado não é deduplicado, o valor agregado é aproximado. Google não fornece — mostra \u201c\u2014\u201d.",
  },
  { id: "viewContent", label: "ViewContent" },
  { id: "addToCart", label: "AddToCart" },
  { id: "initiateCheckout", label: "InitCheckout" },
];

export const DEFAULT_VISIBLE_COLUMNS: MetricColumnId[] = [
  "spend",
  "revenue",
  "conversions",
  "cpa",
  "ticket",
  "cpc",
  "ctr",
  "cpm",
  "freq",
  "reach",
  "impressions",
];

const STORAGE_KEY = "mp.audience.dashboard.columns.v1";

function readStored(): MetricColumnId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = METRIC_COLUMNS.map((c) => c.id);
    return parsed.filter((id: any) => valid.includes(id)) as MetricColumnId[];
  } catch {
    return null;
  }
}

/** Estado das colunas visíveis, persistido por utilizador em localStorage. */
export function useDashboardColumns() {
  const [visible, setVisible] = useState<MetricColumnId[]>(
    () => readStored() ?? DEFAULT_VISIBLE_COLUMNS,
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
    } catch {
      /* storage indisponível — segue com o estado em memória */
    }
  }, [visible]);

  const toggle = useCallback((id: MetricColumnId) => {
    setVisible((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const reset = useCallback(() => setVisible(DEFAULT_VISIBLE_COLUMNS), []);

  // Mantém sempre a ordem canónica, independente da ordem de toggle.
  const ordered = useMemo(
    () => METRIC_COLUMNS.filter((c) => visible.includes(c.id)),
    [visible],
  );

  return { visible, ordered, toggle, reset };
}
