// parse-coala-bp
// POST { fileBase64, fileName, fileVersion, eventId }
// Returns parsed rows + sponsors + validation report (no DB writes).

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseCoalaXlsx, buildValidationReport } from "../_shared/coalaParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json();
    const { fileBase64, fileName, fileVersion, eventId } = body ?? {};
    if (!fileBase64 || !fileVersion || !eventId) {
      return json({ error: "fileBase64, fileVersion e eventId obrigatórios" }, 400);
    }

    // Permission: must be admin/manager/editor on the company that owns the event
    const { data: ev } = await supabase
      .from("events")
      .select("id, name, company_id, import_template")
      .eq("id", eventId)
      .single();
    if (!ev) return json({ error: "Evento não encontrado" }, 404);
    if (ev.import_template !== "coala") {
      return json({ error: "Este evento não está marcado como template 'coala'." }, 400);
    }

    const buf = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0)).buffer;
    const parsed = parseCoalaXlsx(buf, fileVersion);

    // Resolve category mapping for distinct CCs in one query
    const { data: cats } = await supabase
      .from("account_categories")
      .select("id, code, name")
      .eq("company_id", ev.company_id)
      .eq("is_active", true);
    const allCats = cats || [];
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const fallback = allCats.find((c) => c.code === "0.0.99");

    const distinctCC = new Map<string, { matched: string | null; matchedName: string | null; matchedCode: string | null; rowCount: number; netSum: number }>();
    for (const r of parsed.rows) {
      if (r.excluded) continue;
      const key = r.rawCenterCusto || "(sem)";
      let entry = distinctCC.get(key);
      if (!entry) {
        const m = r.rawCenterCusto
          ? allCats.find((c) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""))
          : null;
        entry = {
          matched: m?.id ?? fallback?.id ?? null,
          matchedName: m?.name ?? fallback?.name ?? null,
          matchedCode: m?.code ?? fallback?.code ?? null,
          rowCount: 0,
          netSum: 0,
        };
        distinctCC.set(key, entry);
      }
      entry.rowCount += 1;
      entry.netSum += r.netAmount;
      r.needsCategoryReview = entry.matchedCode === "0.0.99";
    }

    const validation = buildValidationReport(parsed);

    return json({
      ok: true,
      fileName,
      eventId,
      eventName: ev.name,
      parsed,
      categoryMapping: Array.from(distinctCC.entries()).map(([cc, info]) => ({
        cc,
        matchedCategoryId: info.matched,
        matchedCategoryName: info.matchedName,
        matchedCategoryCode: info.matchedCode,
        rowCount: info.rowCount,
        netSum: +info.netSum.toFixed(2),
      })),
      validation,
    });
  } catch (err) {
    console.error("parse-coala-bp error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
