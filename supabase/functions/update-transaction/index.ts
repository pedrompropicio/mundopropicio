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

    // Get caller roles. A user can now have more than one role (e.g. platform_admin + admin),
    // so using .single() would fail or pick the wrong role and incorrectly block admin edits.
    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoles = (roleRows ?? []).map((row: any) => row.role);
    const isAdmin = callerRoles.includes("admin") || callerRoles.includes("platform_admin");

    // SECURITY: only privileged roles may update transactions. Viewers/partners
    // were able to flip status (incl. → paid) bypassing approve-transaction.
    const PRIVILEGED = new Set(["admin", "platform_admin", "manager", "editor"]);
    const hasPrivilegedRole = callerRoles.some((r: string) => PRIVILEGED.has(r));
    if (!hasPrivilegedRole) {
      // Fallback: explicit manage_transactions permission grant
      const { data: permRow } = await adminClient
        .from("user_permissions")
        .select("granted")
        .eq("user_id", caller.id)
        .eq("permission", "manage_transactions")
        .maybeSingle();
      if (!permRow?.granted) {
        return new Response(
          JSON.stringify({ error: "Sem permissão para atualizar transações" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { transaction_id, updates, changes, child_adjustments } = body;

    if (!transaction_id || !updates) {
      return new Response(
        JSON.stringify({ error: "transaction_id e updates são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch current transaction state
    const { data: transaction, error: fetchError } = await adminClient
      .from("transactions")
      .select("*")
      .eq("id", transaction_id)
      .single();

    if (fetchError || !transaction) {
      return new Response(
        JSON.stringify({ error: "Transação não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MULTI-TENANT GUARD: ensure caller belongs to same company as the transaction.
    // Service-role bypasses RLS, so we MUST check company_id explicitly.
    {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("company_id, active_company_id")
        .eq("id", caller.id)
        .maybeSingle();
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
      const callerCompanyId = isPa
        ? (callerProfile?.active_company_id ?? callerProfile?.company_id ?? null)
        : (callerProfile?.company_id ?? null);
      const allowCrossTenant = isPa && callerCompanyId == null;
      if (!allowCrossTenant && transaction.company_id !== callerCompanyId) {
        return new Response(
          JSON.stringify({ error: "Cross-tenant access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Defense-in-depth: never let payload override company_id
      if ("company_id" in updates) delete updates.company_id;
    }

    // RULE: Paid transactions — only specification and supplier_id can be edited (unless admin)
    const isPaid = transaction.status === "paid";
    if (isPaid && !isAdmin) {
      const paidAllowedFields = ["specification", "supplier_id", "is_transitory", "exclude_from_result", "invoice_ref", "payment_method", "payment_entity", "payment_reference", "declared_withholding_rate", "declared_withholding_amount"];
      const blockedFields = Object.keys(updates).filter((f) => !paidAllowedFields.includes(f));
      if (blockedFields.length > 0) {
        return new Response(
          JSON.stringify({ error: "Transações pagas só permitem alteração de especificação e fornecedor" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate amount is positive
    if ("amount" in updates) {
      const amount = parseFloat(updates.amount);
      if (isNaN(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({ error: "O montante deve ser um valor positivo" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updates.amount = amount;
    }

    // Validate IVA rate
    if ("iva_rate" in updates) {
      const validRates = [0, 6, 13, 23];
      if (!validRates.includes(Number(updates.iva_rate))) {
        return new Response(
          JSON.stringify({ error: "Taxa de IVA inválida. Valores permitidos: 0%, 6%, 13%, 23%" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Write audit log (server-side, tamper-proof)
    const callerName = caller.user_metadata?.full_name ?? caller.email ?? "sistema";
    if (changes && Array.isArray(changes) && changes.length > 0) {
      const auditEntries = changes.map((c: any) => ({
        transaction_id,
        changed_by: callerName,
        field_name: String(c.field_name ?? ""),
        old_value: String(c.old_value ?? ""),
        new_value: String(c.new_value ?? ""),
      }));

      const { error: auditError } = await adminClient
        .from("transaction_audit_log")
        .insert(auditEntries);

      if (auditError) {
        console.error("Audit log error:", auditError);
      }
    }

    // Build sanitized update object (only allowed fields)
    // SECURITY: `status` removed — status transitions must go through the
    // dedicated approve-transaction / liquidate flows (which enforce admin/manager).
    const allowedFields = [
      "description", "amount", "iva_rate", "event_id", "category_id",
      "supplier_id", "account_id", "specification", "date", "due_date",
      "payment_date", "is_transitory", "exclude_from_result", "split_mode",
      "invoice_ref", "payment_method", "payment_entity", "payment_reference",
      "declared_withholding_rate", "declared_withholding_amount",
    ];
    const sanitizedUpdates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in updates) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    // Apply update
    const { error: updateError } = await adminClient
      .from("transactions")
      .update(sanitizedUpdates)
      .eq("id", transaction_id);

    if (updateError) {
      console.error("[update-transaction] update failed", {
        transaction_id,
        sanitizedUpdates,
        rawUpdates: updates,
        error: updateError,
      });
      return new Response(
        JSON.stringify({
          error: updateError.message,
          details: updateError.details ?? null,
          hint: updateError.hint ?? null,
          code: updateError.code ?? null,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Propagate changes to child transactions (splits or installments)
    const { data: children } = await adminClient
      .from("transactions")
      .select("id, split_percentage, split_amount, status")
      .eq("parent_transaction_id", transaction_id);

    if (children && children.length > 0) {
      const amountChanged = "amount" in sanitizedUpdates && Number(sanitizedUpdates.amount) !== Number(transaction.amount);
      const ivaChanged = "iva_rate" in sanitizedUpdates && Number(sanitizedUpdates.iva_rate) !== Number(transaction.iva_rate);
      const sharedFields = ["description", "category_id", "supplier_id", "account_id", "due_date", "specification", "date"];

      // Installment children = parent_transaction_id set but no split_percentage.
      // Shared fields that should cascade to PENDING installment siblings.
      // Date/due_date/amount/account stay per-installment (each has own schedule).
      const installmentSharedFields = [
        "category_id", "supplier_id", "event_id", "specification",
        "invoice_ref", "payment_method", "payment_entity", "payment_reference",
        "is_transitory", "exclude_from_result",
      ];

      // If explicit child adjustments were sent (from edit modal), use those
      const hasExplicitAdjustments = child_adjustments && Array.isArray(child_adjustments) && child_adjustments.length > 0;
      const adjustmentMap = hasExplicitAdjustments
        ? Object.fromEntries(child_adjustments.map((ca: any) => [ca.id, Number(ca.amount)]))
        : null;

      for (const child of children) {
        const isInstallmentChild = child.split_percentage == null;
        const childUpdates: Record<string, any> = {};

        if (isInstallmentChild) {
          // Skip paid installments — only edit pending/approved/partially_paid
          if (child.status === "paid") continue;
          for (const field of installmentSharedFields) {
            if (field in sanitizedUpdates && sanitizedUpdates[field] !== transaction[field]) {
              childUpdates[field] = sanitizedUpdates[field];
            }
          }
          // IVA propagates to pending installments (same fiscal doc)
          if (ivaChanged) childUpdates.iva_rate = sanitizedUpdates.iva_rate;
        } else {
          // Split child — keep existing proportional propagation
          if (amountChanged) {
            if (adjustmentMap && adjustmentMap[child.id] != null) {
              childUpdates.amount = adjustmentMap[child.id];
              const newTotal = Number(sanitizedUpdates.amount);
              if (newTotal > 0) {
                childUpdates.split_percentage = +((adjustmentMap[child.id] / newTotal) * 100).toFixed(4);
              }
              if (child.split_amount != null) {
                childUpdates.split_amount = adjustmentMap[child.id];
              }
            } else {
              const pct = child.split_percentage ?? 0;
              const newAmount = Number(sanitizedUpdates.amount);
              childUpdates.amount = +(newAmount * pct / 100).toFixed(2);
              if (child.split_amount != null) {
                childUpdates.split_amount = childUpdates.amount;
              }
            }
          }
          if (ivaChanged) childUpdates.iva_rate = sanitizedUpdates.iva_rate;
          for (const field of sharedFields) {
            if (field in sanitizedUpdates && sanitizedUpdates[field] !== transaction[field]) {
              childUpdates[field] = sanitizedUpdates[field];
            }
          }
        }

        if (Object.keys(childUpdates).length > 0) {
          await adminClient
            .from("transactions")
            .update(childUpdates)
            .eq("id", child.id);
        }
      }
    }

    // Propagate shared fields to invoice-group siblings (fatura com várias taxas de IVA).
    // Apenas campos que fazem sentido replicar — base/IVA/descrição/valor ficam INDIVIDUAIS por irmã.
    if (transaction.invoice_group_id) {
      const invoiceSharedFields = [
        "event_id",
        "category_id",
        "supplier_id",
        "account_id",
        "specification",
        "date",
        "due_date",
        "invoice_ref",
        "payment_method",
        "payment_entity",
        "payment_reference",
        "is_transitory",
        "exclude_from_result",
      ];
      const siblingUpdates: Record<string, any> = {};
      for (const field of invoiceSharedFields) {
        if (field in sanitizedUpdates) {
          siblingUpdates[field] = sanitizedUpdates[field];
        }
      }
      if (Object.keys(siblingUpdates).length > 0) {
        const { data: siblings } = await adminClient
          .from("transactions")
          .select("id")
          .eq("invoice_group_id", transaction.invoice_group_id)
          .neq("id", transaction_id);
        const siblingIds = (siblings ?? []).map((s: any) => s.id);
        if (siblingIds.length > 0) {
          await adminClient
            .from("transactions")
            .update(siblingUpdates)
            .in("id", siblingIds);

          // Audit log on each sibling
          const auditOnSiblings = siblingIds.map((sid: string) => ({
            transaction_id: sid,
            changed_by: callerName,
            field_name: "Propagação grupo-fatura",
            old_value: null,
            new_value: `Atualizado em conjunto com transação ${transaction_id}`,
          }));
          await adminClient.from("transaction_audit_log").insert(auditOnSiblings);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, transaction_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
