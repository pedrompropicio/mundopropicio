import { assertEquals } from "jsr:@std/assert@1";
import { parseResendEvent, verifySvix } from "./svix.ts";

const SECRET = "whsec_" + btoa("chave-de-teste-ficticia-1234567");

async function sign(id: string, ts: string, body: string) {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(SECRET.slice(6)), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return "v1," + btoa(String.fromCharCode(...new Uint8Array(s)));
}

Deno.test("assinatura válida aceita", async () => {
  const ts = "1800000000";
  assertEquals(await verifySvix(SECRET, "msg_1", ts, await sign("msg_1", ts, "{}"), "{}", 1800000000), true);
});
Deno.test("corpo alterado rejeita", async () => {
  const ts = "1800000000";
  assertEquals(await verifySvix(SECRET, "msg_1", ts, await sign("msg_1", ts, "{}"), "{ }", 1800000000), false);
});
Deno.test("timestamp fora de 5 min rejeita", async () => {
  const ts = "1800000000";
  assertEquals(await verifySvix(SECRET, "msg_1", ts, await sign("msg_1", ts, "{}"), "{}", 1800000301), false);
});
Deno.test("só opened/clicked; outros ignorados", () => {
  assertEquals(parseResendEvent({ type: "email.opened", data: { email_id: "e1" }, created_at: "2026-10-26T10:00:00Z" })?.event_type, "opened");
  assertEquals(parseResendEvent({ type: "email.clicked", data: { email_id: "e1" } })?.event_type, "clicked");
  assertEquals(parseResendEvent({ type: "email.delivered", data: { email_id: "e1" } }), null);
  assertEquals(parseResendEvent({ type: "email.opened", data: {} }), null);
});
