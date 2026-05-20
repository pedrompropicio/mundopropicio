import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useOperacaoFilters, type OperacaoFilters } from "./useOperacaoFilters";

export type ListScope = "zonas" | "etapas" | "chamados" | "pessoas";
export type SortDir = "asc" | "desc";
export type Responsibility = "meus" | "sem_responsavel" | "todos";

export interface OperacaoListExtras {
  responsibility?: Responsibility;
  sort_by?: string;
  sort_dir?: SortDir;
  page?: number;
}

export interface OperacaoListFilters extends OperacaoFilters, OperacaoListExtras {}

const DEFAULTS: Record<ListScope, Required<Pick<OperacaoListExtras, "sort_by" | "sort_dir">>> = {
  zonas: { sort_by: "display_order", sort_dir: "asc" },
  etapas: { sort_by: "planned_start", sort_dir: "asc" },
  chamados: { sort_by: "created_at", sort_dir: "desc" },
};

const EXTRA_KEYS = ["responsibility", "sort_by", "sort_dir", "page"] as const;

export function useOperacaoListFilters(scope: ListScope) {
  const base = useOperacaoFilters();
  const [params, setParams] = useSearchParams();
  const defaults = DEFAULTS[scope];

  const extras: Required<OperacaoListExtras> = useMemo(
    () => ({
      responsibility: (params.get("responsibility") as Responsibility) || "todos",
      sort_by: params.get("sort_by") || defaults.sort_by,
      sort_dir: (params.get("sort_dir") as SortDir) || defaults.sort_dir,
      page: Number(params.get("page") ?? "0") || 0,
    }),
    [params, defaults.sort_by, defaults.sort_dir],
  );

  const filters: OperacaoListFilters = useMemo(
    () => ({ ...base.filters, ...extras }),
    [base.filters, extras],
  );

  const update = useCallback(
    (patch: Partial<OperacaoListFilters>) => {
      const next = new URLSearchParams(params);
      let touchedNonPage = false;
      for (const [key, val] of Object.entries(patch)) {
        if (key !== "page") touchedNonPage = true;
        if (val == null || (Array.isArray(val) && val.length === 0) || val === "" || val === "todos") {
          next.delete(key);
        } else if (Array.isArray(val)) {
          next.set(key, val.join(","));
        } else {
          next.set(key, String(val));
        }
      }
      // Reset page when any other filter changes
      if (touchedNonPage && !("page" in patch)) next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(params);
    ["event", "frentes", "status", "kind", ...EXTRA_KEYS].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  }, [params, setParams]);

  const toggle = useCallback(
    <K extends "frentes" | "status" | "kind">(key: K, value: string) => {
      const list = (filters[key] as string[]).slice();
      const idx = list.indexOf(value);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(value);
      update({ [key]: list } as any);
    },
    [filters, update],
  );

  const setPage = useCallback(
    (n: number) => {
      const next = new URLSearchParams(params);
      if (n <= 0) next.delete("page");
      else next.set("page", String(n));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return { filters, update, clear, toggle, page: extras.page, setPage };
}
