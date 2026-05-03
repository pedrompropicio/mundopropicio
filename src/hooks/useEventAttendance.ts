import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte canónica de "público por dia" para um evento.
 *
 * Regras (decidido 2026-05-03):
 *  - Apenas DOIS tipos de bilhete: 'simple' (1 dia) e 'combo' (todos os dias do evento).
 *  - Bilhete Simples conta na sua data específica (via session_id da zona → event_dates).
 *    Se a zona não tiver session_id, recai no dia 0.
 *  - Bilhete Combo conta como 1 pessoa em CADA dia do evento (sem dupla contagem dentro do evento).
 *  - Cortesias (event_courtesies) são por dia × zona × cenário, somam ao público mas não
 *    geram receita.
 *  - Para o cenário "real" usamos ticket_sales; para "breakeven" e "forecast" usamos a
 *    quantidade planeada do lote (event_ticket_lots.quantity).
 */

export type AttendanceScenario = "real" | "breakeven" | "forecast";

export interface AttendanceCell {
  day_index: number;
  date: string | null; // YYYY-MM-DD
  zone_id: string;
  zone_name: string;
  paying: number;
  courtesy: number;
  total: number;
}

export interface UseEventAttendanceResult {
  isLoading: boolean;
  /** Matriz dia×zona para o cenário pedido. */
  cells: AttendanceCell[];
  /** Total de público por dia (somando todas as zonas + cortesias). */
  totalsByDay: Record<number, number>;
  /** Total de público por zona (somando todos os dias). */
  totalsByZone: Record<string, number>;
  /** Total geral (Σ dias). */
  grandTotal: number;
  /** Datas do evento ordenadas. */
  dates: { id: string; date: string; day_index: number }[];
}

export function useEventAttendance(
  eventId: string | undefined,
  scenario: AttendanceScenario = "real",
): UseEventAttendanceResult {
  const { data: dates = [], isLoading: loadingDates } = useQuery({
    queryKey: ["event_dates_attendance", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates")
        .select("id, date")
        .eq("event_id", eventId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d, idx) => ({ id: d.id, date: d.date, day_index: idx }));
    },
    enabled: !!eventId,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["event_sessions_attendance", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, date")
        .eq("event_id", eventId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["event_zones_attendance", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, session_id")
        .eq("event_id", eventId!)
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const zoneIds = zones.map((z) => z.id);

  const { data: lots = [] } = useQuery({
    queryKey: ["event_lots_attendance", eventId, zoneIds.join(",")],
    queryFn: async () => {
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("id, name, zone_id, quantity, lot_kind, is_combo, consumes_zone_ids, applies_to_days")
        .in("zone_id", zoneIds)
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: zoneIds.length > 0,
  });

  const { data: realSales = [] } = useQuery({
    queryKey: ["event_real_sales_attendance", eventId, zoneIds.join(",")],
    queryFn: async () => {
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, lot_id, quantity")
        .in("zone_id", zoneIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: scenario === "real" && zoneIds.length > 0,
  });

  // Cortesias são iguais para Real/BE/Forecast — não filtramos por cenário.
  const { data: courtesies = [] } = useQuery({
    queryKey: ["event_courtesies_attendance", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_courtesies")
        .select("event_date_id, zone_id, quantity")
        .eq("event_id", eventId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });


  return useMemo<UseEventAttendanceResult>(() => {
    if (!eventId || dates.length === 0 || zones.length === 0) {
      return {
        isLoading: loadingDates,
        cells: [],
        totalsByDay: {},
        totalsByZone: {},
        grandTotal: 0,
        dates,
      };
    }

    // session_id → date
    const sessionDate = new Map<string, string>();
    for (const s of sessions) sessionDate.set(s.id, s.date);

    // date → day_index
    const dateToIdx = new Map<string, number>();
    dates.forEach((d) => dateToIdx.set(d.date, d.day_index));

    // zone_id → day_index | null (null = sem session vinculada)
    const zoneDayIdx = new Map<string, number | null>();
    for (const z of zones) {
      if (z.session_id) {
        const sd = sessionDate.get(z.session_id);
        zoneDayIdx.set(z.id, sd != null ? dateToIdx.get(sd) ?? null : null);
      } else {
        zoneDayIdx.set(z.id, null);
      }
    }

    // zone_id → name
    const zoneName = new Map<string, string>();
    for (const z of zones) zoneName.set(z.id, z.name);

    // lot_id → { zone_id, kind, qty, is_combo, consumes_zone_ids, person_mult }
    const lotById = new Map<string, { zone_id: string; kind: string; qty: number; is_combo: boolean; applies_to_days: number; consumes: string[]; person_mult: number }>();
    for (const l of lots as any[]) {
      lotById.set(l.id, {
        zone_id: l.zone_id,
        kind: l.lot_kind || (l.is_combo ? "combo" : "simple"),
        qty: Number(l.quantity || 0),
        is_combo: !!l.is_combo,
        applies_to_days: Math.max(1, Number(l.applies_to_days || (l.is_combo ? dates.length : 1))),
        consumes: (l.consumes_zone_ids ?? []) as string[],
        person_mult: getPersonMultiplier(l.name),
      });
    }

    // Inicializa células
    const grid = new Map<string, AttendanceCell>();
    const ensure = (day_index: number, zone_id: string): AttendanceCell => {
      const k = `${day_index}|${zone_id}`;
      let c = grid.get(k);
      if (!c) {
        c = {
          day_index,
          date: dates[day_index]?.date ?? null,
          zone_id,
          zone_name: zoneName.get(zone_id) || "—",
          paying: 0,
          courtesy: 0,
          total: 0,
        };
        grid.set(k, c);
      }
      return c;
    };

    for (let d = 0; d < dates.length; d++) {
      for (const z of zones) ensure(d, z.id);
    }

    // ── PAGANTES (modelo unificado: lote simples OU combo via consumes_zone_ids) ─
    type Movement = { zone_id: string; lot_id: string | null; qty: number };
    const movements: Movement[] = [];
    if (scenario === "real") {
      for (const s of realSales as any[]) {
        if (!s.zone_id) continue;
        movements.push({ zone_id: s.zone_id, lot_id: s.lot_id ?? null, qty: Number(s.quantity || 0) });
      }
    } else {
      for (const l of lots as any[]) {
        movements.push({ zone_id: l.zone_id, lot_id: l.id, qty: Number(l.quantity || 0) });
      }
    }

    for (const mv of movements) {
      const meta = mv.lot_id ? lotById.get(mv.lot_id) : undefined;
      const isCombo = !!meta?.is_combo;
      const personMult = meta?.person_mult ?? 1;
      const people = mv.qty * personMult;
      if (isCombo) {
        // 1 venda combo = 1 pessoa em CADA dia coberto. Se houver
        // consumes_zone_ids explícitos, respeitamos essa matriz; caso
        // contrário expandimos a partir do dia da zona âncora.
        const consumed = meta!.consumes.length ? meta!.consumes : [meta!.zone_id];
        for (const zid of consumed) {
          const dayIdx = zoneDayIdx.get(zid);
          if (dayIdx == null) {
            // Zona sem session_id → assume todos os dias
            for (let d = 0; d < dates.length; d++) ensure(d, zid).paying += people;
          } else if (meta!.consumes.length) {
            if (dayIdx >= 0 && dayIdx < dates.length) ensure(dayIdx, zid).paying += people;
          } else {
            for (let offset = 0; offset < meta!.applies_to_days; offset++) {
              const d = dayIdx + offset;
              if (d >= dates.length) break;
              ensure(d, zid).paying += people;
            }
          }
        }
      } else {
        const dayIdx = zoneDayIdx.get(mv.zone_id) ?? 0;
        if (dayIdx >= 0 && dayIdx < dates.length) {
          ensure(dayIdx, mv.zone_id).paying += people;
        }
      }
    }

    // ── CORTESIAS ─────────────────────────────────────────────
    const dateIdById = new Map<string, number>();
    dates.forEach((d) => dateIdById.set(d.id, d.day_index));
    for (const c of courtesies) {
      const dayIdx = dateIdById.get(c.event_date_id);
      if (dayIdx == null) continue;
      const cell = ensure(dayIdx, c.zone_id);
      cell.courtesy += Number(c.quantity || 0);
    }

    const cells = Array.from(grid.values());
    for (const c of cells) c.total = c.paying + c.courtesy;

    const totalsByDay: Record<number, number> = {};
    const totalsByZone: Record<string, number> = {};
    let grand = 0;
    for (const c of cells) {
      totalsByDay[c.day_index] = (totalsByDay[c.day_index] ?? 0) + c.total;
      totalsByZone[c.zone_id] = (totalsByZone[c.zone_id] ?? 0) + c.total;
      grand += c.total;
    }

    return {
      isLoading: false,
      cells: cells.sort((a, b) => a.day_index - b.day_index || a.zone_name.localeCompare(b.zone_name)),
      totalsByDay,
      totalsByZone,
      grandTotal: grand,
      dates,
    };
  }, [eventId, scenario, dates, sessions, zones, lots, realSales, courtesies, loadingDates]);
}
