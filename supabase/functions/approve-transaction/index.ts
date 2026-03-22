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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;
    const callerEmail = typeof claimsData.claims.email === "string" ? claimsData.claims.email : undefined;
    const callerUserMetadata =
      claimsData.claims.user_metadata && typeof claimsData.claims.user_metadata === "object"
        ? claimsData.claims.user_metadata as Record<string, unknown>
        : undefined;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRoles = new Set((roleRows ?? []).map((row) => row.role));
    if (!callerRoles.has("admin") && !callerRoles.has("manager")) {
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

    const uniqueIds = [...new Set(transaction_ids.filter((id) => typeof id === "string" && id.length > 0))];
    const { data: transactions, error: fetchError } = await adminClient
      .from("transactions")
      .select("id, status, type, event_id, amount")
      .in("id", uniqueIds);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          approved_count: 0,
          approved_ids: [],
          skipped_count: uniqueIds.length,
          skipped_ids: uniqueIds,
          message: "Nenhuma transação encontrada para aprovar.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const approvableTx = transactions.filter((t) => t.status === "pending" || t.status === "overdue");
    const skippedTx = transactions.filter((t) => t.status !== "pending" && t.status !== "overdue");
    const missingIds = uniqueIds.filter((id) => !transactions.some((t) => t.id === id));
    const approvedIds = approvableTx.map((t) => t.id);
    const skippedIds = [...skippedTx.map((t) => t.id), ...missingIds];
    const callerName =
      (typeof callerUserMetadata?.full_name === "string" && callerUserMetadata.full_name) ||
      callerEmail ||
      "sistema";

    if (approvedIds.length > 0) {
      const auditEntries = approvedIds.map((id) => ({
        transaction_id: id,
        changed_by: callerName,
        field_name: "status",
        old_value: approvableTx.find((t) => t.id === id)?.status ?? "pending",
        new_value: "approved",
      }));

      const { error: auditError } = await adminClient
        .from("transaction_audit_log")
        .insert(auditEntries);

      if (auditError) {
        console.error("Audit log error:", auditError);
      }

      const { error: updateError } = await adminClient
        .from("transactions")
        .update({ status: "approved" })
        .in("id", approvedIds);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const skippedStatuses = [...new Set(skippedTx.map((t) => t.status))];
    const message = approvedIds.length === 0
      ? "Nenhuma transação pendente encontrada para aprovar."
      : skippedIds.length > 0
        ? `${approvedIds.length} transação(ões) aprovada(s); ${skippedIds.length} ignorada(s).`
        : undefined;

    return new Response(
      JSON.stringify({
        success: true,
        approved_count: approvedIds.length,
        approved_ids: approvedIds,
        skipped_count: skippedIds.length,
        skipped_ids: skippedIds,
        skipped_statuses: skippedStatuses,
        message,
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
