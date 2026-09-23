import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAllPagedQuery } from "../_shared/paging.ts";

/**
 * ESPELHO de `src/lib/payment-methods.ts` (PAYMENT_METHODS). O `src/` não é
 * publicado com as edge functions, por isso duplica-se aqui. Comparado pelo
 * teste `supabase/functions/tests/payment-method-domain.test.ts`.
 * O trigger `trg_force_no_account_on_compensation` compara a string
 * exactamente com 'compensation': qualquer grafia fora desta lista desarmaria-o.
 */
export const PAYMENT_METHODS = [
  "transfer",
  "service_payment",
  "direct_debit",
  "state_payment",
  "compensation",
] as const;

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

    // REGRA (Pedro, 14/09/2026): em evento concluído, EDITAR é proibido — a
    // liquidação e o estorno continuam permitidos, mas não passam por aqui
    // (TransactionPaymentModal / BatchPaymentModal / fecho de bilheteira
    // escrevem directamente). Última linha de defesa: um trigger não serve
    // porque este caminho usa service_role (auth.uid() nulo) e apanharia
    // escritas laterais legítimas (sync_partner_aporte_mirror).
    // Verificado ANTES de qualquer escrita, incluindo o audit log.
    {
      const eventIds = [transaction.event_id, updates?.event_id]
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
      if (eventIds.length > 0) {
        const { data: evRows } = await adminClient
          .from("events")
          .select("id, status")
          .in("id", [...new Set(eventIds)]);
        if ((evRows ?? []).some((ev: any) => ev.status === "completed")) {
          return new Response(
            JSON.stringify({ error: "Evento concluído. Reabre o evento para editar." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }



    // RULE: Paid transactions — só um subconjunto de campos é editável.
    // CRITÉRIO (Pedro, 14/09/2026): tem de ser O MESMO do ecrã, que trava por
    // `paidLocked = isPaid && !canApprove` (permissão `approve_transactions`).
    // Antes o servidor travava por papel `admin`, pelo que o GESTOR (que tem a
    // permissão) enviava o payload completo e levava 422 em qualquer TX paga.
    // Agora: platform_admin OU has_permission_in(caller, 'approve_transactions',
    // company da transação) passam sem lista restrita.
    //
    // A lista abaixo é ESPELHO EXACTO do payload do ramo `paidLocked` de
    // `src/components/TransactionEditModal.tsx` (~linha 601). Não a alargues sem
    // alargar o ramo lá — e vice-versa.
    // ATENÇÃO (23/09/2026): qualquer campo novo no ramo `paidLocked` do
    // TransactionEditModal tem de entrar nas DUAS listas desta função — aqui na
    // `paidAllowedFields` E na `allowedFields` mais abaixo. Esquecer a primeira
    // dá 422 a quem não tem `approve_transactions` mesmo sem tocar no campo (o
    // ramo envia-o sempre); esquecer a segunda faz a alteração desaparecer em
    // silêncio, sem erro. Foi exactamente isto que aconteceu com
    // `shared_cost_account_id`/`shared_cost_counterparty_id` entre 16/09 e 23/09.
    // Nota: só decide se o pedido é RECUSADO; não é lista de escrita.
    // `status` e `paid_amount` continuam fora da `allowedFields` mais abaixo (o
    // trigger trg_enforce_held_revenue_is_paid põe-nos sozinho), mas o ramo
    // `paidLocked` envia-os no "Recebido por" e não devem gerar 422.
    const isPaid = transaction.status === "paid";
    if (isPaid) {
      let canApproveTx = false;
      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: caller.id });
      if (isPaRow) {
        canApproveTx = true;
      } else {
        const { data: permOk } = await adminClient.rpc("has_permission_in", {
          _user_id: caller.id,
          _permission: "approve_transactions",
          _company_id: transaction.company_id,
        });
        canApproveTx = Boolean(permOk);
      }

      if (!canApproveTx) {
        const paidAllowedFields = [
          "specification", "supplier_id", "is_transitory", "transitory_reason", "is_confidential",
          "exclude_from_result", "shared_cost_account_id", "shared_cost_counterparty_id",
          "invoice_ref", "payment_method", "payment_entity",
          "payment_reference", "operation_key", "ordering_partner_id", "paying_partner_id",
          "event_settlement_id", "held_by_supplier_id", "category_id",
          "status", "paid_amount", "payment_date",
        ];
        const blockedFields = Object.keys(updates).filter((f) => {
          if (paidAllowedFields.includes(f)) return false;
          // `account_id` SÓ a null: é o caso da despesa paga por sócio (o ecrã
          // limpa a conta). Deixá-lo passar com valor permitiria mudar a conta de
          // onde saiu o dinheiro de uma TX paga — corrompe saldo e conciliação.
          if (f === "account_id" && updates[f] === null) return false;
          return true;
        });
        if (blockedFields.length > 0) {
          return new Response(
            JSON.stringify({ error: `Transações pagas: sem permissão para alterar ${blockedFields.join(", ")}.` }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }


    // Validate payment_method against the closed domain (CHECK na base espelha isto)
    if ("payment_method" in updates && updates.payment_method !== null) {
      if (!PAYMENT_METHODS.includes(updates.payment_method)) {
        return new Response(
          JSON.stringify({
            error: `Método de pagamento inválido: "${updates.payment_method}". Valores aceites: ${PAYMENT_METHODS.join(", ")}.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /**
     * Pagamento de Serviços exige referência MB completa. ESPELHO de
     * `validateServicePaymentFields` em `src/lib/payment-methods.ts` e do CHECK
     * `transactions_service_payment_requires_mb` (NOT VALID em Live: o CHECK não
     * apanha as linhas antigas, por isso a recusa tem de estar aqui também).
     * Só valida quando o pedido toca em algum dos três campos — não se recusa uma
     * edição de descrição por causa de dados antigos incompletos.
     */
    const touchesPaymentMb =
      "payment_method" in updates || "payment_entity" in updates || "payment_reference" in updates;
    if (touchesPaymentMb) {
      const effMethod = "payment_method" in updates ? updates.payment_method : transaction.payment_method;
      if (effMethod === "service_payment") {
        const effEntity = String(
          ("payment_entity" in updates ? updates.payment_entity : transaction.payment_entity) ?? "",
        ).trim();
        const effRef = String(
          ("payment_reference" in updates ? updates.payment_reference : transaction.payment_reference) ?? "",
        ).trim();
        if (!/^\d{5}$/.test(effEntity) || !/^\d{9}$/.test(effRef)) {
          return new Response(
            JSON.stringify({
              error: "Pagamento de Serviços exige Entidade (5 dígitos) e Referência (9 dígitos)",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Chave de operação (D-ERP45): ESPELHO de `src/lib/operation-key.ts`
    // (OPERATION_KEY_PATTERN) e do CHECK `transactions_operation_key_check`.
    // Recusa-se em vez de avisar: uma variante silenciosa cria um grupo de uma
    // linha e o total do fecho deixa de bater.
    const OPERATION_KEY_RE = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;
    if ("operation_key" in updates && updates.operation_key === "") updates.operation_key = null;
    if ("operation_key" in updates && updates.operation_key !== null) {
      if (typeof updates.operation_key !== "string" || !OPERATION_KEY_RE.test(updates.operation_key)) {
        return new Response(
          JSON.stringify({
            error: `Chave de operação inválida: "${updates.operation_key}". Só letras e números em maiúsculas separados por hífen (ex.: ACERTO-FOOD-IVETE-2026).`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const callerName = caller.user_metadata?.full_name ?? caller.email ?? "sistema";

    // Build sanitized update object (only allowed fields)
    // SECURITY: `status` e `paid_amount` ficam FORA por desenho — as transições de
    // estado passam pelos fluxos approve-transaction / liquidação, e no "Recebido
    // por" é o trigger trg_enforce_held_revenue_is_paid que os põe.
    // ESPELHO do `fieldLabels` de `src/components/TransactionEditModal.tsx`: o que
    // o formulário envia e não estiver aqui é descartado em silêncio.
    const allowedFields = [
      "description", "amount", "iva_rate", "event_id", "category_id", "forecast_id",
      "supplier_id", "account_id", "specification", "date", "due_date",
      "payment_date", "is_transitory", "transitory_reason", "exclude_from_result", "split_mode",
      "invoice_ref", "payment_method", "payment_entity", "payment_reference",
      "operation_key",
      "declared_withholding_rate", "declared_withholding_amount",
      "is_reimbursement", "reimbursement_to",
      "held_by_supplier_id", "event_settlement_id", "is_confidential",
      "ordering_partner_id", "paying_partner_id",
      "currency", "original_amount", "fx_rate", "fx_rate_source",
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

    // AUDITORIA — escrita DEPOIS do update ter tido sucesso (2026-09-14).
    // Antes corria primeiro: registava alterações de campos descartados pela
    // sanitização e, se o update falhasse, ficava rasto de uma alteração que não
    // houve. A trava de evento concluído continua ANTES de tudo isto.
    // ESPELHO dos rótulos de `fieldLabels` no TransactionEditModal — serve para
    // filtrar as entradas do cliente pelos campos que sobreviveram.
    const FIELD_BY_LABEL: Record<string, string> = {
      "Descrição": "description", "Valor": "amount", "Taxa IVA": "iva_rate",
      "Evento": "event_id", "Categoria": "category_id", "Fornecedor": "supplier_id",
      "Conta": "account_id", "Especificação": "specification", "Data": "date",
      "Data Vencimento": "due_date", "Data Pagamento": "payment_date",
      "Transitória": "is_transitory", "Motivo da transitória": "transitory_reason",
      "Fora do Resultado": "exclude_from_result",
      "Nº Fatura": "invoice_ref", "Método Pagamento": "payment_method",
      "Entidade Pagamento": "payment_entity", "Referência Pagamento": "payment_reference",
      "Chave de operação": "operation_key",
      "Retenção IRS declarada (%)": "declared_withholding_rate",
      "Retenção IRS declarada (€)": "declared_withholding_amount",
      "Confidencial": "is_confidential", "Reembolso": "is_reimbursement",
      "Colaborador (reembolso)": "reimbursement_to",
      "Ordenador da despesa": "ordering_partner_id",
      "Pagador da despesa": "paying_partner_id",
      "Fechamento": "event_settlement_id",
      "Recebido por": "held_by_supplier_id",
    };
    const auditEntries = (changes && Array.isArray(changes) ? changes : [])
      .filter((c: any) => {
        const label = String(c?.field_name ?? "");
        const field = FIELD_BY_LABEL[label];
        // Rótulo desconhecido: mantém-se (não inventamos censura sobre o que não mapeamos).
        return field ? field in sanitizedUpdates : true;
      })
      .map((c: any) => ({
        transaction_id,
        company_id: transaction.company_id,
        changed_by: callerName,
        field_name: String(c.field_name ?? ""),
        old_value: String(c.old_value ?? ""),
        new_value: String(c.new_value ?? ""),
      }));

    // AUDITORIA OBRIGATÓRIA (derivada no servidor, não depende do cliente):
    // mudança de EVENTO e de DESCRIÇÃO. O incidente do vínculo cruzado BP↔TX
    // (Anitta → Ivete) não deixou rasto porque estes dois campos podiam ser
    // alterados sem qualquer entrada no transaction_audit_log.
    {
      const alreadyAudited = new Set(auditEntries.map((e) => e.field_name));

      if ("description" in sanitizedUpdates && !alreadyAudited.has("Descrição")) {
        const oldVal = String(transaction.description ?? "");
        const newVal = String(sanitizedUpdates.description ?? "");
        if (oldVal !== newVal) {
          auditEntries.push({ transaction_id, company_id: transaction.company_id, changed_by: callerName, field_name: "Descrição", old_value: oldVal, new_value: newVal });
        }
      }

      if ("event_id" in sanitizedUpdates && !alreadyAudited.has("Evento")) {
        const oldId = transaction.event_id ?? null;
        const newId = sanitizedUpdates.event_id ?? null;
        if (String(oldId ?? "") !== String(newId ?? "")) {
          const ids = [oldId, newId].filter(Boolean) as string[];
          const nameById = new Map<string, string>();
          if (ids.length > 0) {
            const { data: evNameRows } = await adminClient.from("events").select("id, name").in("id", ids);
            for (const ev of evNameRows ?? []) nameById.set(ev.id, ev.name);
          }
          const label = (id: string | null) => (id ? `${nameById.get(id) ?? id}` : "(sem evento)");
          auditEntries.push({
            transaction_id, company_id: transaction.company_id, changed_by: callerName, field_name: "Evento",
            old_value: label(oldId), new_value: label(newId),
          });
        }
      }
    }

    if (auditEntries.length > 0) {
      const { error: auditError } = await adminClient
        .from("transaction_audit_log")
        .insert(auditEntries);

      if (auditError) {
        console.error("Audit log error:", auditError);
      }
    }

    // Propagate changes to child transactions (splits or installments)
    const { data: children } = await fetchAllPagedQuery(adminClient
      .from("transactions")
      .select("id, split_percentage, split_amount, status")
      .eq("parent_transaction_id", transaction_id));

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
        "is_transitory", "transitory_reason", "exclude_from_result",
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
      // Uma linha de fatura tem TRÊS naturezas de campo (2026-09-14):
      //
      //  1) O QUE É DO DOCUMENTO — fornecedor, data, vencimento. SÓ ISTO se propaga.
      //
      //  2) O QUE É DA LINHA — valor, taxa de IVA, descrição, specification,
      //     category_id, event_id, is_transitory, exclude_from_result. É por
      //     definição o que DISTINGUE uma linha da outra dentro da mesma fatura;
      //     nunca se propaga. (A specification propagava-se e reescrevia a frase
      //     das irmãs — incidente R-030/2026.) O `invoice_ref` também não viaja:
      //     se é a mesma fatura o número já é igual, propagá-lo só o troca por engano.
      //
      //  3) O QUE É DO PAGAMENTO — account_id, payment_method, payment_entity,
      //     payment_reference. Pagamento não é propriedade da fatura: é o que se
      //     faz com ela depois, tem máquina própria em transaction_payments, e o
      //     account_id é a conta de onde o dinheiro SAIU — reescrevê-lo numa irmã
      //     já paga corrompe o saldo de uma conta bancária. Além disso a interface
      //     limpa o payment_reference quando o método é transferência: propagar um
      //     campo que a própria interface apaga é garantir confusão.
      //
      // Não há custo de preenchimento: o "Dividir por IVA" faz spread do
      // formulário inteiro, logo cada irmã NASCE com rubrica, evento, conta,
      // vencimento e método. A propagação na edição nunca serviu para preencher.
      const invoiceSharedFields = [
        "supplier_id",
        "date",
        "due_date",
      ];
      // Quando o grupo-fatura e o grupo de parcelas se cruzam, a PARCELA manda.
      // Parcelas têm calendário próprio: não propagar datas para as irmãs.
      if (transaction.installment_group_id) {
        const dateIdx = invoiceSharedFields.indexOf("date");
        if (dateIdx >= 0) invoiceSharedFields.splice(dateIdx, 1);
        const dueDateIdx = invoiceSharedFields.indexOf("due_date");
        if (dueDateIdx >= 0) invoiceSharedFields.splice(dueDateIdx, 1);
      }
      const siblingUpdates: Record<string, any> = {};
      for (const field of invoiceSharedFields) {
        if (field in sanitizedUpdates && sanitizedUpdates[field] !== transaction[field]) {
          siblingUpdates[field] = sanitizedUpdates[field];
        }
      }
      if (Object.keys(siblingUpdates).length > 0) {
        const { data: siblings } = await fetchAllPagedQuery(adminClient
          .from("transactions")
          .select("id")
          .eq("invoice_group_id", transaction.invoice_group_id)
          .neq("id", transaction_id));
        const siblingIds = (siblings ?? []).map((s: any) => s.id);
        if (siblingIds.length > 0) {
          await adminClient
            .from("transactions")
            .update(siblingUpdates)
            .in("id", siblingIds);

          // Audit log on each sibling
          const auditOnSiblings = siblingIds.map((sid: string) => ({
            transaction_id: sid,
            company_id: transaction.company_id,
            changed_by: callerName,
            field_name: "Propagação grupo-fatura",
            old_value: null,
            new_value: `Atualizado em conjunto com transação ${transaction_id}`,
          }));
          const { error: siblingsAuditError } = await adminClient
            .from("transaction_audit_log")
            .insert(auditOnSiblings);
          if (siblingsAuditError) {
            console.error("[update-transaction] audit siblings error:", siblingsAuditError);
          }
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
