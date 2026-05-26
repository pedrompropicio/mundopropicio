import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useOperacaoFilters, type OperacaoFilters } from "./useOperacaoFilters";

export type ListScope = "zonas" | "etapas" | "chamados" | "pessoas";
export type SortDir = "asc" | "desc";
export type Responsibility = "meus" | "sem_responsavel" | "todos";

export type DatePreset = "all" | "today" | "range";

export interface OperacaoListExtras {
  responsibility?: Responsibility;
  sort_by?: string;
  sort_dir?: SortDir;
  page?: number;
  date_preset?: DatePreset;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
}

export interface OperacaoListFilters extends OperacaoFilters, OperacaoListExtras {}

const DEFAULTS: Record<ListScope, Required<Pick<OperacaoListExtras, "sort_by" | "sort_dir">>> = {
  zonas: { sort_by: "display_order", sort_dir: "asc" },
  etapas: { sort_by: "planned_start", sort_dir: "asc" },
  chamados: { sort_by: "created_at", sort_dir: "desc" },
  pessoas: { sort_by: "name", sort_dir: "asc" },
};

const EXTRA_KEYS = ["responsibility", "sort_by", "sort_dir", "page", "date_preset", "date_from", "date_to"] as const;

export function useOperacaoListFilters(scope: ListScope) {
  const base = useOperacaoFilters();
  const [params, setParams] = useSearchParams();
  const defaults = DEFAULTS[scope];

  const extras: Required<Pick<OperacaoListExtras, "responsibility" | "sort_by" | "sort_dir" | "page" | "date_preset">> & Pick<OperacaoListExtras, "date_from" | "date_to"> = useMemo(
    () => ({
      responsibility: (params.get("responsibility") as Responsibility) || "todos",
      sort_by: params.get("sort_by") || defaults.sort_by,
      sort_dir: (params.get("sort_dir") as SortDir) || defaults.sort_dir,
      page: Number(params.get("page") ?? "0") || 0,
      date_preset: (params.get("date_preset") as DatePreset) || "all",
      date_from: params.get("date_from") || undefined,
      date_to: params.get("date_to") || undefined,
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
        if (val == null || (Array.isArray(val) && val.length === 0) || val === "" || val === "todos" || (key === "date_preset" && val === "all")) {
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
