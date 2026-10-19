import { durableProviderControl, rpcControlStore } from "../../../../supabase/functions/_shared/issue333-ai/control.ts";
import { generateDocumentAnalysis } from "../../../../supabase/functions/_shared/issue333-ai/provider.ts";

Deno.test("87 real SDK + durable adapter contract: 403 persisted, no second POST, no egress", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let row = { revision: "1", state: "ready", enabled: true, reviewed: true, claim: null as string | null, stage: "idle", reason: "none", status: null as number | null };
  const store = rpcControlStore(async (_name, args) => {
    const op = args.p_operation;
    if (op !== "read") {
      if (args.p_revision !== row.revision) throw Error("revision");
      row.revision = String(BigInt(row.revision) + 1n);
      if (op === "claim") { row.claim = String(args.p_claim); row.stage = "claimed"; }
      if (op === "post") row.stage = "post_started";
      if (op === "finish") { row.state = "denied_provider"; row.enabled = false; row.claim = null; row.stage = "idle"; row.reason = String(args.p_outcome); row.status = Number(args.p_status); }
    }
    return { data: { ...row }, error: null };
  });
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message: "private-local-marker", type: "blocked" } }), { status: 403, headers: { "Content-Type": "application/json" } }); };
  try {
    const request = new Request("http://local.invalid/analysis");
    const control = durableProviderControl(store);
    try { await control.run(request.signal, async () => {}, (t) => generateDocumentAnalysis(request, { bytes: new Uint8Array([1]), mime: "application/pdf", message: "local", history: [] }, "local-placeholder", t)); throw Error("must refuse"); }
    catch (error) { if (!(error instanceof Error) || error.message.includes("private-local-marker")) throw Error("unsafe public error"); }
    if (calls !== 1 || row.state !== "denied_provider" || row.reason !== "provider_denied" || row.status !== 403) throw Error("durable denial missing");
    try { await control.run(request.signal, async () => {}, async () => { throw Error("must not execute"); }); } catch { /* closed */ }
    if (calls !== 1) throw Error("retry");
  } finally { globalThis.fetch = original; }
});