// Temp one-off: re-import Fever XLSX via base64 payload.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseFeverXlsxBuffers, groupFeverLots } from "../_shared/fever-parser.ts";
import { runFeverImport } from "../_shared/fever-import-server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, feverAccountId, salesB64, pricesB64, salesName, pricesName } = await req.json();
    console.log("DEBUG params", { eventId, feverAccountId, sUrl: Deno.env.get("SUPABASE_URL"), keyPrefix: (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").slice(0, 12) });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const probe = await supabase.from("financial_accounts").select("id,name,company_id").eq("id", feverAccountId).maybeSingle();
    console.log("DEBUG fa probe", JSON.stringify(probe));
    const parseResult = parseFeverXlsxBuffers(b64ToBuf(salesB64), b64ToBuf(pricesB64));
    const grouped = groupFeverLots(parseResult.lots);
    const audit = await runFeverImport({
      supabase, eventId, feverAccountId, parseResult, grouped,
      filenames: { sales: salesName, prices: pricesName },
      triggeredBy: "tmp-reimport",
    });
    return new Response(JSON.stringify({ ok: true, audit }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("IMPORT ERROR", e?.message, JSON.stringify(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
