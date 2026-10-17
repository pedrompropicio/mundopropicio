// #332 Parte A — testes: membro, não-membro, maiúsculas/espaços; limite é feito pelo invólucro HTTP (portal_rate_hit).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requestAccessAction, isRecentPendingCapture, type Member } from "./request-access.ts";

const SITE = "f8ce23a5-a27a-4893-9b7a-d6337d84b168";
const members = new Map<string, Member>([
  ["pedro@example.com", { id: "11111111-1111-1111-1111-111111111111", first_name: "Pedro", email: "pedro@example.com" }],
]);
const lookup = async (_s: string, email: string): Promise<Member> => members.get(email) ?? null;

Deno.test("request_access: pending normalizado não envia nem cria sessão", async () => {
  let sends = 0; const logs: string[] = [];
  const r = await requestAccessAction(SITE, "  NOVO@EXAMPLE.COM ", lookup, async () => { sends++; },
    (r) => logs.push(r), async (sid, email) => { assertEquals([sid, email], [SITE, "novo@example.com"]); return true; });
  assertEquals(r, { status: 200, body: { ok: true, status: "pending" } });
  assertEquals(sends, 0); assertEquals(logs, ["pending"]);
});
Deno.test("request_access: membro prevalece sobre pending", async () => {
  const r = await requestAccessAction(SITE, "pedro@example.com", lookup, async () => {}, undefined,
    async () => { throw new Error("pending lookup must not run"); });
  assertEquals(r.body.status, "sent");
});
Deno.test("pending: limite 30min exacto; antiga/processada/outra origem/futura excluídas", () => {
  const now = Date.parse("2026-10-17T10:50:00Z");
  const c = {source:"clube_newgang",processed:false,created_at:new Date(now-30*60_000).toISOString()};
  assertEquals(isRecentPendingCapture(c, now), true);
  assertEquals(isRecentPendingCapture({...c,created_at:new Date(now-30*60_000-1).toISOString()}, now), false);
  assertEquals(isRecentPendingCapture({...c,processed:true}, now), false);
  assertEquals(isRecentPendingCapture({...c,source:"portal"}, now), false);
  assertEquals(isRecentPendingCapture({...c,created_at:new Date(now+1).toISOString()}, now), false);
});

Deno.test("request_access: membro -> status=sent e envia", async () => {
  const sends: string[] = []; const logs: string[] = [];
  const r = await requestAccessAction(SITE, "pedro@example.com", lookup, async (m) => { sends.push(m.email); }, (reason) => { logs.push(reason); });
  assertEquals(r, { status: 200, body: { ok: true, status: "sent" } });
  assertEquals(sends, ["pedro@example.com"]);
  assertEquals(logs, ["sent"]);
});

Deno.test("request_access: não-membro -> status=not_member e NÃO envia", async () => {
  const sends: string[] = []; const logs: string[] = [];
  const r = await requestAccessAction(SITE, "estranho@example.com", lookup, async (m) => { sends.push(m.email); }, (reason) => { logs.push(reason); });
  assertEquals(r, { status: 200, body: { ok: true, status: "not_member" } });
  assertEquals(sends, []);
  assertEquals(logs, ["not_member"]);
});

Deno.test("request_access: maiúsculas e espaços normalizados antes do lookup", async () => {
  const sends: string[] = []; const logs: string[] = [];
  const r = await requestAccessAction(SITE, "  PEDRO@Example.COM ", lookup, async (m) => { sends.push(m.email); }, (reason) => { logs.push(reason); });
  assertEquals(r, { status: 200, body: { ok: true, status: "sent" } });
  assertEquals(sends, ["pedro@example.com"]);
  assertEquals(logs, ["sent"]);
});

Deno.test("request_access: sem email -> 400", async () => {
  const r = await requestAccessAction(SITE, undefined, lookup, async () => {});
  assertEquals(r, { status: 400, body: { error: "email" } });
});

Deno.test("request_access: falha no envio não revela ao chamador", async () => {
  const logs: string[] = [];
  const r = await requestAccessAction(SITE, "pedro@example.com", lookup, async () => { throw new Error("smtp"); }, (reason) => { logs.push(reason); });
  assertEquals(r, { status: 200, body: { ok: true, status: "sent" } });
  assertEquals(logs, ["sent"]);
});
