import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-local-only", user: { id: "local-user" } } } }) } } }));
import { edgeDataEntryAdapter } from "@/lib/data-entry-client";
afterEach(() => vi.unstubAllGlobals());
it("client Stop aborts the actual fetch and never resends", async () => {
  let ready: () => void = () => {}; const reached = new Promise<void>(r => ready = r); let sentSignal: AbortSignal | undefined;
  const f = vi.fn(async (_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => { sentSignal = init.signal ?? undefined; ready(); init.signal?.addEventListener("abort", () => reject(new DOMException("stop", "AbortError"))); }));
  vi.stubGlobal("fetch", f); const ac = new AbortController();
  const pending = edgeDataEntryAdapter.assistantTurn?.({ text: "Pedido", history: [] }, { user_id: "local-user", company_id: "local-company" }, ac.signal);
  await reached; ac.abort(); await expect(pending).rejects.toMatchObject({ status: 499 }); expect(sentSignal?.aborted).toBe(true); expect(f).toHaveBeenCalledTimes(1);
});