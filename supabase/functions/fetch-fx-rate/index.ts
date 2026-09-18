// Fetch suggested FX rate (foreign currency -> EUR) using free public APIs.
// No API key required. Moedas: BRL, USD, GBP e EUR.
// Com `date` (AAAA-MM-DD) devolve o câmbio de referência do BCE dessa data ou do
// último dia útil anterior — ver supabase/functions/_shared/fx-rate.ts (#195).
import { getEcbRate, isFxCurrency, type FxCurrency } from "../_shared/fx-rate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const from = String(body?.from ?? "").toUpperCase();
    const date = body?.date == null ? undefined : String(body.date);

    if (!isFxCurrency(from)) {
      return json({ error: "Unsupported currency. Use BRL, USD, GBP or EUR." }, 400);
    }

    if (date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Data inválida — use AAAA-MM-DD." }, 400);
      if (date > new Date().toISOString().slice(0, 10)) {
        return json({ error: "Data no futuro — não existe câmbio de referência." }, 400);
      }
    }

    let result;
    try {
      result = await getEcbRate(from as FxCurrency, date);
    } catch (err) {
      return json({ error: (err as Error).message }, 502);
    }

    // `date` mantém-se no corpo da resposta para os modais existentes não mudarem.
    return json({
      from,
      to: "EUR",
      rate: result.rate,
      source: result.source,
      date: result.date_used,
      date_used: result.date_used,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
