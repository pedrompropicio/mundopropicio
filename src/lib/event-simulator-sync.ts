/**
 * Helpers para inicializar/sincronizar o Simulador a partir das fontes reais:
 *  - Vendas reais: ticket_sales (sum quantity, sum total_value via ticketSaleRevenue)
 *  - Sessões: produto cartesiano event_dates × event_ticket_zones
 *  - Projeção default: total_capacity − vendido (clamp ≥ 0)
 *  - Forecast custos: event_forecasts approved (type=expense) agregados por categoria L3
 *
 * Sources foram aprovadas pelo utilizador (msg de 2026-04-30).
 */
import { supabase } from "@/integrations/supabase/client";
import { ticketSaleRevenue } from "./ticket-sales-revenue";
import { keepLatestFeverImportRows } from "./ticket-sales-batch-filter";

export type SyncReport = {
  sessionsCreated: number;
  sessionsUpdated: number;
  costLinesCreated: number;
  costLinesUpdated: number;
  sponsorsTotal: number;
};

type Row = Record<string, any>;

/**
 * Cria sessões em falta (date × zone) e atualiza Vendas Reais a partir de ticket_sales.
 * Não toca em campos manuais (cortesia, forecast_qty, avg_ticket_override) se a sessão já existe.
 */
export async function syncSimulatorFromSources(eventId: string): Promise<SyncReport> {
  const report: SyncReport = {
    sessionsCreated: 0, sessionsUpdated: 0,
    costLinesCreated: 0, costLinesUpdated: 0,
    sponsorsTotal: 0,
  };

  // 1) Carrega fontes
  const [eventRes, datesRes, zonesRes, salesRes, existingRes, fcRes, catsRes, cfgRes] = await Promise.all([
    supabase.from("events").select("id, company_id").eq("id", eventId).maybeSingle(),
    supabase.from("event_dates").select("id, date").eq("event_id", eventId).order("date"),
    supabase.from("event_ticket_zones").select("id, name, total_capacity, session_id").eq("event_id", eventId).order("name"),
    supabase.from("ticket_sales").select("zone_id, sale_date, quantity, unit_price, total_value")
      .in("zone_id", []) // placeholder substituído logo abaixo
      .limit(1),
    supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId),
    supabase.from("event_forecasts").select("id, category_id, amount, type, status, transaction_id")
      .eq("event_id", eventId).eq("status", "approved").eq("type", "expense").is("version_id", null),
    supabase.from("account_categories").select("id, code, name, company_id").eq("is_active", true),
    supabase.from("event_simulator_cost_lines").select("*").eq("event_id", eventId),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (!eventRes.data?.company_id) throw new Error("Evento sem empresa associada; não é possível sincronizar o simulador.");

  const companyId = eventRes.data.company_id;

  const dates = (datesRes.data ?? []) as Row[];
  const zones = (zonesRes.data ?? []) as Row[];
  const existing = (existingRes.data ?? []) as Row[];
  const forecasts = (fcRes.data ?? []) as Row[];
  const categories = (catsRes.data ?? []) as Row[];
  const existingCosts = (cfgRes.data ?? []) as Row[];

  // Re-fetch ticket_sales agora que temos zone_ids reais
  const zoneIds = zones.map((z) => z.id);
  let sales: Row[] = [];
  if (zoneIds.length) {
    const { data } = await supabase
      .from("ticket_sales")
      .select("zone_id, sale_date, quantity, unit_price, total_value, financial_account_id, source, import_batch_id, created_at")
      .in("zone_id", zoneIds);
    sales = keepLatestFeverImportRows((data ?? []) as Row[]);
  }

  // Agrega vendas por (zone_id, sale_date). Modelo unificado: combos são lotes
  // normais com is_combo=true que vivem na sua zona âncora — para receita,
  // basta agregar pelo zone_id da venda (mesmo comportamento que simples).
  const salesByZoneDate = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    const key = `${s.zone_id}|${s.sale_date}`;
    const prev = salesByZoneDate.get(key) ?? { qty: 0, revenue: 0 };
    prev.qty += Number(s.quantity || 0);
    prev.revenue += ticketSaleRevenue(s as any);
    salesByZoneDate.set(key, prev);
  }
  const salesByZone = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    const prev = salesByZone.get(s.zone_id) ?? { qty: 0, revenue: 0 };
    prev.qty += Number(s.quantity || 0);
    prev.revenue += ticketSaleRevenue(s as any);
    salesByZone.set(s.zone_id, prev);
  }

  // 3) Indexa sessões existentes
  const existingByKey = new Map<string, Row>();
  const existingIndexes: number[] = [];
  for (const e of existing) {
    const lk = (e.zone_label || "").toLowerCase();
    existingByKey.set(`${e.day_index}|${lk}`, e);
    existingIndexes.push(Number(e.day_index ?? 0));
  }
  // Próximo day_index disponível para novas sessões — evita colisões com
  // linhas já existentes (ex.: imports anteriores criaram day_index 0..N).
  let nextDayIndex = existingIndexes.length ? Math.max(...existingIndexes) + 1 : 0;

  // 4) Para cada (date × zone) calcula payload e upsert
  // Se não há dates, cria 1 dia "virtual"
  const effectiveDates = dates.length ? dates : [{ id: null, date: null }];

  // Para cada zona, descobrimos qual o `day_index` "anchor" — o dia onde
  // a totalidade das vendas reais da zona é depositada. Sem isto, vendas
  // cuja `sale_date` não coincide com nenhuma `event_date` (típico de
  // imports antecipados — Fever/Coala) ficam órfãs e o cartão Bilhetes
  // mostra menos do que a receita real.
  //  - Zonas COM session_id → anchor = índice do dia dessa session_id.
  //  - Zonas SEM session_id (passes/combos multi-dia) → anchor = dia 0.
  const sessionIdToDayIdx = new Map<string, number>();
  effectiveDates.forEach((d, i) => { if ((d as any).id) sessionIdToDayIdx.set((d as any).id, i); });
  const anchorByZone = new Map<string, number>();
  for (const z of zones) {
    const sid = (z as any).session_id;
    const idx = sid ? (sessionIdToDayIdx.get(sid) ?? 0) : 0;
    anchorByZone.set(z.id, idx);
  }

  for (let dIdx = 0; dIdx < effectiveDates.length; dIdx++) {
    const d = effectiveDates[dIdx];
    for (const z of zones) {
      const key = `${dIdx}|${(z.name || "").toLowerCase()}`;
      const existingRow = existingByKey.get(key);

      // Vendas reais: só são depositadas na linha "anchor" da zona — o
      // total da zona vai inteiro para lá. Os outros dias da zona ficam
      // a zero (os solvers tratam o agregado por zone_label).
      let realQty = 0, realRev = 0;
      if (anchorByZone.get(z.id) === dIdx) {
        const z2 = salesByZone.get(z.id);
        if (z2) { realQty = z2.qty; realRev = z2.revenue; }
      }

      const capacity = Number(z.total_capacity || 0);
      const projected = Math.max(0, capacity - realQty);

      if (existingRow) {
        // Update apenas as métricas automáticas; preserva manuais
        const patch: Row = {
          real_sales_qty: realQty,
          real_sales_revenue: realRev,
        };
        // Atualiza projeção só se o utilizador ainda não a editou (heurística: se existing.projected_qty == 0 ou == capacity)
        if (
          Number(existingRow.projected_qty || 0) === 0 ||
          Number(existingRow.projected_qty || 0) === capacity
        ) {
          patch.projected_qty = projected;
        }
        const { error } = await supabase
          .from("event_simulator_inputs")
          .update(patch as any).eq("id", existingRow.id);
        if (error) throw error;
        report.sessionsUpdated++;
      } else {
        const { error } = await supabase
          .from("event_simulator_inputs")
          .insert({
            event_id: eventId,
            company_id: companyId,
            day_index: nextDayIndex++,
            day_date: d.date ?? null,
            zone_label: z.name,
            capacity_target: capacity,
            real_sales_qty: realQty,
            real_sales_revenue: realRev,
            projected_qty: projected,
            courtesy_qty: 0,
            forecast_qty: null,
            avg_ticket_override: null,
            iva_pct: 6,
          } as any);
        if (error) throw error;
        report.sessionsCreated++;
      }
    }
  }

  // 5) Custos por categoria
  // Idealmente só L3, mas há BPs legados com linhas em L2 (ex: "2.5 Cenografia").
  // Para o simulador bater com o BP, aceitamos qualquer categoria da empresa
  // que tenha movimento (BP ou TX). Mantemos L3 como preferida para novas linhas.
  const l3 = categories.filter(
    (c) => c.company_id === companyId,
  );
  const l3ById = new Map<string, Row>();
  for (const c of l3) l3ById.set(c.id, c);

  // 5a) Forecast aprovado (despesa) por categoria
  const fcByCat = new Map<string, number>();
  for (const f of forecasts) {
    if (!f.category_id || !l3ById.has(f.category_id)) continue;
    fcByCat.set(f.category_id, (fcByCat.get(f.category_id) ?? 0) + Number(f.amount || 0));
  }

  // 5b) Transações reais por categoria L3 — só approved+paid (alinhado a Cards do BP / Análise de Resultados)
  const { data: txRaw } = await supabase
    .from("transactions")
    .select("id, amount, status, category_id, type")
    .eq("event_id", eventId)
    .in("status", ["approved", "paid"]);
  const txs = (txRaw ?? []) as Array<{
    id: string; amount: number; status: string; category_id: string | null; type: string;
  }>;

  const actualTxByCat = new Map<string, number>();        // TX approved+paid
  const actualPaidByCat = new Map<string, number>();      // só TX paid
  for (const t of txs) {
    if (t.type !== "expense") continue;
    if (!t.category_id || !l3ById.has(t.category_id)) continue;
    const v = Number(t.amount || 0);
    actualTxByCat.set(t.category_id, (actualTxByCat.get(t.category_id) ?? 0) + v);
    if (t.status === "paid") {
      actualPaidByCat.set(t.category_id, (actualPaidByCat.get(t.category_id) ?? 0) + v);
    }
  }

  // 5c) BP aprovado por categoria — total (não filtrar por transaction_id; vínculo BP↔TX é por
  //      category_id+event_id, não por transaction_id — ver memory bp-installments / accounting-linkage-logic).
  const bpApprovedByCat = fcByCat;

  // 5d) União de categorias afetadas
  const allCatIds = new Set<string>([
    ...fcByCat.keys(),
    ...actualTxByCat.keys(),
  ]);

  const existingCostByCat = new Map<string, Row>();
  for (const c of existingCosts) {
    if (c.category_id) existingCostByCat.set(c.category_id, c);
  }

  let order = existingCosts.length;
  for (const catId of allCatIds) {
    const cat = l3ById.get(catId);
    if (!cat) continue;
    const fcAmount = bpApprovedByCat.get(catId) ?? 0;
    const actualPaid = actualPaidByCat.get(catId) ?? 0;
    const actualTxAppPaid = actualTxByCat.get(catId) ?? 0;
    // "Hoje" = TX (approved+paid) + BP aprovado SEM TX correspondente.
    // committedBp = parcela do BP ainda não materializada em transação.
    // Vínculo BP↔TX é por category_id+event_id, por isso somamos sem dupla contagem.
    const committedBp = Math.max(0, fcAmount - actualTxAppPaid);
    const actualAmount = actualTxAppPaid + committedBp;

    const exists = existingCostByCat.get(catId);
    if (exists) {
      const { error } = await supabase
        .from("event_simulator_cost_lines")
        .update({
          forecast_amount: fcAmount,
          actual_amount: actualAmount,
          actual_paid: actualPaid,
          actual_committed_bp: committedBp,
        })
        .eq("id", exists.id);
      if (error) throw error;
      report.costLinesUpdated++;
    } else {
      const { error } = await supabase
        .from("event_simulator_cost_lines")
        .insert({
          event_id: eventId,
          company_id: companyId,
          category_id: catId,
          label: `${cat.code} — ${cat.name}`,
          prior_year_amount: 0,
          break_even_amount: 0,
          forecast_amount: fcAmount,
          actual_amount: actualAmount,
          actual_paid: actualPaid,
          actual_committed_bp: committedBp,
          is_ab_passthrough: false,
          display_order: order++,
        } as any);
      if (error) throw error;
      report.costLinesCreated++;
    }
  }

  // 5e) Remove linhas de custo órfãs (já não têm BP nem TX) — evita resíduos
  //      de BPs antigos apagados que ficavam a inflar o "Hoje".
  const orphanIds = existingCosts
    .filter((c) => c.category_id && !allCatIds.has(c.category_id))
    .map((c) => c.id);
  if (orphanIds.length) {
    await supabase.from("event_simulator_cost_lines").delete().in("id", orphanIds);
  }

  // 6) Patrocinadores: totaliza receitas de qualquer L3 abaixo de 1.2 e atualiza
  //    event_simulator_config.sponsorship_revenue (mantém compatibilidade com os cálculos atuais).
  const { data: allFcRevenue } = await supabase
    .from("event_forecasts")
    .select("amount, category_id")
    .eq("event_id", eventId)
    .eq("type", "income")
    .eq("status", "approved")
    .is("version_id", null);
  // l3 abaixo de 1.2 (default; o utilizador pode customizar via sponsor_category_l2_id)
  const sponsorL3Ids = new Set(l3.filter((c) => c.code.startsWith("1.2.")).map((c) => c.id));
  const sponsorsTotal = ((allFcRevenue ?? []) as any[])
    .filter((f) => f.category_id && sponsorL3Ids.has(f.category_id))
    .reduce((acc, f) => acc + Number(f.amount || 0), 0);
  report.sponsorsTotal = sponsorsTotal;

  const { data: existingConfig } = await supabase
    .from("event_simulator_config")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingConfig) {
    await supabase
      .from("event_simulator_config")
      .update({ sponsorship_revenue: sponsorsTotal })
      .eq("event_id", eventId);
  } else {
    await supabase
      .from("event_simulator_config")
      .insert({ event_id: eventId, company_id: companyId, sponsorship_revenue: sponsorsTotal } as any);
  }

  return report;
}
