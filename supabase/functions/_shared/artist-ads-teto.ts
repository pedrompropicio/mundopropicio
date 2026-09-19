// Teto de orçamento das contas de tráfego do ARTISTA (D-ERP95 F2b/F3).
//
// Fonte única partilhada por crm-meta-publish-execute (publicação),
// crm-meta-publish-activate (activação) e crm-meta-entity-action (porta lateral).
// Fechado por omissão: sem linha em crm.artist_ads_budget_caps o motor recusa.
//
// Só se aplica a connections connection_scope='artist'. Nada aqui corre para
// planos de evento nem para connections de empresa.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type TetoInfo = {
  ok: boolean;
  error?: string;
  teto?: number;
  pedido?: number;
  ja_comprometido?: number;
  moeda?: string;
};

/** Orçamento diário de uma lista de adsets (vitalício ÷ dias da janela). */
export function dailyFromAdsets(list: any[], lifetime: boolean, dias: number): number {
  const cents = (list ?? []).reduce((s: number, a: any) => s + Math.max(0, Number(a?.orcamento_cents ?? 0)), 0);
  return (lifetime ? cents / Math.max(1, dias) : cents) / 100;
}

/** Diário já comprometido pelos OUTROS planos de música publicado/ativo da connection. */
export async function committedDaily(
  admin: SupabaseClient,
  connectionId: string,
  excludePlanId?: string | null,
): Promise<number> {
  let q = (admin as any).schema("crm").from("meta_publish_plan")
    .select("id, adsets, start_time, end_time")
    .eq("connection_id", connectionId)
    .in("estado", ["publicado", "ativo"]);
  if (excludePlanId) q = q.neq("id", excludePlanId);
  const { data: outros } = await q;
  let total = 0;
  for (const p of (outros ?? [])) {
    const lt = !!(p as any).end_time;
    const dias = (lt && (p as any).start_time)
      ? Math.max(1, Math.ceil((new Date((p as any).end_time).getTime() - new Date((p as any).start_time).getTime()) / 86400000))
      : 1;
    total += dailyFromAdsets(Array.isArray((p as any).adsets) ? (p as any).adsets : [], lt, dias);
  }
  return total;
}

/**
 * Verifica o teto de uma connection de artista para um pedido diário.
 * `moeda` é a moeda do pedido (plano); tem de ser a do teto.
 */
export async function checkTetoDaily(
  admin: SupabaseClient,
  opts: { connectionId: string; moeda?: string | null; pedido: number; excludePlanId?: string | null },
): Promise<TetoInfo> {
  const { data: cap } = await (admin as any).schema("crm").from("artist_ads_budget_caps")
    .select("daily_cap, currency").eq("connection_id", opts.connectionId).maybeSingle();
  if (!cap) return { ok: false, error: "sem_teto" };
  const capMoeda = String((cap as any).currency ?? "").toUpperCase();
  const moedaPedido = String(opts.moeda ?? "").toUpperCase();
  if (moedaPedido && capMoeda !== moedaPedido) {
    return { ok: false, error: "moeda_diferente_do_teto", teto: Number((cap as any).daily_cap), moeda: capMoeda };
  }
  const comprometido = await committedDaily(admin, opts.connectionId, opts.excludePlanId ?? null);
  const teto = Number((cap as any).daily_cap);
  if (opts.pedido + comprometido > teto + 1e-9) {
    return { ok: false, error: "acima_do_teto", teto, pedido: opts.pedido, ja_comprometido: comprometido, moeda: capMoeda };
  }
  return { ok: true, teto, pedido: opts.pedido, ja_comprometido: comprometido, moeda: capMoeda };
}

/** Variante para um plano: calcula o pedido a partir dos adsets do próprio plano. */
export async function checkTetoPlano(
  admin: SupabaseClient,
  opts: {
    connectionId: string;
    moeda?: string | null;
    adsets: any[];
    usaLifetime: boolean;
    diasJanela: number;
    planId: string;
  },
): Promise<TetoInfo> {
  const pedido = dailyFromAdsets(opts.adsets, opts.usaLifetime, opts.diasJanela);
  return await checkTetoDaily(admin, {
    connectionId: opts.connectionId,
    moeda: opts.moeda,
    pedido,
    excludePlanId: opts.planId,
  });
}
