import { describe, it, expect, vi } from "vitest";
import { createApproveLock } from "@/lib/approve-lock";
import { approveAndAudit } from "../../supabase/functions/approve-transaction/approve-core";

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

function fakeClient(rows: Record<string, string>) {
  const audit: any[] = [];
  const client = {
    from(table: string) {
      if (table === "transaction_audit_log") {
        return { insert: async (e: any[]) => { audit.push(...e); return { error: null }; } };
      }
      const st: { ids: string[]; statuses: string[] } = { ids: [], statuses: [] };
      const b: any = {
        update: () => b,
        in: (col: string, v: string[]) => { if (col === "id") st.ids = v; else st.statuses = v; return b; },
        select: async () => {
          const changed = st.ids.filter((id) => st.statuses.includes(rows[id]));
          for (const id of changed) rows[id] = "approved";
          return { data: changed.map((id) => ({ id })), error: null };
        },
      };
      return b;
    },
  };
  return { client, audit };
}

describe("approve-transaction: UPDATE condicional antes da auditoria", () => {
  it("id já approved → skipped e 0 linhas de auditoria", async () => {
    const { client, audit } = fakeClient({ a: "approved" });
    const r = await approveAndAudit(client, [{ id: "a", status: "pending", company_id: "c" }], "X");
    expect(r.changedIds).toEqual([]);
    expect(r.raceSkippedIds).toEqual(["a"]);
    expect(audit).toHaveLength(0);
  });

  it("pedidos concorrentes: só um audita", async () => {
    const { client, audit } = fakeClient({ a: "pending" });
    const row = [{ id: "a", status: "pending", company_id: "c" }];
    const [r1, r2] = await Promise.all([approveAndAudit(client, row, "X"), approveAndAudit(client, row, "X")]);
    expect(r1.changedIds.length + r2.changedIds.length).toBe(1);
    expect(audit).toHaveLength(1);
  });
});
