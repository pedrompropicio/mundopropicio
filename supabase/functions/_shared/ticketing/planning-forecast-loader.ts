import { assertForecastId, parseTicketForecastInputs, type TicketForecastInputs } from "./planning-forecast-contract.ts";

export interface TicketForecastClient {
  /** Supply the caller's authenticated client; this loader never constructs a privileged client. */
  rpc(name: "get_event_ticket_forecast_inputs", args: {
    p_company_id: string; p_event_ids: string[]; p_version_id: string | null;
  }): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Errors (including malformed or partial responses) reject the whole read, never default to 100. */
export async function carregarPercentagens(
  cliente: TicketForecastClient, companyId: string, eventIds: readonly string[], versionId?: string | null,
): Promise<TicketForecastInputs> {
  assertForecastId(companyId);
  eventIds.forEach(assertForecastId);
  const ids = [...new Set(eventIds)];
  if (versionId != null) {
    assertForecastId(versionId);
    if (ids.length !== 1) throw new Error("ticket_forecast_invalid_version_events");
  }
  const result: TicketForecastInputs = { version: "ticket-forecast-inputs-v1", company_id: companyId, events: [] };
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await cliente.rpc("get_event_ticket_forecast_inputs", {
      p_company_id: companyId, p_event_ids: batch, p_version_id: versionId ?? null,
    });
    if (error != null) throw error;
    result.events.push(...parseTicketForecastInputs(data, companyId, batch).events);
  }
  return result;
}
