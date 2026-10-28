/**
 * (P5) `financial-position` — Saldo Geral e resultado MP por evento.
 *
 * Gate: JWT do utilizador + RPC get_financial_position_base chamada COM esse JWT
 * (a RPC decide not_authenticated / company_forbidden /
 * financial_position_permission_denied). Só depois o cliente de serviço lê os
 * bundles do motor (statement-service, sem segundo cálculo) e as despesas sem
 * evento. Só leitura; a única escrita é o registo em system_audit_log.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildPartnerStatement, computeStatementEngine, loadStatementBundle } from "../_shared/settlement/statement-service.ts";
import { assembleFinancialPosition, gateStatus, sumParticipationRows, type EventInput, type StructureTxInput } from "../_shared/financial-position/assemble.ts";
import { assembleFutureCoverage, futureEventSet } from "../_shared/financial-position/future-coverage.ts";
import { loadIndependentFutureCoverage } from "../_shared/financial-position/future-coverage-loader.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONCURRENCY = 4;
const DEADLINE_MS = 25_000;

async function pageAll(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadStructure(admin: any, companyId: string, year: number | null): Promise<StructureTxInput[]> {
  const txs = await pageAll((a, b) => admin.from("transactions")
    .select("id, amount, iva_rate, paid_amount, status, payment_date, due_date, created_at, category_id, is_transitory, exclude_from_result")
    .eq("company_id", companyId).is("event_id", null).eq("type", "expense").is("reversed_at", null).order("id").range(a, b));
  const parents = new Set((await pageAll((a, b) => admin.from("transactions").select("parent_transaction_id")
    .eq("company_id", companyId).not("parent_transaction_id", "is", null).order("id").range(a, b))).map((r: any) => r.parent_transaction_id));
  const cats = new Map((await pageAll((a, b) => admin.from("account_categories").select("id, code, name, ebitda_class")
    .order("id").range(a, b))).map((c: any) => [c.id, c]));
  return txs
    .filter((t: any) => !parents.has(t.id) && !t.is_transitory && !t.exclude_from_result)
    .filter((t: any) => {
      if (year == null) return true;
      const d = String(t.payment_date ?? t.due_date ?? t.created_at ?? "").slice(0, 4);
      return Number(d) === year;
    })
    .map((t: any) => {
      const c: any = t.category_id ? cats.get(t.category_id) : null;
      return { code: c?.code ?? null, name: c?.name ?? null, ebitda_class: c?.ebitda_class ?? null,
        amount: Number(t.amount) || 0, iva_rate: t.iva_rate, paid_amount: t.paid_amount, status: t.status };
    });
}

/**
 * Participações em resultados de terceiros (receita sem evento, categoria 1.3.05
 * "Participação em Resultados — Cloudscape (Coala)"). Dinheiro já dentro do caixa:
 * soma só ao resultado_mp_ano, nunca ao Saldo Geral. Ano = ano de payment_date
 * (fallback date). Irmão de loadStructure.
 */
async function loadParticipations(admin: any, companyId: string, year: number | null) {
  const cats = await pageAll((a, b) => admin.from("account_categories").select("id, code")
    .eq("company_id", companyId).eq("code", "1.3.05").order("id").range(a, b));
  const catIds = cats.map((c: any) => c.id);
  if (catIds.length === 0) return { cloudscape: { valor: 0, linhas: 0 } };
  const txs = await pageAll((a, b) => admin.from("transactions")
    .select("id, amount, paid_amount, payment_date, date")
    .eq("company_id", companyId).is("event_id", null).eq("type", "income").eq("status", "paid")
    .eq("is_transitory", false).eq("exclude_from_result", false).is("reversed_at", null)
    .in("category_id", catIds).order("id").range(a, b));
  const rows = txs.filter((t: any) => {
    if (year == null) return true;
    return Number(String(t.payment_date ?? t.date ?? "").slice(0, 4)) === year;
  });
  const valor = rows.reduce((s: number, t: any) => s + (Number(t.paid_amount ?? t.amount) || 0), 0);
  return { cloudscape: { valor: Math.round(valor * 100) / 100, linhas: rows.length } };
}

/**
 * P5b — leituras do bloco cobertura_futuros. RPCs de leitura com o JWT do utilizador
 * (get_event_cash_position exige current_company_id; get_ticket_office_sales é INVOKER);
 * tabelas pelo cliente de serviço, filtradas pela empresa já validada pelo gate.
 */
async function loadFutureCoverage(asUser: any, admin: any, companyId: string, base: any) {
  const future = futureEventSet(base);
  const evRows = await pageAll((a, b) => admin.from("events").select("id, parent_event_id").eq("company_id", companyId).order("id").range(a, b));
  const parent = new Map<string, string | null>(evRows.map((e: any) => [e.id, e.parent_event_id]));
  const rootOf: Record<string, string> = {};
  for (const e of evRows) { let r = e.id, d = 0; while (parent.get(r) && d++ < 16) r = parent.get(r)!; rootOf[e.id] = r; }
  const futureIds = new Set(future.map((e: any) => e.evento_id));
  const treeIds = evRows.map((e: any) => e.id).filter((id: string) => futureIds.has(rootOf[id]));

  const accounts = await pageAll((a, b) => admin.from("financial_accounts")
    .select("id, name, type, skip_balance_check, initial_balance_date, is_active").eq("company_id", companyId).order("id").range(a, b));
  const accById = new Map(accounts.map((x: any) => [x.id, x]));
  const offices = accounts.filter((x: any) => x.type === "ticket_office" && x.is_active !== false);

  const salesP = Promise.all(offices.map(async (o: any) => {
    const { data, error } = await asUser.rpc("get_ticket_office_sales", { p_account_id: o.id });
    if (error) throw new Error("ticket_office_sales_failed");
    return { account_id: o.id, name: o.name, rows: (data ?? []).map((r: any) => ({ event_id: r.event_id, revenue: Number(r.revenue) || 0 })) };
  }));
  const cashP = (async () => {
    const { data, error } = await asUser.rpc("get_event_cash_position", { p_company_id: companyId });
    if (error) throw new Error("event_cash_position_failed");
    return (data ?? []).map((r: any) => ({ event_id: r.event_id, realized: Number(r.realized) || 0 }));
  })();
  const txs: any[] = [];
  for (let i = 0; i < treeIds.length; i += 100) {
    txs.push(...await pageAll((a, b) => admin.from("transactions")
      .select("id, event_id, type, status, paid_amount, payment_date, description, account_id, is_transitory, transitory_reason")
      .eq("company_id", companyId).in("event_id", treeIds.slice(i, i + 100)).is("reversed_at", null).order("id").range(a, b)));
  }
  const preCutoff = txs.filter((t) => {
    const acc: any = t.account_id ? accById.get(t.account_id) : null;
    return acc && ["bank", "cash", "prepaid_card"].includes(acc.type) && acc.skip_balance_check === false
      && acc.initial_balance_date && t.payment_date && t.paid_amount != null && String(t.payment_date) <= String(acc.initial_balance_date);
  }).map((t) => ({ event_id: t.event_id, type: t.type, paid: Number(t.paid_amount) || 0 }));
  const aportes = txs.filter((t) => t.type === "income" && t.status === "paid" && t.is_transitory && t.transitory_reason === "aporte_socio")
    .map((t) => {
      const acc: any = t.account_id ? accById.get(t.account_id) : null;
      return { event_id: t.event_id, payment_date: t.payment_date, description: t.description, account_name: acc?.name ?? null,
        account_type: acc?.type ?? null, skip_balance_check: acc ? acc.skip_balance_check === true : null, paid: Number(t.paid_amount) || 0 };
    });
  const [sales, cash] = await Promise.all([salesP, cashP]);
  return assembleFutureCoverage({ base, rootOf, sales, cash, preCutoff, aportes });
}

async function loadPaidContracts(admin: any, companyId: string): Promise<Record<string, number>> {
  const contracts = await pageAll((a, b) => admin.from("partner_payment_contracts")
    .select("event_id, beneficiary_supplier_id, balance_tx_id").eq("company_id", companyId).is("cancelled_at", null).order("id").range(a, b));
  const ids = contracts.map((c: any) => c.balance_tx_id).filter(Boolean);
  const paid = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("transactions").select("id, paid_amount").in("id", ids.slice(i, i + 200)).is("reversed_at", null).limit(200);
    if (error) throw new Error(error.message);
    for (const t of data ?? []) paid.set(t.id, Number(t.paid_amount) || 0);
  }
  const out: Record<string, number> = {};
  for (const c of contracts) {
    const k = `${c.event_id}:${c.beneficiary_supplier_id}`;
    out[k] = (out[k] ?? 0) + (paid.get(c.balance_tx_id) ?? 0);
  }
  return out;
}

async function eventInput(admin: any, ev: { event_id: string; name: string; stage: string }): Promise<EventInput> {
  let bundle = await loadStatementBundle(admin, ev.event_id);
  const soBp = ev.stage === "historico";
  if (soBp) bundle = { ...bundle, transactions: [], paidExpenses: [], basis: { ...bundle.basis, expenseSource: "committed" } };
  const engine = computeStatementEngine(bundle);
  const seen = new Set<string>();
  const partners = [];
  for (const p of bundle.participants as any[]) {
    if (p.isHouse || p.mode !== "settles" || !p.supplier_id || seen.has(p.supplier_id)) continue;
    seen.add(p.supplier_id);
    const st = buildPartnerStatement(bundle, p.supplier_id);
    if (!st) continue;
    const a = st.block.account;
    partners.push({ supplier_id: p.supplier_id, nome: p.name, transferBase: a.transferBase, transferVat: a.transferVat,
      transferTotal: a.transferTotal, transferWithVat: a.transferWithVat });
  }
  return {
    event_id: ev.event_id, nome: ev.name, estagio: ev.stage, so_bp: soBp, partners,
    engine: { eventNetResult: engine.eventNetResult, partnersPaidTotal: engine.partnersPaidTotal,
      house: { residual: engine.house.residual, declared: engine.house.declared, ivaDeductible: engine.house.ivaDeductible },
      checksOk: engine.c1.ok && engine.c2.ok && engine.errors.length === 0, errors: engine.errors },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "not_authenticated" }, 401);
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await asUser.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "not_authenticated" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* vazio */ }
    const companyId = String(body?.company_id ?? "");
    if (!UUID.test(companyId)) return json({ error: "invalid_company" }, 400);
    const year = body?.year == null ? null : Number(body.year);
    if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return json({ error: "invalid_year" }, 400);

    // Gate: a própria RPC, com o JWT do utilizador.
    const { data: base, error: rpcErr } = await asUser.rpc("get_financial_position_base", { p_company_id: companyId, p_year: year });
    if (rpcErr) {
      const gate = gateStatus(String(rpcErr.message ?? ""));
      if (gate) return json({ error: gate.error }, gate.status);
      console.error("financial-position rpc", rpcErr);
      return json({ error: "financial_position_unavailable" }, 500);
    }
    if (!base || base.meta?.company_id !== companyId) return json({ error: "financial_position_invalid_response" }, 500);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const evs: Array<{ event_id: string; name: string; stage: string }> = [];
    for (const [stage, items] of Object.entries(base.eventos_por_estagio ?? {})) {
      if (stage === "cancelado") continue;
      for (const it of (items as any[]) ?? []) evs.push({ event_id: it.event_id, name: it.name, stage });
    }

    const results: EventInput[] = new Array(evs.length);
    let next = 0;
    const worker = async () => {
      while (next < evs.length) {
        const i = next++;
        const ev = evs[i];
        const left = DEADLINE_MS - (Date.now() - started);
        if (left <= 0) { results[i] = { event_id: ev.event_id, nome: ev.name, estagio: ev.stage, so_bp: false, engine: null, partners: [], error: "timeout" }; continue; }
        try {
          results[i] = await Promise.race([
            eventInput(admin, ev),
            new Promise<EventInput>((_, rej) => setTimeout(() => rej(new Error("timeout")), left)),
          ]);
        } catch (e) {
          console.error("financial-position event", ev.event_id, e);
          results[i] = { event_id: ev.event_id, nome: ev.name, estagio: ev.stage, so_bp: false, engine: null, partners: [],
            error: (e as Error).message === "timeout" ? "timeout" : "erro_motor" };
        }
      }
    };
    const [structure, paidContracts, futureCoverage, participations] = await Promise.all([
      loadStructure(admin, companyId, year),
      loadPaidContracts(admin, companyId),
      loadParticipations(admin, companyId, year),
      // Independent all-years RPC + subsequent reads share the 6 s coverage deadline.
      // The gate base, evs and settlement workers retain the requested year.
      loadIndependentFutureCoverage(asUser, companyId, (futureBase) => loadFutureCoverage(asUser, admin, companyId, futureBase)),
      Promise.all(Array.from({ length: Math.min(CONCURRENCY, evs.length) }, worker)),
    ]);

    const out = assembleFinancialPosition({ base, events: results, structure, paidContracts, futureCoverage, participations, generatedAt: new Date().toISOString() });
    const ms = Date.now() - started;

    await admin.from("system_audit_log").insert({
      entity_type: "financial_position", entity_id: companyId, action: "read",
      changed_by: user.email ?? user.id, company_id: companyId,
      metadata: { year, version: out.meta.version, eventos: evs.length, incompleto: out.meta.incompleto, ms },
    });
    return json({ ...out, meta: { ...out.meta, duracao_ms: ms } });
  } catch (e) {
    console.error("financial-position", e);
    return json({ error: "financial_position_unavailable" }, 500);
  }
});
