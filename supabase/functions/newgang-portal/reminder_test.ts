// Lembrete Newgang — testes sem rede/base/emails. Correr: deno test --deny-net --deny-env reminder_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { REMINDER_SUBJECT, REMINDER_TEMPLATE, reminderEmail } from "./reminder-email.ts";
import { clampLimit, REMINDER_MAX_BATCH, reminderMessageId, runReminderBatch, sendReminderOnce, type ReminderDeps } from "./reminder.ts";
import { PreSendError } from "./welcome.ts";
import { clubEmail } from "./email.ts";

const U = "https://newgangfestival.pt/descadastrar?token=U1";
const L1 = "https://newgangfestival.pt/clube/entrar?t=AAA111";
const L2 = "https://newgangfestival.pt/clube/entrar?t=BBB222";
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const count = (h: string, s: string) => h.split(s).length - 1;

Deno.test("template tem as marcas esperadas (4 do link: VML, botão, href e texto alternativo)", () => {
  assertEquals(count(REMINDER_TEMPLATE, "{{LINK_CONFIRMACAO}}"), 4);
  assertEquals(count(REMINDER_TEMPLATE, "{{URL_CABECALHO}}"), 1);
  assertEquals(count(REMINDER_TEMPLATE, "{{NOME_OPCIONAL}}"), 1);
  assertEquals(count(REMINDER_TEMPLATE, "{{RODAPE_ATUAL_LOGO_NEWGANG_PRODUCOES}}"), 1);
});

Deno.test("HTML final: sem {{, link individual 4x, cabeçalho, lang pt-PT, cores e rodapé", () => {
  const { html, text } = reminderEmail({ firstName: "Ana", link: L1, unsubscribeUrl: U });
  assert(!html.includes("{{"));
  assertEquals(count(html, L1), 4);
  assert(html.includes('<html lang="pt-PT"'));
  assert(html.includes("https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/NG_clube_lembrete_B_1200.jpg"));
  assert(html.includes("Olá Ana,"));
  assert(html.includes("#0b1f14") && html.includes("#3ddc6f"));
  assert(html.includes("logo-newgang-producoes-branco.png"));
  assertEquals(count(html, "Cancelar a subscrição"), 1);
  assertEquals(count(html, "Recebeste este e-mail"), 1);
  assert(!html.includes("Recebeste este email"));
  assert(text.includes(L1) && text.includes(U) && !text.includes("{{") && text.startsWith("Falta 1 clique"));
  assertEquals(REMINDER_SUBJECT, "Falta 1 clique para entrares no Clube Newgang");
});

Deno.test("nome vazio/ausente -> 'Olá,'; nome com HTML é escapado", () => {
  assert(reminderEmail({ firstName: null, link: L1, unsubscribeUrl: U }).html.includes("Olá,</p>"));
  assert(reminderEmail({ firstName: "  ", link: L1, unsubscribeUrl: U }).text.includes("Olá,\n"));
  const h = reminderEmail({ firstName: "<b>x</b>", link: L1, unsubscribeUrl: U }).html;
  assert(h.includes("Olá &lt;b&gt;x&lt;/b&gt;,") && !h.includes("<b>x</b>"));
});

Deno.test("dois membros -> links distintos, sem cruzamento", () => {
  const a = reminderEmail({ firstName: "A", link: L1, unsubscribeUrl: U }).html;
  const b = reminderEmail({ firstName: "B", link: L2, unsubscribeUrl: U }).html;
  assert(a.includes(L1) && !a.includes(L2) && b.includes(L2) && !b.includes(L1));
});

Deno.test("marca por resolver no resultado lança", () => {
  let threw = false;
  try { reminderEmail({ firstName: "{{X}}", link: L1, unsubscribeUrl: U }); } catch { threw = true; }
  assert(threw);
});

Deno.test("boas-vindas inalterada (impressão digital do HTML/texto antes desta alteração)", async () => {
  const o = clubEmail({ greet: "Olá Ana,", lines: ["Falta só um clique para entrares no Clube Newgang. Confirma o teu email e ganha +100 pontos."],
    cta: "Confirmar e entrar no Clube", link: "https://newgangfestival.pt/clube/entrar?t=FIXO",
    note: "O link é pessoal e válido durante 30 dias.", unsubscribeUrl: "https://newgangfestival.pt/descadastrar?token=U" });
  assertEquals(await sha(o.html), "04029002a53dbbc59c675f549bbb2bddd8f6215850195b7ef8c98bbbbec3c14b");
  assertEquals(await sha(o.text), "fa27bb5354cbbfbe9650976da119518d0803094f4f5b8ddecf18314ef51b5076");
});

function deps(reply: string | Error, send: () => Promise<void> = async () => {}) {
  const calls: string[] = [];
  const d: ReminderDeps = {
    reserve: async (id, mid, test) => { calls.push(`reserve:${id}:${mid}:${test}`); if (reply instanceof Error) throw reply; return reply; },
    mark: async (id, st) => { calls.push(`mark:${id}:${st}`); },
    send: async (id) => { calls.push(`send:${id}`); await send(); },
  };
  return { d, calls };
}

Deno.test("reserva recusada (confirmed/suppressed/too_recent/welcome_dlq/already_reserved) nunca envia", async () => {
  for (const why of ["confirmed", "suppressed", "too_recent", "welcome_dlq", "welcome_none", "already_reserved"]) {
    const { d, calls } = deps(why);
    assertEquals(await sendReminderOnce(d, "m1"), { result: "skipped", reason: why });
    assertEquals(calls, ["reserve:m1:ng-reminder-m1:false"]);
  }
});

Deno.test("reservado -> envia e marca enqueued; teste passa p_test=true", async () => {
  const { d, calls } = deps("reserved");
  assertEquals((await sendReminderOnce(d, "m1", true)).result, "sent");
  assertEquals(calls, ["reserve:m1:ng-reminder-m1:true", "send:m1", "mark:m1:enqueued"]);
  assertEquals(reminderMessageId("m1"), "ng-reminder-m1");
});

Deno.test("falha pré-fila -> error_pre_send; falha na fila -> unknown; reserva com erro -> skipped", async () => {
  assertEquals((await sendReminderOnce(deps("reserved", async () => { throw new PreSendError("x"); }).d, "m")).result, "error_pre_send");
  assertEquals((await sendReminderOnce(deps("reserved", async () => { throw new Error("enqueue"); }).d, "m")).result, "unknown");
  const r = deps(new Error("db"));
  assertEquals((await sendReminderOnce(r.d, "m")).result, "skipped");
  assert(!r.calls.some((c) => c.startsWith("send")));
});

Deno.test("lote para ao 3.º unknown seguido; limite máx. 500", async () => {
  const { d, calls } = deps("reserved", async () => { throw new Error("enqueue"); });
  const out = await runReminderBatch(d, ["a", "b", "c", "d", "e"]);
  assertEquals(out.unknown, 3); assert(out.stopped);
  assert(!calls.includes("send:d"));
  assertEquals([clampLimit(1000), clampLimit(300), clampLimit(-1), clampLimit("500"), clampLimit(undefined)], [REMINDER_MAX_BATCH, 300, 0, 0, 0]);
});

Deno.test("rodapé com as duas promotoras: Mundo Propício (84) antes de Newgang Produções (110), tabela, link de cancelar 1x", () => {
  const { html } = reminderEmail({ firstName: "Ana", link: L1, unsubscribeUrl: U });
  const mp = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/logo-mundo-propicio.png";
  const ng = "https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/logo-newgang-producoes-branco.png";
  const iMp = html.indexOf(`src="${mp}"`), iNg = html.indexOf(`src="${ng}"`);
  assert(iMp > 0 && iNg > iMp);
  assert(html.includes('width="84" alt="Mundo Propício"') && html.includes('width="110" alt="Newgang Produções"'));
  assert(!html.includes('width="140"'));
  assert(html.indexOf("Cancelar a subscrição") > iNg);
  assertEquals(count(html, "Cancelar a subscrição"), 1);
  assert(!html.includes("{{") && !html.includes("display:flex"));
});
