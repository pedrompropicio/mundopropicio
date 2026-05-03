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
        .select("id, zone_id, quantity, lot_kind")
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

  const { data: courtesies = [] } = useQuery({
    queryKey: ["event_courtesies_attendance", eventId, scenario],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_courtesies")
        .select("event_date_id, zone_id, quantity, scenario")
        .eq("event_id", eventId!)
        .eq("scenario", scenario);
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

    // lot_id → { zone_id, kind, qty }
    const lotById = new Map<string, { zone_id: string; kind: string; qty: number }>();
    for (const l of lots) {
      lotById.set(l.id, {
        zone_id: l.zone_id,
        kind: (l as any).lot_kind || "simple",
        qty: Number(l.quantity || 0),
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

    // ── PAGANTES ──────────────────────────────────────────────
    // Fonte: real → ticket_sales agregado por (zone, lot)
    //        breakeven/forecast → event_ticket_lots.quantity
    type Movement = { zone_id: string; lot_id: string | null; qty: number };
    const movements: Movement[] = [];

    if (scenario === "real") {
      for (const s of realSales) {
        if (!s.zone_id) continue;
        movements.push({
          zone_id: s.zone_id,
          lot_id: s.lot_id ?? null,
          qty: Number(s.quantity || 0),
        });
      }
    } else {
      for (const l of lots) {
        movements.push({
          zone_id: l.zone_id,
          lot_id: l.id,
          qty: Number(l.quantity || 0),
        });
      }
    }

    for (const mv of movements) {
      // determinar kind (combo vs simple)
      let kind: "simple" | "combo" = "simple";
      if (mv.lot_id && lotById.has(mv.lot_id)) {
        kind = (lotById.get(mv.lot_id)!.kind as any) === "combo" ? "combo" : "simple";
      }

      if (kind === "combo") {
        // 1 venda combo = 1 pessoa em CADA dia do evento
        for (let d = 0; d < dates.length; d++) {
          const cell = ensure(d, mv.zone_id);
          cell.paying += mv.qty;
        }
      } else {
        // simple: dia da zona; se zona não tem session, dia 0
        const dayIdx = zoneDayIdx.get(mv.zone_id) ?? 0;
        if (dayIdx >= 0 && dayIdx < dates.length) {
          const cell = ensure(dayIdx, mv.zone_id);
          cell.paying += mv.qty;
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

    // Finaliza totals
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
      cells: cells.sort(
        (a, b) => a.day_index - b.day_index || a.zone_name.localeCompare(b.zone_name),
      ),
      totalsByDay,
      totalsByZone,
      grandTotal: grand,
      dates,
    };
  }, [eventId, scenario, dates, sessions, zones, lots, realSales, courtesies, loadingDates]);
}
