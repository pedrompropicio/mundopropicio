import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ParkedDecision {
  item_id: string;
  decision: "reject" | "approve_without_doc" | "defer";
  reason?: string;
}

interface RequestBody {
  session_id: string;
  card_account_id?: string | null; // financial account id used for "card" payments
  /** Decisão item-a-item para itens parqueados (status='pending_review'). */
  parked_decisions?: ParkedDecision[];
  /** Conta financeira para gerar a transação de acerto (reforço/devolução do adiantamento). */
  settlement_account_id?: string | null;
  /** ID do fornecedor (sócio/funcionário) para a transação de reforço quando há saldo a pagar à equipa. */
  settlement_supplier_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Não autorizado" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Role check: admin OR manager
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (!roleData || (roleData.role !== "admin" && roleData.role !== "manager")) {
      return json({ error: "Apenas admin/manager podem integrar a sessão" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.session_id) return json({ error: "session_id obrigatório" }, 400);

    // Load session
    const { data: session, error: sErr } = await adminClient
      .from("camarim_sessions")
      .select("id,title,status,currency,master_event_id,opened_at,closed_at")
      .eq("id", body.session_id)
      .single();
    if (sErr || !session) return json({ error: "Sessão não encontrada" }, 404);
    if (session.status === "integrated") return json({ error: "Sessão já integrada" }, 422);
    if (session.status !== "closed" && session.status !== "in_review") {
      return json({ error: "Apenas sessões em revisão ou fechadas podem ser integradas" }, 422);
    }

    // Primary event
    const { data: events } = await adminClient
      .from("camarim_session_events")
      .select("event_id,is_primary")
      .eq("session_id", body.session_id);
    const primaryEvent = (events ?? []).find((e: any) => e.is_primary) ?? (events ?? [])[0];
    const primaryEventId = primaryEvent?.event_id ?? null;
    if (!primaryEventId && !session.master_event_id) {
      return json({ error: "Sessão sem evento associado — impossível gerar transações" }, 422);
    }

    // === Aplicar decisões sobre itens parqueados ANTES de carregar os aprovados ===
    const decisions = body.parked_decisions ?? [];
    if (decisions.length > 0) {
      for (const d of decisions) {
        if (!d.item_id) continue;
        if (d.decision === "reject") {
          await adminClient
            .from("camarim_items")
            .update({ status: "rejected" })
            .eq("id", d.item_id)
            .eq("status", "pending_review");
        } else if (d.decision === "approve_without_doc") {
          if (!d.reason || !d.reason.trim()) {
            return json({
              error: `Item ${d.item_id}: justificativa obrigatória para aprovar sem documento.`,
            }, 422);
          }
          await adminClient
            .from("camarim_items")
            .update({
              status: "approved",
              approved_without_document: true,
              approved_without_document_reason: d.reason,
              needs_accounting_review: true,
            })
            .eq("id", d.item_id)
            .eq("status", "pending_review");
        }
        // 'defer' → não faz nada, fica parqueado para próxima vez
      }
    }

    // Verificar se ainda há parqueados (não decididos)
    const { data: stillParked } = await adminClient
      .from("camarim_items")
      .select("id")
      .eq("session_id", body.session_id)
      .eq("status", "pending_review");

    // Approved items only (após aplicar decisões)
    const { data: items, error: iErr } = await adminClient
      .from("camarim_items")
      .select("*")
      .eq("session_id", body.session_id)
      .eq("status", "approved");
    if (iErr) return json({ error: iErr.message }, 500);
    if (!items || items.length === 0) {
      return json({ error: "Não há itens aprovados para integrar" }, 422);
    }

    // Validate: every item needs a category
    const missingCat = items.filter((it: any) => !it.category_id);
    if (missingCat.length > 0) {
      return json({
        error: `${missingCat.length} item(ns) aprovado(s) sem categoria contábil. Edita-os antes de integrar.`,
      }, 422);
    }

    // Find advance financial account from latest fund_move
    const { data: lastFundAdvance } = await adminClient
      .from("camarim_fund_moves")
      .select("financial_account_id")
      .eq("session_id", body.session_id)
      .in("move_type", ["advance", "reinforcement"])
      .order("created_at", { ascending: false })
      .limit(1);
    const advanceAccountId = (lastFundAdvance?.[0] as any)?.financial_account_id ?? null;

    const created: string[] = [];
    const errors: string[] = [];

    for (const it of items as any[]) {
      const txEventId = it.bp_scope === "master_common"
        ? (session.master_event_id ?? primaryEventId)
        : (primaryEventId ?? session.master_event_id);

      const total = Number(it.total_amount ?? 0);
      const baseAmount = Number(it.base_amount ?? 0);
      const ivaAmount = Number(it.iva_amount ?? 0);
      const ivaRate = baseAmount > 0 ? Math.round((ivaAmount / baseAmount) * 100) : 0;

      let accountId: string | null = null;
      let txStatus: "paid" | "approved" = "approved";
      let isReimbursement = false;
      let reimbursementTo: string | null = null;

      if (it.payment_origin === "advance") {
        accountId = advanceAccountId;
        txStatus = "paid";
        if (!accountId) {
          errors.push(`Item ${it.id}: sem conta de adiantamento configurada (regista um movimento de fundo primeiro).`);
          continue;
        }
      } else if (it.payment_origin === "card") {
        accountId = body.card_account_id ?? null;
        txStatus = "paid";
        if (!accountId) {
          errors.push(`Item ${it.id}: pagamento por cartão exige conta financeira (card_account_id).`);
          continue;
        }
      } else if (it.payment_origin === "out_of_pocket") {
        // Stays as approved (to be reimbursed)
        txStatus = "approved";
        isReimbursement = true;
        reimbursementTo = it.buyer_profile_id ?? null;
      }

      const description = (it.service_description?.trim()
        || it.supplier_name_raw?.trim()
        || `Camarim — ${session.title}`).slice(0, 250);

      const txPayload: Record<string, unknown> = {
        description,
        type: "expense",
        amount: total,
        iva_rate: ivaRate,
        event_id: txEventId,
        category_id: it.category_id,
        supplier_id: it.supplier_id ?? null,
        specification: it.notes ?? null,
        date: it.document_date ?? new Date(session.closed_at ?? session.opened_at).toISOString().slice(0, 10),
        status: txStatus,
        invoice_ref: it.document_number ?? null,
        currency: it.currency ?? "EUR",
        is_reimbursement: isReimbursement,
        reimbursement_to: reimbursementTo,
      };

      if (txStatus === "paid") {
        txPayload.paid_amount = total;
        txPayload.payment_date = txPayload.date;
        txPayload.account_id = accountId;
      } else {
        txPayload.paid_amount = 0;
      }

      const { data: newTx, error: txErr } = await adminClient
        .from("transactions")
        .insert(txPayload)
        .select("id")
        .single();

      if (txErr) {
        errors.push(`Item ${it.id}: ${txErr.message}`);
        continue;
      }

      // Link item → transaction
      await adminClient
        .from("camarim_items")
        .update({ transaction_id: newTx.id, status: "integrated" })
        .eq("id", it.id);

      // Carry documents into transaction_documents (private bucket "camarim-documents")
      const { data: docs } = await adminClient
        .from("camarim_item_documents")
        .select("file_path,file_name,mime_type")
        .eq("item_id", it.id);

      for (const d of (docs ?? []) as any[]) {
        await adminClient.from("transaction_documents").insert({
          transaction_id: newTx.id,
          name: d.file_name ?? "talão",
          file_url: `camarim://${d.file_path}`,
          doc_type: "outro",
          uploaded_by: caller.email ?? "sistema",
          is_accounting: true,
        });
      }

      created.push(newTx.id);
    }

    // ===== ABATE AUTOMÁTICO DO ADIANTAMENTO =====
    // Soma adiantamentos entregues (advance + reinforcement) menos devoluções já feitas
    const { data: fundMoves } = await adminClient
      .from("camarim_fund_moves")
      .select("move_type,amount")
      .eq("session_id", body.session_id);

    const advanceTotal = (fundMoves ?? [])
      .filter((m: any) => m.move_type === "advance" || m.move_type === "reinforcement")
      .reduce((acc: number, m: any) => acc + Number(m.amount ?? 0), 0);
    const refundTotal = (fundMoves ?? [])
      .filter((m: any) => m.move_type === "refund")
      .reduce((acc: number, m: any) => acc + Number(m.amount ?? 0), 0);
    const advanceNet = advanceTotal - refundTotal;

    // Total efetivamente gasto contra o adiantamento (apenas itens advance integrados)
    const spentFromAdvance = (items as any[])
      .filter((it) => it.payment_origin === "advance")
      .reduce((acc, it) => acc + Number(it.total_amount ?? 0), 0);

    // saldo positivo = falta dinheiro à equipa (REFORÇO a pagar)
    // saldo negativo = sobrou dinheiro com a equipa (DEVOLUÇÃO a receber)
    const balance = +(spentFromAdvance - advanceNet).toFixed(2);
    let settlementType: "refund" | "reinforcement" | "balanced" = "balanced";
    let settlementTxId: string | null = null;

    const settlementAccountId = body.settlement_account_id ?? advanceAccountId;
    const SETTLEMENT_TOLERANCE = 0.01;

    if (advanceNet > 0 && Math.abs(balance) >= SETTLEMENT_TOLERANCE && settlementAccountId) {
      const settlementEventId = session.master_event_id ?? primaryEventId;
      if (balance > 0) {
        // Falta pagar à equipa → cria expense 'approved' a favor do responsável
        settlementType = "reinforcement";
        const { data: stx, error: stxErr } = await adminClient
          .from("transactions")
          .insert({
            description: `Camarim — Reforço (acerto adiantamento) · ${session.title}`,
            type: "expense",
            amount: balance,
            iva_rate: 0,
            event_id: settlementEventId,
            category_id: null,
            supplier_id: body.settlement_supplier_id ?? null,
            specification: `Acerto automático do adiantamento da sessão ${session.title}`,
            date: new Date().toISOString().slice(0, 10),
            status: "approved",
            currency: session.currency ?? "EUR",
            paid_amount: 0,
            account_id: settlementAccountId,
          })
          .select("id")
          .single();
        if (stxErr) {
          errors.push(`Acerto/reforço: ${stxErr.message}`);
        } else {
          settlementTxId = stx.id;
        }
      } else {
        // Sobrou caixa → cria income 'approved' a receber da equipa
        settlementType = "refund";
        const { data: stx, error: stxErr } = await adminClient
          .from("transactions")
          .insert({
            description: `Camarim — Devolução (acerto adiantamento) · ${session.title}`,
            type: "income",
            amount: Math.abs(balance),
            iva_rate: 0,
            event_id: settlementEventId,
            category_id: null,
            supplier_id: body.settlement_supplier_id ?? null,
            specification: `Acerto automático do adiantamento da sessão ${session.title}`,
            date: new Date().toISOString().slice(0, 10),
            status: "approved",
            currency: session.currency ?? "EUR",
            paid_amount: 0,
            account_id: settlementAccountId,
          })
          .select("id")
          .single();
        if (stxErr) {
          errors.push(`Acerto/devolução: ${stxErr.message}`);
        } else {
          settlementTxId = stx.id;
        }
      }
    }

    // Update session status + settlement metadata
    await adminClient
      .from("camarim_sessions")
      .update({
        status: "integrated",
        integrated_at: new Date().toISOString(),
        advance_total: advanceNet,
        spent_total: spentFromAdvance,
        settlement_balance: balance,
        settlement_type: settlementType,
        settlement_transaction_id: settlementTxId,
      })
      .eq("id", body.session_id);

    // Audit / integration record
    await adminClient.from("camarim_integrations").insert({
      session_id: body.session_id,
      integration_type: "transactions",
      status: errors.length === 0 ? "success" : "partial",
      created_by: caller.id,
      summary_payload: {
        created_count: created.length,
        error_count: errors.length,
        errors,
        advance_net: advanceNet,
        spent_from_advance: spentFromAdvance,
        settlement_balance: balance,
        settlement_type: settlementType,
        settlement_transaction_id: settlementTxId,
        parked_remaining: (stillParked ?? []).length,
      },
    });

    return json({
      success: true,
      created: created.length,
      total_items: items.length,
      errors,
      settlement: {
        advance_net: advanceNet,
        spent_from_advance: spentFromAdvance,
        balance,
        type: settlementType,
        transaction_id: settlementTxId,
      },
      parked_remaining: (stillParked ?? []).length,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
