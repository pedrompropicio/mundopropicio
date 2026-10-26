import { assertEquals } from "jsr:@std/assert@1";
import { grantedOnly } from "./reminder-consent.ts";

const row = (member_id: string, decision: string, decided_at: string, id: number) => ({ member_id, decision, decided_at, id });

Deno.test("#364 último=granted envia", () => {
  assertEquals(grantedOnly(["a"], [row("a", "revoked", "2026-01-01T00:00:00Z", 1), row("a", "granted", "2026-02-01T00:00:00Z", 2)]), { allowed: ["a"], excluded: 0 });
});
Deno.test("#364 último=revoked não envia mesmo com granted antigo", () => {
  assertEquals(grantedOnly(["a"], [row("a", "granted", "2026-01-01T00:00:00Z", 1), row("a", "revoked", "2026-02-01T00:00:00Z", 2)]), { allowed: [], excluded: 1 });
});
Deno.test("#364 sem linha não envia", () => {
  assertEquals(grantedOnly(["a", "b"], [row("a", "granted", "2026-01-01T00:00:00Z", 1)]), { allowed: ["a"], excluded: 1 });
});
Deno.test("#364 empate de datas resolve pelo id maior, independentemente da ordem", () => {
  const t = "2026-03-01T10:00:00Z";
  const r1 = [row("a", "granted", t, 5), row("a", "revoked", t, 9)];
  assertEquals(grantedOnly(["a"], r1).allowed, []);
  assertEquals(grantedOnly(["a"], [...r1].reverse()).allowed, []);
  assertEquals(grantedOnly(["a"], [row("a", "revoked", t, 5), row("a", "granted", t, 9)]).allowed, ["a"]);
});
Deno.test("#364 outra decisão não envia", () => {
  assertEquals(grantedOnly(["a"], [row("a", "pending", "2026-01-01T00:00:00Z", 1)]).excluded, 1);
});
