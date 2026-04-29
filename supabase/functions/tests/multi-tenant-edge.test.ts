import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function call(name: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─────────────────────────────────────────────────────────────
// create-company — only platform_admin can create
// ─────────────────────────────────────────────────────────────

Deno.test("create-company: rejects unauthenticated request", async () => {
  const { status, data } = await call("create-company", {
    legal_name: "Foo, Lda",
    display_name: "Foo",
    slug: "foo-test",
  });
  // Either 401 (no JWT) or 403 (not platform_admin)
  assertEquals([401, 403].includes(status), true, `expected 401/403, got ${status}`);
  assertExists(data.error ?? data.message);
});

Deno.test("create-company: rejects invalid token", async () => {
  const { status } = await call(
    "create-company",
    { legal_name: "Foo, Lda", display_name: "Foo", slug: "foo-test" },
    "invalid-token-xxx",
  );
  assertEquals([401, 403].includes(status), true);
});

// ─────────────────────────────────────────────────────────────
// invite-company-admin — only platform_admin
// ─────────────────────────────────────────────────────────────

Deno.test("invite-company-admin: rejects unauthenticated request", async () => {
  const { status, data } = await call("invite-company-admin", {
    company_id: "00000000-0000-0000-0000-000000000000",
    email: "x@example.com",
    role: "admin",
  });
  assertEquals([401, 403].includes(status), true);
  assertExists(data.error ?? data.message);
});

Deno.test("invite-company-admin: rejects invalid token", async () => {
  const { status } = await call(
    "invite-company-admin",
    {
      company_id: "00000000-0000-0000-0000-000000000000",
      email: "x@example.com",
      role: "admin",
    },
    "invalid-token-xxx",
  );
  assertEquals([401, 403].includes(status), true);
});

// ─────────────────────────────────────────────────────────────
// accept-invitation — public function (verify_jwt = false)
// Should accept POSTs but reject invalid tokens / missing fields
// ─────────────────────────────────────────────────────────────

Deno.test("accept-invitation: rejects missing token", async () => {
  const { status, data } = await call("accept-invitation", {
    password: "Password123!",
    full_name: "Test",
  });
  assertEquals(status >= 400, true, `expected 4xx, got ${status}`);
  assertExists(data.error ?? data.message);
});

Deno.test("accept-invitation: rejects missing password", async () => {
  const { status, data } = await call("accept-invitation", {
    token: "fake-token-1234567890",
    full_name: "Test",
  });
  assertEquals(status >= 400, true);
  assertExists(data.error ?? data.message);
});

Deno.test("accept-invitation: rejects unknown / fake token", async () => {
  const { status, data } = await call("accept-invitation", {
    token: "0000000000000000000000000000000000000000000000000000000000000000",
    password: "Password123!",
    full_name: "Test User",
  });
  assertEquals(status >= 400, true, `expected 4xx for unknown token, got ${status}`);
  assertExists(data.error ?? data.message);
});

Deno.test("accept-invitation: rejects weak password (if validated)", async () => {
  const { status } = await call("accept-invitation", {
    token: "0000000000000000000000000000000000000000000000000000000000000000",
    password: "x",
    full_name: "T",
  });
  // Either rejected for short password OR for unknown token; both are >= 400
  assertEquals(status >= 400, true);
});
