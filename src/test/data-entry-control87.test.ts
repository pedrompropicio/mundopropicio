// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { durableProviderControl, rpcControlStore, parseControl, type ControlRecord, type ControlStore, type ControlOutcome } from "../../supabase/functions/_shared/issue333-ai/control";
import { generateDocumentAnalysis } from "../../supabase/functions/_shared/issue333-ai/provider";

// Double is explicitly NOT a concurrency proof; real PostgreSQL tests provide that guarantee.
function harness() {
  let row: ControlRecord = { revision: "1", state: "ready", enabled: true, reviewed: true, claim: null, stage: "idle", reason: "none", status: null };
  const outcomes: ControlOutcome[] = [];
  const transition = vi.fn<ControlStore["transition"]>(async (op, claim, revision, outcome, status) => {
    if (op === "read") return { ...row };
    if (revision !== row.revision || op === "claim" && row.claim !== null || op !== "claim" && row.claim !== claim) throw Error("fenced");
    row.revision = String(BigInt(row.revision) + 1n);
    if (op === "claim") { row.claim = claim ?? null; row.stage = "claimed"; }
    if (op === "post") row.stage = "post_started";
    if (op === "finish") {
      if (outcome) outcomes.push(outcome);
      row.reason = outcome ?? "none"; row.status = status ?? null;
      if (outcome === "credit_denied") row.state = "paused_credit";
      if (outcome === "provider_denied") row.state = "denied_provider";
      if (["provider_unavailable", "transport_uncertain", "cancelled_after_post"].includes(outcome ?? "")) row.state = "unavailable";
      if (row.state !== "ready") row.enabled = false;
      if (["transport_uncertain", "cancelled_after_post"].includes(outcome ?? "")) row.stage = "uncertain";
      else { row.claim = null; row.stage = "idle"; }
    }
    return { ...row };
  });
  return { control: durableProviderControl({ transition }), transition, row, outcomes };
}
afterEach(() => vi.unstubAllGlobals());
describe("task87 durable control contract and SDK doubles", () => {
  it.each([null, {}, { revision: 1 }, { revision: "9007199254740993", state: "ready", enabled: true, reviewed: true, claim: null, stage: "post_started", reason: "none", status: null }])("malformed/missing authority fails closed %j", async (data) => {
    const rpc = vi.fn(async () => ({ data, error: null })); const execute = vi.fn();
    await expect(durableProviderControl(rpcControlStore(rpc)).run(new AbortController().signal, async () => {}, execute)).rejects.toMatchObject({ status: 503 });
    expect(execute).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("RPC failure exposes no upstream body and calls no provider", async () => {
    const execute = vi.fn(); const rpc = vi.fn(async () => { throw Error("private-token-body"); });
    await expect(durableProviderControl(rpcControlStore(rpc)).run(new AbortController().signal, async () => {}, execute)).rejects.not.toHaveProperty("message", "private-token-body");
    expect(execute).not.toHaveBeenCalled();
  });
  it("bigint revisions remain exact strings", () => { const h = harness(); expect(parseControl({ ...h.row, revision: "9007199254740993" }).revision).toBe("9007199254740993"); });
  it("success requires claim, POST fencing, context and exact final revision", async () => {
    const h = harness(); const context = vi.fn(async () => {});
    expect(await h.control.run(new AbortController().signal, context, async (t) => { await t.beforePost(); t.received(200); t.completed(); return "validated"; })).toBe("validated");
    expect(h.row.claim).toBeNull(); expect(h.row.revision).toBe("4"); expect(context.mock.calls.length).toBeGreaterThanOrEqual(3); expect(h.outcomes).toEqual(["success"]);
  });
  it("failure before POST releases only known unsubmitted claim", async () => {
    const h = harness(); await expect(h.control.run(new AbortController().signal, async () => {}, async () => { throw Error("local"); })).rejects.toThrow("local");
    expect(h.outcomes).toEqual(["before_post_failure"]); expect(h.row.claim).toBeNull(); expect(h.row.state).toBe("ready");
  });
  it("abort before POST has a distinct public trail", async () => {
    const h = harness(), c = new AbortController();
    await expect(h.control.run(c.signal, async () => {}, async (t) => { c.abort(); await t.beforePost(); })).rejects.toMatchObject({ status: 499 });
    expect(h.outcomes).toEqual(["cancelled_before_post"]); expect(h.row.claim).toBeNull();
  });
  it("abort after POST retains uncertain claim without expiry", async () => {
    const h = harness(), c = new AbortController();
    await expect(h.control.run(c.signal, async () => {}, async (t) => { await t.beforePost(); c.abort(); throw Error("abort"); })).rejects.toThrow();
    expect(h.outcomes).toEqual(["cancelled_after_post"]); expect(h.row.stage).toBe("uncertain"); expect(h.row.claim).not.toBeNull();
  });
  it("network outcome unknown blocks next request", async () => {
    const h = harness();
    await expect(h.control.run(new AbortController().signal, async () => {}, async (t) => { await t.beforePost(); throw Error("disconnect"); })).rejects.toThrow();
    const second = vi.fn(); await expect(h.control.run(new AbortController().signal, async () => {}, second)).rejects.toMatchObject({ status: 503 });
    expect(second).not.toHaveBeenCalled(); expect(h.outcomes).toEqual(["transport_uncertain"]);
  });
  it.each([[402, "paused_credit", "credit_denied"], [403, "denied_provider", "provider_denied"], [404, "unavailable", "provider_unavailable"]] as const)("SDK HTTP%d persists global denial without retry/probe/fallback", async (status, state, outcome) => {
    const h = harness(); const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "private-body-token", type: "blocked" } }), { status, headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetch);
    const request = new Request("http://local.invalid/analysis");
    await expect(h.control.run(request.signal, async () => {}, (transport) => generateDocumentAnalysis(request, { bytes: new Uint8Array([1]), mime: "application/pdf", message: "local", history: [] }, "local-placeholder", transport))).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1); expect(h.row.state).toBe(state); expect(h.outcomes).toEqual([outcome]);
    await expect(h.control.run(request.signal, async () => {}, vi.fn())).rejects.toMatchObject({ status: 503 }); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("HTTP200 refusal/invalid response does not pause workspace", async () => {
    const h = harness(); await expect(h.control.run(new AbortController().signal, async () => {}, async (t) => { await t.beforePost(); t.received(200); t.completed(); throw Error("refusal"); })).rejects.toThrow();
    expect(h.row.state).toBe("ready"); expect(h.row.claim).toBeNull(); expect(h.outcomes).toEqual(["invalid_response"]);
  });
  it("revision changed during flight discards response and cannot clear foreign pause", async () => {
    const h = harness(); await expect(h.control.run(new AbortController().signal, async () => {}, async (t) => { await t.beforePost(); t.received(200); t.completed(); h.row.revision = "9"; h.row.state = "denied_provider"; return "stale"; })).rejects.toMatchObject({ status: 503 });
    expect(h.row.claim).not.toBeNull(); expect(h.row.state).toBe("denied_provider");
  });
  it("lost finalization response is not retried", async () => {
    const h = harness(); const original = h.transition.getMockImplementation(); h.transition.mockImplementation(async (...args) => { if (!original) throw Error("missing"); const result = await original(...args); if (args[0] === "finish") throw Error("response lost"); return result; });
    await expect(h.control.run(new AbortController().signal, async () => {}, async (t) => { await t.beforePost(); t.received(200); t.completed(); return "output"; })).rejects.toThrow();
    expect(h.transition.mock.calls.filter(([op]) => op === "finish")).toHaveLength(1);
  });
  it("HTTP200 headers followed by broken stream retain uncertain claim", async () => {
    const h = harness(); await expect(h.control.run(new AbortController().signal, async () => {}, async (t) => { await t.beforePost(); t.received(200); throw Error("stream disconnected"); })).rejects.toThrow();
    expect(h.outcomes).toEqual(["transport_uncertain"]); expect(h.row.stage).toBe("uncertain");
  });
});