import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { transaction_ids } = await req.json();
    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "transaction_ids é obrigatório (array de UUIDs)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uniqueIds = [...new Set(transaction_ids.filter((id) => typeof id === "string" && id.length > 0))];

    // Expand to invoice-group siblings (faturas com várias taxas de IVA)
    let expandedIds = [...uniqueIds];
    {
      const { data: groupRows } = await adminClient
        .from("transactions")
        .select("id, invoice_group_id")
        .in("id", uniqueIds);
      const groupKeys = [
        ...new Set(
          (groupRows ?? [])
            .map((r: any) => r.invoice_group_id)
            .filter((g: any) => !!g),
        ),
      ];
      if (groupKeys.length > 0) {
        const { data: siblings } = await adminClient
          .from("transactions")
          .select("id")
          .in("invoice_group_id", groupKeys);
        const set = new Set<string>(expandedIds);
        for (const s of siblings ?? []) set.add(s.id);
        expandedIds = [...set];
      }
    }

    const { data: transactions, error: fetchError } = await adminClient
      .from("transactions")
      .select("id, status, type, event_id, amount, company_id, forecast_id, parent_transaction_id")
      .in("id", expandedIds);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MULTI-TENANT GUARD: every transaction must belong to caller's company.
    {
      const { data: callerProfile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", callerId).maybeSingle();
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: callerId });
      const callerCompanyId = isPa
        ? (callerProfile?.active_company_id ?? callerProfile?.company_id ?? null)
        : (callerProfile?.company_id ?? null);
      const allowCrossTenant = isPa && callerCompanyId == null;
      if (!allowCrossTenant) {
        const foreign = (transactions ?? []).filter((t: any) => t.company_id !== callerCompanyId);
        if (foreign.length > 0) {
          return new Response(
            JSON.stringify({ error: "Cross-tenant access denied", offending_ids: foreign.map((t: any) => t.id) }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          approved_count: 0,
          approved_ids: [],
          skipped_count: expandedIds.length,
          skipped_ids: expandedIds,
          message: "Nenhuma transação encontrada para aprovar.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const approvableTx = transactions.filter((t) => t.status === "pending" || t.status === "overdue");
    const skippedTx = transactions.filter((t) => t.status !== "pending" && t.status !== "overdue");
    const missingIds = expandedIds.filter((id) => !transactions.some((t) => t.id === id));
    const approvedIds = approvableTx.map((t) => t.id);
    const skippedIds = [...skippedTx.map((t) => t.id), ...missingIds];
    const callerName =
      (typeof callerUserMetadata?.full_name === "string" && callerUserMetadata.full_name) ||
      callerEmail ||
      "sistema";

    if (approvedIds.length > 0) {
      const auditEntries = approvedIds.map((id) => ({
        transaction_id: id,
        company_id: approvableTx.find((t) => t.id === id)?.company_id,
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

      // Propagate approval to child split transactions
      for (const parentId of approvedIds) {
        const { data: children } = await adminClient
          .from("transactions")
          .select("id, status, company_id")
          .eq("parent_transaction_id", parentId);

        if (children && children.length > 0) {
          const pendingChildren = children.filter((c) => c.status === "pending" || c.status === "overdue");
          if (pendingChildren.length > 0) {
            const childIds = pendingChildren.map((c) => c.id);

            const childAuditEntries = pendingChildren.map((c) => ({
              transaction_id: c.id,
              company_id: c.company_id,
              changed_by: callerName,
              field_name: "status",
              old_value: c.status,
              new_value: "approved",
            }));

            const { error: childAuditError } = await adminClient
              .from("transaction_audit_log")
              .insert(childAuditEntries);
            if (childAuditError) {
              console.error("[approve-transaction] audit children error:", childAuditError);
            }
            await adminClient
              .from("transactions")
              .update({ status: "approved" })
              .in("id", childIds);
          }
        }
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
