import type { PlanningLot, PlanningZone } from "./planning-forecast.ts";

export type ForecastPctOrigin = "padrao" | "evento" | "sessao";
export type ForecastPct = { valor: number; origem: ForecastPctOrigin } | { erro: string };
export interface ForecastSessionKey { date: string; start_time: string | null; sort_order: number }
export interface ForecastLot extends PlanningLot { iva_rate?: number | null }
export interface ForecastZone extends PlanningZone { lotes: ForecastLot[] }
export interface ForecastMoney { bruto: number; liquido: number | null }
export interface PlanningForecastUnit {
  unit_id: string;
  event_id: string;
  sessao: ForecastSessionKey | null;
  data: string | null;
  zonas: ForecastZone[];
  /** Only the explicit unit's own manual revenue; never inherited or apportioned. */
  manual: { bruta: number; iva_rate: number | null } | null;
  vendido: { bruto: number; liquido: number };
  pct: ForecastPct;
  viragem_dias: number | null;
  indivisivel: boolean;
}
export type ForecastReason = "sem_previsao" | "percentagem_erro" | "percentagem_zero"
  | "data_invalida" | "data_passada" | "hoje" | "viragem" | "vendido" | "previsao" | "indivisivel";
export interface PlanningForecastUnitResult {
  unit_id: string;
  data: string | null;
  /** Source of the unscaled forecast; motivo identifies the selected alternative. */
  fonte: "lotes" | "manual" | "sem_previsao";
  pct: number | null;
  origem: ForecastPctOrigin | null;
  motivo: ForecastReason;
  cortes: { zone_id: string; fator: number; bruto: number; limitado: number }[];
  vendido: ForecastMoney;
  previsao: ForecastMoney | null;
  considerada: ForecastMoney;
  completo: boolean;
  alertas: string[];
}
export interface PlanningForecastResult {
  unidades: PlanningForecastUnitResult[];
  vendido: ForecastMoney;
  previsao: ForecastMoney | null;
  considerada: ForecastMoney;
  completo: boolean;
}

export interface TicketForecastSessionInput {
  session_id: string;
  session_date: string;
  session_start_time: string | null;
  session_sort_order: number;
  percentagem: number;
  origem: ForecastPctOrigin;
}
export interface TicketForecastEventInput {
  event_id: string;
  percentagem: number;
  origem: "padrao" | "evento";
  receita_manual_iva_rate: number | null;
  sessions: TicketForecastSessionInput[];
}
export interface TicketForecastInputs {
  version: "ticket-forecast-inputs-v1";
  company_id: string;
  events: TicketForecastEventInput[];
}

export function isForecastCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

export function assertForecastId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("ticket_forecast_invalid_id");
  }
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error("ticket_forecast_invalid_shape");
  }
  return value as Record<string, unknown>;
}
function percent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("ticket_forecast_invalid_percentage");
  }
  return value;
}
function origin(value: unknown, session = false): ForecastPctOrigin {
  if (value !== "padrao" && value !== "evento" && !(session && value === "sessao")) {
    throw new Error("ticket_forecast_invalid_origin");
  }
  return value as ForecastPctOrigin;
}
function sessionKey(date: string, time: string | null, order: number): string {
  return JSON.stringify([date, time, order]);
}

/** Strict 0341 payload: exact company and exact requested event set, including empty requests. */
export function parseTicketForecastInputs(value: unknown, companyId: string, eventIds: readonly string[]): TicketForecastInputs {
  assertForecastId(companyId);
  eventIds.forEach(assertForecastId);
  if (new Set(eventIds).size !== eventIds.length) throw new Error("ticket_forecast_duplicate_request");
  const root = object(value, ["version", "company_id", "events"]);
  if (root.version !== "ticket-forecast-inputs-v1") throw new Error("ticket_forecast_invalid_version");
  if (root.company_id !== companyId) throw new Error("ticket_forecast_company_mismatch");
  if (!Array.isArray(root.events)) throw new Error("ticket_forecast_invalid_events");
  const requested = new Set(eventIds), seen = new Set<string>(), sessionIds = new Set<string>();
  const events = root.events.map(value => {
    const event = object(value, ["event_id", "percentagem", "origem", "receita_manual_iva_rate", "sessions"]);
    assertForecastId(event.event_id);
    if (!requested.has(event.event_id) || seen.has(event.event_id)) throw new Error("ticket_forecast_event_set_mismatch");
    seen.add(event.event_id);
    const pct = percent(event.percentagem), source = origin(event.origem) as "padrao" | "evento";
    if (source === "padrao" && pct !== 100) throw new Error("ticket_forecast_invalid_default");
    const vat = event.receita_manual_iva_rate === null ? null : percent(event.receita_manual_iva_rate);
    if (!Array.isArray(event.sessions)) throw new Error("ticket_forecast_invalid_sessions");
    const keys = new Set<string>();
    const sessions = event.sessions.map(value => {
      const session = object(value, ["session_id", "session_date", "session_start_time", "session_sort_order", "percentagem", "origem"]);
      assertForecastId(session.session_id);
      if (sessionIds.has(session.session_id)) throw new Error("ticket_forecast_session_ambiguous");
      sessionIds.add(session.session_id);
      if (!isForecastCivilDate(session.session_date)
        || !(session.session_start_time === null || (typeof session.session_start_time === "string"
          && /^(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?|24:00:00)$/.test(session.session_start_time)))
        || !Number.isSafeInteger(session.session_sort_order)) throw new Error("ticket_forecast_invalid_session_key");
      const date = session.session_date, time = session.session_start_time as string | null, order = session.session_sort_order as number;
      const key = sessionKey(date, time, order);
      if (keys.has(key)) throw new Error("ticket_forecast_session_ambiguous");
      keys.add(key);
      const percentagem = percent(session.percentagem), origem = origin(session.origem, true);
      if ((origem === "padrao" && (percentagem !== 100 || source !== "padrao"))
        || (origem === "evento" && (percentagem !== pct || source !== "evento"))) {
        throw new Error("ticket_forecast_invalid_inheritance");
      }
      return { session_id: session.session_id, session_date: date, session_start_time: time,
        session_sort_order: order, percentagem, origem };
    });
    return { event_id: event.event_id, percentagem: pct, origem: source, receita_manual_iva_rate: vat, sessions };
  });
  if (seen.size !== requested.size) throw new Error("ticket_forecast_event_set_mismatch");
  const byId = new Map(events.map(event => [event.event_id, event]));
  return { version: "ticket-forecast-inputs-v1", company_id: companyId, events: eventIds.map(id => byId.get(id)!) };
}

/** Q1: no physical UUID, approximate match, root inheritance or implicit time conversion. */
export function resolverPct(evento: TicketForecastEventInput | null | undefined, sessao: ForecastSessionKey | null): ForecastPct {
  if (evento == null) return { valor: 100, origem: "padrao" };
  const matches = sessao === null ? [] : evento.sessions.filter(row =>
    row.session_date === sessao.date && row.session_start_time === sessao.start_time && row.session_sort_order === sessao.sort_order);
  if (matches.length > 1) throw new Error("ticket_forecast_session_ambiguous");
  const selected = matches[0] ?? evento;
  return { valor: selected.percentagem, origem: selected.origem };
}
