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
    if (approvableTx.length > 0) {
      const candidates = approvableTx.filter(
        (t: any) =>
          t.type === "expense" && !!t.event_id && !t.parent_transaction_id && !t.forecast_id,
      );
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

    // DR-2026-09-02-D2 (revista 03/09) — aprovar implica ELEVAR a linha de BP
    // quando o realizado passa a ultrapassar a verba. Atómico: valida e aplica
    // todos os raises ANTES de aprovar; se um falhar, não aprova nada.
    const appliedRaises: { forecast_id: string; old_amount: number; new_amount: number; observation: string }[] = [];
    const excessTxIds = new Set<string>();
    if (approvedIds.length > 0) {
      const entries = approvableTx.filter(
        (t: any) => t.type === "expense" && !!t.forecast_id && !t.parent_transaction_id,
      );
      const forecastIds = [...new Set(entries.map((t: any) => t.forecast_id as string))];

      if (forecastIds.length > 0) {
        const { data: lines, error: linesErr } = await adminClient
          .from("event_forecasts")
          .select("id, description, specification, amount, baseline_amount, company_id")
          .in("id", forecastIds);
        if (linesErr) {
          return new Response(JSON.stringify({ error: linesErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: realizedRows, error: realizedErr } = await adminClient
          .from("transactions")
          .select("id, forecast_id, amount, is_transitory, exclude_from_result, reversed_at, is_hidden")
          .in("forecast_id", forecastIds)
          .in("status", ["approved", "paid"]);
        if (realizedErr) {
          return new Response(JSON.stringify({ error: realizedErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const batchIds = new Set(entries.map((t: any) => t.id));
        const realizedByLine = new Map<string, number>();
        for (const r of (realizedRows ?? []) as any[]) {
          if (batchIds.has(r.id)) continue;
          if (r.is_transitory === true || r.exclude_from_result === true || r.reversed_at != null || r.is_hidden === true) continue;
          realizedByLine.set(r.forecast_id, (realizedByLine.get(r.forecast_id) ?? 0) + Number(r.amount ?? 0));
        }
        const toApproveByLine = new Map<string, number>();
        for (const t of entries as any[]) {
          toApproveByLine.set(t.forecast_id, (toApproveByLine.get(t.forecast_id) ?? 0) + Number(t.amount ?? 0));
        }

        const excess: any[] = [];
        const lineById = new Map<string, any>();
        for (const l of (lines ?? []) as any[]) {
          lineById.set(l.id, l);
          const lineAmount = round2(Number(l.amount ?? 0));
          const realized = round2(realizedByLine.get(l.id) ?? 0);
          const toApprove = round2(toApproveByLine.get(l.id) ?? 0);
          const over = round2(realized + toApprove - lineAmount);
          if (over <= 0) continue;
          excess.push({
            forecast_id: l.id,
            description: [l.description, l.specification].filter(Boolean).join(" · ") || "(sem descrição)",
            line_amount: lineAmount,
            baseline_amount: l.baseline_amount == null ? null : round2(Number(l.baseline_amount)),
            realized,
            to_approve: toApprove,
            excess: over,
            suggested_amount: round2(realized + toApprove),
          });
        }

        if (excess.length > 0) {
          const raises = Array.isArray(budget_raises) ? budget_raises : [];
          const missing = excess.filter(
            (e) => !raises.some((r: any) => r?.forecast_id === e.forecast_id),
          );
          if (missing.length > 0) {
            return new Response(
              JSON.stringify({
                error: "Há despesas que excedem a verba da linha de BP.",
                budget_excess: excess,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          const { data: isPa2 } = await adminClient.rpc("is_platform_admin", { _user_id: callerId });

          for (const e of excess) {
            const raise = raises.find((r: any) => r?.forecast_id === e.forecast_id);
            const newAmount = Number(raise?.new_amount);
            const observation = typeof raise?.observation === "string" ? raise.observation.trim() : "";
            if (!Number.isFinite(newAmount) || newAmount < e.suggested_amount) {
              return new Response(
                JSON.stringify({
                  error: `A nova verba da linha "${e.description}" tem de ser pelo menos ${e.suggested_amount.toFixed(2)} €.`,
                }),
                { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            if (!observation) {
              return new Response(
                JSON.stringify({ error: "Observação obrigatória para elevar a verba da linha de BP." }),
                { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            if (!isPa2) {
              const { data: allowed } = await adminClient.rpc("has_permission_in", {
                _user_id: callerId,
                _permission: "raise_budget",
                _company_id: lineById.get(e.forecast_id)?.company_id,
              });
              if (!allowed) {
                return new Response(
                  JSON.stringify({ error: "Sem permissão para elevar verbas de BP nesta empresa." }),
                  { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
              }
            }
          }

          // Aplica os raises (baseline_amount NUNCA é tocado — D3).
          for (const e of excess) {
            const raise = raises.find((r: any) => r?.forecast_id === e.forecast_id);
            const newAmount = Math.round(Number(raise.new_amount) * 100) / 100;
            const observation = String(raise.observation).trim();
            const { error: upErr } = await adminClient
              .from("event_forecasts")
              .update({ amount: newAmount })
              .eq("id", e.forecast_id);
            if (upErr) {
              return new Response(
                JSON.stringify({ error: `Falha ao elevar a verba da linha de BP: ${upErr.message}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            const { error: logErr } = await adminClient.from("forecast_audit_log").insert({
              forecast_id: e.forecast_id,
              changed_by: callerName,
              field_name: "Valor (EUR)",
              old_value: e.line_amount.toFixed(2),
              new_value: newAmount.toFixed(2),
              observation,
              company_id: lineById.get(e.forecast_id)?.company_id,
            });
            if (logErr) console.error("[approve-transaction] forecast_audit_log error:", logErr);
            appliedRaises.push({
              forecast_id: e.forecast_id,
              old_amount: e.line_amount,
              new_amount: newAmount,
              observation,
            });
            for (const t of entries as any[]) {
              if (t.forecast_id === e.forecast_id) excessTxIds.add(t.id);
            }
          }
        }
      }
    }


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

      // D2 — deixa rasto na transação que motivou a elevação da verba.
      if (excessTxIds.size > 0 && appliedRaises.length > 0) {
        const raiseAudit = [...excessTxIds]
          .filter((id) => approvedIds.includes(id))
          .map((id) => {
            const tx = approvableTx.find((t: any) => t.id === id) as any;
            const r = appliedRaises.find((x) => x.forecast_id === tx?.forecast_id);
            if (!r) return null;
            return {
              transaction_id: id,
              company_id: tx?.company_id,
              changed_by: callerName,
              field_name: "bp_budget_raised",
              old_value: null,
              new_value: `Verba da linha elevada de ${r.old_amount.toFixed(2)} € para ${r.new_amount.toFixed(2)} € — ${r.observation}`,
            };
          })
          .filter(Boolean);
        if (raiseAudit.length > 0) {
          const { error: raErr } = await adminClient.from("transaction_audit_log").insert(raiseAudit as any);
          if (raErr) console.error("[approve-transaction] raise audit error:", raErr);
        }
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
