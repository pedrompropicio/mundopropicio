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

    // Authenticate caller
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

    // Check caller role: must be admin or manager
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRole = roleData?.role;
    if (callerRole !== "admin" && callerRole !== "manager") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores e managers podem aprovar transações" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { transaction_ids } = await req.json();
    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "transaction_ids é obrigatório (array de UUIDs)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch transactions to validate current state
    const { data: transactions, error: fetchError } = await adminClient
      .from("transactions")
      .select("id, status, type, event_id, amount")
      .in("id", transaction_ids);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma transação encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate: only pending or overdue transactions can be approved
    const invalidTx = transactions.filter(
      (t) => t.status !== "pending" && t.status !== "overdue"
    );
    if (invalidTx.length > 0) {
      return new Response(
        JSON.stringify({
          error: `${invalidTx.length} transação(ões) não podem ser aprovadas (estado atual: ${[...new Set(invalidTx.map((t) => t.status))].join(", ")})`,
          invalid_ids: invalidTx.map((t) => t.id),
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate: transactions already paid cannot be approved
    const paidTx = transactions.filter((t) => t.status === "paid");
    if (paidTx.length > 0) {
      return new Response(
        JSON.stringify({ error: "Transações já pagas não podem ser aprovadas" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validIds = transactions.map((t) => t.id);
    const callerName = caller.user_metadata?.full_name ?? caller.email ?? "sistema";

    // Write audit log entries (server-side, tamper-proof)
    const auditEntries = validIds.map((id) => ({
      transaction_id: id,
      changed_by: callerName,
      field_name: "status",
      old_value: transactions.find((t) => t.id === id)?.status ?? "pending",
      new_value: "approved",
    }));

    const { error: auditError } = await adminClient
      .from("transaction_audit_log")
      .insert(auditEntries);

    if (auditError) {
      console.error("Audit log error:", auditError);
      // Don't block approval for audit failure, but log it
    }

    // Update transaction statuses
    const { error: updateError } = await adminClient
      .from("transactions")
      .update({ status: "approved" })
      .in("id", validIds);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        approved_count: validIds.length,
        approved_ids: validIds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
