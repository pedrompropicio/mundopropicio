import { describe, it, expect, vi } from "vitest";
import { createApproveLock } from "@/lib/approve-lock";
import { approveAtomic } from "../../supabase/functions/approve-transaction/approve-rpc";

describe("trinco de aprovação (incidente 05/10/2026)", () => {
  it("duas chamadas simultâneas ao handler → 1 invoke", async () => {
    const ref = { current: false };
    const lock = createApproveLock(ref);
    const invoke = vi.fn(async () => ({ data: { approved_count: 1 }, error: null }));
    // Mesmo formato do handleBulkApprove: acquire antes do 1.º await, validações, mutate.
    const handler = async () => {
      if (!lock.acquire()) return;
      let handed = false;
      try {
        await new Promise((r) => setTimeout(r, 20)); // partitionByBpLineRequirement
        await new Promise((r) => setTimeout(r, 20)); // excessLinesFor
        handed = true;
        await invoke().finally(() => lock.release()); // onSettled
      } finally {
        if (!handed) lock.release();
      }
    };
    await Promise.all([handler(), handler()]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(false);
  });

  it("retorno antecipado liberta o trinco", async () => {
    const ref = { current: false };
    const lock = createApproveLock(ref);
    expect(lock.acquire()).toBe(true);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });
});

function rpcClient(result: { data?: any; error?: any }) {
  const calls: any[] = [];
  return { calls, client: { rpc: async (fn: string, args: any) => { calls.push({ fn, args }); return result; } } };
}

describe("approve-transaction: RPC atómica", () => {
  it("chama approve_transactions_atomic com ids, raises e autor", async () => {
    const { client, calls } = rpcClient({ data: { approved_ids: ["a"], skipped_ids: [], applied_raises: [] }, error: null });
    const r = await approveAtomic(client, ["a"], [{ forecast_id: "f", new_amount: 10, observation: "x" }], "X");
    expect(calls).toEqual([{ fn: "approve_transactions_atomic", args: { p_ids: ["a"], p_raises: [{ forecast_id: "f", new_amount: 10, observation: "x" }], p_caller_name: "X" } }]);
    expect(r).toEqual({ kind: "ok", approved_ids: ["a"], skipped_ids: [], applied_raises: [] });
  });

  it("id já approved → skipped", async () => {
    const { client } = rpcClient({ data: { approved_ids: [], skipped_ids: ["a"], applied_raises: [] }, error: null });
    const r = await approveAtomic(client, ["a"], undefined, "X");
    expect(r.kind === "ok" && r.skipped_ids).toEqual(["a"]);
  });

  it("P0409 → excess com o detalhe das linhas (sem company_id)", async () => {
    const detail = JSON.stringify([{ forecast_id: "f", suggested_amount: 12, company_id: "c" }]);
    const { client } = rpcClient({ data: null, error: { code: "P0409", message: "excesso", details: detail } });
    const r = await approveAtomic(client, ["a"], [], "X");
    expect(r).toEqual({ kind: "excess", budget_excess: [{ forecast_id: "f", suggested_amount: 12 }] });
  });

  it("outro erro → error", async () => {
    const { client } = rpcClient({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await approveAtomic(client, ["a"], [], "X")).toEqual({ kind: "error", message: "boom" });
  });
});
