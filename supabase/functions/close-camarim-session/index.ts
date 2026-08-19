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
      .select(
        "id,title,status,currency,master_event_id,opened_at,closed_at,company_id,fund_holder_type,fund_holder_supplier_id,fund_holder_user_id",
      )
      .eq("id", body.session_id)
      .single();
    if (sErr || !session) return json({ error: "Sessão não encontrada" }, 404);
    if (session.status === "integrated") return json({ error: "Sessão já integrada" }, 422);
    if (session.status !== "closed" && session.status !== "in_review") {
      return json({ error: "Apenas sessões em revisão ou fechadas podem ser integradas" }, 422);
    }

    // MULTI-TENANT GUARD: caller must belong to the session's company.
    {
      const { data: callerProfile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", caller.id).maybeSingle();
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
      const callerCompanyId = isPa
        ? (callerProfile?.active_company_id ?? callerProfile?.company_id ?? null)
        : (callerProfile?.company_id ?? null);
      const allowCrossTenant = isPa && callerCompanyId == null;
      if (!allowCrossTenant && (session as any).company_id !== callerCompanyId) {
        return json({ error: "Cross-tenant access denied" }, 403);
      }
    }

    // ===== ADMINISTRADORA (obrigatória) =====
    // A sessão tem de estar associada a uma entidade cadastrada (supplier) — a mesma
    // pessoa que recebeu o adiantamento. É ela o supplier_id das transações agregadas
    // e a contraparte do acerto de adiantamento.
    let administratorSupplierId: string | null =
      (session as any).fund_holder_type === "supplier"
        ? ((session as any).fund_holder_supplier_id ?? null)
        : null;
    if (!administratorSupplierId && (session as any).fund_holder_user_id) {
      // Colaborador: a entidade é o fornecedor vinculado ao perfil (mesmo padrão dos reembolsos).
      const { data: holderProfile } = await adminClient
        .from("profiles")
        .select("linked_supplier_id")
        .eq("id", (session as any).fund_holder_user_id)
        .maybeSingle();
      administratorSupplierId = (holderProfile as any)?.linked_supplier_id ?? null;
    }
    if (!administratorSupplierId) {
      return json({
        error:
          "Sessão sem administradora definida. Edita a sessão e escolhe o responsável pelo caixa " +
          "(prestador externo do cadastro, ou colaborador com fornecedor vinculado) antes de integrar.",
      }, 422);
    }

    const sessionPaymentRef = `CAMARIM-${String(session.id).slice(0, 8).toUpperCase()}`;


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
      // DB constraint: iva_rate ∈ {0, 6, 13, 23}. Faturas com linhas em
      // taxas mistas dão rácios intermédios (ex.: 17%, 20%) — fazemos
      // snap para a taxa PT válida mais próxima. O valor real do IVA
      // continua preservado em base_amount/iva_amount/total_amount.
      const ALLOWED_IVA_RATES = [0, 6, 13, 23];
      const rawRate = base > 0 ? (iva / base) * 100 : 0;
      const ivaRate = ALLOWED_IVA_RATES.reduce((best, r) =>
        Math.abs(r - rawRate) < Math.abs(best - rawRate) ? r : best
      , 0);

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
    // Inclui o destino de BP (bp_scope) para nunca misturar rateio Master com despesa local.
    const groupKey = (r: ResolvedItem) =>
      [
        r.eventId,
        (r.raw.bp_scope as string | null) ?? "",
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
      // Soma os IVAs reais dos items (preserva o valor exato do recibo).
      const realIvaSum = +groupItems.reduce((s, i) => s + i.iva, 0).toFixed(2);
      // CORE RULE do projeto: transactions.amount é o valor LÍQUIDO (sem IVA).
      // Recalculamos a base a partir do total e da snapped iva_rate para que
      // os consumidores (DRE, Relatório IVA, BP vs Real) que fazem
      // `iva = amount × iva_rate / 100` produzam o IVA mais próximo possível
      // do real. Pequena distorção (cêntimos) só na taxa reportada.
      const snappedRate = first.ivaRate; // já snapped em {0,6,13,23}
      const baseAmount = snappedRate > 0
        ? +(totalAmount / (1 + snappedRate / 100)).toFixed(2)
        : totalAmount;
      const ivaAmount = +(totalAmount - baseAmount).toFixed(2);
      // Diff em c\u00eantimos vs IVA real do recibo, para diagn\u00f3stico nas notas.
      const ivaDriftCents = Math.round(Math.abs(ivaAmount - realIvaSum) * 100);

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

      const receiptWord = itemCount === 1 ? "recibo" : "recibos";
      const originSuffix = first.paymentOrigin === "advance" ? "" : ` · ${originLabel}`;
      const description =
        `Camarim — ${session.title} (${itemCount} ${receiptWord}, IVA ${first.ivaRate}%)${originSuffix}`
          .slice(0, 250);

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

      const ivaNote = ivaDriftCents > 1
        ? `\nIVA real do recibo: ${realIvaSum.toFixed(2)}€ · IVA recalculado a ${snappedRate}%: ${ivaAmount.toFixed(2)}€ · desvio ${(ivaDriftCents/100).toFixed(2)}€ (taxas mistas no recibo)`
        : "";

      const txPayload: Record<string, unknown> = {
        description,
        type: "expense",
        amount: baseAmount, // CORE RULE: net (sem IVA)
        iva_rate: snappedRate,
        event_id: first.eventId,
        category_id: camarimCategoryId, // FORCED to 2.6.04 — Camarins
        supplier_id: administratorSupplierId, // administradora da sessão (recebeu o adiantamento)
        payment_reference: sessionPaymentRef,
        specification: specification + ivaNote,
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

    // ===== Generate Camarim Dossier (HTML) and attach to every consolidated tx =====
    if (created.length > 0) {
      try {
        const allItemDocs = await adminClient
          .from("camarim_item_documents")
          .select("file_path,file_name,item_id")
          .in("item_id", resolved.map((r) => r.raw.id as string));

        const dossierHtml = buildCamarimDossierHtml({
          session,
          resolved,
          itemDocs: (allItemDocs.data ?? []) as any[],
          tagLabel: {
            bebidas: "Bebidas",
            comida: "Comida",
            higiene: "Higiene e Consumíveis",
            equipa: "Equipa Camarim",
            outros: "Outros / Sem classificação",
          },
        });

        const dossierPath = `dossiers/${body.session_id}.html`;
        const { error: upErr } = await adminClient.storage
          .from("camarim-documents")
          .upload(dossierPath, new Blob([dossierHtml], { type: "text/html; charset=utf-8" }), {
            upsert: true,
            contentType: "text/html; charset=utf-8",
          });

        if (upErr) {
          errors.push(`Dossier: upload falhou — ${upErr.message}`);
        } else {
          const dossierName = `Dossier Camarim · ${session.title}.html`;
          const dossierRows = created.map((txId) => ({
            transaction_id: txId,
            name: dossierName,
            file_url: `camarim://${dossierPath}`,
            doc_type: "outro",
            uploaded_by: caller.email ?? "sistema",
            is_accounting: true,
          }));
          const { error: dossierLinkErr } = await adminClient
            .from("transaction_documents")
            .insert(dossierRows);
          if (dossierLinkErr) {
            errors.push(`Dossier: vínculo falhou — ${dossierLinkErr.message}`);
          }
        }
      } catch (dErr: any) {
        errors.push(`Dossier: ${dErr?.message ?? String(dErr)}`);
      }
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
            supplier_id: body.settlement_supplier_id ?? administratorSupplierId,
            payment_reference: sessionPaymentRef,
            specification: `Acerto automático do adiantamento da sessão ${session.title} (reembolso à administradora)`,
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
            supplier_id: body.settlement_supplier_id ?? administratorSupplierId,
            payment_reference: sessionPaymentRef,
            specification: `Acerto automático do adiantamento da sessão ${session.title} (devolução de caixa em mão pela administradora)`,
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

    // IDs de todas as transações geradas (consolidadas + settlement)
    const allTxIds = [...created, ...(settlementTxId ? [settlementTxId] : [])];

    // ===== Auditoria: registar a origem de cada transação criada (autor real) =====
    if (allTxIds.length > 0) {
      const auditRows = allTxIds.map((txId) => ({
        transaction_id: txId,
        field_name: "created_by_camarim_integration",
        old_value: null,
        new_value: `Sessão de camarim ${session.title} (${sessionPaymentRef})${
          txId === settlementTxId ? " · acerto de adiantamento" : " · agregado por taxa de IVA"
        }`,
        changed_by: caller.id,
        company_id: (session as any).company_id,
      }));
      const { error: auditErr } = await adminClient
        .from("transaction_audit_log")
        .insert(auditRows);
      if (auditErr) errors.push(`Auditoria: ${auditErr.message}`);
    }



    // Snapshot completo do resumo
    const integrationSummary = {
      generated_at: new Date().toISOString(),
      generated_by: caller.email ?? caller.id,
      session_title: session.title,
      currency: session.currency ?? "EUR",
      integrated_by_user_id: caller.id,
      administrator_supplier_id: administratorSupplierId,
      aggregation_mode: "hybrid_by_iva_rate",
      payment_reference: sessionPaymentRef,
      consolidated_groups: created.length,
      consolidated_transaction_ids: created,
      items_integrated: resolved.length,
      total_items: items.length,
      total_base: +resolved.reduce((s, r) => s + r.base, 0).toFixed(2),
      total_iva: +resolved.reduce((s, r) => s + r.iva, 0).toFixed(2),
      total_amount: +resolved.reduce((s, r) => s + r.total, 0).toFixed(2),
      by_origin: {
        advance: +resolved.filter(r => r.paymentOrigin === "advance").reduce((s, r) => s + r.total, 0).toFixed(2),
        card: +resolved.filter(r => r.paymentOrigin === "card").reduce((s, r) => s + r.total, 0).toFixed(2),
        out_of_pocket: +resolved.filter(r => r.paymentOrigin === "out_of_pocket").reduce((s, r) => s + r.total, 0).toFixed(2),
      },
      settlement: {
        advance_net: advanceNet,
        spent_from_advance: spentFromAdvance,
        balance,
        type: settlementType,
        transaction_id: settlementTxId,
      },
      parked_remaining: (stillParked ?? []).length,
      error_count: errors.length,
      errors,
    };

    if (!allFailed) {
      await adminClient
        .from("camarim_sessions")
        .update({
          status: "integrated",
          integrated_at: new Date().toISOString(),
          integrated_by: caller.id,
          advance_total: advanceNet,
          spent_total: spentFromAdvance,
          settlement_balance: balance,
          settlement_type: settlementType,
          settlement_transaction_id: settlementTxId,
          integration_summary: integrationSummary,
          integration_transaction_ids: allTxIds,
        })
        .eq("id", body.session_id);
    }

    const integrationStatus = allFailed
      ? "failed"
      : errors.length === 0
        ? "done"
        : "partial";

    await adminClient.from("camarim_integrations").insert({
      session_id: body.session_id,
      integration_type: "financial_close",
      status: integrationStatus,
      created_by: caller.id,
      summary_payload: integrationSummary,
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
      consolidated_transaction_ids: created,
      transaction_ids: allTxIds,
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
      summary: integrationSummary,
    });
  } catch (err: any) {
    console.error("[close-camarim-session] Unhandled error:", err?.stack ?? err?.message ?? String(err));
    return json({ error: err?.message ?? String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  if (status >= 400) {
    console.error(`[close-camarim-session] ${status} →`, JSON.stringify(payload));
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number, cur = "EUR"): string {
  return `${n.toFixed(2)} ${cur}`;
}

function buildCamarimDossierHtml(args: {
  session: any;
  resolved: any[];
  itemDocs: { file_path: string; file_name: string; item_id: string }[];
  tagLabel: Record<string, string>;
}): string {
  const { session, resolved, itemDocs, tagLabel } = args;
  const cur = session.currency ?? "EUR";

  const totalBase = resolved.reduce((s, r) => s + Number(r.base ?? 0), 0);
  const totalIva = resolved.reduce((s, r) => s + Number(r.iva ?? 0), 0);
  const totalTotal = resolved.reduce((s, r) => s + Number(r.total ?? 0), 0);

  // Aggregate by tag
  const tagAgg = new Map<string, { count: number; total: number }>();
  for (const r of resolved) {
    const tag = (r.raw.analytic_tag as string | null) ?? "outros";
    const cur2 = tagAgg.get(tag) ?? { count: 0, total: 0 };
    cur2.count += 1;
    cur2.total += Number(r.total ?? 0);
    tagAgg.set(tag, cur2);
  }
  const tagsRows = Array.from(tagAgg.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tag, v]) =>
      `<tr><td>${escapeHtml(tagLabel[tag] ?? tag)}</td><td class="num">${v.count}</td><td class="num">${fmtMoney(v.total, cur)}</td></tr>`,
    ).join("");

  // Items rows
  const docsByItem = new Map<string, string[]>();
  for (const d of itemDocs) {
    const arr = docsByItem.get(d.item_id) ?? [];
    arr.push(d.file_name ?? "talão");
    docsByItem.set(d.item_id, arr);
  }

  const itemsRows = resolved
    .sort((a, b) => String(a.raw.document_date ?? "").localeCompare(String(b.raw.document_date ?? "")))
    .map((r) => {
      const it = r.raw;
      const tag = it.analytic_tag ? (tagLabel[it.analytic_tag] ?? it.analytic_tag) : "—";
      const docs = docsByItem.get(it.id) ?? [];
      const docInfo = docs.length > 0
        ? `${docs.length} talão(ões): ${docs.map(escapeHtml).join(", ")}`
        : (it.approved_without_document ? `<i>Aprovado sem documento — ${escapeHtml(it.approved_without_document_reason ?? "")}</i>` : "—");
      const origin = r.paymentOrigin === "advance" ? "Adiantamento"
        : r.paymentOrigin === "card" ? "Cartão" : "Reembolso";
      return `<tr>
        <td>${escapeHtml(it.document_date ?? "—")}</td>
        <td>${escapeHtml(it.supplier_name_raw ?? "—")}<br><small>${escapeHtml(it.document_number ?? "(sem nº)")}</small></td>
        <td>${escapeHtml(it.service_description ?? "—")}</td>
        <td>${escapeHtml(tag)}</td>
        <td>${escapeHtml(origin)}</td>
        <td class="num">${fmtMoney(Number(it.base_amount), cur)}</td>
        <td class="num">${fmtMoney(Number(it.iva_amount), cur)}</td>
        <td class="num"><b>${fmtMoney(Number(it.total_amount), cur)}</b></td>
        <td><small>${docInfo}</small></td>
      </tr>`;
    }).join("");

  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Dossier Camarim — ${escapeHtml(session.title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; font-size: 11px; line-height: 1.45; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccc; }
  .meta { color: #555; font-size: 10px; margin-bottom: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 8px; }
  .card .label { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
  .card .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: .03em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  small { color: #666; font-size: 9px; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #888; text-align: center; }
  .badge { display: inline-block; background: #eef; color: #225; padding: 1px 6px; border-radius: 3px; font-size: 9px; margin-right: 4px; }
  @media print { .no-print { display: none; } body { font-size: 10px; } }
</style>
</head>
<body>
  <h1>Dossier de Camarim</h1>
  <div class="meta">
    <b>${escapeHtml(session.title)}</b><br>
    Sessão aberta: ${escapeHtml(session.opened_at?.slice(0, 10) ?? "—")}
    · Fechada: ${escapeHtml(session.closed_at?.slice(0, 10) ?? "—")}
    · Gerado: ${escapeHtml(generatedAt)}<br>
    Categoria contabilística: <span class="badge">2.6.04 — Camarins</span>
    Itens consolidados: ${resolved.length} · Moeda: ${escapeHtml(cur)}
  </div>

  <div class="summary">
    <div class="card"><div class="label">Total Base</div><div class="value">${fmtMoney(totalBase, cur)}</div></div>
    <div class="card"><div class="label">Total IVA</div><div class="value">${fmtMoney(totalIva, cur)}</div></div>
    <div class="card"><div class="label">Total Geral</div><div class="value">${fmtMoney(totalTotal, cur)}</div></div>
  </div>

  <h2>Resumo por Tag Analítica</h2>
  <table>
    <thead><tr><th>Tag</th><th class="num">Itens</th><th class="num">Total</th></tr></thead>
    <tbody>${tagsRows || `<tr><td colspan="3"><i>Sem tags atribuídas</i></td></tr>`}</tbody>
  </table>

  <h2>Detalhe dos Itens (${resolved.length})</h2>
  <table>
    <thead><tr>
      <th>Data</th><th>Fornecedor / Doc</th><th>Descrição</th><th>Tag</th><th>Origem</th>
      <th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th><th>Talões</th>
    </tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="footer">
    Documento gerado automaticamente pelo MP Gestão Eventos no fecho da sessão de camarim.<br>
    Os talões originais estão arquivados como anexos individuais nas transações consolidadas.
  </div>
</body>
</html>`;
}
