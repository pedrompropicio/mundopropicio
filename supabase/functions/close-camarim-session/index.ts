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
  card_account_id?: string | null;
  parked_decisions?: ParkedDecision[];
  settlement_account_id?: string | null;
  settlement_supplier_id?: string | null;
}

/**
 * Camarim session integration — CONSOLIDATED MODE.
 *
 * All approved items of a session are grouped into a small number of consolidated
 * transactions, all booked under the FIXED accounting category 2.6.04 — Camarins
 * (looked up by code). The original analytical detail is preserved at the item
 * level (each `camarim_items` row keeps its `analytic_tag`, supplier, base/IVA,
 * and `transaction_id` pointing to the consolidated transaction it belongs to).
 *
 * Grouping key: (event_id × payment_origin × account_id × buyer_id × iva_rate)
 * - One transaction per group.
 * - Multiple IVA rates produce multiple transactions (clean for AT/SAF-T).
 * - All receipts of a group are attached to the consolidated transaction.
 */
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

    // ===== Resolve fixed accounting category 2.6.04 — Camarins =====
    const { data: catRow, error: catErr } = await adminClient
      .from("account_categories")
      .select("id,code,name,is_active")
      .eq("code", "2.6.04")
      .eq("is_active", true)
      .single();
    if (catErr || !catRow) {
      return json({
        error: "Categoria 2.6.04 — Camarins não encontrada/ativa no plano de contas. Avisa um administrador.",
      }, 500);
    }
    const camarimCategoryId = catRow.id as string;

    // ===== Load session =====
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

    // Primary event (for items without explicit event_id)
    const { data: events } = await adminClient
      .from("camarim_session_events")
      .select("event_id,is_primary")
      .eq("session_id", body.session_id);
    const primaryEvent = (events ?? []).find((e: any) => e.is_primary) ?? (events ?? [])[0];
    const primaryEventId = primaryEvent?.event_id ?? null;
    if (!primaryEventId && !session.master_event_id) {
      return json({ error: "Sessão sem evento associado — impossível gerar transações" }, 422);
    }

    // ===== Apply decisions over parked items BEFORE loading approved =====
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
        // 'defer' → does nothing
      }
    }

    // Are there still parked items?
    const { data: stillParked } = await adminClient
      .from("camarim_items")
      .select("id")
      .eq("session_id", body.session_id)
      .eq("status", "pending_review");

    // ===== Load approved items =====
    const { data: items, error: iErr } = await adminClient
      .from("camarim_items")
      .select("*")
      .eq("session_id", body.session_id)
      .eq("status", "approved");
    if (iErr) return json({ error: iErr.message }, 500);
    if (!items || items.length === 0) {
      return json({ error: "Não há itens aprovados para integrar" }, 422);
    }

    // ===== Find advance financial account from latest fund_move =====
    const { data: lastFundAdvance } = await adminClient
      .from("camarim_fund_moves")
      .select("financial_account_id")
      .eq("session_id", body.session_id)
      .in("move_type", ["advance", "reinforcement"])
      .order("created_at", { ascending: false })
      .limit(1);
    const advanceAccountId = (lastFundAdvance?.[0] as any)?.financial_account_id ?? null;

    // ===== Pre-flight: validate every item can be resolved into a group =====
    type ResolvedItem = {
      raw: any;
      eventId: string;
      paymentOrigin: "advance" | "card" | "out_of_pocket";
      accountId: string | null;
      buyerId: string | null;
      ivaRate: number;
      total: number;
      base: number;
      iva: number;
    };

    const resolved: ResolvedItem[] = [];
    const preflightErrors: string[] = [];

    for (const it of items as any[]) {
      const txEventId = it.bp_scope === "master_common"
        ? (session.master_event_id ?? primaryEventId)
        : (primaryEventId ?? session.master_event_id);

      if (!txEventId) {
        preflightErrors.push(`Item ${it.id}: sem evento determinável.`);
        continue;
      }

      const total = Number(it.total_amount ?? 0);
      const base = Number(it.base_amount ?? 0);
      const iva = Number(it.iva_amount ?? 0);
      const ivaRate = base > 0 ? Math.round((iva / base) * 100) : 0;

      let accountId: string | null = null;
      let buyerId: string | null = null;

      if (it.payment_origin === "advance") {
        accountId = advanceAccountId;
        if (!accountId) {
          preflightErrors.push(
            `Item ${it.id}: pago pelo adiantamento, mas a sessão não tem movimento de adiantamento registado. Regista um movimento na aba "Fundos" antes de integrar.`,
          );
          continue;
        }
      } else if (it.payment_origin === "card") {
        accountId = it.financial_account_id ?? body.card_account_id ?? null;
        if (!accountId) {
          preflightErrors.push(
            `Item ${it.id}: pagamento por cartão exige conta financeira (financial_account_id no item ou card_account_id no fecho).`,
          );
          continue;
        }
      } else if (it.payment_origin === "out_of_pocket") {
        buyerId = it.buyer_profile_id ?? null;
        // accountId stays null — reimbursements are NOT linked to a financial account
      }

      resolved.push({
        raw: it,
        eventId: txEventId,
        paymentOrigin: it.payment_origin,
        accountId,
        buyerId,
        ivaRate,
        total,
        base,
        iva,
      });
    }

    // If preflight has errors, return early without creating anything
    if (preflightErrors.length > 0 && resolved.length === 0) {
      return json({
        success: false,
        error: "Não foi possível integrar nenhum item — corrige os pré-requisitos.",
        created: 0,
        total_items: items.length,
        errors: preflightErrors,
      }, 422);
    }

    // ===== Group items by consolidation key =====
    const groupKey = (r: ResolvedItem) =>
      [
        r.eventId,
        r.paymentOrigin,
        r.accountId ?? "",
        r.buyerId ?? "",
        r.ivaRate,
      ].join("|");

    const groups = new Map<string, ResolvedItem[]>();
    for (const r of resolved) {
      const k = groupKey(r);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    // ===== Create one consolidated transaction per group =====
    const created: string[] = [];
    const errors: string[] = [...preflightErrors];

    const sessionDateFallback = new Date(session.closed_at ?? session.opened_at)
      .toISOString().slice(0, 10);

    for (const [key, groupItems] of groups.entries()) {
      const first = groupItems[0];
      const totalAmount = +groupItems.reduce((s, i) => s + i.total, 0).toFixed(2);
      const baseAmount = +groupItems.reduce((s, i) => s + i.base, 0).toFixed(2);
      const ivaAmount = +groupItems.reduce((s, i) => s + i.iva, 0).toFixed(2);

      // Use the most recent document_date in the group (or session fallback)
      const datesInGroup = groupItems
        .map((g) => g.raw.document_date)
        .filter(Boolean)
        .sort();
      const txDate = datesInGroup[datesInGroup.length - 1] ?? sessionDateFallback;

      // Build legible description and analytical specification
      const itemCount = groupItems.length;
      const originLabel =
        first.paymentOrigin === "advance" ? "Adiantamento"
        : first.paymentOrigin === "card" ? "Cartão"
        : "Reembolso";

      const description = `Camarim · ${session.title} · ${originLabel} · ${itemCount} ${itemCount === 1 ? "item" : "itens"}`.slice(0, 250);

      // Aggregate per analytic_tag for the specification field
      const tagAgg = new Map<string, { count: number; total: number }>();
      for (const g of groupItems) {
        const tag = (g.raw.analytic_tag as string | null) ?? "outros";
        const cur = tagAgg.get(tag) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += g.total;
        tagAgg.set(tag, cur);
      }
      const TAG_LABEL: Record<string, string> = {
        bebidas: "Bebidas",
        comida: "Comida",
        frutas_snacks: "Frutas e Snacks",
        higiene: "Higiene e Consumíveis",
        equipa: "Equipa Camarim",
        outros: "Outros / Sem classificação",
      };
      const tagSummary = Array.from(tagAgg.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([tag, v]) => `${TAG_LABEL[tag] ?? tag}: ${v.total.toFixed(2)}€ (${v.count})`)
        .join(" · ");

      const supplierList = Array.from(
        new Set(
          groupItems
            .map((g) => (g.raw.supplier_name_raw as string | null)?.trim())
            .filter(Boolean) as string[],
        ),
      ).slice(0, 8).join(", ");

      const specification = [
        `Sessão de Camarim: ${session.title}`,
        `Itens consolidados: ${itemCount}`,
        tagSummary ? `Análise: ${tagSummary}` : null,
        supplierList ? `Fornecedores: ${supplierList}${supplierList.length >= 1 ? "" : "…"}` : null,
        `Origem: ${originLabel}`,
        `IVA: ${first.ivaRate}%`,
      ].filter(Boolean).join("\n");

      const isReimbursement = first.paymentOrigin === "out_of_pocket";
      const txStatus: "paid" | "approved" =
        first.paymentOrigin === "out_of_pocket" ? "approved" : "paid";

      const txPayload: Record<string, unknown> = {
        description,
        type: "expense",
        amount: totalAmount,
        iva_rate: first.ivaRate,
        event_id: first.eventId,
        category_id: camarimCategoryId, // FORCED to 2.6.04 — Camarins
        supplier_id: null, // consolidated — no single supplier
        specification,
        date: txDate,
        status: txStatus,
        invoice_ref: null,
        currency: session.currency ?? "EUR",
        is_reimbursement: isReimbursement,
        reimbursement_to: isReimbursement ? first.buyerId : null,
      };

      if (txStatus === "paid") {
        txPayload.paid_amount = totalAmount;
        txPayload.payment_date = txDate;
        txPayload.account_id = first.accountId;
      } else {
        txPayload.paid_amount = 0;
      }

      const { data: newTx, error: txErr } = await adminClient
        .from("transactions")
        .insert(txPayload)
        .select("id")
        .single();

      if (txErr) {
        errors.push(`Grupo [${key}]: ${txErr.message}`);
        continue;
      }

      const newTxId = (newTx as any).id as string;

      // Link every item in the group → consolidated transaction
      const itemIds = groupItems.map((g) => g.raw.id as string);
      const { error: linkErr } = await adminClient
        .from("camarim_items")
        .update({ transaction_id: newTxId, status: "integrated" })
        .in("id", itemIds);
      if (linkErr) {
        errors.push(`Grupo [${key}] vínculo: ${linkErr.message}`);
        // continue — transaction exists; manual linking still possible
      }

      // Carry every receipt into transaction_documents
      const { data: docs } = await adminClient
        .from("camarim_item_documents")
        .select("file_path,file_name,mime_type,item_id")
        .in("item_id", itemIds);

      for (const d of (docs ?? []) as any[]) {
        await adminClient.from("transaction_documents").insert({
          transaction_id: newTxId,
          name: d.file_name ?? "talão",
          file_url: `camarim://${d.file_path}`,
          doc_type: "outro",
          uploaded_by: caller.email ?? "sistema",
          is_accounting: true,
        });
      }

      created.push(newTxId);
    }

    // ===== Settlement (advance balance) — unchanged logic =====
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

    const spentFromAdvance = resolved
      .filter((r) => r.paymentOrigin === "advance")
      .reduce((acc, r) => acc + r.total, 0);

    const balance = +(spentFromAdvance - advanceNet).toFixed(2);
    let settlementType: "refund" | "reinforcement" | "balanced" = "balanced";
    let settlementTxId: string | null = null;

    const settlementAccountId = body.settlement_account_id ?? advanceAccountId;
    const SETTLEMENT_TOLERANCE = 0.01;

    if (advanceNet > 0 && Math.abs(balance) >= SETTLEMENT_TOLERANCE && settlementAccountId) {
      const settlementEventId = session.master_event_id ?? primaryEventId;
      if (balance > 0) {
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
          settlementTxId = (stx as any).id;
        }
      } else {
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
          settlementTxId = (stx as any).id;
        }
      }
    }

    const allFailed = created.length === 0 && errors.length > 0;

    if (!allFailed) {
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
    }

    const integrationStatus = allFailed
      ? "failed"
      : errors.length === 0
        ? "success"
        : "partial";

    await adminClient.from("camarim_integrations").insert({
      session_id: body.session_id,
      integration_type: "transactions",
      status: integrationStatus,
      created_by: caller.id,
      summary_payload: {
        consolidated_groups: created.length,
        items_integrated: resolved.length,
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

    if (allFailed) {
      return json({
        success: false,
        error: "Nenhuma transação foi gerada — verifica os pré-requisitos.",
        created: 0,
        total_items: items.length,
        errors,
      }, 422);
    }

    return json({
      success: true,
      created: created.length, // number of CONSOLIDATED transactions (not items)
      consolidated_groups: created.length,
      items_integrated: resolved.length,
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
