import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Check caller is admin
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

    const { event_id } = await req.json();
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get event info
    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("id, name, date")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Evento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the "Histórico / Ajuste" account
    const { data: histAccount } = await adminClient
      .from("financial_accounts")
      .select("id")
      .eq("name", "Histórico / Ajuste")
      .single();

    if (!histAccount) {
      return new Response(JSON.stringify({ error: "Conta 'Histórico / Ajuste' não encontrada. Crie-a primeiro." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all approved forecasts without a linked transaction
    const { data: forecasts, error: forecastError } = await adminClient
      .from("event_forecasts")
      .select("*")
      .eq("event_id", event_id)
      .eq("status", "approved")
      .is("transaction_id", null);

    if (forecastError) {
      return new Response(JSON.stringify({ error: forecastError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!forecasts || forecasts.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma previsão aprovada sem transação vinculada encontrada" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    const errors: string[] = [];

    for (const forecast of forecasts) {
      // Calculate total with IVA
      const baseAmount = Number(forecast.amount);
      const ivaRate = Number(forecast.iva_rate);
      const totalWithIva = baseAmount * (1 + ivaRate / 100);

      const transactionPayload = {
        description: forecast.description,
        type: forecast.type,
        amount: totalWithIva,
        iva_rate: ivaRate,
        event_id: event_id,
        category_id: forecast.category_id,
        specification: forecast.specification || null,
        date: event.date,
        status: "paid",
        paid_amount: totalWithIva,
        payment_date: event.date,
        account_id: histAccount.id,
      };

      const { data: newTx, error: txError } = await adminClient
        .from("transactions")
        .insert(transactionPayload)
        .select("id")
        .single();

      if (txError) {
        errors.push(`Erro ao criar transação para "${forecast.description}": ${txError.message}`);
        continue;
      }

      // Link forecast to transaction
      const { error: linkError } = await adminClient
        .from("event_forecasts")
        .update({ transaction_id: newTx.id })
        .eq("id", forecast.id);

      if (linkError) {
        errors.push(`Erro ao vincular previsão "${forecast.description}": ${linkError.message}`);
      }

      created++;
    }

    return new Response(
      JSON.stringify({ success: true, created, total: forecasts.length, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
