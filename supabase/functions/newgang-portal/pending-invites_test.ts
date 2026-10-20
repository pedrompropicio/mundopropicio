// Hermetic: no network, database, environment or real member data.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { pendingInviteView, readPendingInvites, type InviteQuery } from "./pending-invites.ts";

const rows = Array.from({ length: 75 }, (_, i) => ({
  first_name: "Ana Maria Silva", created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  pending_crew_code: i >= 50 ? "OWN" : null,
}));

Deno.test("friends limit 50 and crew limit 20; newest first", () => {
  assertEquals(pendingInviteView(rows, 50).length, 50);
  assertEquals(pendingInviteView(rows, 20).length, 20);
  assertEquals(pendingInviteView(rows, 50)[0], { short_name: "Ana S.", at: rows[74].created_at });
  assertEquals(pendingInviteView(rows, 50)[49].at, rows[25].created_at);
});
Deno.test("missing name falls back to Convidado; same shortName as history", () => {
  assertEquals(pendingInviteView([{ first_name: null, created_at: "a" }, { first_name: "  ", created_at: "b" }], 50),
    [{ short_name: "Convidado", at: "b" }, { short_name: "Convidado", at: "a" }]);
});
Deno.test("duplicates excluded before limit, including crew entries outside first 20", () => {
  const result = pendingInviteView(rows, 50, "OWN");
  assertEquals(result.length, 50);
  assertEquals(result[0].at, rows[49].created_at);
  assertEquals(pendingInviteView(rows, 50, null)[0].at, rows[74].created_at);
});
Deno.test("projection never includes email phone id or full name", () => {
  const result = pendingInviteView([{ first_name: "Ana Maria Silva", created_at: "a", email: "private@example.invalid", phone: "99999", id: "secret" } as any], 50);
  assertEquals(Object.keys(result[0]).sort(), ["at", "short_name"]);
  for (const forbidden of ["email", "phone", "id", "@", "99999", "secret", "Ana Maria Silva"]) assert(!JSON.stringify(result).includes(forbidden));
});

function mock(fail = false) {
  const calls: unknown[][] = [];
  const from = () => {
    const ops: unknown[][] = []; calls.push(ops);
    const q = {
      select(...a: unknown[]) { ops.push(["select", ...a]); return q; },
      eq(...a: unknown[]) { ops.push(["eq", ...a]); return q; },
      is(...a: unknown[]) { ops.push(["is", ...a]); return q; },
      or(...a: unknown[]) { ops.push(["or", ...a]); return q; },
      order(...a: unknown[]) { ops.push(["order", ...a]); return q; },
      limit(...a: unknown[]) { ops.push(["limit", ...a]); return q; },
      then(resolve: (r: unknown) => unknown, reject: (r: unknown) => unknown) {
        return Promise.resolve({ data: rows, count: 75, error: fail ? {} : null }).then(resolve, reject);
      },
    };
    return q as unknown as InviteQuery;
  };
  return { from, calls };
}
const scope = { siteId: "site", companyId: "company", memberId: "session-member" };
Deno.test("exact totals independent of limit; queries scoped by site/company/session and own crew", async () => {
  const m = mock();
  const r = await readPendingInvites(m.from, scope, "OWN");
  assertEquals(r.referrals.pending_friends_total, 75);
  assertEquals(r.crew?.pending_members_total, 75);
  assertEquals(r.referrals.pending_friends.length, 50);
  assertEquals(r.crew?.pending_members.length, 20);
  for (const query of m.calls) {
    assert(query.some((op: any) => JSON.stringify(op) === JSON.stringify(["select", "first_name,created_at", { count: "exact" }])));
    for (const filter of [["eq", "site_id", "site"], ["eq", "company_id", "company"], ["is", "confirmed_at", null]])
      assert(query.some((op: any) => JSON.stringify(op) === JSON.stringify(filter)));
    assertEquals(query.slice(-3, -1), [["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }]]);
  }
  assertEquals(m.calls[0][4], ["eq", "referred_by_member_id", "session-member"]);
  assertEquals(m.calls[0][5], ["or", 'pending_crew_code.is.null,pending_crew_code.neq."OWN"']);
  assertEquals(m.calls[1][4], ["eq", "pending_crew_code", "OWN"]);
});
Deno.test("non crew member: no crew query/result or exclusion", async () => {
  const m = mock();
  const r = await readPendingInvites(m.from, scope, null);
  assertEquals(r.crew, null);
  assertEquals(m.calls.length, 1);
  assert(!m.calls[0].some((op: any) => op[0] === "or"));
});
Deno.test("optional read failure exposes unavailable, not fabricated zero totals", async () => {
  const r = await readPendingInvites(mock(true).from, scope, null);
  assertEquals(r.referrals, { pending_friends: [], pending_friends_total: null, pending_friends_error: "unavailable" });
});