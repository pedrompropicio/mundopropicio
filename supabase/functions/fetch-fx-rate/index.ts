// Fetch suggested FX rate (foreign currency -> EUR) using free public APIs.
// No API key required. Phase 1 supports BRL and USD.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FromCurrency = "BRL" | "USD" | "EUR";

const ALLOWED: FromCurrency[] = ["BRL", "USD", "EUR"];

async function tryFrankfurter(from: FromCurrency): Promise<number | null> {
  // https://www.frankfurter.app/docs (ECB data, free, no key)
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=EUR`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

async function tryExchangerateHost(from: FromCurrency): Promise<number | null> {
  // Fallback: exchangerate.host (no key, community)
  try {
    const res = await fetch(`https://api.exchangerate.host/latest?base=${from}&symbols=EUR`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const from = String(body?.from ?? "").toUpperCase() as FromCurrency;

    if (!ALLOWED.includes(from)) {
      return new Response(
        JSON.stringify({ error: "Unsupported currency. Use BRL, USD or EUR." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (from === "EUR") {
      return new Response(JSON.stringify({ from, to: "EUR", rate: 1, source: "identity", date: new Date().toISOString().slice(0, 10) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rate = await tryFrankfurter(from);
    let source = "frankfurter";
    if (!rate) {
      rate = await tryExchangerateHost(from);
      source = "exchangerate.host";
    }

    if (!rate) {
      return new Response(JSON.stringify({ error: "Unable to fetch FX rate from upstream providers." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ from, to: "EUR", rate, source, date: new Date().toISOString().slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
