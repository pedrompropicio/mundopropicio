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

    // Get caller role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRole = roleData?.role ?? "user";
    const isAdmin = callerRole === "admin";

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

    // RULE: Paid transactions — only specification and supplier_id can be edited (unless admin)
    const isPaid = transaction.status === "paid";
    if (isPaid && !isAdmin) {
      const paidAllowedFields = ["specification", "supplier_id", "is_transitory", "exclude_from_result", "invoice_ref", "payment_method", "payment_entity", "payment_reference"];
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
    const allowedFields = [
      "description", "amount", "iva_rate", "event_id", "category_id",
      "supplier_id", "account_id", "specification", "date", "due_date",
      "payment_date", "is_transitory", "exclude_from_result", "split_mode",
      "invoice_ref", "payment_method", "payment_entity", "payment_reference",
      "status",
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
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Propagate changes to child split transactions
    const { data: children } = await adminClient
      .from("transactions")
      .select("id, split_percentage, split_amount")
      .eq("parent_transaction_id", transaction_id);

    if (children && children.length > 0) {
      const amountChanged = "amount" in sanitizedUpdates && Number(sanitizedUpdates.amount) !== Number(transaction.amount);
      const ivaChanged = "iva_rate" in sanitizedUpdates && Number(sanitizedUpdates.iva_rate) !== Number(transaction.iva_rate);
      const sharedFields = ["description", "category_id", "supplier_id", "account_id", "due_date", "specification", "date"];

      // If explicit child adjustments were sent (from edit modal), use those
      const hasExplicitAdjustments = child_adjustments && Array.isArray(child_adjustments) && child_adjustments.length > 0;
      const adjustmentMap = hasExplicitAdjustments
        ? Object.fromEntries(child_adjustments.map((ca: any) => [ca.id, Number(ca.amount)]))
        : null;

      for (const child of children) {
        const childUpdates: Record<string, any> = {};

        // Propagate amount
        if (amountChanged) {
          if (adjustmentMap && adjustmentMap[child.id] != null) {
            // Use explicit adjustment from user
            childUpdates.amount = adjustmentMap[child.id];
            // Update split_percentage to reflect new ratio
            const newTotal = Number(sanitizedUpdates.amount);
            if (newTotal > 0) {
              childUpdates.split_percentage = +((adjustmentMap[child.id] / newTotal) * 100).toFixed(4);
            }
            // Update split_amount if in absolute mode
            if (child.split_amount != null) {
              childUpdates.split_amount = adjustmentMap[child.id];
            }
          } else {
            // Auto-propagate proportionally via percentage
            const pct = child.split_percentage ?? 0;
            const newAmount = Number(sanitizedUpdates.amount);
            childUpdates.amount = +(newAmount * pct / 100).toFixed(2);
            if (child.split_amount != null) {
              childUpdates.split_amount = childUpdates.amount;
            }
          }
        }
        // Propagate IVA rate directly
        if (ivaChanged) {
          childUpdates.iva_rate = sanitizedUpdates.iva_rate;
        }
        // Propagate shared fields directly
        for (const field of sharedFields) {
          if (field in sanitizedUpdates && sanitizedUpdates[field] !== transaction[field]) {
            childUpdates[field] = sanitizedUpdates[field];
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
