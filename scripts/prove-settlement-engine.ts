/**
 * PROVA CONTA-A-CONTA do motor dos apuramentos (#146 (c)) — SÓ LEITURA.
 *
 * Lado "ecrã": réplica literal do cálculo do Encontro de Contas em modo
 * "por contrato de cada sócio" (PartnerSettlementTab: casa injectada por
 * computeHousePercentage, base por sócio via partnerUsesGrossExpenses com a
 * casa forçada a s/IVA, quota = % × resultado, mais despesas pagas pelo sócio
 * e extras do sócio na base do sócio).
 *
 * Lado "motor": computeSettlementEngine sobre os MESMOS totais do evento.
 *
 * Critério: defaults do Fecho — overhead LIGADO, despesa realizada.
 * Não escreve nada. Corre com: bun scripts/prove-settlement-engine.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { calcTotalWithIva, roundCents } from "../src/lib/iva";
import { computeEventSettlementTotals } from "../src/lib/event-settlement-inputs";
import { computeSettlementEngine, type EngineParticipant, type EngineParticipantMoney, type EngineMarkedLine } from "../src/lib/event-settlement-engine";
import {
  normalizePartnerCalcBasis,
  partnerUsesGrossExpenses,
  ignoresOperationalExpenses,
} from "../src/lib/partner-calc-basis";
import { computeHousePercentage, HOUSE_PARTNER_NAME } from "../src/lib/house-partner";
import { isValidFechoTransaction } from "../src/lib/fecho-filters";

const URL = "https://sfohvvlqccmmebvjgibx.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmb2h2dmxxY2NtbWVidmpnaWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjUyNzgsImV4cCI6MjA4OTMwMTI3OH0.Js56uldkgHZ0kkOUZmpXI2Ker0Av0u7LJrHZ6rxSRd0";

const session = JSON.parse(
  readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8"),
);
const token = session.access_token ?? session.session?.access_token;
const supabase = createClient(URL, ANON, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASIS = { includeOverhead: true, expenseSource: "realized" as const };
const EUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

async function stamps() {
  const tables = [
    "event_partners",
    "event_forecasts",
    "transactions",
    "event_settlements",
    "event_settlement_participants",
  ];
  const out: Record<string, string | null> = {};
  for (const t of tables) {
    const { data } = await supabase
      .from(t as any)
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    out[t] = (data?.[0] as any)?.updated_at ?? null;
  }
  return out;
}

interface Row {
  event: string;
  participant: string;
  screenShare: number;
  engineShare: number;
  screenFinal: number;
  engineFinal: number;
}

async function main() {
  const before = await stamps();

  const { data: roots, error: rootsErr } = await supabase
    .from("event_settlements")
    .select("event_id, events(name)")
    .is("parent_id", null)
    .order("created_at");
  if (rootsErr) throw rootsErr;

  const rows: Row[] = [];
  const notes: string[] = [];

  for (const root of roots ?? []) {
    const eventId = (root as any).event_id as string;
    const eventName = (root as any).events?.name ?? eventId;

    const { data: events } = await supabase
      .from("events")
      .select("id, name, date, parent_event_id, partner_calc_basis")
      .or(`id.eq.${eventId},parent_event_id.eq.${eventId}`);
    const allIds = (events ?? []).map((e: any) => e.id);
    const self = (events ?? []).find((e: any) => e.id === eventId);
    const calcBasis = normalizePartnerCalcBasis((self as any)?.partner_calc_basis);

    const { data: transactions } = await supabase
      .from("transactions")
      .select(
        "id, amount, iva_rate, type, status, event_id, event_settlement_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, account_categories(code)",
      )
      .in("event_id", allIds);
    const { data: forecasts } = await supabase
      .from("event_forecasts")
      .select(
        "id, event_id, type, amount, iva_rate, status, is_overhead, is_transitory, exclude_from_result, master_forecast_id, transaction_id, category_id, event_settlement_id",
      )
      .in("event_id", allIds)
      .eq("status", "approved")
      .is("version_id", null);

    const { data: zones } = await supabase.from("event_ticket_zones").select("id").in("event_id", allIds);
    let ticketSales: { gross: number; net: number }[] = [];
    if (zones?.length) {
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate")
        .in("zone_id", zones.map((z: any) => z.id));
      if (lots?.length) {
        const { data: sales } = await supabase
          .from("ticket_sales")
          .select("lot_id, quantity, unit_price, total_value")
          .in("lot_id", lots.map((l: any) => l.id));
        ticketSales = (sales ?? []).map((s: any) => {
          const lot = lots.find((l: any) => l.id === s.lot_id);
          const rate = Number(lot?.iva_rate || 0);
          const gross = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
          return { gross, net: gross / (1 + rate / 100) };
        });
      }
    }

    const totals = computeEventSettlementTotals({
      events: events ?? [],
      transactions: transactions ?? [],
      forecasts: forecasts ?? [],
      ticketSales,
      basis: BASIS,
    });

    // ---- dinheiro do sócio (mesmas fontes do ecrã) ----
    const { data: paid } = await supabase
      .from("partner_paid_expenses")
      .select("partner_id, transactions(amount, iva_rate, is_transitory)")
      .in("event_id", allIds)
      .eq("status", "approved");
    const { data: advances } = await supabase
      .from("partner_advance_expenses")
      .select("partner_id, amount, iva_rate")
      .in("event_id", allIds);
    const { data: manualExtras } = await supabase
      .from("event_partner_extras")
      .select("partner_id, amount")
      .in("event_id", allIds);

    const money: Record<string, EngineParticipantMoney> = {};
    const bump = (k: string) =>
      (money[k] = money[k] ?? { paidByPartner: 0, paidByPartnerGross: 0, extras: 0, extrasGross: 0 });
    (paid ?? []).forEach((pe: any) => {
      if (!pe.partner_id || pe.transactions?.is_transitory) return;
      const m = bump(pe.partner_id);
      const net = Number(pe.transactions?.amount || 0);
      m.paidByPartner! += net;
      m.paidByPartnerGross! += calcTotalWithIva(net, Number(pe.transactions?.iva_rate || 0));
    });
    (advances ?? []).forEach((a: any) => {
      const m = bump(a.partner_id);
      const net = Number(a.amount || 0);
      m.extras! += net;
      m.extrasGross! += calcTotalWithIva(net, Number(a.iva_rate || 0));
    });
    (manualExtras ?? []).forEach((a: any) => {
      const m = bump(a.partner_id);
      const net = Number(a.amount || 0);
      m.extras! += net;
      m.extrasGross! += net;
    });

    // ---- LADO ECRÃ (modo "por contrato de cada sócio") ----
    const { data: partners } = await supabase
      .from("event_partners")
      .select("id, percentage, loss_percentage, expense_includes_iva, suppliers(name)")
      .eq("event_id", eventId)
      .order("created_at");
    const housePct = computeHousePercentage((partners ?? []).map((p: any) => ({ percentage: p.percentage })));
    const screenList = [
      ...(partners ?? []).map((p: any) => ({
        id: p.id,
        name: p.suppliers?.name ?? "—",
        isHouse: false,
        pct: Number(p.percentage),
        loss: p.loss_percentage != null ? Number(p.loss_percentage) : null,
        override: p.expense_includes_iva === null || p.expense_includes_iva === undefined ? null : !!p.expense_includes_iva,
      })),
      ...(housePct != null
        ? [{ id: "__house__", name: HOUSE_PARTNER_NAME, isHouse: true, pct: housePct, loss: null, override: false }]
        : []),
    ];

    const screenByName: Record<string, { share: number; final: number }> = {};
    for (const p of screenList) {
      const usesGross = partnerUsesGrossExpenses(calcBasis, p.isHouse ? false : p.override);
      const expenses = ignoresOperationalExpenses(calcBasis)
        ? 0
        : usesGross
          ? totals.expensesGross
          : totals.expensesNet;
      const result = totals.revenueNet - expenses;
      const eff = result < 0 && p.loss != null ? p.loss : p.pct;
      const share = result * (eff / 100);
      const m = p.isHouse ? {} : (money[p.id] ?? {});
      const paidV = usesGross ? Number(m.paidByPartnerGross || 0) : Number(m.paidByPartner || 0);
      const extraV = usesGross ? Number(m.extrasGross || 0) : Number(m.extras || 0);
      screenByName[p.name] = {
        share: roundCents(share),
        final: roundCents(share + (p.isHouse ? 0 : paidV - extraV)),
      };
    }

    // ---- LADO MOTOR ----
    const { data: settlements } = await supabase
      .from("event_settlements")
      .select("id, name, parent_id, parent_share_pct, parent_share_basis, position, is_sealed")
      .eq("event_id", eventId)
      .order("position");
    const { data: parts } = await supabase
      .from("event_settlement_participants")
      .select("id, settlement_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, supplier_id, event_partner_id, supplier:suppliers(name)")
      .eq("event_id", eventId);

    const engineParticipants: EngineParticipant[] = (parts ?? []).map((p: any) => ({
      id: p.id,
      settlement_id: p.settlement_id,
      participant_kind: p.participant_kind,
      name: p.participant_kind === "house" ? HOUSE_PARTNER_NAME : (p.supplier?.name ?? "—"),
      supplier_id: p.supplier_id,
      event_partner_id: p.event_partner_id,
      mode: p.mode,
      profit_pct: p.profit_pct,
      loss_pct: p.loss_pct,
      expense_includes_iva: p.expense_includes_iva,
    }));

    const markedLines: EngineMarkedLine[] = [
      ...(transactions ?? [])
        .filter((t: any) => t.event_settlement_id && isValidFechoTransaction(t))
        .map((t: any) => ({
          event_settlement_id: t.event_settlement_id,
          kind: "tx" as const,
          type: t.type,
          amount: t.amount,
          iva_rate: t.iva_rate,
        })),
    ];

    const engine = computeSettlementEngine({
      eventBasis: calcBasis,
      eventTotals: totals,
      settlements: (settlements ?? []) as any,
      participants: engineParticipants,
      markedLines,
      moneyByPartner: money,
    });
    if (engine.errors.length) notes.push(`${eventName}: ${engine.errors.join(" | ")}`);
    if (!engine.c1.ok) notes.push(`${eventName}: C1 falha (${EUR(engine.c1.value)})`);
    if (!engine.c2.ok) notes.push(`${eventName}: C2 falha (${EUR(engine.c2.value)})`);

    for (const n of engine.nodes) {
      for (const p of n.participants) {
        const s = screenByName[p.name];
        rows.push({
          event: eventName,
          participant: `${p.name}${n.parentId ? ` (${n.name})` : ""}`,
          screenShare: s ? s.share : NaN,
          engineShare: p.share,
          screenFinal: s ? s.final : NaN,
          engineFinal: p.settlementAmount,
        });
      }
    }
  }

  console.log("\n== max(updated_at) ANTES ==");
  console.log(JSON.stringify(before, null, 2));

  console.log("\n== PARIDADE (modo por contrato de cada sócio) ==");
  console.log(
    ["EVENTO", "PARTICIPANTE", "ECRÃ parte", "MOTOR parte", "ECRÃ final", "MOTOR final", "DIF"].join(" | "),
  );
  let worst = 0;
  for (const r of rows) {
    const dif = Number.isNaN(r.screenShare) ? NaN : roundCents(r.engineShare - r.screenShare);
    if (!Number.isNaN(dif)) worst = Math.max(worst, Math.abs(dif));
    console.log(
      [
        r.event,
        r.participant,
        EUR(r.screenShare),
        EUR(r.engineShare),
        EUR(r.screenFinal),
        EUR(r.engineFinal),
        Number.isNaN(dif) ? "sem par no ecrã" : EUR(dif),
      ].join(" | "),
    );
  }
  console.log(`\nMaior diferença absoluta na parte: ${EUR(worst)}`);
  if (notes.length) {
    console.log("\n== AVISOS ==");
    notes.forEach((n) => console.log(`- ${n}`));
  }

  const after = await stamps();
  console.log("\n== max(updated_at) DEPOIS ==");
  console.log(JSON.stringify(after, null, 2));
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
  console.log(changed.length ? `ALTERADO: ${changed.join(", ")}` : "Nenhum max(updated_at) mudou.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
