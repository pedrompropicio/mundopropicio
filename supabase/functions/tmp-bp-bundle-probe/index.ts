// FUNÇÃO TEMPORÁRIA DE DIAGNÓSTICO — apagar depois de validar o export do BP.
// Devolve o pacote de dados do relatório de fecho de um evento, para correr o
// mesmo código de montagem do XLSX/PDF fora do browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PROBE_TOKEN = "b7f1c2a4-probe-bp-bundle-2026-08-22";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-probe-token") !== PROBE_TOKEN) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }
  const { event_id } = await req.json();
  if (typeof event_id !== "string" || !/^[0-9a-f-]{36}$/i.test(event_id)) {
    return new Response(JSON.stringify({ error: "event_id inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: evt } = await db
    .from("events")
    .select("id, name, date, location, cities:city_id(name), venues:venue_id(name)")
    .eq("id", event_id)
    .maybeSingle();
  const { data: kids } = await db.from("events").select("id").eq("parent_event_id", event_id);
  const eventIds = [event_id, ...((kids ?? []) as any[]).map((k) => k.id)];

  const [fc, tx, cat, part] = await Promise.all([
    db.from("event_forecasts")
      .select("id, description, specification, amount, iva_rate, category_id, transaction_id, event_id, is_overhead, ordering_partner_id")
      .in("event_id", eventIds).is("version_id", null).eq("type", "expense").eq("status", "approved"),
    db.from("transactions")
      .select("id, description, amount, iva_rate, category_id, type, event_id, ordering_partner_id, is_transitory, exclude_from_result, reversed_at, is_hidden, status")
      .in("event_id", eventIds).eq("type", "expense"),
    db.from("account_categories").select("id, code, name, parent_id"),
    db.from("event_partners").select("id, suppliers:supplier_id(name)").in("event_id", eventIds),
  ]);

  const fcIds = (fc.data ?? []).map((f: any) => f.id);
  const txIds = (tx.data ?? []).map((t: any) => t.id);
  const [fa, td] = await Promise.all([
    db.from("event_forecast_attachments").select("forecast_id").in("forecast_id", fcIds),
    db.from("transaction_documents").select("transaction_id").in("transaction_id", txIds),
  ]);

  const forecastDocs: Record<string, number> = {};
  for (const a of (fa.data ?? []) as any[]) forecastDocs[a.forecast_id] = (forecastDocs[a.forecast_id] ?? 0) + 1;
  const txDocs: Record<string, number> = {};
  for (const d of (td.data ?? []) as any[]) txDocs[d.transaction_id] = (txDocs[d.transaction_id] ?? 0) + 1;

  const partnerNames: Record<string, string> = {};
  for (const p of (part.data ?? []) as any[]) partnerNames[p.id] = p.suppliers?.name ?? "Sócio";

  const e = evt as any;
  return new Response(
    JSON.stringify({
      event: {
        id: e?.id, name: e?.name, date: e?.date, location: e?.location ?? null,
        venueName: e?.venues?.name ?? null, cityName: e?.cities?.name ?? null,
      },
      eventIds,
      forecasts: (fc.data ?? []).map((f: any) => ({ ...f, amount: Number(f.amount || 0), iva_rate: Number(f.iva_rate || 0) })),
      transactions: tx.data ?? [],
      categories: cat.data ?? [],
      partnerNames, forecastDocs, txDocs,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
