import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Comparison between the *current* event_forecasts (live, editable) and the
 * snapshot of the active BP version. Powers the "Alterações pendentes" banner
 * and the diff modal that lets users revert individual rows back to the snapshot.
 *
 * The active version is the source of truth for production. Any edit to a
 * forecast row after the version was frozen produces a "pending change" that
 * this hook surfaces.
 */

export interface SnapshotRow {
  id: string;
  type: "income" | "expense";
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  status: string;
  category_id: string | null;
  formula_type: string;
  formula_value: number;
  notes: string | null;
  exclude_from_result: boolean;
  is_overhead: boolean;
  is_transitory: boolean;
  currency: string;
  fx_rate: number | null;
  invoice_group_id: string | null;
  cache_config_id: string | null;
  master_forecast_id: string | null;
}

export interface CurrentRow extends SnapshotRow {
  formalidade: string | null;
}

export type DiffStatus = "modified" | "added" | "removed";

export interface DiffEntry {
  forecastId: string;
  status: DiffStatus;
  before: SnapshotRow | null; // present when status is modified | removed
  after: CurrentRow | null; // present when status is modified | added
  /** List of human-readable changed fields (only for "modified") */
  changedFields: string[];
}

export interface ActiveVersionDiff {
  versionId: string | null;
  versionNumber: number | null;
  versionApprovedAt: string | null;
  entries: DiffEntry[];
  totalChanges: number;
}

const COMPARED_FIELDS: Array<{ key: keyof SnapshotRow; label: string }> = [
  { key: "amount", label: "Valor" },
  { key: "iva_rate", label: "IVA" },
  { key: "description", label: "Descrição" },
  { key: "specification", label: "Especificação" },
  { key: "category_id", label: "Categoria" },
  { key: "status", label: "Estado" },
  { key: "formula_type", label: "Tipo de fórmula" },
  { key: "formula_value", label: "Valor da fórmula" },
  { key: "exclude_from_result", label: "Excluir do resultado" },
  { key: "is_overhead", label: "Overhead" },
  { key: "is_transitory", label: "Transitório" },
  { key: "currency", label: "Moeda" },
  { key: "notes", label: "Notas" },
];

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return value;
}

export function useActiveVersionDiff(eventId: string) {
  return useQuery<ActiveVersionDiff>({
    queryKey: ["active-version-diff", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data: activeVersion, error: versionErr } = await supabase
        .from("bp_versions")
        .select("id, version_number, approved_at, snapshot_payload")
        .eq("event_id", eventId)
        .eq("state", "active")
        .maybeSingle();
      if (versionErr) throw versionErr;

      if (!activeVersion) {
        return {
          versionId: null,
          versionNumber: null,
          versionApprovedAt: null,
          entries: [],
          totalChanges: 0,
        };
      }

      const snapshotForecasts: SnapshotRow[] =
        (activeVersion.snapshot_payload as any)?.forecasts ?? [];

      const { data: currentForecasts, error: curErr } = await supabase
        .from("event_forecasts")
        .select(
          "id, type, description, specification, amount, iva_rate, status, category_id, formula_type, formula_value, notes, exclude_from_result, is_overhead, is_transitory, currency, fx_rate, invoice_group_id, cache_config_id, master_forecast_id, formalidade"
        )
        .eq("event_id", eventId);
      if (curErr) throw curErr;

      const snapshotById = new Map(snapshotForecasts.map((r) => [r.id, r]));
      const currentById = new Map(
        (currentForecasts ?? []).map((r) => [r.id, r as unknown as CurrentRow])
      );

      const entries: DiffEntry[] = [];

      // Modified or removed (rows present in the snapshot)
      for (const [id, before] of snapshotById) {
        const after = currentById.get(id) ?? null;
        if (!after) {
          entries.push({
            forecastId: id,
            status: "removed",
            before,
            after: null,
            changedFields: [],
          });
          continue;
        }
        const changed: string[] = [];
        for (const { key, label } of COMPARED_FIELDS) {
          if (normalize((before as any)[key]) !== normalize((after as any)[key])) {
            changed.push(label);
          }
        }
        if (changed.length > 0) {
          entries.push({
            forecastId: id,
            status: "modified",
            before,
            after,
            changedFields: changed,
          });
        }
      }

      // Added (rows present only in current)
      for (const [id, after] of currentById) {
        if (!snapshotById.has(id)) {
          entries.push({
            forecastId: id,
            status: "added",
            before: null,
            after,
            changedFields: [],
          });
        }
      }

      // Sort: modified first, then added, then removed; within each, by description
      entries.sort((a, b) => {
        const order = { modified: 0, added: 1, removed: 2 } as const;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        const labelA = a.after?.description ?? a.before?.description ?? "";
        const labelB = b.after?.description ?? b.before?.description ?? "";
        return labelA.localeCompare(labelB);
      });

      return {
        versionId: activeVersion.id,
        versionNumber: activeVersion.version_number,
        versionApprovedAt: activeVersion.approved_at,
        entries,
        totalChanges: entries.length,
      };
    },
  });
}
