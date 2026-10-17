// #332 Parte A — testes: membro, não-membro, maiúsculas/espaços; limite é feito pelo invólucro HTTP (portal_rate_hit).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requestAccessAction, type Member } from "./request-access.ts";

const SITE = "f8ce23a5-a27a-4893-9b7a-d6337d84b168";
const members = new Map<string, Member>([
  ["pedro@example.com", { id: "11111111-1111-1111-1111-111111111111", first_name: "Pedro", email: "pedro@example.com" }],
]);
const lookup = async (_s: string, email: string): Promise<Member> => members.get(email) ?? null;

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
