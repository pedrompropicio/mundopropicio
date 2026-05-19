import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type EtapaStatus = "pending" | "in_progress" | "blocked" | "done" | "cancelled";
export type RegistroKind = "evolucao" | "observacao" | "punch" | "chamado";

export interface OperacaoFilters {
  event: string | null;
  frentes: string[];
  status: EtapaStatus[];
  kind: RegistroKind[];
}

function parseCsv<T extends string>(raw: string | null): T[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean) as T[];
}

export function useOperacaoFilters() {
  const [params, setParams] = useSearchParams();

  const filters: OperacaoFilters = useMemo(
    () => ({
      event: params.get("event"),
      frentes: parseCsv<string>(params.get("frentes")),
      status: parseCsv<EtapaStatus>(params.get("status")),
      kind: parseCsv<RegistroKind>(params.get("kind")),
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<OperacaoFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, val] of Object.entries(patch)) {
        if (val == null || (Array.isArray(val) && val.length === 0) || val === "") {
          next.delete(key);
        } else if (Array.isArray(val)) {
          next.set(key, val.join(","));
        } else {
          next.set(key, String(val));
        }
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(params);
    ["event", "frentes", "status", "kind"].forEach((k) => next.delete(k));
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

  return { filters, update, clear, toggle };
}
