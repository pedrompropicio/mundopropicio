import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

// ── Helper ──
async function callFunction(name: string, body: Record<string, unknown>, token?: string) {
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
  const data = await res.json();
  return { status: res.status, data };
}

// ── Tests ──

Deno.test("create-user: rejects unauthenticated request", async () => {
  const { status, data } = await callFunction("create-user", { email: "test@test.com", full_name: "Test" });
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("delete-user: rejects unauthenticated request", async () => {
  const { status, data } = await callFunction("delete-user", { user_id: "fake-id" });
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("approve-transaction: rejects unauthenticated request", async () => {
  const { status, data } = await callFunction("approve-transaction", { transaction_ids: ["fake-id"] });
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("resend-reset-email: rejects unauthenticated request", async () => {
  const { status, data } = await callFunction("resend-reset-email", { email: "test@test.com" });
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("approve-transaction: rejects invalid token", async () => {
  const { status, data } = await callFunction(
    "approve-transaction",
    { transaction_ids: ["fake-id"] },
    "invalid-token"
  );
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("create-user: rejects missing fields with valid-looking but invalid token", async () => {
  const { status, data } = await callFunction(
    "create-user",
    {},
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
  );
  // Should fail with 401 (invalid token) or 400 (missing fields)
  assertEquals(status >= 400, true);
  assertExists(data.error);
});
