import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * D17 — Integração (fecho) de uma sessão de cartão pré-pago, no modelo do camarim.
 *
 * As despesas do cartão são ITENS durante a sessão (`card_session_items`) e só
 * viram transações aqui, consolidadas:
 *   - itens COM evento  → grupo (event_id × category_id × iva_rate)
 *   - itens SEM evento  → grupo (category_id × iva_rate), FORA do BP por completo
 *     (sem linha, sem gate D1/D8, sem forecast_id) — rubricas 10.x
 *
 * D1+D8: cada par (evento × rubrica) de um evento `with_bp` exige linha de BP.
 * D2 (revista 03/09): se a soma do grupo fizer o realizado da linha ultrapassar
 * a verba, a linha é ELEVADA no mesmo acto (`budget_raises`), antes de se criar
 * qualquer transação.
 *
 * A conciliação de saldo replica exactamente o modal antigo e inclui as
 * transações directas antigas já carimbadas com `card_session_id` (sessões
 * abertas antes do novo modelo): tratam-se como gasto JÁ INTEGRADO e não se
 * tocam. Uma sessão pode misturar antigas + itens novos, ou ter só antigas e
 * zero itens — nesse caso fecha consolidando zero grupos.

 */

interface ParkedDecision {
  item_id: string;
  decision: "reject" | "approve_without_doc" | "defer";
  reason?: string;
}

interface ForecastLine {
  event_id: string;
  category_id: string;
  forecast_id: string;
}

interface BudgetRaise {
  forecast_id: string;
  new_amount: number;
  observation: string;
}

interface RequestBody {
  session_id: string;
  parked_decisions?: ParkedDecision[];
  forecast_lines?: ForecastLine[];
  budget_raises?: BudgetRaise[];
  confirmed_balance?: number | null;
  create_adjustment?: boolean;
  adjustment_note?: string | null;
  /**
   * OPCIONAL, DESLIGADO POR DEFEITO (decisão pendente do Pedro).
   * Quando `true`, as transações directas ANTIGAS desta sessão (carimbadas com
   * `card_session_id`, sem item de origem, ainda sem `forecast_id`) cujo par
   * (event_id × category_id) coincida com um par escolhido em `forecast_lines`
   * adoptam essa linha de BP: `transactions.forecast_id` é actualizado, fica
   * registo em `transaction_audit_log` ('bp_line_adopted_at_card_close') e o
   * valor líquido entra no cálculo do excesso (D2) dessa linha.
   * Nenhuma UI passa esta flag — só existe no contrato da função.
   */
  adopt_legacy_lines?: boolean;
}


const ALLOWED_IVA_RATES = [0, 6, 13, 23];
const round2 = (n: number) => Math.round(n * 100) / 100;

function snapRate(rate: number): number {
  return ALLOWED_IVA_RATES.reduce(
    (best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best),
    0,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Não autorizado" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as RequestBody;
    if (!body?.session_id) return json({ error: "session_id obrigatório" }, 400);

    // ===== Sessão =====
    const { data: session, error: sErr } = await adminClient
      .from("card_sessions")
      .select(
        "id,company_id,card_account_id,holder_name,holder_profile_id,primary_event_id,opening_balance,status,opened_at,notes",
      )
      .eq("id", body.session_id)
      .single();
    if (sErr || !session) return json({ error: "Sessão não encontrada" }, 404);
    if ((session as any).status === "closed") return json({ error: "Sessão já fechada" }, 422);

    const sessionCompanyId = (session as any).company_id as string;
    const cardAccountId = (session as any).card_account_id as string;

    // ===== Guard multi-tenant =====
    const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
    {
      const { data: callerProfile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", caller.id).maybeSingle();
      const callerCompanyId = isPa
        ? ((callerProfile as any)?.active_company_id ?? (callerProfile as any)?.company_id ?? null)
        : ((callerProfile as any)?.company_id ?? null);
      const allowCrossTenant = isPa && callerCompanyId == null;
      if (!allowCrossTenant && sessionCompanyId !== callerCompanyId) {
        return json({ error: "Cross-tenant access denied" }, 403);
      }
    }

    // ===== Autorização por permissão (integrar cria transações pagas) =====
    {
      let allowed = isPa === true;
      if (!allowed) {
        const { data: hasPerm } = await adminClient.rpc("has_permission_in", {
          _user_id: caller.id,
          _permission: "approve_transactions",
          _company_id: sessionCompanyId,
        });
        allowed = hasPerm === true;
      }
      if (!allowed) return json({ error: "Sem permissão para aprovar transações nesta empresa." }, 403);
    }

    const cardName = await (async () => {
      const { data } = await adminClient
        .from("financial_accounts").select("name, initial_balance").eq("id", cardAccountId).maybeSingle();
      return { name: (data as any)?.name ?? "Cartão", initial: Number((data as any)?.initial_balance ?? 0) };
    })();

    const sessionPaymentRef = `CARTAO-${String(session.id).slice(0, 8).toUpperCase()}`;

    // ===== Decisões sobre itens parqueados (submitted) =====
    for (const d of body.parked_decisions ?? []) {
      if (!d.item_id) continue;
      if (d.decision === "reject") {
        await adminClient
          .from("card_session_items")
          .update({ status: "rejected", rejection_reason: d.reason ?? "Rejeitado no fecho da sessão", reviewed_by: caller.id, reviewed_at: new Date().toISOString() })
          .eq("id", d.item_id)
          .eq("session_id", body.session_id)
          .eq("status", "submitted");
      } else if (d.decision === "approve_without_doc") {
        if (!d.reason?.trim()) {
          return json({ error: `Item ${d.item_id}: justificação obrigatória para aprovar sem documento.` }, 422);
        }
        await adminClient
          .from("card_session_items")
          .update({
            status: "approved",
            approved_without_document: true,
            approved_without_document_reason: d.reason.trim(),
            reviewed_by: caller.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", d.item_id)
          .eq("session_id", body.session_id)
          .eq("status", "submitted");
      }
      // 'defer' → nada
    }

    // ===== Sobras submitted bloqueiam a integração =====
    const { data: stillParked } = await adminClient
      .from("card_session_items")
      .select("id, description, supplier_name, amount, iva_rate, item_date")
      .eq("session_id", body.session_id)
      .eq("status", "submitted");
    if ((stillParked ?? []).length > 0) {
      return json({
        error: "Há despesas por rever nesta sessão — decide item a item antes de integrar.",
        parked_items: stillParked,
      }, 422);
    }

    // ===== Itens aprovados =====
    const { data: items, error: iErr } = await adminClient
      .from("card_session_items")
      .select("*")
      .eq("session_id", body.session_id)
      .eq("status", "approved");
    if (iErr) return json({ error: iErr.message }, 500);

    // ===== Transações DIRECTAS ANTIGAS desta sessão (modelo pré-D17) =====
    // Sessões abertas antes do novo modelo podem ter despesas lançadas
    // directamente na conta do cartão e carimbadas com `card_session_id`, sem
    // item de origem. Não se tocam (entram só na conciliação de saldo) — salvo
    // se `adopt_legacy_lines` estiver ligado. A sessão fecha mesmo que só tenha
    // transações antigas e ZERO itens novos (consolida zero grupos).
    const { data: legacyTxsRaw } = await adminClient
      .from("transactions")
      .select("id, description, amount, paid_amount, iva_rate, event_id, category_id, forecast_id, date, payment_date, type")
      .eq("card_session_id", body.session_id);
    const legacyTxs = ((legacyTxsRaw ?? []) as any[]).filter(
      (t) => !((items ?? []) as any[]).some((it) => it.transaction_id === t.id),
    );



    // ===== Grupos de consolidação =====
    type Resolved = {
      raw: any;
      eventId: string | null;
      categoryId: string;
      ivaRate: number;
      base: number;
      iva: number;
      total: number;
    };
    const resolved: Resolved[] = [];
    const preflightErrors: string[] = [];

    for (const it of (items ?? []) as any[]) {
      if (!it.category_id) {
        preflightErrors.push(
          `Item ${it.description ?? it.supplier_name ?? it.id}: sem rubrica (L3) — classifica antes de integrar.`,
        );
        continue;
      }
      const rate = snapRate(Number(it.iva_rate ?? 0));
      const base = round2(Number(it.amount ?? 0));
      const total = round2(base * (1 + rate / 100));
      resolved.push({
        raw: it,
        eventId: (it.event_id as string | null) ?? null,
        categoryId: it.category_id as string,
        ivaRate: rate,
        base,
        iva: round2(total - base),
        total,
      });
    }
    if (preflightErrors.length > 0) {
      return json({ error: "Corrige os itens antes de integrar.", errors: preflightErrors }, 422);
    }

    const groupKey = (r: Resolved) => [r.eventId ?? "", r.categoryId, r.ivaRate].join("|");
    const groups = new Map<string, Resolved[]>();
    for (const r of resolved) {
      const arr = groups.get(groupKey(r)) ?? [];
      arr.push(r);
      groups.set(groupKey(r), arr);
    }

    // ===== D1+D8 — linha de BP por par (evento × rubrica) em eventos with_bp =====
    const eventIds = [...new Set(resolved.map((r) => r.eventId).filter(Boolean) as string[])];
    const withBp = new Set<string>();
    for (const evId of eventIds) {
      const { data: mode } = await adminClient.rpc("event_budget_mode", { _event_id: evId });
      if (mode === "with_bp") withBp.add(evId);
    }

    const lines = body.forecast_lines ?? [];
    const lineFor = (eventId: string, categoryId: string) =>
      lines.find((l) => l.event_id === eventId && l.category_id === categoryId)?.forecast_id ?? null;

    /** forecast_id atribuído a cada grupo (só grupos com evento with_bp). */
    const forecastByGroup = new Map<string, string>();
    const missingLines: { event_id: string; category_id: string; total_base: number }[] = [];

    for (const [key, groupItems] of groups.entries()) {
      const first = groupItems[0];
      if (!first.eventId || !withBp.has(first.eventId)) continue;
      const fid = lineFor(first.eventId, first.categoryId);
      if (!fid) {
        missingLines.push({
          event_id: first.eventId,
          category_id: first.categoryId,
          total_base: round2(groupItems.reduce((s, i) => s + i.base, 0)),
        });
        continue;
      }
      const { data: fc, error: fcErr } = await adminClient
        .from("event_forecasts")
        .select("id,event_id,category_id")
        .eq("id", fid)
        .maybeSingle();
      if (fcErr) return json({ error: `Erro ao validar a linha de BP: ${fcErr.message}` }, 500);
      if (!fc) return json({ error: "Uma das linhas de BP indicadas não existe." }, 422);
      if ((fc as any).event_id !== first.eventId) {
        return json({ error: "Uma linha de BP indicada não pertence ao evento do grupo." }, 422);
      }
      if ((fc as any).category_id !== first.categoryId) {
        return json({ error: "Uma linha de BP indicada não é da rubrica do grupo." }, 422);
      }
      forecastByGroup.set(key, fid);
    }

    if (missingLines.length > 0) {
      return json({
        error: "Evento gerido com BP: escolhe a linha de BP para cada rubrica antes de integrar.",
        missing_bp_lines: missingLines,
      }, 422);
    }

    // ===== D2 — excesso de verba por linha (pré-voo + aplicação antes das TXs) =====
    /** Soma, por forecast_id, das bases líquidas a integrar. */
    const toApproveByLine = new Map<string, number>();
    for (const [key, groupItems] of groups.entries()) {
      const fid = forecastByGroup.get(key);
      if (!fid) continue;
      toApproveByLine.set(
        fid,
        round2((toApproveByLine.get(fid) ?? 0) + groupItems.reduce((s, i) => s + i.base, 0)),
      );
    }

    // Adopção OPCIONAL das transações antigas por linha de BP (desligada por
    // defeito). Só entram as que já tenham evento + rubrica, ainda sem linha, e
    // cujo par coincida com um `forecast_lines` indicado pelo chamador.
    const legacyAdoptions: { transaction_id: string; forecast_id: string; amount: number }[] = [];
    if (body.adopt_legacy_lines === true) {
      for (const t of legacyTxs) {
        if (t.forecast_id) continue;
        if (!t.event_id || !t.category_id) continue;
        if (t.type !== "expense") continue;
        const fid = lineFor(t.event_id as string, t.category_id as string);
        if (!fid) continue;
        const base = round2(Number(t.amount ?? 0));
        legacyAdoptions.push({ transaction_id: t.id as string, forecast_id: fid, amount: base });
        toApproveByLine.set(fid, round2((toApproveByLine.get(fid) ?? 0) + base));
      }
      // A linha indicada tem de pertencer mesmo ao par (evento × rubrica).
      for (const a of legacyAdoptions) {
        const { data: fc } = await adminClient
          .from("event_forecasts").select("id,event_id,category_id").eq("id", a.forecast_id).maybeSingle();
        const tx = legacyTxs.find((t) => t.id === a.transaction_id);
        if (!fc || (fc as any).event_id !== tx?.event_id || (fc as any).category_id !== tx?.category_id) {
          return json({ error: "Adopção de transação antiga: a linha de BP não corresponde ao evento/rubrica." }, 422);
        }
      }
    }



    const budgetExcess: any[] = [];
    const raisesToApply: { forecast_id: string; old: number; next: number; observation: string; company_id: string }[] = [];


    for (const [fid, toApprove] of toApproveByLine.entries()) {
      const { data: fcFull } = await adminClient
        .from("event_forecasts")
        .select("id,description,specification,amount,baseline_amount,company_id")
        .eq("id", fid)
        .maybeSingle();

      const { data: realizedRows } = await adminClient
        .from("transactions")
        .select("amount, is_transitory, exclude_from_result, reversed_at, is_hidden")
        .eq("forecast_id", fid)
        .in("status", ["approved", "paid"]);
      const realized = round2(
        ((realizedRows ?? []) as any[])
          .filter((r) =>
            r.is_transitory !== true && r.exclude_from_result !== true &&
            r.reversed_at == null && r.is_hidden !== true
          )
          .reduce((s, r) => s + Number(r.amount ?? 0), 0),
      );

      const lineAmount = round2(Number((fcFull as any)?.amount ?? 0));
      const excess = round2(realized + toApprove - lineAmount);
      if (excess <= 0) continue;

      const suggested = round2(realized + toApprove);
      const raise = (body.budget_raises ?? []).find((r) => r.forecast_id === fid) ?? null;

      if (!raise) {
        budgetExcess.push({
          forecast_id: fid,
          description:
            [(fcFull as any)?.description, (fcFull as any)?.specification].filter(Boolean).join(" · ") ||
            "(sem descrição)",
          line_amount: lineAmount,
          baseline_amount:
            (fcFull as any)?.baseline_amount == null ? null : round2(Number((fcFull as any).baseline_amount)),
          realized,
          to_approve: toApprove,
          excess,
          suggested_amount: suggested,
        });
        continue;
      }

      const newAmount = round2(Number(raise.new_amount));
      const observation = typeof raise.observation === "string" ? raise.observation.trim() : "";
      if (!Number.isFinite(newAmount) || newAmount < suggested) {
        return json({ error: `A nova verba da linha tem de ser pelo menos ${suggested.toFixed(2)} €.` }, 422);
      }
      if (!observation) {
        return json({ error: "Observação obrigatória para elevar a verba da linha de BP." }, 422);
      }
      raisesToApply.push({
        forecast_id: fid,
        old: lineAmount,
        next: newAmount,
        observation,
        company_id: (fcFull as any)?.company_id,
      });
    }

    if (budgetExcess.length > 0) {
      return json({
        error: "As despesas desta sessão excedem a verba de linhas de BP.",
        budget_excess: budgetExcess,
      }, 422);
    }

    if (raisesToApply.length > 0 && !isPa) {
      const { data: canRaise } = await adminClient.rpc("has_permission_in", {
        _user_id: caller.id,
        _permission: "raise_budget",
        _company_id: sessionCompanyId,
      });
      if (!canRaise) return json({ error: "Sem permissão para elevar verbas de BP nesta empresa." }, 403);
    }

    // Aplicar raises ANTES de criar transações (baseline_amount NUNCA é tocado — D3).
    for (const r of raisesToApply) {
      const { error: upErr } = await adminClient
        .from("event_forecasts").update({ amount: r.next }).eq("id", r.forecast_id);
      if (upErr) return json({ error: `Falha ao elevar a verba da linha de BP: ${upErr.message}` }, 500);
      const { error: logErr } = await adminClient.from("forecast_audit_log").insert({
        forecast_id: r.forecast_id,
        changed_by: caller.email ?? caller.id,
        field_name: "Valor (EUR)",
        old_value: r.old.toFixed(2),
        new_value: r.next.toFixed(2),
        observation: r.observation,
        company_id: r.company_id ?? sessionCompanyId,
      });
      if (logErr) console.error("[close-card-session] forecast_audit_log error:", logErr);
    }

    // Adopção das transações antigas (só quando `adopt_legacy_lines` = true).
    const legacyAdopted: string[] = [];
    for (const a of legacyAdoptions) {
      const { error: upErr } = await adminClient
        .from("transactions").update({ forecast_id: a.forecast_id }).eq("id", a.transaction_id);
      if (upErr) {
        console.error("[close-card-session] adopção legado falhou:", upErr);
        continue;
      }
      legacyAdopted.push(a.transaction_id);
      await adminClient.from("transaction_audit_log").insert({
        transaction_id: a.transaction_id,
        field_name: "bp_line_adopted_at_card_close",
        old_value: null,
        new_value: a.forecast_id,
        changed_by: caller.email ?? caller.id,
        company_id: sessionCompanyId,
      });
    }



    // ===== Consolidação: uma transação paga por grupo =====
    const created: string[] = [];
    const errors: string[] = [];
    const sessionDateFallback = new Date((session as any).opened_at).toISOString().slice(0, 10);

    // Rótulos das rubricas / eventos para descrições legíveis
    const categoryIds = [...new Set(resolved.map((r) => r.categoryId))];
    const { data: cats } = await adminClient
      .from("account_categories").select("id,code,name").in("id", categoryIds);
    const catById = new Map(((cats ?? []) as any[]).map((c) => [c.id, c]));
    const { data: evs } = eventIds.length
      ? await adminClient.from("events").select("id,name").in("id", eventIds)
      : { data: [] as any[] };
    const evById = new Map(((evs ?? []) as any[]).map((e) => [e.id, e]));

    for (const [key, groupItems] of groups.entries()) {
      const first = groupItems[0];
      const rate = first.ivaRate;
      const totalAmount = round2(groupItems.reduce((s, i) => s + i.total, 0));
      const baseAmount = rate > 0 ? round2(totalAmount / (1 + rate / 100)) : totalAmount;
      const cat = catById.get(first.categoryId) as any;
      const ev = first.eventId ? (evById.get(first.eventId) as any) : null;

      const dates = groupItems.map((g) => g.raw.item_date).filter(Boolean).sort();
      const txDate = (dates[dates.length - 1] as string) ?? sessionDateFallback;

      const itemCount = groupItems.length;
      const receiptWord = itemCount === 1 ? "despesa" : "despesas";
      const description =
        `Cartão ${cardName.name} — ${cat?.name ?? "despesas"} (${itemCount} ${receiptWord}, IVA ${rate}%)`
          .slice(0, 250);

      const supplierList = [...new Set(
        groupItems.map((g) => (g.raw.supplier_name as string | null)?.trim()).filter(Boolean) as string[],
      )].slice(0, 8).join(", ");
      const detail = groupItems
        .map((g) =>
          `${g.raw.item_date} · ${(g.raw.supplier_name ?? "—")} · ${(g.raw.description ?? "—")} · ${g.total.toFixed(2)}€`
        )
        .join("\n");

      const specification = [
        `Sessão de cartão: ${cardName.name} · portador ${(session as any).holder_name}`,
        ev ? `Evento: ${ev.name}` : "Sem evento (custo de estrutura)",
        `Rubrica: ${cat?.code ?? "?"} — ${cat?.name ?? "?"}`,
        `Itens consolidados: ${itemCount}`,
        supplierList ? `Fornecedores: ${supplierList}` : null,
        `IVA: ${rate}%`,
        "",
        detail,
      ].filter((x) => x !== null).join("\n");

      const txPayload: Record<string, unknown> = {
        description,
        type: "expense",
        amount: baseAmount, // CORE RULE: líquido
        iva_rate: rate,
        event_id: first.eventId,
        category_id: first.categoryId,
        account_id: cardAccountId,
        payment_reference: sessionPaymentRef,
        specification,
        date: txDate,
        status: "paid",
        paid_amount: totalAmount,
        payment_date: txDate,
        card_session_id: body.session_id,
        company_id: sessionCompanyId,
        forecast_id: forecastByGroup.get(key) ?? null,
      };

      const { data: newTx, error: txErr } = await adminClient
        .from("transactions").insert(txPayload).select("id").single();
      if (txErr) {
        errors.push(`Grupo [${key}]: ${txErr.message}`);
        continue;
      }
      const newTxId = (newTx as any).id as string;

      const itemIds = groupItems.map((g) => g.raw.id as string);
      const { error: linkErr } = await adminClient
        .from("card_session_items")
        .update({ transaction_id: newTxId, status: "integrated" })
        .in("id", itemIds);
      if (linkErr) errors.push(`Grupo [${key}] vínculo: ${linkErr.message}`);

      // Documentos: N por item (card_item_documents) + legado document_path
      const { data: docs } = await adminClient
        .from("card_item_documents")
        .select("file_path,file_name,mime_type,item_id")
        .in("item_id", itemIds);

      const docRefs: { path: string; name: string }[] = [
        ...((docs ?? []) as any[]).map((d) => ({ path: d.file_path as string, name: (d.file_name as string) ?? "documento" })),
        ...groupItems
          .filter((g) => !!g.raw.document_path)
          .map((g) => ({ path: g.raw.document_path as string, name: "talão" })),
      ];
      const seen = new Set<string>();
      for (const d of docRefs) {
        if (seen.has(d.path)) continue;
        seen.add(d.path);
        await adminClient.from("transaction_documents").insert({
          transaction_id: newTxId,
          name: d.name,
          file_url: `card://${d.path}`,
          doc_type: "outro",
          uploaded_by: caller.email ?? "sistema",
          is_accounting: true,
          company_id: sessionCompanyId,
        });
      }

      created.push(newTxId);
    }

    const allFailed = created.length === 0 && errors.length > 0;

    // ===== Dossier HTML =====
    if (created.length > 0) {
      try {
        const { data: allDocs } = await adminClient
          .from("card_item_documents")
          .select("file_path,file_name,item_id")
          .in("item_id", resolved.map((r) => r.raw.id as string));

        const dossierHtml = buildCardDossierHtml({
          session,
          cardName: cardName.name,
          resolved,
          itemDocs: (allDocs ?? []) as any[],
          catById,
          evById,
        });
        const dossierPath = `dossiers/${body.session_id}.html`;
        const { error: upErr } = await adminClient.storage
          .from("card-documents")
          .upload(dossierPath, new Blob([dossierHtml], { type: "text/html; charset=utf-8" }), {
            upsert: true,
            contentType: "text/html; charset=utf-8",
          });
        if (upErr) {
          errors.push(`Dossier: upload falhou — ${upErr.message}`);
        } else {
          const rows = created.map((txId) => ({
            transaction_id: txId,
            name: `Dossier Cartão · ${cardName.name} · ${(session as any).holder_name}.html`,
            file_url: `card://${dossierPath}`,
            doc_type: "outro",
            uploaded_by: caller.email ?? "sistema",
            is_accounting: true,
            company_id: sessionCompanyId,
          }));
          const { error: linkErr } = await adminClient.from("transaction_documents").insert(rows);
          if (linkErr) errors.push(`Dossier: vínculo falhou — ${linkErr.message}`);
        }
      } catch (dErr: any) {
        errors.push(`Dossier: ${dErr?.message ?? String(dErr)}`);
      }
    }

    // ===== Conciliação de saldo (replica o modal antigo) =====
    const { data: loads } = await adminClient
      .from("card_session_loads")
      .select("amount, in_transaction_id")
      .eq("session_id", body.session_id);
    const totalLoads = round2(((loads ?? []) as any[]).reduce((s, l) => s + Number(l.amount ?? 0), 0));
    const loadInIds = new Set(
      ((loads ?? []) as any[]).map((l) => l.in_transaction_id).filter(Boolean) as string[],
    );

    const { data: accountTxs } = await adminClient
      .from("transactions")
      .select("id, description, type, paid_amount, date, payment_date, card_session_id")
      .eq("account_id", cardAccountId);

    const openDay = String((session as any).opened_at ?? "").slice(0, 10);
    const signedOf = (t: any) => (t.type === "income" ? 1 : -1) * Number(t.paid_amount ?? 0);
    const effOf = (t: any) => String(t.payment_date ?? t.date ?? "");

    const overrideOpening = (session as any).opening_balance;
    let dynamicOpening = cardName.initial;
    let directTotal = 0;
    const directMovements: any[] = [];
    let legacySessionSpend = 0; // transações antigas já carimbadas com card_session_id
    let legacySessionCount = 0;
    const newTxIds = new Set(created);

    for (const t of ((accountTxs ?? []) as any[])) {
      const signed = signedOf(t);
      const eff = effOf(t);
      // O carimbo da sessão manda: uma despesa antiga da sessão nunca é
      // confundida com saldo de abertura, mesmo que a data seja anterior.
      if (t.card_session_id === body.session_id) {
        if (!newTxIds.has(t.id)) {
          legacySessionSpend += signed;
          legacySessionCount += 1;
        }
        continue;
      }
      if (eff && openDay && eff < openDay) {
        dynamicOpening += signed;
        continue;
      }
      if (loadInIds.has(t.id)) continue;
      if (signed === 0) continue;
      directMovements.push({ id: t.id, description: t.description, signed, date: eff });
      directTotal += signed;
    }


    const opening = overrideOpening === null || overrideOpening === undefined
      ? round2(dynamicOpening)
      : round2(Number(overrideOpening));
    const newSpendGross = round2(resolved.reduce((s, r) => s + r.total, 0));
    const theoretical = round2(
      opening + totalLoads - newSpendGross + round2(legacySessionSpend) + round2(directTotal),
    );

    const confirmed = body.confirmed_balance === null || body.confirmed_balance === undefined
      ? theoretical
      : round2(Number(body.confirmed_balance));
    const diff = round2(confirmed - theoretical);
    let adjustmentTxId: string | null = null;

    if (!allFailed && body.create_adjustment && Math.abs(diff) > 0.01) {
      const note = (body.adjustment_note ?? "").trim();
      if (!note) {
        return json({
          error: "Explica a origem da diferença de saldo antes de criar o acerto de fecho.",
        }, 422);
      }
      const today = new Date().toISOString().slice(0, 10);
      const amt = Math.abs(diff);
      const { data: adjTx, error: adjErr } = await adminClient
        .from("transactions")
        .insert({
          description: `Acerto de fecho de sessão — cartão ${cardName.name} (${note})`,
          type: diff < 0 ? "expense" : "income",
          amount: amt,
          iva_rate: 0,
          category_id: null,
          account_id: cardAccountId,
          date: today,
          status: "paid",
          paid_amount: amt,
          payment_date: today,
          exclude_from_result: true,
          card_session_id: body.session_id,
          company_id: sessionCompanyId,
        })
        .select("id")
        .single();
      if (adjErr) errors.push(`Acerto de fecho: ${adjErr.message}`);
      else adjustmentTxId = (adjTx as any).id as string;
    }

    const allTxIds = [...created, ...(adjustmentTxId ? [adjustmentTxId] : [])];

    // ===== Auditoria da origem das transações =====
    if (allTxIds.length > 0) {
      const auditRows = allTxIds.map((txId) => ({
        transaction_id: txId,
        field_name: "created_by_card_integration",
        old_value: null,
        new_value: `Sessão de cartão ${cardName.name} · ${(session as any).holder_name} (${sessionPaymentRef})${
          txId === adjustmentTxId ? " · acerto de conciliação de saldo" : " · agregado por evento × rubrica × IVA"
        }`,
        changed_by: caller.email ?? caller.id,
        company_id: sessionCompanyId,
      }));
      const { error: auditErr } = await adminClient.from("transaction_audit_log").insert(auditRows);
      if (auditErr) errors.push(`Auditoria: ${auditErr.message}`);
    }

    const byEvent: Record<string, { name: string; base: number; total: number }> = {};
    for (const r of resolved) {
      const k = r.eventId ?? "__none__";
      const name = r.eventId ? ((evById.get(r.eventId) as any)?.name ?? "—") : "Sem evento (estrutura)";
      const cur = byEvent[k] ?? { name, base: 0, total: 0 };
      cur.base = round2(cur.base + r.base);
      cur.total = round2(cur.total + r.total);
      byEvent[k] = cur;
    }

    const integrationSummary = {
      generated_at: new Date().toISOString(),
      generated_by: caller.email ?? caller.id,
      integrated_by_user_id: caller.id,
      card_name: cardName.name,
      holder_name: (session as any).holder_name,
      payment_reference: sessionPaymentRef,
      aggregation_mode: "event_x_category_x_iva",
      legacy_lines_adopted: legacyAdopted,

      consolidated_groups: created.length,
      consolidated_transaction_ids: created,
      items_integrated: resolved.length,
      total_base: round2(resolved.reduce((s, r) => s + r.base, 0)),
      total_iva: round2(resolved.reduce((s, r) => s + r.iva, 0)),
      total_amount: newSpendGross,
      by_event: byEvent,
      budget_raises: raisesToApply.map((r) => ({
        forecast_id: r.forecast_id, old_amount: r.old, new_amount: r.next, observation: r.observation,
      })),
      reconciliation: {
        opening_balance: opening,
        opening_is_override: overrideOpening !== null && overrideOpening !== undefined,
        total_loads: totalLoads,
        new_spend_gross: newSpendGross,
        legacy_session_movements: round2(legacySessionSpend),
        legacy_session_movement_count: legacySessionCount,

        direct_movements_total: round2(directTotal),
        direct_movements: directMovements,
        theoretical_balance: theoretical,
        confirmed_balance: confirmed,
        difference: diff,
        adjustment_created: !!adjustmentTxId,
        adjustment_transaction_id: adjustmentTxId,
        note: (body.adjustment_note ?? "").trim() || null,
      },
      error_count: errors.length,
      errors,
    };

    if (!allFailed) {
      await adminClient
        .from("card_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: caller.id,
          closing_balance_confirmed: confirmed,
          closing_summary: integrationSummary,
          integrated_at: new Date().toISOString(),
          integrated_by: caller.id,
          integration_summary: integrationSummary,
          integration_transaction_ids: allTxIds,
        })
        .eq("id", body.session_id);
    }

    const integrationStatus = allFailed ? "failed" : errors.length === 0 ? "done" : "partial";
    const { error: intLogErr } = await adminClient.from("card_integrations").insert({
      session_id: body.session_id,
      integration_type: "financial_close",
      status: integrationStatus,
      created_by: caller.id,
      summary_payload: integrationSummary,
      company_id: sessionCompanyId,
    });
    if (intLogErr) console.error("[close-card-session] card_integrations:", intLogErr.message);

    if (allFailed) {
      return json({
        success: false,
        error: "Nenhuma transação foi gerada — verifica os pré-requisitos.",
        created: 0,
        errors,
      }, 422);
    }

    return json({
      success: true,
      created: created.length,
      consolidated_transaction_ids: created,
      transaction_ids: allTxIds,
      items_integrated: resolved.length,
      errors,
      summary: integrationSummary,
    });
  } catch (err: any) {
    console.error("[close-card-session] Unhandled error:", err?.stack ?? err?.message ?? String(err));
    return json({ error: err?.message ?? String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  if (status >= 400) console.error(`[close-card-session] ${status} →`, JSON.stringify(payload));
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function fmtMoney(n: number): string {
  return `${Number(n ?? 0).toFixed(2)} €`;
}

function buildCardDossierHtml(args: {
  session: any;
  cardName: string;
  resolved: any[];
  itemDocs: any[];
  catById: Map<string, any>;
  evById: Map<string, any>;
}): string {
  const { session, cardName, resolved, itemDocs, catById, evById } = args;
  const docsByItem = new Map<string, number>();
  for (const d of itemDocs) docsByItem.set(d.item_id, (docsByItem.get(d.item_id) ?? 0) + 1);

  const totalBase = resolved.reduce((s, r) => s + r.base, 0);
  const totalIva = resolved.reduce((s, r) => s + r.iva, 0);
  const totalTotal = resolved.reduce((s, r) => s + r.total, 0);

  const rows = resolved
    .slice()
    .sort((a, b) => String(a.raw.item_date).localeCompare(String(b.raw.item_date)))
    .map((r) => {
      const cat = r.categoryId ? catById.get(r.categoryId) : null;
      const ev = r.eventId ? evById.get(r.eventId) : null;
      return `<tr>
        <td>${escapeHtml(r.raw.item_date ?? "—")}</td>
        <td>${escapeHtml(r.raw.supplier_name ?? "—")}${r.raw.invoice_ref ? `<br><small>${escapeHtml(r.raw.invoice_ref)}</small>` : ""}</td>
        <td>${escapeHtml(r.raw.description ?? "—")}${
        r.raw.approved_without_document
          ? `<br><small>sem documento: ${escapeHtml(r.raw.approved_without_document_reason ?? "")}</small>`
          : ""
      }</td>
        <td>${escapeHtml(ev?.name ?? "Sem evento")}</td>
        <td>${escapeHtml(cat ? `${cat.code} — ${cat.name}` : "—")}</td>
        <td class="num">${fmtMoney(r.base)}</td>
        <td class="num">${fmtMoney(r.iva)}</td>
        <td class="num">${fmtMoney(r.total)}</td>
        <td class="num">${docsByItem.get(r.raw.id) ?? 0}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><title>Dossier Cartão — ${escapeHtml(cardName)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 8px; }
  .card .label { font-size: 9px; text-transform: uppercase; color: #666; }
  .card .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 9px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  small { color: #666; font-size: 9px; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #888; text-align: center; }
</style></head>
<body>
  <h1>Dossier de Cartão Pré-pago</h1>
  <div class="meta">
    <b>${escapeHtml(cardName)}</b> · portador ${escapeHtml(session.holder_name ?? "—")}<br>
    Sessão aberta: ${escapeHtml(String(session.opened_at ?? "").slice(0, 10))}
    · Gerado: ${escapeHtml(new Date().toISOString().slice(0, 16).replace("T", " "))}
    · Itens integrados: ${resolved.length}
  </div>
  <div class="summary">
    <div class="card"><div class="label">Total Base</div><div class="value">${fmtMoney(totalBase)}</div></div>
    <div class="card"><div class="label">Total IVA</div><div class="value">${fmtMoney(totalIva)}</div></div>
    <div class="card"><div class="label">Total Geral</div><div class="value">${fmtMoney(totalTotal)}</div></div>
  </div>
  <h2>Detalhe dos itens</h2>
  <table>
    <thead><tr>
      <th>Data</th><th>Fornecedor / Doc</th><th>Descrição</th><th>Evento</th><th>Rubrica</th>
      <th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th><th class="num">Anexos</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="9"><i>Sem itens</i></td></tr>`}</tbody>
  </table>
  <div class="footer">
    Documento gerado automaticamente pelo MP Gestão Eventos na integração da sessão de cartão.
  </div>
</body></html>`;
}
