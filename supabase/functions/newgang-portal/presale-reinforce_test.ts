// #405 — testes sem rede/base/emails. Correr: deno test --deny-net --deny-env presale-reinforce_test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { FEVER_CLUB_URL, PRESALE_LINK, PRESALE_SUBJECT, presaleEmail, presaleFirstName } from "./presale-reinforce-email.ts";
import { presaleEligible, presaleLimit, presaleMessageId, runPresaleBatch, type PresaleDeps, type PresaleMember } from "./presale-reinforce.ts";
import { PreSendError } from "./welcome.ts";

Deno.test("nome: primeira palavra capitalizada e casos inválidos", () => {
  assertEquals(presaleFirstName("MARIA JOANA SILVA"), "Maria");
  assertEquals(presaleFirstName("  joão  "), "João");
  assertEquals(presaleFirstName("ana-rita costa"), "Ana-rita");
  assertEquals(presaleFirstName("ÉLIA"), "Élia");
  for (const v of ["", null, undefined, "A", "J.", "Jo3", "😀", "O'Neil", "-ana", "ana-"]) assertEquals(presaleFirstName(v), "", String(v));
});

Deno.test("email: placeholders, assunto, link, código em texto, teste com prefixo", () => {
  const r = presaleEmail({ firstName: "MARIA JOANA", code: "NEWGANG27A", unsubscribeUrl: "https://x/u?t=1" });
  assertEquals(r.subject, PRESALE_SUBJECT);
  assert(!r.html.includes("{{") && !r.text.includes("{{"));
  assert(r.html.includes("Olá Maria,") && r.html.includes(">NEWGANG27A</div>"));
  assert(r.html.includes("test-artifacts/newgang/NG27_prevenda_cabecalho_1200x600-2.jpg"));
  assert(r.html.includes("test-artifacts/newgang/NG27_prevenda_carimbo_ultimos_dias-2.png"));
  assert(r.html.includes(PRESALE_LINK.replaceAll("&", "&amp;")) && PRESALE_LINK.startsWith(FEVER_CLUB_URL + "?utm_source=clube&utm_medium=email&utm_campaign=ng27_prevenda_reforco"));
  assert(r.html.includes("Cancelar a subscrição") && r.text.includes("Cancelar a subscrição: https://x/u?t=1"));
  assert(r.text.includes("Olá Maria,") && r.text.includes("NEWGANG27A"));
  assert(presaleEmail({ firstName: "", code: "NEWGANG27B", unsubscribeUrl: "u" }).html.includes("Olá,"));
  assertEquals(presaleEmail({ firstName: "x", code: "NEWGANG27B", unsubscribeUrl: "u", test: true }).subject, "[TESTE] " + PRESALE_SUBJECT);
  assertThrows(() => presaleEmail({ firstName: "a", code: "OUTRO", unsubscribeUrl: "u" }));
});

const M = (id: string, email: string | null, created_at: string, erased_at: string | null = null): PresaleMember => ({ id, email, first_name: "x", created_at, erased_at });
const g = (member_id: string, decision = "granted", decided_at = "2026-10-01T00:00:00Z", id = 1) => ({ member_id, decision, decided_at, id });

Deno.test("elegibilidade: decomposição, duplicados por email, ordem estável", () => {
  const members = [
    M("b", "Dup@x.pt", "2026-01-02"), M("a", "dup@x.pt ", "2026-01-02"), M("c", "rev@x.pt", "2026-01-01"),
    M("d", "er@x.pt", "2026-01-01", "2026-02-01"), M("e", "sup@x.pt", "2026-01-03"), M("f", "nocode@x.pt", "2026-01-04"),
    M("g", "exc@x.pt", "2026-01-05"), M("h", "res@x.pt", "2026-01-06"), M("i", "hash@x.pt", "2026-01-07"), M("j", "ok@x.pt", "2026-01-01"),
  ];
  const consents = [..."abdefghij"].map((id) => g(id)).concat([g("c"), g("c", "revoked", "2026-11-01T00:00:00Z", 2)]);
  const codes = new Map(["dup@x.pt", "rev@x.pt", "er@x.pt", "sup@x.pt", "exc@x.pt", "res@x.pt", "hash@x.pt", "ok@x.pt"].map((e) => [e, "NEWGANG27A"]));
  const r = presaleEligible({ members, consents, suppressed: new Set(["sup@x.pt", "sha256:H"]), hashOf: (e) => e === "hash@x.pt" ? "sha256:H" : "sha256:?",
    codes, exclusions: new Set(["exc@x.pt"]), reserved: new Set(["h"]) });
  assertEquals(r.eligible.map((m) => m.id), ["j", "a"]);
  assertEquals(r.breakdown, { members: 10, no_granted_consent: 1, erased: 1, suppressed: 2, no_code: 1, excluded: 1, duplicates: 1, already_reserved: 1, eligible: 2 });
});

Deno.test("limite: máximo 300, acima recusado", () => {
  assertEquals(presaleLimit(undefined), { limit: 300 });
  assertEquals(presaleLimit(50), { limit: 50 });
  assertEquals(presaleLimit(301), { error: "limit_too_large", max: 300 });
  assertEquals(presaleMessageId("u1"), "ng-reforco-u1");
});

Deno.test("lote: reserva antes de enviar, já reservado não envia, para a 3 unknown seguidos", async () => {
  const sent: string[] = [], marks: string[] = [];
  const deps = (fail: (id: string) => Error | null): PresaleDeps => ({
    reserve: async (id) => id !== "r",
    send: async (id) => { const e = fail(id); if (e) throw e; sent.push(id); },
    mark: async (id, st) => { marks.push(`${id}:${st}`); },
  });
  const a = await runPresaleBatch(deps((id) => id === "p" ? new PreSendError("x") : null), ["1", "r", "p", "2"]);
  assertEquals(a, { sent: 2, skipped: 1, error_pre_send: 1, unknown: 0, stopped: false });
  assertEquals(sent, ["1", "2"]);
  const b = await runPresaleBatch(deps((id) => id.startsWith("u") ? new Error("t") : null), ["u1", "u2", "u3", "9"]);
  assertEquals(b.stopped, true); assertEquals(b.unknown, 3); assert(!sent.includes("9"));
  assert(marks.includes("u3:unknown"));
});

Deno.test("link Fever: Newgang 821990, nunca o 826449 do Coala", () => {
  const r = presaleEmail({ firstName: "Ana", code: "NEWGANG27A", unsubscribeUrl: "https://x/u?t=1" });
  const hrefs = [...r.html.matchAll(/href="([^"]*feverup[^"]*)"/g)].map((m) => m[1]);
  assert(hrefs.length > 0);
  for (const h of [...hrefs, PRESALE_LINK, r.text]) assert(!h.includes("826449"));
  for (const h of [...hrefs, PRESALE_LINK]) assert(h.startsWith("https://feverup.com/m/821990"));
  assertEquals(FEVER_CLUB_URL, "https://feverup.com/m/821990");
});
