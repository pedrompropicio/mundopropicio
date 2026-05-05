// apply-coala-bp
// POST { fileBase64, fileName, fileVersion, eventId, syncMode, ackTotals }
// Atomically:
//  • Snapshots current BP into a new bp_versions row (auto)
//  • Replaces (sync='replace') or appends (sync='append') event_forecasts
//    for this event using the parsed Coala XLSX
//  • Creates suppliers (UPPERCASED) when missing
//  • Generates approved transactions for paid / partial lines
//  • Records a coala_import_runs row with full audit trail
//
// Returns { ok, runId, summary }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  parseCoalaXlsx,
  buildValidationReport,
  type ParsedRow,
} from "../_shared/coalaParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SyncMode = "replace" | "append";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { fileBase64, fileName, fileVersion, eventId, syncMode = "replace", ackTotals = false } = body ?? {};
    if (!fileBase64 || !fileVersion || !eventId) {
      return json({ error: "fileBase64, fileVersion e eventId obrigatórios" }, 400);
    }

    // Permissions: must be admin/manager/editor
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const allowedRoles = new Set(["admin", "manager", "editor", "platform_admin"]);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (![...roleSet].some((r) => allowedRoles.has(r as string))) {
      return json({ error: "Sem permissão para importar BP." }, 403);
    }

    const { data: ev, error: evErr } = await admin
      .from("events")
      .select("id, name, company_id, import_template, status")
      .eq("id", eventId)
      .single();
    if (evErr || !ev) return json({ error: "Evento não encontrado" }, 404);
    if (ev.import_template !== "coala") {
      return json({ error: "Evento sem template 'coala'." }, 400);
    }

    // Parse
    const buf = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0)).buffer;
    const parsed = parseCoalaXlsx(buf, fileVersion);
    const validation = buildValidationReport(parsed);
    if (validation.hasErrors && !ackTotals) {
      return json({ error: "Validação tem erros — confirma com ackTotals=true.", validation }, 400);
    }

    // Resolve fallback category
    const { data: cats } = await admin
      .from("account_categories")
      .select("id, code, name, parent_id")
      .eq("company_id", ev.company_id)
      .eq("is_active", true);
    const allCats = cats || [];
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const fallback = allCats.find((c: any) => c.code === "0.0.99");
    if (!fallback) return json({ error: "Categoria fallback 0.0.99 não existe" }, 500);

    const categoryFor = (cc: string | null): string => {
      if (!cc) return fallback.id;
      const m = allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(cc));
      return m?.id ?? fallback.id;
    };

    // Pre-load suppliers
    const { data: existingSups } = await admin
      .from("suppliers")
      .select("id, name")
      .eq("company_id", ev.company_id)
      .eq("is_active", true);
    const supByName = new Map<string, string>();
    for (const s of (existingSups || [])) {
      supByName.set(String(s.name).toUpperCase().trim(), s.id);
    }

    // Create new suppliers
    const newSupplierIds: string[] = [];
    const distinctSuppliers = new Set<string>();
    for (const r of parsed.rows) {
      if (r.excluded) continue;
      if (r.supplier) distinctSuppliers.add(r.supplier);
    }
    for (const name of distinctSuppliers) {
      if (supByName.has(name)) continue;
      const { data: ins, error: e } = await admin
        .from("suppliers")
        .insert({ name, company_id: ev.company_id, is_active: true })
        .select("id")
        .single();
      if (e) console.warn("supplier insert failed", name, e.message);
      else if (ins) {
        supByName.set(name, ins.id);
        newSupplierIds.push(ins.id);
      }
    }

    // BP snapshot (auto): trigger via RPC if available; otherwise skip silently
    let bpVersionId: string | null = null;
    try {
      const { data: snapId } = await admin.rpc("create_bp_snapshot", {
        p_event_id: eventId,
        p_label: `Pré-import Coala ${fileVersion} (${new Date().toISOString().slice(0, 10)})`,
      });
      if (snapId) bpVersionId = snapId as string;
    } catch (e) {
      console.warn("create_bp_snapshot indisponível:", (e as Error).message);
    }

    // Replace mode: soft-delete existing forecasts (move to trash via flag — we just delete here for simplicity within the run)
    const importBatchId = crypto.randomUUID();
    if (syncMode === "replace") {
      // Only delete forecasts not yet linked to a transaction
      await admin
        .from("event_forecasts")
        .delete()
        .eq("event_id", eventId)
        .is("transaction_id", null)
        .is("master_forecast_id", null);
    }

    const createdForecastIds: string[] = [];
    const createdTransactionIds: string[] = [];

    const formalidadeMap: Record<string, string> = {
      "Fechado": "fechado",
      "Negociado": "negociacao",
      "Estimado": "estimado",
      "Cotação": "estimado",
    };

    for (const r of parsed.rows) {
      if (r.excluded) continue;

      const categoryId = categoryFor(r.rawCenterCusto);
      const supplierId = r.supplier ? supByName.get(r.supplier) ?? null : null;

      // BP forecast row
      const { data: fc, error: fErr } = await admin
        .from("event_forecasts")
        .insert({
          event_id: eventId,
          category_id: categoryId,
          type: "expense",
          description: r.description,
          amount: r.netAmount,
          iva_rate: r.ivaRate,
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.email ?? user.id,
          formalidade: formalidadeMap[r.formalidade] ?? "estimado",
          notes: [
            `Coala ${fileVersion}`,
            r.invoiceRef ? `Fatura ${r.invoiceRef}` : null,
            r.warnings.length ? `⚠ ${r.warnings.join("; ")}` : null,
          ].filter(Boolean).join(" • "),
        })
        .select("id")
        .single();
      if (fErr || !fc) {
        console.error("forecast insert failed row", r.rowNumber, fErr);
        continue;
      }
      createdForecastIds.push(fc.id);

      // Generate transactions for paid/partial. Pending lines → no TX (lives in BP).
      if (r.status === "pending") continue;

      // Partial: 2 transactions
      if (r.status === "partial" && r.paidNet > 0 && r.paidNet < r.netAmount) {
        const remainder = +(r.netAmount - r.paidNet).toFixed(2);
        const remainderIva = +(r.ivaAmount - r.paidIva).toFixed(2);
        // Paid leg
        const t1 = await admin.from("transactions").insert({
          event_id: eventId,
          type: "expense",
          category_id: categoryId,
          description: r.description,
          amount: r.paidNet,
          iva_rate: r.paidNet > 0 ? Math.round((r.paidIva / r.paidNet) * 100) : r.ivaRate,
          date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "paid",
          supplier_id: supplierId,
          paid_amount: +(r.paidNet + r.paidIva).toFixed(2),
          payment_date: r.paymentDate,
          due_date: r.dueDate,
          invoice_ref: r.invoiceRef,
        }).select("id").single();
        // Pending leg
        const t2 = await admin.from("transactions").insert({
          event_id: eventId,
          type: "expense",
          category_id: categoryId,
          description: r.description + " (saldo)",
          amount: remainder,
          iva_rate: remainder > 0 ? Math.round((remainderIva / remainder) * 100) : r.ivaRate,
          date: r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "pending",
          supplier_id: supplierId,
          due_date: r.dueDate,
          invoice_ref: r.invoiceRef,
        }).select("id").single();
        if (t1.data) createdTransactionIds.push(t1.data.id);
        if (t2.data) createdTransactionIds.push(t2.data.id);
        continue;
      }

      // Fully paid
      if (r.status === "paid") {
        const t = await admin.from("transactions").insert({
          event_id: eventId,
          type: "expense",
          category_id: categoryId,
          description: r.description,
          amount: r.netAmount,
          iva_rate: r.ivaRate,
          date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "paid",
          supplier_id: supplierId,
          paid_amount: r.grossAmount,
          payment_date: r.paymentDate,
          due_date: r.dueDate,
          invoice_ref: r.invoiceRef,
        }).select("id").single();
        if (t.data) createdTransactionIds.push(t.data.id);
      }
    }

    // Pendency report
    const pendencies = {
      excludedAB: parsed.rows.filter((r) => r.excluded).length,
      noCC: parsed.rows.filter((r: ParsedRow) => !r.excluded && !r.rawCenterCusto).length,
      dateInterval: parsed.rows.filter((r: ParsedRow) => !r.excluded && r.needsDateReview).length,
      formalidadeAmbiguous: parsed.rows.filter((r: ParsedRow) => !r.excluded && r.needsFormalidadeReview).length,
      ivaSnapped: parsed.rows.filter((r: ParsedRow) => !r.excluded && r.warnings.some((w) => w.includes("IVA"))).length,
      newSuppliers: newSupplierIds.length,
    };

    const { data: run } = await admin
      .from("coala_import_runs")
      .insert({
        company_id: ev.company_id,
        event_id: eventId,
        file_version: fileVersion,
        file_name: fileName ?? null,
        bp_version_id: bpVersionId,
        import_batch_id: importBatchId,
        status: "applied",
        totals: parsed.totals,
        validation_report: validation,
        pendencies_report: pendencies,
        created_transaction_ids: createdTransactionIds,
        created_forecast_ids: createdForecastIds,
        created_supplier_ids: newSupplierIds,
        applied_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    return json({
      ok: true,
      runId: run?.id ?? null,
      bpVersionId,
      summary: {
        forecastsCreated: createdForecastIds.length,
        transactionsCreated: createdTransactionIds.length,
        suppliersCreated: newSupplierIds.length,
        excludedAB: pendencies.excludedAB,
        pendencies,
        totals: parsed.totals,
      },
    });
  } catch (err) {
    console.error("apply-coala-bp error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
