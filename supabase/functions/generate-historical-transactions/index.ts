import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ----- helpers -----
function norm(s: string): string {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Dice coefficient (mesma técnica do modal de implantação)
function stringSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const set: Record<string, number> = {};
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.substring(i, i + 2);
      set[bi] = (set[bi] || 0) + 1;
    }
    return set;
  };
  const bg1 = bigrams(na);
  const bg2 = bigrams(nb);
  let intersection = 0;
  for (const bi in bg1) {
    if (bg2[bi]) intersection += Math.min(bg1[bi], bg2[bi]);
  }
  return (2 * intersection) / (na.length - 1 + nb.length - 1);
}

const PAID_TOKENS = ["pago", "liquidado", "ok", "✓"];
function isPaidStatus(raw: any): boolean {
  const n = norm(String(raw ?? ""));
  if (!n) return false;
  return PAID_TOKENS.some((tok) => n === tok || n.includes(tok));
}

interface XlsxRowInput {
  description: string;
  baseAmount: number;
  ivaRate?: number;
  status?: string; // raw column F
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerar transações históricas" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event_id: string | undefined = body?.event_id;
    const xlsxRows: XlsxRowInput[] = Array.isArray(body?.xlsxRows) ? body.xlsxRows : [];
    const eligibleForecastIds: string[] | null = Array.isArray(body?.eligible_forecast_ids)
      ? body.eligible_forecast_ids.filter((x: unknown) => typeof x === "string")
      : null;
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("id, name, date, status, parent_event_id, event_type, company_id")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Evento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MULTI-TENANT GUARD: caller must belong to the event's company.
    {
      const { data: callerProfile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", caller.id).maybeSingle();
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
      const callerCompanyId = isPa
        ? (callerProfile?.active_company_id ?? callerProfile?.company_id ?? null)
        : (callerProfile?.company_id ?? null);
      const allowCrossTenant = isPa && callerCompanyId == null;
      if (!allowCrossTenant && (event as any).company_id !== callerCompanyId) {
        return new Response(JSON.stringify({ error: "Cross-tenant access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (event.status !== "completed" && event.status !== "active") {
      return new Response(JSON.stringify({ error: "Apenas eventos ativos ou concluídos permitem gerar transações históricas" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: histAccount } = await adminClient
      .from("financial_accounts")
      .select("id")
      .eq("name", "Eventos Históricos")
      .single();

    if (!histAccount) {
      return new Response(JSON.stringify({ error: "Conta 'Eventos Históricos' não encontrada. Crie-a primeiro." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let forecastsQuery = adminClient
      .from("event_forecasts")
      .select("*")
      .eq("event_id", event_id)
      .eq("status", "approved")
      .is("transaction_id", null)
      .is("version_id", null);

    // Strict rule (matches client bulk logic): only forecasts pre-validated by
    // the caller as having no matching real transaction. If the caller does
    // not pass the list, fall back to the legacy behaviour for compatibility.
    if (eligibleForecastIds && eligibleForecastIds.length > 0) {
      forecastsQuery = forecastsQuery.in("id", eligibleForecastIds);
    }

    const { data: forecasts, error: forecastError } = await forecastsQuery;

    if (forecastError) {
      return new Response(JSON.stringify({ error: forecastError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!forecasts || forecasts.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma previsão elegível encontrada (sem transação e sem match por categoria)" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let createdPaid = 0;
    let createdApproved = 0;
    let matched = 0;
    const errors: string[] = [];

    // Track xlsx rows already used for matching to avoid duplicates
    const usedXlsxIdx = new Set<number>();

    // Detect Master event (event_type='master' OR has children — used to enable ½× fallback for shared costs)
    const isMaster = event.event_type === "master" || event.parent_event_id === null;
    const { data: childEvents } = isMaster
      ? await adminClient.from("events").select("id").eq("parent_event_id", event_id)
      : { data: null };
    const hasChildren = (childEvents?.length ?? 0) > 0;
    const enableHalfFallback = isMaster && hasChildren;

    function findXlsxMatch(forecastDescription: string, forecastBase: number): { idx: number; row: XlsxRowInput; mode: "1x" | "0.5x" } | null {
      if (xlsxRows.length === 0) return null;
      // Try full base first; if Master with children, also try half base (shared cost split between sub-events)
      const candidates: Array<{ base: number; mode: "1x" | "0.5x" }> = [{ base: forecastBase, mode: "1x" }];
      if (enableHalfFallback) candidates.push({ base: Math.round((forecastBase / 2) * 100) / 100, mode: "0.5x" });
      let best: { idx: number; sim: number; mode: "1x" | "0.5x" } | null = null;
      for (const cand of candidates) {
        for (let i = 0; i < xlsxRows.length; i++) {
          if (usedXlsxIdx.has(i)) continue;
          const r = xlsxRows[i];
          if (Math.abs(Number(r.baseAmount) - cand.base) > 0.01) continue;
          const sim = stringSimilarity(r.description, forecastDescription);
          if (sim < 0.8) continue;
          if (!best || sim > best.sim) best = { idx: i, sim, mode: cand.mode };
        }
      }
      if (!best) return null;
      usedXlsxIdx.add(best.idx);
      return { idx: best.idx, row: xlsxRows[best.idx], mode: best.mode };
    }

    for (const forecast of forecasts) {
      const baseAmount = Number(forecast.amount);
      const ivaRate = Number(forecast.iva_rate);
      const totalWithIva = Math.round(baseAmount * (1 + ivaRate / 100) * 100) / 100;

      // Match with xlsx (if provided)
      const match = findXlsxMatch(String(forecast.description), baseAmount);
      const shouldLiquidate = match ? isPaidStatus(match.row.status) : false;
      if (match) matched++;

      const txStatus = shouldLiquidate ? "paid" : "approved";

      const transactionPayload: Record<string, unknown> = {
        description: forecast.description,
        type: forecast.type,
        amount: totalWithIva,
        iva_rate: ivaRate,
        event_id: event_id,
        category_id: forecast.category_id,
        specification: forecast.specification || null,
        date: event.date,
        status: txStatus,
      };

      if (shouldLiquidate) {
        transactionPayload.paid_amount = totalWithIva;
        transactionPayload.payment_date = event.date;
        transactionPayload.account_id = histAccount.id;
      } else {
        transactionPayload.paid_amount = 0;
      }

      const { data: newTx, error: txError } = await adminClient
        .from("transactions")
        .insert(transactionPayload)
        .select("id")
        .single();

      if (txError) {
        errors.push(`Erro ao criar transação para "${forecast.description}": ${txError.message}`);
        continue;
      }

      const { error: linkError } = await adminClient
        .from("event_forecasts")
        .update({ transaction_id: newTx.id })
        .eq("id", forecast.id);

      if (linkError) {
        errors.push(`Erro ao vincular previsão "${forecast.description}": ${linkError.message}`);
      }

      // Propagate forecast.attachment_refs into transaction_documents
      const refs = Array.isArray((forecast as any).attachment_refs)
        ? ((forecast as any).attachment_refs as Array<{ url?: string }>)
        : [];
      const refUrls = refs
        .map((r) => (r && typeof r.url === "string" ? r.url.trim() : ""))
        .filter((u) => /^https?:\/\//i.test(u));

      if (refUrls.length > 0) {
        const { data: existing } = await adminClient
          .from("transaction_documents")
          .select("file_url")
          .eq("transaction_id", newTx.id);
        const existingSet = new Set((existing || []).map((d: any) => d.file_url));

        for (const link of refUrls) {
          const fileUrl = `ref://${link}`;
          if (existingSet.has(fileUrl)) continue;
          const fileName = (() => {
            try {
              const u = new URL(link);
              return decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname).slice(0, 120);
            } catch { return link.slice(0, 80); }
          })();
          await adminClient.from("transaction_documents").insert({
            transaction_id: newTx.id,
            name: fileName,
            file_url: fileUrl,
            doc_type: "outro",
            uploaded_by: caller.email ?? "sistema",
            is_accounting: true,
          });
        }
      }

      if (shouldLiquidate) createdPaid++;
      else createdApproved++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: createdPaid + createdApproved,
        createdPaid,
        createdApproved,
        matched,
        unmatched: forecasts.length - matched,
        total: forecasts.length,
        xlsxProvided: xlsxRows.length,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
