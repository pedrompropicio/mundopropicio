// classify-coala-tx-with-ai
// IA classificadora Gemini para TX em "0.0.99 A Classificar" (Coala apenas).
// POST { tx_ids?: string[], filter?: { onlyUnclassified, limit }, mode: "preview"|"apply" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COALA_COMPANY_ID = "7d831e59-6e82-427b-95a0-64904aae5dd2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida" }, 401);

    // Permission check
    const { data: rolesData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = new Set((rolesData ?? []).map((r: any) => r.role));
    const allowed = ["admin", "manager", "editor", "platform_admin"].some((r) => roles.has(r));
    if (!allowed) return json({ error: "Sem permissão" }, 403);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    const body = await req.json().catch(() => ({}));
    const mode: "preview" | "apply" = body.mode === "apply" ? "apply" : "preview";
    let txIds: string[] = Array.isArray(body.tx_ids) ? body.tx_ids.slice(0, 50) : [];

    // admin client for cross-table reads/writes
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fallback: filter mode (only unclassified Coala)
    if (txIds.length === 0 && body.filter?.onlyUnclassified) {
      const { data: fallbackCat } = await admin
        .from("account_categories")
        .select("id")
        .eq("company_id", COALA_COMPANY_ID)
        .eq("code", "0.0.99")
        .maybeSingle();
      if (!fallbackCat) return json({ error: "Categoria 0.0.99 Coala não encontrada" }, 500);
      const limit = Math.min(Math.max(Number(body.filter?.limit) || 50, 1), 50);
      const { data: txs } = await admin
        .from("transactions")
        .select("id")
        .eq("company_id", COALA_COMPANY_ID)
        .eq("category_id", fallbackCat.id)
        .order("amount", { ascending: false })
        .limit(limit);
      txIds = (txs ?? []).map((t: any) => t.id);
    }

    if (txIds.length === 0) return json({ error: "Nenhuma TX para classificar" }, 400);

    // Load all L3 leaves for Coala
    const { data: allCats } = await admin
      .from("account_categories")
      .select("id, code, name, type, parent_id, is_active")
      .eq("company_id", COALA_COMPANY_ID);
    const cats = (allCats ?? []) as any[];
    const parentIds = new Set(cats.filter((c) => c.parent_id).map((c) => c.parent_id));
    const leafs = cats.filter((c) => c.is_active && c.parent_id && !parentIds.has(c.id));
    const byId = new Map(cats.map((c) => [c.id, c]));
    const byCode = new Map(leafs.map((c) => [c.code, c]));
    const fallbackCatId = cats.find((c) => c.code === "0.0.99")?.id;

    const getL2Id = (catId: string | null | undefined): string | null => {
      if (!catId) return null;
      const cur = byId.get(catId);
      if (!cur || !cur.parent_id) return null;
      const parent = byId.get(cur.parent_id);
      if (!parent) return null;
      return parent.parent_id ? parent.id : cur.id;
    };

    // Build category list grouped by L2 for prompt
    const l2ById = new Map<string, { code: string; name: string; leafs: any[] }>();
    for (const leaf of leafs) {
      const l2Id = getL2Id(leaf.id);
      if (!l2Id) continue;
      const l2 = byId.get(l2Id);
      if (!l2) continue;
      if (!l2ById.has(l2Id)) l2ById.set(l2Id, { code: l2.code, name: l2.name, leafs: [] });
      l2ById.get(l2Id)!.leafs.push(leaf);
    }
    const planoText = Array.from(l2ById.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((l2) => {
        const lines = l2.leafs
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((l) => `  ${l.code} | ${l.name}`)
          .join("\n");
        return `[${l2.code} ${l2.name}]\n${lines}`;
      })
      .join("\n\n");

    // Load TX details
    const { data: txs } = await admin
      .from("transactions")
      .select("id, description, amount, supplier_id, event_id, category_id, company_id, type")
      .in("id", txIds);
    const txList = (txs ?? []) as any[];

    const supplierIds = Array.from(new Set(txList.map((t) => t.supplier_id).filter(Boolean)));
    const { data: supRows } = supplierIds.length
      ? await admin.from("suppliers").select("id, name").in("id", supplierIds)
      : { data: [] as any[] };
    const supById = new Map((supRows ?? []).map((s: any) => [s.id, s.name]));

    const eventIds = Array.from(new Set(txList.map((t) => t.event_id).filter(Boolean)));
    const { data: evRows } = eventIds.length
      ? await admin.from("events").select("id, name").in("id", eventIds)
      : { data: [] as any[] };
    const evById = new Map((evRows ?? []).map((e: any) => [e.id, e.name]));

    // BP linked (event_forecasts.transaction_id = tx.id)
    const { data: bpLinks } = await admin
      .from("event_forecasts")
      .select("transaction_id, category_id, description")
      .in("transaction_id", txIds)
      .is("version_id", null);
    const bpByTx = new Map((bpLinks ?? []).map((b: any) => [b.transaction_id, b]));

    const results: any[] = [];
    const stats = { processed: 0, auto_applied: 0, suggested: 0, kept: 0, skipped_l2_mismatch: 0, skipped_already_classified: 0 };

    for (const tx of txList) {
      stats.processed++;

      if (tx.company_id !== COALA_COMPANY_ID) {
        results.push({ tx_id: tx.id, action: "skipped", reason: "not_coala_company" });
        continue;
      }
      if (tx.category_id !== fallbackCatId) {
        stats.skipped_already_classified++;
        results.push({ tx_id: tx.id, action: "skipped", reason: "already_classified" });
        continue;
      }

      const supplierName = tx.supplier_id ? supById.get(tx.supplier_id) ?? null : null;
      const eventName = tx.event_id ? evById.get(tx.event_id) ?? null : null;
      const bp = bpByTx.get(tx.id);
      const bpL2Id = bp ? getL2Id(bp.category_id) : null;
      const bpL2 = bpL2Id ? byId.get(bpL2Id) : null;

      // Build prompt
      const bpBlock = bp && bpL2
        ? `\n- Linha BP origem: "${bp.description ?? ""}" (L2 alvo: ${bpL2.code} ${bpL2.name})`
        : "";

      const userPrompt = `Despesa a classificar:
- Descrição: "${tx.description ?? ""}"
- Fornecedor: ${supplierName ?? "(sem)"}
- Valor: €${Number(tx.amount).toFixed(2)}
- Evento: ${eventName ?? "(sem)"}${bpBlock}

Plano de contas L3 disponível (Coala Festival Portugal):
${planoText}

Regras OBRIGATÓRIAS:
- Retorna SEMPRE 3 candidatos (top-3), mesmo se 2º e 3º forem fracos.
- "confidence" entre 0 e 1; só usa >0.85 quando for muito óbvio.
- NÃO uses "2.6.08 Despesas Extras" como fallback genérico.
- Cachê de artista (nome de pessoa/banda na descrição) → categoria de Cachê Artístico.
- Estrutura técnica (palco/som/luz/LED no palco) → 2.3.*.
- Hospedagem (quartos/hotel) → 2.2.02.
- Direitos autorais (PASSMUSICA/AUDIOGEST/SPA) → 2.7.01.
- Seguros → 2.7.02.
- Contabilidade/auditoria (EXPERT NUMBERS, contabilista) → 10.7.* serviços profissionais.
- TAP/voos/comboios → 2.2.01.`;

      const systemPrompt = `Sou um auditor contabilístico para festivais de música em Portugal. Classifico despesas no plano de contas L3 do MP Gestão Eventos. Devolvo APENAS através da função classify_expense (tool call). Considero descrição + fornecedor + valor + evento em conjunto.`;

      let aiResponse: any = null;
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.05,
            tools: [
              {
                type: "function",
                function: {
                  name: "classify_expense",
                  description: "Return top-3 L3 candidates",
                  parameters: {
                    type: "object",
                    properties: {
                      candidates: {
                        type: "array",
                        minItems: 3,
                        maxItems: 3,
                        items: {
                          type: "object",
                          properties: {
                            category_code: { type: "string" },
                            confidence: { type: "number" },
                            reasoning: { type: "string" },
                          },
                          required: ["category_code", "confidence", "reasoning"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["candidates"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "classify_expense" } },
          }),
        });

        if (!r.ok) {
          const t = await r.text();
          if (r.status === 429) {
            results.push({ tx_id: tx.id, action: "error", reason: "rate_limit" });
            continue;
          }
          if (r.status === 402) {
            return json({ error: "Créditos Lovable AI esgotados", processed_so_far: results.length }, 402);
          }
          console.error("AI gateway error", r.status, t.slice(0, 300));
          results.push({ tx_id: tx.id, action: "error", reason: `gateway_${r.status}` });
          continue;
        }
        const data = await r.json();
        const tc = data.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) aiResponse = JSON.parse(tc.function.arguments);
      } catch (e) {
        console.error("AI call failed for tx", tx.id, e);
        results.push({ tx_id: tx.id, action: "error", reason: "ai_call_failed" });
        continue;
      }

      if (!aiResponse || !Array.isArray(aiResponse.candidates) || aiResponse.candidates.length === 0) {
        results.push({ tx_id: tx.id, action: "error", reason: "no_candidates" });
        continue;
      }

      // Resolve codes to IDs + L2 guard
      let candidates = aiResponse.candidates
        .map((c: any) => {
          const cat = byCode.get(c.category_code);
          return cat ? { ...c, category_id: cat.id, category_name: cat.name, l2_id: getL2Id(cat.id) } : null;
        })
        .filter(Boolean);

      const filterApplied = !!bpL2Id;
      if (bpL2Id) {
        candidates = candidates.filter((c: any) => c.l2_id === bpL2Id);
      }

      if (candidates.length === 0) {
        stats.skipped_l2_mismatch++;
        // Log even when no candidate survives — for auditing
        await admin.from("coala_ai_classification_suggestions").insert({
          transaction_id: tx.id,
          company_id: COALA_COMPANY_ID,
          requested_by: user.id,
          ai_response_raw: aiResponse,
          top_candidate_code: null,
          top_candidate_id: null,
          top_confidence: null,
          bp_l2_filter_applied: true,
          applied_auto: false,
        });
        results.push({
          tx_id: tx.id,
          action: "skipped",
          reason: "no_candidate_matches_bp_l2",
          bp_l2_code: bpL2?.code,
          ai_candidates_raw: aiResponse.candidates,
        });
        continue;
      }

      const top = candidates[0];
      const second = candidates[1] ?? null;
      const decisive = top.confidence >= 0.85 && (!second || (top.confidence - second.confidence) > 0.2);

      const shouldAutoApply = mode === "apply" && decisive;

      // Insert suggestion row (audit)
      const { data: insertedSug } = await admin
        .from("coala_ai_classification_suggestions")
        .insert({
          transaction_id: tx.id,
          company_id: COALA_COMPANY_ID,
          requested_by: user.id,
          ai_response_raw: aiResponse,
          top_candidate_code: top.category_code,
          top_candidate_id: top.category_id,
          top_confidence: top.confidence,
          bp_l2_filter_applied: filterApplied,
          applied_auto: shouldAutoApply,
          applied_at: shouldAutoApply ? new Date().toISOString() : null,
          applied_by: shouldAutoApply ? user.id : null,
        })
        .select("id")
        .single();

      if (shouldAutoApply) {
        // Mark match source then update
        await admin.rpc("set_coala_match_source", { source: "ai_classifier" });
        const { error: updErr } = await admin
          .from("transactions")
          .update({ category_id: top.category_id })
          .eq("id", tx.id);
        if (updErr) {
          // rollback suggestion flag
          await admin
            .from("coala_ai_classification_suggestions")
            .update({ applied_auto: false, applied_at: null, applied_by: null })
            .eq("id", insertedSug?.id);
          results.push({ tx_id: tx.id, action: "error", reason: `update_failed: ${updErr.message}` });
          continue;
        }
        stats.auto_applied++;
        results.push({
          tx_id: tx.id,
          action: "auto_applied",
          category: top.category_code,
          category_name: top.category_name,
          confidence: top.confidence,
          reasoning: top.reasoning,
        });
      } else {
        if (top.confidence < 0.6) stats.kept++;
        else stats.suggested++;
        results.push({
          tx_id: tx.id,
          action: top.confidence < 0.6 ? "kept_unclassified" : "suggested",
          top_candidate: top.category_code,
          top_candidate_name: top.category_name,
          confidence: top.confidence,
          reasoning: top.reasoning,
          candidates: candidates.map((c: any) => ({
            category_code: c.category_code,
            category_name: c.category_name,
            confidence: c.confidence,
            reasoning: c.reasoning,
          })),
          suggestion_id: insertedSug?.id,
        });
      }
    }

    return json({ mode, stats, results });
  } catch (e) {
    console.error("classify-coala-tx-with-ai error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
