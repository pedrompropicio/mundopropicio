// TEMPORÁRIO — arnês de teste das chamadas internas (service role do runtime).
// POST { fn, body } → reencaminha via invokeInternal. Removida após o teste.
import { invokeInternal } from "../_shared/internal-call.ts";

Deno.serve(async (req) => {
  const p = await req.json().catch(() => ({}));
  const r = await invokeInternal(String(p.fn ?? ""), p.body ?? {}, { timeoutMs: 240_000 });
  return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
});
