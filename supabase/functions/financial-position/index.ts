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
import { assembleFinancialPosition, gateStatus, type EventInput, type StructureTxInput } from "../_shared/financial-position/assemble.ts";

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

async function loadPaidContracts(admin: any, companyId: string): Promise<Record<string, number>> {
  const contracts = await pageAll((a, b) => admin.from("partner_payment_contracts")
    .select("event_id, beneficiary_supplier_id, balance_tx_id").eq("company_id", companyId).is("cancelled_at", null).order("id").range(a, b));
  const ids = contracts.map((c: any) => c.balance_tx_id).filter(Boolean);
  const paid = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("transactions").select("id, paid_amount").in("id", ids.slice(i, i + 200)).is("reversed_at", null);
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
    const [structure, paidContracts] = await Promise.all([
      loadStructure(admin, companyId, year),
      loadPaidContracts(admin, companyId),
      Promise.all(Array.from({ length: Math.min(CONCURRENCY, evs.length) }, worker)),
    ]);

    const out = assembleFinancialPosition({ base, events: results, structure, paidContracts, generatedAt: new Date().toISOString() });
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
