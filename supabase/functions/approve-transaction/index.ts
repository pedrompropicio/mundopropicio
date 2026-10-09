import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAllPagedQuery } from "../_shared/paging.ts";
import { approveAtomic } from "./approve-rpc.ts";

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

    const { transaction_ids, budget_raises } = await req.json();
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
      const { data: groupRows } = await fetchAllPagedQuery(adminClient
        .from("transactions")
        .select("id, invoice_group_id")
        .in("id", uniqueIds));
      const groupKeys = [
        ...new Set(
          (groupRows ?? [])
            .map((r: any) => r.invoice_group_id)
            .filter((g: any) => !!g),
        ),
      ];
      if (groupKeys.length > 0) {
        const { data: siblings } = await fetchAllPagedQuery(adminClient
          .from("transactions")
          .select("id")
          .in("invoice_group_id", groupKeys));
        const set = new Set<string>(expandedIds);
        for (const s of siblings ?? []) set.add(s.id);
        expandedIds = [...set];
      }
    }

    const { data: transactions, error: fetchError } = await fetchAllPagedQuery(adminClient
      .from("transactions")
      .select("id, status, type, event_id, amount, iva_rate, company_id, category_id, forecast_id, parent_transaction_id, is_transitory, exclude_from_result, reversed_at, is_hidden, shared_cost_account_id")
      .in("id", expandedIds));

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MULTI-TENANT GUARD: every transaction must belong to a company where the
    // caller HAS a membership (Issue #241 — `profiles.company_id` é só a empresa
    // por omissão e não serve de autorização em multi-membership).
    {
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: callerId });
      if (!isPa) {
        const { data: memberships } = await adminClient
          .from("user_roles").select("company_id").eq("user_id", callerId);
        const memberCompanyIds = new Set(
          (memberships ?? []).map((r: any) => r.company_id).filter(Boolean),
        );
        const foreign = (transactions ?? []).filter(
          (t: any) => !t.company_id || !memberCompanyIds.has(t.company_id),
        );
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

    // AUTORIZAÇÃO POR PERMISSÃO (não por papel): is_platform_admin OU
    // has_permission_in('approve_transactions', company_id da transação).
    {
      const { data: isPa } = await adminClient.rpc("is_platform_admin", { _user_id: callerId });
      if (!isPa) {
        const companyIds = [
          ...new Set((transactions ?? []).map((t: any) => t.company_id).filter((c: any) => !!c)),
        ];
        for (const companyId of companyIds) {
          const { data: allowed, error: permError } = await adminClient.rpc("has_permission_in", {
            _user_id: callerId,
            _permission: "approve_transactions",
            _company_id: companyId,
          });
          if (permError) {
            return new Response(JSON.stringify({ error: permError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (!allowed) {
            return new Response(
              JSON.stringify({ error: "Sem permissão para aprovar transações nesta empresa." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    // D1 + D8: despesa de evento gerido `with_bp` não pode ser aprovada sem
    // linha de BP. Última linha de defesa — o trigger não vê service_role.
    // Isenções (09/09/2026), MESMO predicado do trigger
    // public.enforce_transaction_approval_permission() e de
    // src/lib/bp-line-required.ts: não consomem verba do BP as transações com
    // is_transitory, exclude_from_result, reversed_at preenchido ou is_hidden
    // (null = false). Quinta isenção (16/09/2026, D-ERP69):
    // shared_cost_account_id preenchido — custo partilhado com terceiros.
    // É também o predicado do bloco D2 mais abaixo.
    // Sexta isenção (20/09/2026, #111): rubrica 10.3 "Transferências Internas"
    // (ou descendente) — movimento de tesouraria/bilheteira, o BP nunca tem
    // linha para ele, com ou sem evento.
    if (approvableTx.length > 0) {
      let candidates = approvableTx.filter(
        (t: any) =>
          t.type === "expense" && !!t.event_id && !t.parent_transaction_id && !t.forecast_id &&
          t.is_transitory !== true && t.exclude_from_result !== true &&
          t.reversed_at == null && t.is_hidden !== true && t.shared_cost_account_id == null,
      );
      if (candidates.length > 0) {
        const catIds = [...new Set(candidates.map((t: any) => t.category_id).filter(Boolean))];
        if (catIds.length > 0) {
          const { data: cats, error: catsError } = await adminClient
            .from("account_categories")
            .select("id, code")
            .in("id", catIds as string[]);
          if (catsError) {
            return new Response(JSON.stringify({ error: catsError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const internal = new Set(
            (cats ?? []).filter((c: any) => String(c.code ?? "").startsWith("10.3")).map((c: any) => c.id),
          );
          if (internal.size > 0) {
            candidates = candidates.filter((t: any) => !internal.has(t.category_id));
          }
        }
      }
      if (candidates.length > 0) {
        const eventIds = [...new Set(candidates.map((t: any) => t.event_id as string))];
        const withBp = new Set<string>();
        for (const eventId of eventIds) {
          const { data: mode, error: modeError } = await adminClient.rpc("event_budget_mode", {
            _event_id: eventId,
          });
          if (modeError) {
            return new Response(JSON.stringify({ error: modeError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (mode === "with_bp") withBp.add(eventId);
        }
        const blockedIds = candidates
          .filter((t: any) => withBp.has(t.event_id as string))
          .map((t: any) => t.id);
        if (blockedIds.length > 0) {
          return new Response(
            JSON.stringify({ error: "Há despesas sem linha de BP.", blocked_ids: blockedIds }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const callerName =
      (typeof callerUserMetadata?.full_name === "string" && callerUserMetadata.full_name) ||
      callerEmail ||
      "sistema";

    // D-ERP173 — aprovação ATÓMICA. A edge só autoriza; a RPC tranca as linhas,
    // recalcula o excesso (D2), aplica os raises, aprova, audita e propaga às
    // filhas numa só transação. Excesso sem raise válido → 409 budget_excess.
    const raises = Array.isArray(budget_raises) ? budget_raises : [];
    if (raises.length > 0) {
      const { data: isPa2 } = await adminClient.rpc("is_platform_admin", { _user_id: callerId });
      if (!isPa2) {
        const raiseIds = [...new Set(raises.map((r: any) => r?.forecast_id).filter((x: any) => typeof x === "string"))];
        const { data: rLines, error: rErr } = await fetchAllPagedQuery(adminClient
          .from("event_forecasts").select("id, company_id").in("id", raiseIds as string[]));
        if (rErr) {
          return new Response(JSON.stringify({ error: rErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        for (const companyId of [...new Set((rLines ?? []).map((l: any) => l.company_id))]) {
          const { data: allowed } = await adminClient.rpc("has_permission_in", {
            _user_id: callerId, _permission: "raise_budget", _company_id: companyId,
          });
          if (!allowed) {
            return new Response(
              JSON.stringify({ error: "Sem permissão para elevar verbas de BP nesta empresa." }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }
    }

    if (approvedIds.length > 0) {
      const res = await approveAtomic(adminClient, approvedIds, raises, callerName);
      if (res.kind === "excess") {
        return new Response(
          JSON.stringify({ error: "Há despesas que excedem a verba da linha de BP.", budget_excess: res.budget_excess }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (res.kind === "error") {
        return new Response(JSON.stringify({ error: res.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ok = new Set(res.approved_ids);
      for (let i = approvedIds.length - 1; i >= 0; i--) if (!ok.has(approvedIds[i])) approvedIds.splice(i, 1);
      skippedIds.push(...res.skipped_ids);
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
