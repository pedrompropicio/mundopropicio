import type { User } from "@supabase/supabase-js";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getAuditUser } from "@/lib/audit";

export const BP_FINAL_CLOSE_PREFIX = "Versão final do fecho";

export interface FinalCloseBpVersion {
  id: string;
  event_id: string;
  version_number: number;
  state: string;
  description: string | null;
  snapshot_payload: unknown;
}

/** A RPC existente aprova a versão e trata a cascata para os sub-eventos. */
export async function freezeFinalBpVersion(eventId: string, user: User | null | undefined) {
  const { data, error } = await supabase.rpc("create_bp_snapshot", {
    _event_id: eventId,
    _description: `${BP_FINAL_CLOSE_PREFIX} — ${format(new Date(), "dd/MM/yyyy")}`,
    _approve_immediately: true,
    _scenario_label: null,
    _scenario_assumptions: null,
    _is_pinned_scenario: false,
    _created_by: user?.id ?? null,
    _created_by_label: getAuditUser(user),
  });
  if (error) throw error;
  return data;
}

/** A versão final mais recente continua válida depois de ser superseded. */
export function pickFinalCloseVersions(versions: readonly FinalCloseBpVersion[] = []) {
  const byEvent = new Map<string, FinalCloseBpVersion>();
  for (const version of versions) {
    if (!version.description?.startsWith(BP_FINAL_CLOSE_PREFIX)) continue;
    if (version.state !== "active" && version.state !== "superseded") continue;
    const previous = byEvent.get(version.event_id);
    if (!previous || version.version_number > previous.version_number) {
      byEvent.set(version.event_id, version);
    }
  }
  return byEvent;
}

/** Só troca a fonte das despesas; os consumidores mantêm o cálculo e o perímetro. */
export function withFinalCloseForecasts<T extends { event_id?: string | null }>(
  live: T[],
  versions: readonly FinalCloseBpVersion[] = [],
  events: readonly { id: string; status?: string | null }[] = [],
): T[] {
  const finals = pickFinalCloseVersions(versions);
  const replacements = new Map<string, T[]>();
  for (const event of events) {
    const version = finals.get(event.id);
    if (event.status !== "completed" || !version) continue;
    const payload = version.snapshot_payload as { forecasts?: unknown } | null;
    const forecasts = Array.isArray(payload?.forecasts) ? payload.forecasts : [];
    replacements.set(event.id, forecasts.filter((f) => f?.type === "expense") as T[]);
  }
  if (replacements.size === 0) return live;
  return [
    ...live.filter((f) => !f.event_id || !replacements.has(f.event_id)),
    ...Array.from(replacements.values()).flat(),
  ];
}
