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
    const {
      fileBase64, fileName, fileVersion, eventId,
      syncMode = "replace", ackTotals = false,
      phase = "apply", // "preview" | "apply"
      decisions = {} as Record<string, "skip" | "create">, // rowNumber -> decisão da IA/utilizador
    } = body ?? {};
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
    const fallback = allCats.find((c: any) => c.code === "0.0.99")
      ?? allCats.find((c: any) => c.code === "2.6.08");
    if (!fallback) return json({ error: "Categoria fallback 0.0.99/2.6.08 não existe" }, 500);

    const categoryFor = (cc: string | null): string => {
      if (!cc) return fallback.id;
      const m = allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(cc));
      return m?.id ?? fallback.id;
    };

    const normTxt = (s: string | null) =>
      String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const moneyKey = (n: number) => Math.round(n * 100); // tolerância 0.005€

    // ── Dedupe pre-load (também precisamos para preview)
    const { data: existingFcs } = await admin
      .from("event_forecasts")
      .select("id, category_id, description, amount, transaction_id")
      .eq("event_id", eventId);
    const { data: existingTxs } = await admin
      .from("transactions")
      .select("id, category_id, supplier_id, description, amount, payment_date, invoice_ref")
      .eq("event_id", eventId);

    const fcKeySet = new Set<string>();
    for (const f of (existingFcs || [])) {
      fcKeySet.add(`${normTxt(f.description)}|${moneyKey(Number(f.amount) || 0)}`);
    }
    const txKeySet = new Set<string>();
    for (const t of (existingTxs || [])) {
      const amt = moneyKey(Number(t.amount) || 0);
      if (t.invoice_ref) txKeySet.add(`INV|${t.supplier_id ?? "_"}|${normTxt(t.invoice_ref)}|${amt}`);
      txKeySet.add(`DSC|${t.supplier_id ?? "_"}|${normTxt(t.description)}|${amt}|${t.payment_date ?? ""}`);
    }

    // ===========================================================================
    // PHASE = "preview": calcula dedupe exato + fuzzy candidates + IA → ambíguos
    // ===========================================================================
    if (phase === "preview") {
      // Dice coefficient (bigrams) — robusto a abreviaturas
      const dice = (a: string, b: string): number => {
        a = normTxt(a); b = normTxt(b);
        if (!a || !b) return 0;
        if (a === b) return 1;
        const grams = (s: string) => {
          const out = new Set<string>();
          for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
          return out;
        };
        const A = grams(a), B = grams(b);
        let inter = 0;
        for (const g of A) if (B.has(g)) inter++;
        return (2 * inter) / (A.size + B.size || 1);
      };

      const fuzzyCandidates: any[] = [];
      const exactDuplicates: any[] = [];
      const cleanIncoming: any[] = []; // sem qualquer match

      for (const r of parsed.rows) {
        if (r.excluded) continue;
        const fcKey = `${normTxt(r.description)}|${moneyKey(r.netAmount)}`;
        if (fcKeySet.has(fcKey)) {
          exactDuplicates.push({ rowNumber: r.rowNumber, description: r.description, netAmount: r.netAmount });
          continue;
        }
        // procurar candidatos fuzzy: mesmo valor (±0.01€) e Dice ≥ 0.55
        const incomingAmt = moneyKey(r.netAmount);
        const cands = (existingFcs || [])
          .filter((f: any) => Math.abs(moneyKey(Number(f.amount) || 0) - incomingAmt) <= 1)
          .map((f: any) => ({ id: f.id, description: f.description, amount: Number(f.amount), score: dice(r.description, f.description) }))
          .filter((c: any) => c.score >= 0.55)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 3);
        if (cands.length === 0) {
          cleanIncoming.push({ rowNumber: r.rowNumber, description: r.description, netAmount: r.netAmount });
        } else {
          fuzzyCandidates.push({ rowNumber: r.rowNumber, description: r.description, netAmount: r.netAmount, candidates: cands });
        }
      }

      // IA: classifica cada fuzzyCandidate em same/different/unsure (em batches)
      const aiDecisions: Record<string, { verdict: "same" | "different" | "unsure"; confidence: number; reason: string; bestCandidateId?: string }> = {};
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY && fuzzyCandidates.length > 0) {
        const batchSize = 25;
        for (let i = 0; i < fuzzyCandidates.length; i += batchSize) {
          const batch = fuzzyCandidates.slice(i, i + batchSize);
          const userMsg = batch.map((c: any) => ({
            id: c.rowNumber,
            nova: { desc: c.description, valor: c.netAmount },
            existentes: c.candidates.map((x: any) => ({ id: x.id, desc: x.description, valor: x.amount })),
          }));
          try {
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "És um auditor financeiro. Para cada despesa NOVA do XLSX Coala, decide se ela representa a MESMA despesa que alguma já existente no BP do evento (que pode ter sido recategorizada/reescrita manualmente) ou se é uma despesa DIFERENTE que por acaso tem valor parecido. Responde só via tool call." },
                  { role: "user", content: JSON.stringify(userMsg) },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "classify_duplicates",
                    description: "Classifica cada candidato como duplicado ou não.",
                    parameters: {
                      type: "object",
                      properties: {
                        results: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "number" },
                              verdict: { type: "string", enum: ["same", "different", "unsure"] },
                              confidence: { type: "number" },
                              reason: { type: "string" },
                              bestCandidateId: { type: "string" },
                            },
                            required: ["id", "verdict", "confidence", "reason"],
                          },
                        },
                      },
                      required: ["results"],
                    },
                  },
                }],
                tool_choice: { type: "function", function: { name: "classify_duplicates" } },
              }),
            });
            if (resp.ok) {
              const j = await resp.json();
              const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
              if (args) {
                const parsed = JSON.parse(args);
                for (const r of (parsed.results || [])) {
                  aiDecisions[String(r.id)] = r;
                }
              }
            } else {
              console.warn("AI classification failed", resp.status, await resp.text());
            }
          } catch (e) {
            console.warn("AI batch error", e);
          }
        }
      }

      return json({
        ok: true,
        phase: "preview",
        summary: {
          totalImportable: parsed.rows.filter((r) => !r.excluded).length,
          exactDuplicates: exactDuplicates.length,
          fuzzyCandidates: fuzzyCandidates.length,
          clean: cleanIncoming.length,
        },
        exactDuplicates,
        clean: cleanIncoming,
        review: fuzzyCandidates.map((c: any) => ({
          ...c,
          ai: aiDecisions[String(c.rowNumber)] ?? { verdict: "unsure", confidence: 0, reason: "IA indisponível" },
        })),
      });
    }

    // ===========================================================================
    // PHASE = "apply": efeitos colaterais (suppliers, snapshot, replace, inserts)
    // ===========================================================================

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

    // BP snapshot (auto)
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

    const importBatchId = crypto.randomUUID();

    // Replace mode: only purge forecasts NOT linked to TX AND that won't be re-created
    const incomingFcKeys = new Set<string>();
    for (const r of parsed.rows) {
      if (r.excluded) continue;
      incomingFcKeys.add(`${normTxt(r.description)}|${moneyKey(r.netAmount)}`);
    }
    if (syncMode === "replace") {
      const toDelete = (existingFcs || []).filter((f: any) => {
        if (f.transaction_id) return false;
        const k = `${normTxt(f.description)}|${moneyKey(Number(f.amount) || 0)}`;
        return !incomingFcKeys.has(k);
      }).map((f: any) => f.id);
      if (toDelete.length > 0) {
        await admin.from("event_forecasts").delete().in("id", toDelete);
      }
    }

    const createdForecastIds: string[] = [];
    const createdTransactionIds: string[] = [];
    const skippedForecasts: number[] = [];
    const skippedTransactions: number[] = [];

    const formalidadeMap: Record<string, string> = {
      "Fechado": "fechado",
      "Negociado": "negociacao",
      "Estimado": "estimado",
      "Cotação": "estimado",
    };

    const insertTxIfNew = async (
      r: ParsedRow,
      payload: Record<string, any>,
      keyOverrideDesc?: string,
    ): Promise<string | null> => {
      const supId = payload.supplier_id ?? "_";
      const amt = moneyKey(Number(payload.amount) || 0);
      const descKey = normTxt(keyOverrideDesc ?? payload.description);
      const invKey = payload.invoice_ref
        ? `INV|${supId}|${normTxt(payload.invoice_ref)}|${amt}`
        : null;
      const dscKey = `DSC|${supId}|${descKey}|${amt}|${payload.payment_date ?? ""}`;
      if ((invKey && txKeySet.has(invKey)) || txKeySet.has(dscKey)) {
        skippedTransactions.push(r.rowNumber);
        return null;
      }
      const { data, error } = await admin.from("transactions").insert({ company_id: ev.company_id, ...payload }).select("id").single();
      if (error || !data) {
        console.error("tx insert failed row", r.rowNumber, error);
        return null;
      }
      if (invKey) txKeySet.add(invKey);
      txKeySet.add(dscKey);
      return data.id;
    };

    for (const r of parsed.rows) {
      if (r.excluded) continue;

      const categoryId = categoryFor(r.rawCenterCusto);
      const supplierId = r.supplier ? supByName.get(r.supplier) ?? null : null;

      // ── Forecast dedupe (descrição + valor; ignora categoria para preservar reclassificações)
      const fcKey = `${normTxt(r.description)}|${moneyKey(r.netAmount)}`;
      if (fcKeySet.has(fcKey)) {
        skippedForecasts.push(r.rowNumber);
      } else {
        const { data: fc, error: fErr } = await admin
          .from("event_forecasts")
          .insert({
            company_id: ev.company_id,
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
        } else {
          createdForecastIds.push(fc.id);
          fcKeySet.add(fcKey);
        }
      }

      // ── Transactions
      if (r.status === "pending") continue;
      if (r.status === "partial" && r.paidNet <= 0) continue;

      if (r.status === "partial" && r.paidNet > 0 && r.paidNet < r.netAmount) {
        const remainder = +(r.netAmount - r.paidNet).toFixed(2);
        const remainderIva = +(r.ivaAmount - r.paidIva).toFixed(2);
        const t1Id = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description, amount: r.paidNet,
          iva_rate: r.paidNet > 0 ? Math.round((r.paidIva / r.paidNet) * 100) : r.ivaRate,
          date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "paid", supplier_id: supplierId,
          paid_amount: +(r.paidNet + r.paidIva).toFixed(2),
          payment_date: r.paymentDate, due_date: r.dueDate, invoice_ref: r.invoiceRef,
        });
        const t2Id = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description + " (saldo)", amount: remainder,
          iva_rate: remainder > 0 ? Math.round((remainderIva / remainder) * 100) : r.ivaRate,
          date: r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "pending", supplier_id: supplierId,
          due_date: r.dueDate, invoice_ref: r.invoiceRef,
        }, r.description + " (saldo)");
        if (t1Id) createdTransactionIds.push(t1Id);
        if (t2Id) createdTransactionIds.push(t2Id);
        continue;
      }

      if (r.status === "paid") {
        const tId = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
          date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
          status: "paid", supplier_id: supplierId,
          paid_amount: r.grossAmount, payment_date: r.paymentDate,
          due_date: r.dueDate, invoice_ref: r.invoiceRef,
        });
        if (tId) createdTransactionIds.push(tId);
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
      skippedForecasts: skippedForecasts.length,
      skippedTransactions: skippedTransactions.length,
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
        forecastsSkipped: skippedForecasts.length,
        transactionsSkipped: skippedTransactions.length,
        suppliersCreated: newSupplierIds.length,
        excludedAB: pendencies.excludedAB,
        pendencies,
        totals: parsed.totals,
      },
    });
  } catch (err) {
    console.error("apply-coala-bp error:", err, (err as Error)?.stack);
    return json({ error: (err as Error).message, stack: (err as Error)?.stack }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
