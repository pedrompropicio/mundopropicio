// #328 — testes do patch inerte newgang-portal (pending.ts). Correr com: deno test --deny-net --deny-env
// Sem rede, sem base, sem emails: RPC e query builder são mocks em memória.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { crewPendingAction, memberByEmail, mePendingCrew, normalizeEmail, pendingFrom } from "./pending.ts";

type Call = { fn: string; args: Record<string, unknown> };
const A = { id: "aaaaaaaa-0000-4000-8000-00000000000a", confirmed_at: "2026-10-16T00:00:00Z" };
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const silent = () => {};
function rpcMock(reply: { data: any; error: any } | Error) {
  const calls: Call[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); if (reply instanceof Error) throw reply; return reply; };
  return { rpc, calls };
}
const noLeak = (o: unknown) => { const t = JSON.stringify(o); assert(!t.includes("@"), t); assert(!/token|email|member_id/i.test(t), t); assert(!t.includes(A.id) && !t.includes(B), t); };

Deno.test("no_session sem membro e com membro não confirmado; RPC não chamada", async () => {
  const m = rpcMock({ data: {}, error: null });
  assertEquals((await crewPendingAction(m.rpc, null, { op: "status" })).status, 401);
  assertEquals((await crewPendingAction(m.rpc, { id: A.id, confirmed_at: null }, { op: "status" })).body, { error: "no_session" });
  assertEquals(m.calls.length, 0);
});

Deno.test("op inválida/NULL/ausente → 400 action, RPC não chamada", async () => {
  const m = rpcMock({ data: {}, error: null });
  for (const op of [undefined, null, "", "x", "STATUS", 1]) {
    const r = await crewPendingAction(m.rpc, A, { op });
    assertEquals(r, { status: 400, body: { error: "action" } });
  }
  assertEquals(m.calls.length, 0);
});

Deno.test("membro A não opera B: member_id do payload é ignorado", async () => {
  const m = rpcMock({ data: { pending: null }, error: null });
  await crewPendingAction(m.rpc, A, { op: "dismiss", member_id: B, p_member: B });
  assertEquals(m.calls, [{ fn: "club_crew_pending", args: { p_member: A.id, p_action: "dismiss" } }]);
});

Deno.test("status/retry/dismiss: forma da resposta, sem emails/tokens/ids", async () => {
  const raw = { status: "crew_full", code: "Q9VT3F", crew_name: "A Gang", email: "x@y.pt", token: "t", member_id: B };
  for (const op of ["status", "retry", "dismiss"]) {
    const m = rpcMock({ data: { pending: raw }, error: null });
    const r = await crewPendingAction(m.rpc, A, { op });
    assertEquals(r, { status: 200, body: { pending: { status: "crew_full", code: "Q9VT3F", crew_name: "A Gang" }, joined: false } });
    noLeak(r.body);
  }
  const ok = rpcMock({ data: { pending: null, crew_id: "c1" }, error: null });
  assertEquals((await crewPendingAction(ok.rpc, A, { op: "retry" })).body, { pending: null, joined: true });
  const st = rpcMock({ data: { pending: null }, error: null });
  assertEquals((await crewPendingAction(st.rpc, A, { op: "status" })).body, { pending: null, joined: false });
});

Deno.test("erros da RPC no corpo → HTTP", async () => {
  assertEquals(await crewPendingAction(rpcMock({ data: { error: "no_session" }, error: null }).rpc, A, { op: "status" }), { status: 401, body: { error: "no_session" } });
  assertEquals(await crewPendingAction(rpcMock({ data: { error: "action" }, error: null }).rpc, A, { op: "status" }), { status: 400, body: { error: "action" } });
});

Deno.test("falha da RPC nunca é silenciosa: 500 + log (erro, exceção, resposta sem pending)", async () => {
  for (const reply of [{ data: null, error: { message: "boom" } }, new Error("timeout"), { data: { foo: 1 }, error: null }]) {
    const logs: string[] = [];
    const r = await crewPendingAction(rpcMock(reply as any).rpc, A, { op: "retry" }, (s) => logs.push(s));
    assertEquals(r, { status: 500, body: { error: "crew_pending" } });
    assertEquals(logs.length, 1);
  }
});

Deno.test("me.pending_crew: valor, null, e falha sinalizada", async () => {
  assertEquals(await mePendingCrew(rpcMock({ data: { pending: { status: "already_in_crew", code: "ABC123", crew_name: null } }, error: null }).rpc, A.id, silent),
    { pending_crew: { status: "already_in_crew", code: "ABC123", crew_name: null } });
  assertEquals(await mePendingCrew(rpcMock({ data: { pending: null }, error: null }).rpc, A.id, silent), { pending_crew: null });
  for (const reply of [{ data: null, error: { message: "x" } }, new Error("t"), { data: { error: "no_session" }, error: null }]) {
    const logs: string[] = [];
    assertEquals(await mePendingCrew(rpcMock(reply as any).rpc, A.id, (s) => logs.push(s)), { pending_crew: null, pending_crew_error: "unavailable" });
    assertEquals(logs.length, 1);
  }
});

Deno.test("pendingFrom rejeita estados/códigos fora do contrato", () => {
  assertEquals(pendingFrom({ status: "weird", code: "ABC" }), null);
  assertEquals(pendingFrom({ status: "crew_full", code: "a@b" }), null);
  assertEquals(pendingFrom(null), null);
});

// request_access: lookup exato. Mock implementa eq() como igualdade estrita sobre linhas em memória.
function table(rows: { site_id: string; email: string; id: string }[]) {
  const ops: string[] = [];
  const from = () => {
    const f: [string, string][] = [];
    const q = {
      eq(c: string, v: string) { ops.push(`eq:${c}=${v}`); f.push([c, v]); return q; },
      ilike() { ops.push("ilike"); throw new Error("ilike proibido"); },
      async maybeSingle() { const m = rows.filter((r) => f.every(([c, v]) => (r as any)[c] === v)); return { data: m[0] ?? null, error: m.length > 1 ? { message: "multiple" } : null }; },
    };
    return q;
  };
  return { from, ops };
}
const rows = [{ site_id: "s", email: "a_b@x.pt", id: "1" }, { site_id: "s", email: "axb@x.pt", id: "2" }, { site_id: "s", email: "100%@x.pt", id: "3" }, { site_id: "s2", email: "c@x.pt", id: "4" }];

Deno.test("request_access: '_' e '%' não casam outro email", async () => {
  const t = table(rows);
  assertEquals((await memberByEmail(t.from, "s", "A_B@x.pt")).data?.id, "1");
  assertEquals((await memberByEmail(t.from, "s", "a%b@x.pt")).data, null);
  assertEquals((await memberByEmail(t.from, "s", "a_b@X.PT ")).data?.id, "1");
  assertEquals((await memberByEmail(t.from, "s", "%@x.pt")).data, null);
  assertEquals((await memberByEmail(t.from, "s", "1__%@x.pt")).data, null);
  assertEquals((await memberByEmail(t.from, "s", "c@x.pt")).data, null, "site isolado");
  assert(!t.ops.includes("ilike"));
  assertEquals(normalizeEmail("  Ab@C.Pt "), "ab@c.pt");
});
