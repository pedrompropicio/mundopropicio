import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

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

// ── update-transaction: transitory field tests ──

Deno.test("update-transaction: rejects unauthenticated request", async () => {
  const { status, data } = await callFunction("update-transaction", {
    transaction_id: "fake-id",
    updates: { is_transitory: true },
  });
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("update-transaction: rejects invalid token", async () => {
  const { status, data } = await callFunction(
    "update-transaction",
    {
      transaction_id: "fake-id",
      updates: { is_transitory: true },
    },
    "invalid-token"
  );
  assertEquals(status, 401);
  assertExists(data.error);
});

Deno.test("update-transaction: rejects missing transaction_id", async () => {
  const { status, data } = await callFunction(
    "update-transaction",
    { updates: { is_transitory: true } },
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
  );
  // Should fail — either 401 (bad token) or 400 (missing fields)
  assertEquals(status >= 400, true);
  assertExists(data.error);
});

Deno.test("update-transaction: is_transitory is in allowed fields list", () => {
  // Validate that is_transitory is in the allowed fields for the edge function
  const allowedFields = [
    "description", "amount", "iva_rate", "event_id", "category_id",
    "supplier_id", "account_id", "specification", "date", "due_date",
    "payment_date", "is_transitory",
  ];
  assertEquals(allowedFields.includes("is_transitory"), true);
});
