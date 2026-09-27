/**
 * ACUMULADO COM CORTE — eventos Ticketline migrados para a nova área de Promotores.
 *
 * FONTE ÚNICA desta aritmética. Nenhum ecrã a repete: todos chamam isto.
 *
 * Regra (decisão 2026-09-27, ver memória ticketline-dashboard-daily-fallback):
 *  - Evento com `ticketline_sync_config.promotores_migrated_at` preenchido:
 *      acumulado = ticket_sales com sale_date <= promotores_cutoff_date (congelado)
 *                + ticketline_daily_sales com sale_date >  promotores_cutoff_date.
 *    Períodos disjuntos, fronteira registada: nenhum dia contado duas vezes.
 *  - Todos os outros eventos: só ticket_sales, sem alteração.
 *  - `daily_fallback_active` NÃO decide nada aqui (não significa "migrado").
 *
 * A série diária não tem zona: a parte depois do corte entra no total do
 * evento, nunca é repartida por zonas. A repartição por zona fica congelada
 * na data do corte.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketlineCutoff {
  eventId: string;
  cutoffDate: string; // YYYY-MM-DD, inclusive no lado do ticket_sales
  migratedAt: string;
  /** Dias da série diária DEPOIS do corte (só dias com vendas). */
  postDays: { date: string; qty: number; value: number }[];
  postQty: number;
  postValue: number;
}

export type CutoffMap = Map<string, TicketlineCutoff>;

export async function fetchTicketlineCutoffs(eventIds: string[]): Promise<CutoffMap> {
  const ids = [...new Set(eventIds.filter(Boolean))];
  const out: CutoffMap = new Map();
  if (ids.length === 0) return out;
  const { data: cfgs, error } = await supabase
    .from("ticketline_sync_config")
    .select("event_id, promotores_migrated_at, promotores_cutoff_date")
    .in("event_id", ids)
    .not("promotores_migrated_at", "is", null)
    .not("promotores_cutoff_date", "is", null);
  if (error) throw error;
  const migrated = (cfgs ?? []) as any[];
  if (migrated.length === 0) return out;

  for (const c of migrated) {
    out.set(c.event_id, {
      eventId: c.event_id,
      cutoffDate: String(c.promotores_cutoff_date).slice(0, 10),
      migratedAt: c.promotores_migrated_at,
      postDays: [],
      postQty: 0,
      postValue: 0,
    });
  }
  const { data: days, error: dErr } = await supabase
    .from("ticketline_daily_sales")
    .select("event_id, sale_date, quantity, total_value")
    .in("event_id", [...out.keys()])
    .order("sale_date", { ascending: true })
    .limit(10000);
  if (dErr) throw dErr;
  for (const d of (days ?? []) as any[]) {
    const info = out.get(d.event_id);
    if (!info) continue;
    const date = String(d.sale_date).slice(0, 10);
    if (date <= info.cutoffDate) continue; // período do ticket_sales
    const qty = Number(d.quantity ?? 0);
    const value = Number(d.total_value ?? 0);
    if (qty === 0 && value === 0) continue;
    info.postDays.push({ date, qty, value });
    info.postQty += qty;
    info.postValue += value;
  }
  for (const info of out.values()) info.postValue = Math.round(info.postValue * 100) / 100;
  return out;
}

/** true se a linha de ticket_sales pertence ao acumulado (fica do lado congelado). */
export function keepTicketSaleRow(
  cutoffs: CutoffMap | undefined,
  eventId: string | null | undefined,
  saleDate: string | null | undefined,
): boolean {
  if (!cutoffs || !eventId) return true;
  const info = cutoffs.get(eventId);
  if (!info || !saleDate) return true;
  return String(saleDate).slice(0, 10) <= info.cutoffDate;
}

/** Total do evento: base do ticket_sales (já cortada) + série depois do corte. */
export function cumulativeWithCutoff(
  base: { qty: number; value: number },
  info: TicketlineCutoff | undefined,
): { qty: number; value: number } {
  if (!info) return base;
  return { qty: base.qty + info.postQty, value: Math.round((base.value + info.postValue) * 100) / 100 };
}

export function useTicketlineCutoffs(eventIds: string[]) {
  const key = [...new Set(eventIds.filter(Boolean))].sort().join(",");
  return useQuery({
    queryKey: ["ticketline-cutoffs", key],
    enabled: key.length > 0,
    queryFn: () => fetchTicketlineCutoffs(key.split(",")),
    staleTime: 60_000,
  });
}

/** "DD/MM" a partir de YYYY-MM-DD. */
export function ddmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}
