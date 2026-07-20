/**
 * Helper partilhado para criação de sub-eventos de uma turnê (event_type=multi_day).
 *
 * Extraído do wizard de criação (`src/pages/Events.tsx`) para permitir reutilização
 * no fluxo "Adicionar cidade" a partir do EventDetail de um master já existente.
 *
 * Mantém EXACTAMENTE o mesmo insert que o wizard usa:
 *   - `events` com `parent_event_id`, `event_type='simple'` (ou `'festival'` se
 *     tiver extra_dates), `budget=0`, `tickets_total=0`, `location` composta.
 *   - `event_dates` para as datas extra (só festival).
 *   - `event_sessions` para as sessões, se existirem.
 *
 * Marketing multi-cidade herda da mãe automaticamente por resolução no portal
 * (ver docs/features/portal-tour-multi-cidade.md) — nada a fazer aqui.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SessionDraft {
  date: string;
  label: string;
  start_time: string;
}

export interface SubEventDraft {
  name: string;
  date: string;
  city_id: string;
  venue_id: string;
  extra_dates: string[];
  sessions: SessionDraft[];
}

export interface CreateSubEventArgs {
  parentId: string;
  /** Herdado do master no wizard; ao adicionar posteriormente passa-se o status atual do master. */
  parentStatus: string;
  sub: SubEventDraft;
  venuesMap: Record<string, { name?: string } | any>;
  citiesMap: Record<string, string>;
}

/** Cria um sub-evento (mais event_dates + event_sessions) vinculado a um master. Devolve o id novo. */
export async function createSubEventInTour({
  parentId,
  parentStatus,
  sub,
  venuesMap,
  citiesMap,
}: CreateSubEventArgs): Promise<string> {
  const subVenue = sub.venue_id ? (venuesMap as any)[sub.venue_id]?.name : null;
  const subCity = sub.city_id ? (citiesMap as any)[sub.city_id] : null;
  const subLocation = [subVenue, subCity].filter(Boolean).join(", ");

  const { data: newSub, error: sErr } = await supabase
    .from("events")
    .insert({
      name: sub.name,
      date: sub.date,
      location: subLocation || null,
      city_id: sub.city_id || null,
      venue_id: sub.venue_id || null,
      status: parentStatus,
      event_type: sub.extra_dates.length > 0 ? "festival" : "simple",
      parent_event_id: parentId,
      budget: 0,
      tickets_total: 0,
    } as any)
    .select()
    .single();
  if (sErr) throw sErr;

  const subId = (newSub as any).id;

  if (sub.extra_dates.length > 0) {
    const extraDates = sub.extra_dates.map((d: string) => ({
      event_id: subId,
      date: d,
    }));
    const { error: edErr } = await supabase.from("event_dates" as any).insert(extraDates);
    if (edErr) throw edErr;
  }

  if (sub.sessions.length > 0) {
    const sessionsToInsert = sub.sessions.map((sess, i) => ({
      event_id: subId,
      date: sess.date || sub.date,
      label: sess.label || `Sessão ${i + 1}`,
      start_time: sess.start_time || null,
      sort_order: i + 1,
    }));
    const { error: sessErr } = await supabase.from("event_sessions" as any).insert(sessionsToInsert);
    if (sessErr) throw sessErr;
  }

  return subId;
}
