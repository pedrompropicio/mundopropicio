// #405 E2b — deno test --allow-read --deny-net --deny-env access-queue_test.ts
import { deepStrictEqual as equal, strictEqual, ok as assert } from "node:assert/strict";
import { clubLinkEnqueueArgs, writeActionIpMax } from "./access-queue.ts";

for (const [kind, queue_name] of [
  ["access", "auth_emails"],
  ["welcome", "transactional_emails"],
  ["reminder", "transactional_emails"],
] as const) {
  Deno.test(`sendClubLink: ${kind} → ${queue_name}, payload igual`, () => {
    const payload = Object.freeze({
      message_id: "synthetic-message-405", company_id: "synthetic-company", to: "member@example.invalid",
      from: "Synthetic Club <club@example.invalid>", sender_domain: "example.invalid",
      subject: "Synthetic subject", html: "<p>Synthetic message</p>", text: "Synthetic message",
      purpose: "transactional", label: `newgang_club_${kind}`, idempotency_key: "synthetic-message-405",
      ...(kind === "access" ? {} : { unsubscribe_http_url: "https://example.invalid/unsubscribe" }),
      queued_at: "2026-11-05T12:00:00.000Z",
    });
    const original = structuredClone(payload);
    const result = clubLinkEnqueueArgs(kind, payload);
    equal(result, { queue_name, payload: original });
    strictEqual(result.payload, payload);
    equal(payload, original);
  });
}

Deno.test("sendClubLink: expressão do payload igual ao main c604b9e, incluindo os três kinds", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const start = source.indexOf("async function sendClubLink(");
  const end = source.indexOf("\n\n/** Welcome", start);
  assert(start >= 0 && end > start);
  const sendClubLink = source.slice(start, end);
  assert(sendClubLink.includes('sb.rpc("enqueue_email", clubLinkEnqueueArgs(kind, {'));
  const payloadStart = sendClubLink.indexOf("      message_id: messageId, company_id: site.company_id, to: email,");
  const lastField = "queued_at: new Date().toISOString(),";
  const payloadEnd = sendClubLink.indexOf(lastField, payloadStart);
  assert(payloadStart >= 0 && payloadEnd > payloadStart);
  const bytes = new TextEncoder().encode(sendClubLink.slice(payloadStart, payloadEnd + lastField.length));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  equal(hash, "3ed60d8dbc12cd75b32c69a0a12b7bdeb03b597ca9d181136c61de99427f73ae");
});

Deno.test("WRITE_ACTIONS: request_access 20 → 40; todas as outras mantêm 20 e janela 600", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(source.includes('import { clubLinkEnqueueArgs, writeActionIpMax } from "./access-queue.ts";'));
  const actions = source.match(/const WRITE_ACTIONS = new Set\(\[([^\]]+)\]\);/);
  assert(actions);
  const names = [...actions[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert(names.includes("request_access") && names.includes("profile_confirm"));
  for (const action of names) equal(writeActionIpMax(action), action === "request_access" ? 40 : 20);
  const start = source.indexOf("  if (WRITE_ACTIONS.has(body.action)) {");
  const end = source.indexOf('\n  if (body.action === "profile_countries")', start);
  assert(start >= 0 && end > start);
  assert(source.slice(start, end).includes('sb.rpc("portal_rate_hit", { p_bucket: `ng:${body.action}:${ipHash}`, p_max: writeActionIpMax(body.action), p_window_seconds: 600 })'));
});

Deno.test("request_access admite 40 pedidos por IP; profile_confirm mantém o corte no 21.º", () => {
  const hits = new Map<string, number>();
  const rateHit = (action: string) => {
    const bucket = `ng:${action}:synthetic-ip-hash`;
    const count = (hits.get(bucket) ?? 0) + 1;
    hits.set(bucket, count);
    return count <= writeActionIpMax(action);
  };
  for (let i = 0; i < 40; i++) equal(rateHit("request_access"), true);
  equal(rateHit("request_access"), false);
  for (let i = 0; i < 20; i++) equal(rateHit("profile_confirm"), true);
  equal(rateHit("profile_confirm"), false);
});
