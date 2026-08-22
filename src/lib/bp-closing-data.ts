/**
 * CAMADA DE DADOS do documento de fecho com os sócios.
 *
 * Este módulo NÃO conhece jsPDF. É deliberado: o PDF actual ("Business Plan —
 * previsto + excedido") é apenas a PRIMEIRA SECÇÃO de um documento de fecho que
 * vai ganhar, na fase 2, um bloco de RECEITAS e um bloco de APURAÇÃO com os
 * sócios. Toda a montagem de números vive aqui; o desenho vive em
 * `export-bp-committed-pdf.ts`.
 *
 * Regras fechadas (decisões do Pedro):
 *  • Só linhas `status='approved'` da versão activa (`version_id IS NULL`).
 *    Linhas em draft ficam fora.
 *  • Excedido calcula-se POR RUBRICA (category_id): max(realizado − previsto, 0),
 *    com o realizado a vir das transações válidas de Fecho (`fecho-filters.ts`).
 *    Baseline do excesso exclui linhas de overhead (igual a `event-cost-basis.ts`).
 *  • O excedido NÃO tem linha própria e NÃO é destacado: soma-se ao valor das
 *    próprias linhas de BP da rubrica, repartido por
 *        quota = excedido × (previsto_da_linha / Σ previsto das linhas da rubrica)
 *    arredondado a 2 casas, com o resto do arredondamento a cair na ÚLTIMA linha
 *    para o total da rubrica fechar sempre ao cêntimo. Rubrica com uma só linha
 *    recebe o excesso todo.
 *
 *    NOTA HONESTA: a repartição proporcional é uma CONVENÇÃO, não um facto — com
 *    várias linhas na mesma rubrica não se sabe qual delas estourou. O caminho
 *    exacto seria olhar para as transações vinculadas por FK e somar à linha que
 *    realmente gastou a mais. Fica como melhoria possível, não implementada.
 *  • IVA do valor comprometido usa a taxa da PRÓPRIA linha de BP (não a taxa
 *    ponderada das transações) — simplifica e é coerente com o resto da coluna.
 *  • Ordenação hierárquica é NUMÉRICA por segmento do código (10 vem depois de 2).
 *    Dentro de cada rubrica L3 as linhas vão por valor decrescente.
 */
import { supabase } from "@/integrations/supabase/client";
import { calcIvaAmount } from "@/lib/iva";
import { FECHO_TX_FILTER_COLUMNS, isValidFechoTransaction } from "@/lib/fecho-filters";
import { EXCESS_EPSILON } from "@/lib/event-cost-basis";

export const HOUSE_ORDERER = "MP";

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Ordenação NUMÉRICA por segmento: chave("10.8.04") = [10, 8, 4].
 * Sem isto, "10" ordenava antes de "2" (comparação de texto) e as Operações
 * Financeiras e Administrativas abriam o relatório em vez de o fechar.
 */
export function codeSortKey(code?: string | null): number[] {
  return String(code ?? "")
    .trim()
    .split(".")
    .map((part) => {
      const n = Number.parseInt(part, 10);
      // Segmentos não numéricos (ex.: "Z" das rubricas sem grupo) vão para o fim.
      return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    });
}

export function compareCodesNumeric(a?: string | null, b?: string | null): number {
  const ka = codeSortKey(a);
  const kb = codeSortKey(b);
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) {
    const va = ka[i] ?? -1;
    const vb = kb[i] ?? -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

interface CategoryNode {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
}

interface ForecastLine {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  category_id: string | null;
  transaction_id: string | null;
  event_id: string;
  is_overhead: boolean;
  ordering_partner_id: string | null;
}

export interface CommittedBpBundle {
  event: { id: string; name: string; date: string; location: string | null; venueName: string | null; cityName: string | null };
  eventIds: string[];
  forecasts: ForecastLine[];
  transactions: any[];
  categories: CategoryNode[];
  partnerNames: Record<string, string>;
  forecastDocs: Record<string, number>;
  txDocs: Record<string, number>;
}

/** Lê tudo o que o relatório precisa (uma única passagem à BD). */
export async function fetchCommittedBpBundle(
  eventId: string,
  includeChildren = true,
): Promise<CommittedBpBundle> {
  const { data: evt, error: evtErr } = await supabase
    .from("events")
    .select("id, name, date, location, cities:city_id(name), venues:venue_id(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (evtErr) throw evtErr;
  if (!evt) throw new Error("Evento não encontrado");

  let eventIds = [eventId];
  if (includeChildren) {
    const { data: kids } = await supabase.from("events").select("id").eq("parent_event_id", eventId);
    eventIds = [eventId, ...((kids ?? []) as any[]).map((k) => k.id)];
  }

  const [fcRes, txRes, catRes, partnerRes] = await Promise.all([
    supabase
      .from("event_forecasts")
      .select(
        "id, description, specification, amount, iva_rate, category_id, transaction_id, event_id, is_overhead, ordering_partner_id, type, status",
      )
      .in("event_id", eventIds)
      .is("version_id", null)
      .eq("type", "expense")
      .eq("status", "approved"),
    supabase
      .from("transactions")
      .select(
        `id, description, amount, iva_rate, category_id, type, event_id, ordering_partner_id, ${FECHO_TX_FILTER_COLUMNS}`,
      )
      .in("event_id", eventIds)
      .eq("type", "expense"),
    supabase.from("account_categories").select("id, code, name, parent_id"),
    supabase.from("event_partners").select("id, suppliers:supplier_id(name)").in("event_id", eventIds),
  ]);
  if (fcRes.error) throw fcRes.error;
  if (txRes.error) throw txRes.error;
  if (catRes.error) throw catRes.error;
  if (partnerRes.error) throw partnerRes.error;

  const forecasts: ForecastLine[] = ((fcRes.data ?? []) as any[]).map((f) => ({
    id: f.id,
    description: f.description ?? "—",
    specification: f.specification ?? null,
    amount: Number(f.amount || 0),
    iva_rate: Number(f.iva_rate || 0),
    category_id: f.category_id ?? null,
    transaction_id: f.transaction_id ?? null,
    event_id: f.event_id,
    is_overhead: !!f.is_overhead,
    ordering_partner_id: f.ordering_partner_id ?? null,
  }));

  const transactions = ((txRes.data ?? []) as any[]).filter(isValidFechoTransaction);

  const partnerNames: Record<string, string> = {};
  for (const p of (partnerRes.data ?? []) as any[]) {
    partnerNames[p.id] = p.suppliers?.name ?? "Sócio";
  }

  // Contagens de anexos
  const forecastDocs: Record<string, number> = {};
  const txDocs: Record<string, number> = {};
  const fcIds = forecasts.map((f) => f.id);
  const txIds = transactions.map((t) => t.id);
  const [faRes, tdRes] = await Promise.all([
    fcIds.length
      ? supabase.from("event_forecast_attachments").select("forecast_id").in("forecast_id", fcIds)
      : Promise.resolve({ data: [], error: null } as any),
    txIds.length
      ? supabase.from("transaction_documents").select("transaction_id").in("transaction_id", txIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  for (const a of ((faRes as any).data ?? []) as any[]) {
    forecastDocs[a.forecast_id] = (forecastDocs[a.forecast_id] ?? 0) + 1;
  }
  for (const d of ((tdRes as any).data ?? []) as any[]) {
    txDocs[d.transaction_id] = (txDocs[d.transaction_id] ?? 0) + 1;
  }

  return {
    event: {
      id: (evt as any).id,
      name: (evt as any).name,
      date: (evt as any).date,
      location: (evt as any).location ?? null,
      venueName: (evt as any).venues?.name ?? null,
      cityName: (evt as any).cities?.name ?? null,
    },
    eventIds,
    forecasts,
    transactions,
    categories: (catRes.data ?? []) as any,
    partnerNames,
    forecastDocs,
    txDocs,
  };
}

// ─── Estrutura hierárquica ────────────────────────────────────────────────────

export type RowKind = "l1" | "l2" | "l3" | "line" | "total";

export interface OutRow {
  kind: RowKind;
  code: string;
  label: string;
  orderer: string;
  docs: number;
  base: number;
  iva: number;
  total: number;
}

export interface SectionTotals {
  base: number;
  iva: number;
  total: number;
  docs: number;
}

/** Secção pronta a desenhar: árvore de linhas + totais. */
export interface ReportSection {
  title: string;
  rows: OutRow[];
  totals: SectionTotals;
}

interface LineCalc {
  fc: ForecastLine;
  base: number; // previsto + quota do excedido
  iva: number;
  docs: number;
}

interface L3Group {
  id: string | null;
  code: string;
  name: string;
  lines: LineCalc[];
}
interface L2Group {
  code: string;
  name: string;
  l3: L3Group[];
}
interface L1Group {
  code: string;
  name: string;
  l2: L2Group[];
}

/** Reparte o excedido da rubrica pelas linhas, resto na última (fecha ao cêntimo). */
export function distributeExcess(previstos: number[], excess: number): number[] {
  const n = previstos.length;
  if (n === 0 || excess <= EXCESS_EPSILON) return previstos.map(() => 0);
  if (n === 1) return [round2(excess)];
  const sum = previstos.reduce((s, v) => s + v, 0);
  const quotas: number[] = [];
  if (Math.abs(sum) < 0.005) {
    // Sem base de repartição: tudo na última linha.
    for (let i = 0; i < n; i++) quotas.push(i === n - 1 ? round2(excess) : 0);
    return quotas;
  }
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const q = round2(excess * (previstos[i] / sum));
    quotas.push(q);
    acc += q;
  }
  quotas.push(round2(excess - acc));
  return quotas;
}

export function buildCommittedRows(bundle: CommittedBpBundle): { rows: OutRow[]; totals: SectionTotals } {
  const { forecasts, transactions, categories, partnerNames, forecastDocs, txDocs } = bundle;

  const byId: Record<string, CategoryNode> = {};
  categories.forEach((c) => { byId[c.id] = c; });
  const chainOf = (catId: string | null) => {
    if (!catId || !byId[catId]) return { l1: null as CategoryNode | null, l2: null as CategoryNode | null, l3: null as CategoryNode | null };
    const cat = byId[catId];
    const parent = cat.parent_id ? byId[cat.parent_id] : null;
    if (!parent) return { l1: cat, l2: null, l3: null };
    const gp = parent.parent_id ? byId[parent.parent_id] : null;
    if (!gp) return { l1: parent, l2: cat, l3: null };
    return { l1: gp, l2: parent, l3: cat };
  };

  // ── Excedido por rubrica (category_id) ─────────────────────────────────────
  const prevByCat = new Map<string, number>();
  for (const f of forecasts) {
    if (f.is_overhead || !f.category_id) continue; // overhead fora do baseline
    prevByCat.set(f.category_id, (prevByCat.get(f.category_id) ?? 0) + f.amount);
  }
  const realByCat = new Map<string, number>();
  const txByCat = new Map<string, any[]>();
  for (const t of transactions) {
    const k = t.category_id ?? "__no_category__";
    realByCat.set(k, (realByCat.get(k) ?? 0) + Number(t.amount || 0));
    txByCat.set(k, [...(txByCat.get(k) ?? []), t]);
  }
  const excessByCat = new Map<string, number>();
  for (const [k, real] of realByCat) {
    const diff = real - (prevByCat.get(k) ?? 0);
    if (diff > EXCESS_EPSILON) excessByCat.set(k, diff);
  }

  // ── Linhas por rubrica, já com a quota do excedido somada ───────────────────
  const linesByCat = new Map<string, ForecastLine[]>();
  for (const f of forecasts) {
    const k = f.category_id ?? "__no_category__";
    linesByCat.set(k, [...(linesByCat.get(k) ?? []), f]);
  }

  const committedByForecast = new Map<string, number>();
  for (const [cat, lines] of linesByCat) {
    const excess = excessByCat.get(cat) ?? 0;
    // Repartição só entre linhas operacionais; se a rubrica só tiver overhead,
    // reparte por todas (senão o excesso não teria onde entrar).
    const target = lines.filter((l) => !l.is_overhead);
    const pool = target.length > 0 ? target : lines;
    const quotas = distributeExcess(pool.map((l) => l.amount), excess);
    lines.forEach((l) => committedByForecast.set(l.id, l.amount));
    pool.forEach((l, i) => committedByForecast.set(l.id, round2(l.amount + quotas[i])));
  }

  // Rubricas COM excedido mas SEM linha aprovada de BP: linha sintética neutra,
  // para o total fechar (sem ela o excesso desaparecia do relatório).
  const syntheticByCat: { cat: string; amount: number }[] = [];
  for (const [cat, exc] of excessByCat) {
    if (!linesByCat.has(cat)) syntheticByCat.push({ cat, amount: round2(exc) });
  }

  // ── Montar hierarquia ──────────────────────────────────────────────────────
  const l1Map: Record<string, L1Group> = {};
  const pushLine = (catId: string | null, calc: LineCalc) => {
    const chain = chainOf(catId);
    const l1Name = chain.l1?.name ?? "Sem Grupo";
    const l1Code = chain.l1?.code ?? "Z";
    const l2Name = chain.l2?.name ?? chain.l1?.name ?? "Geral";
    const l2Code = chain.l2?.code ?? chain.l1?.code ?? "Z.Z";
    const l3Name = chain.l3?.name ?? chain.l2?.name ?? chain.l1?.name ?? "—";
    const l3Code = chain.l3?.code ?? chain.l2?.code ?? chain.l1?.code ?? "";
    if (!l1Map[l1Code]) l1Map[l1Code] = { code: l1Code, name: l1Name, l2: [] };
    let g2 = l1Map[l1Code].l2.find((g) => g.code === l2Code);
    if (!g2) { g2 = { code: l2Code, name: l2Name, l3: [] }; l1Map[l1Code].l2.push(g2); }
    let g3 = g2.l3.find((g) => g.code === l3Code && g.name === l3Name);
    if (!g3) { g3 = { id: catId, code: l3Code, name: l3Name, lines: [] }; g2.l3.push(g3); }
    g3.lines.push(calc);
  };

  for (const f of forecasts) {
    const base = committedByForecast.get(f.id) ?? f.amount;
    const iva = calcIvaAmount(base, f.iva_rate);
    // Anexos da linha: os seus + documentos das transações vinculadas por FK.
    let docs = forecastDocs[f.id] ?? 0;
    if (f.transaction_id) docs += txDocs[f.transaction_id] ?? 0;
    pushLine(f.category_id, { fc: f, base, iva, docs });
  }
  for (const s of syntheticByCat) {
    const catId = s.cat === "__no_category__" ? null : s.cat;
    const txs = txByCat.get(s.cat) ?? [];
    const ivaSum = txs.reduce((acc, t) => acc + calcIvaAmount(Number(t.amount || 0), Number(t.iva_rate || 0)), 0);
    const baseSum = txs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const rate = baseSum > 0 ? (ivaSum / baseSum) * 100 : 0;
    pushLine(catId, {
      fc: {
        id: `synthetic-${s.cat}`,
        description: "Realizado sem linha de BP",
        specification: null,
        amount: s.amount,
        iva_rate: rate,
        category_id: catId,
        transaction_id: null,
        event_id: bundle.event.id,
        is_overhead: false,
        ordering_partner_id: null,
      },
      base: s.amount,
      iva: calcIvaAmount(s.amount, rate),
      docs: 0,
    });
  }

  // ── Achatar em linhas de output com subtotais ──────────────────────────────
  const rows: OutRow[] = [];
  const grand: SectionTotals = { base: 0, iva: 0, total: 0, docs: 0 };

  const l1s = Object.values(l1Map).sort((a, b) => compareCodesNumeric(a.code, b.code));
  for (const g1 of l1s) {
    const g1Rows: OutRow[] = [];
    const s1 = { base: 0, iva: 0, docs: 0 };
    const l2s = g1.l2.sort((a, b) => compareCodesNumeric(a.code, b.code));
    for (const g2 of l2s) {
      const g2Rows: OutRow[] = [];
      const s2 = { base: 0, iva: 0, docs: 0 };
      const l3s = g2.l3.sort((a, b) => compareCodesNumeric(a.code, b.code));
      for (const g3 of l3s) {
        const s3 = { base: 0, iva: 0, docs: 0 };
        const lineRows: OutRow[] = [];
        // Dentro da rubrica, linhas por valor decrescente.
        const orderedLines = [...g3.lines].sort((a, b) => b.base - a.base);
        for (const l of orderedLines) {
          s3.base += l.base;
          s3.iva += l.iva;
          s3.docs += l.docs;
          lineRows.push({
            kind: "line",
            code: "",
            label: l.fc.specification ? `${l.fc.description} — ${l.fc.specification}` : l.fc.description,
            orderer: l.fc.ordering_partner_id ? partnerNames[l.fc.ordering_partner_id] ?? HOUSE_ORDERER : HOUSE_ORDERER,
            docs: l.docs,
            base: l.base,
            iva: l.iva,
            total: l.base + l.iva,
          });
        }
        // Anexos da rubrica: linhas + documentos das transações NÃO vinculadas
        // por FK a nenhuma linha (senão o total ficaria abaixo do real).
        const catKey = g3.id ?? "__no_category__";
        const linkedTxIds = new Set(
          g3.lines.map((l) => l.fc.transaction_id).filter(Boolean) as string[],
        );
        const unlinkedDocs = (txByCat.get(catKey) ?? [])
          .filter((t) => !linkedTxIds.has(t.id))
          .reduce((acc, t) => acc + (txDocs[t.id] ?? 0), 0);
        const l3Docs = s3.docs + unlinkedDocs;
        g2Rows.push({ kind: "l3", code: g3.code, label: g3.name, orderer: "", docs: l3Docs, base: s3.base, iva: s3.iva, total: s3.base + s3.iva });
        g2Rows.push(...lineRows);
        s2.base += s3.base;
        s2.iva += s3.iva;
        s2.docs += l3Docs;
      }
      g1Rows.push({ kind: "l2", code: g2.code, label: g2.name, orderer: "", docs: s2.docs, base: s2.base, iva: s2.iva, total: s2.base + s2.iva });
      g1Rows.push(...g2Rows);
      s1.base += s2.base;
      s1.iva += s2.iva;
      s1.docs += s2.docs;
    }
    rows.push({ kind: "l1", code: g1.code, label: g1.name, orderer: "", docs: s1.docs, base: s1.base, iva: s1.iva, total: s1.base + s1.iva });
    rows.push(...g1Rows);
    grand.base += s1.base;
    grand.iva += s1.iva;
    grand.docs += s1.docs;
  }
  grand.total = grand.base + grand.iva;

  rows.push({ kind: "total", code: "", label: "TOTAL GERAL", orderer: "", docs: grand.docs, base: grand.base, iva: grand.iva, total: grand.total });

  return { rows, totals: grand };
}

/**
 * Documento de fecho — modelo de dados.
 * Hoje só traz a secção de despesas. A fase 2 acrescenta aqui
 * `revenues: ReportSection` e `apuracao: { partnerId, share, ... }[]`,
 * sem tocar no desenho já validado.
 */
export interface ClosingReportData {
  bundle: CommittedBpBundle;
  expenses: ReportSection;
}

export function buildClosingReportData(bundle: CommittedBpBundle): ClosingReportData {
  const { rows, totals } = buildCommittedRows(bundle);
  return {
    bundle,
    expenses: { title: "Despesas — previsto + excedido", rows, totals },
  };
}
