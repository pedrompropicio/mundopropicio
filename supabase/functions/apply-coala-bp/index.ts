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

    // Pre-load suppliers
    const { data: existingSups } = await admin
      .from("suppliers")
      .select("id, name")
      .eq("company_id", ev.company_id)
      .eq("is_active", true);

    // Pre-load conta de liquidação default = "Banco Santander Totta"
    const { data: santanderAcc } = await admin
      .from("financial_accounts")
      .select("id")
      .eq("company_id", ev.company_id)
      .ilike("name", "%santander%totta%")
      .maybeSingle();
    const defaultAccountId: string | null = santanderAcc?.id ?? null;
    const today = () => new Date().toISOString().slice(0, 10);
    const supByName = new Map<string, string>();
    for (const s of (existingSups || [])) {
      supByName.set(String(s.name).toUpperCase().trim(), s.id);
    }

    const normTxt = (s: string | null) =>
      String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const moneyKey = (n: number) => Math.round(n * 100); // tolerância 0.005€

    // ── Dedupe pre-load (também precisamos para preview)
    const { data: existingFcs } = await admin
      .from("event_forecasts")
      .select("id, category_id, description, amount, transaction_id, type")
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
    // PHASE = "compare": diff puro entre XLSX e BP/TX/Sponsors atuais (read-only)
    // ===========================================================================
    if (phase === "compare") {
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

      // Index XLSX rows by exact key (descNorm|cents)
      const fileRows = parsed.rows.filter((r) => !r.excluded);
      const fileByKey = new Map<string, ParsedRow>();
      const fileByDesc = new Map<string, ParsedRow[]>();
      for (const r of fileRows) {
        fileByKey.set(`${normTxt(r.description)}|${moneyKey(r.netAmount)}`, r);
        const k = normTxt(r.description);
        const arr = fileByDesc.get(k) ?? [];
        arr.push(r);
        fileByDesc.set(k, arr);
      }

      // Helper para "descrição base" — remove sufixos de parcela / Nx
      const baseDesc = (s: string): string => {
        let x = normTxt(s);
        // remove " - parcela NN", " parcela NN", " - NN", " (NN)", " NN/MM"
        x = x.replace(/\s*[-–]\s*parcela\s*\d+.*$/i, "");
        x = x.replace(/\s+parcela\s*\d+.*$/i, "");
        x = x.replace(/\s*[-–]\s*\d{1,2}\s*(de|\/)\s*\d{1,2}.*$/i, "");
        x = x.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\).*$/i, "");
        x = x.replace(/\s*[-–]\s*\d{1,2}\s*$/i, "");
        return x.trim();
      };

      // SÓ comparamos despesas — o XLSX V13 lista apenas despesas (P&L > P_L Despesas)
      const bpRows = ((existingFcs || []) as any[]).filter((f) => f.type === "expense");
      const bpByKey = new Map<string, any>();
      const bpByDesc = new Map<string, any[]>();
      const bpByBase = new Map<string, any[]>();
      for (const f of bpRows) {
        bpByKey.set(`${normTxt(f.description)}|${moneyKey(Number(f.amount) || 0)}`, f);
        const k = normTxt(f.description);
        const arr = bpByDesc.get(k) ?? [];
        arr.push(f);
        bpByDesc.set(k, arr);
        const bk = baseDesc(f.description);
        const barr = bpByBase.get(bk) ?? [];
        barr.push(f);
        bpByBase.set(bk, barr);
      }

      // Agregar XLSX por base description (junta "X parcela 01" + "X parcela 02" → X)
      const fileByBase = new Map<string, { desc: string; total: number; rows: ParsedRow[] }>();
      for (const r of fileRows) {
        const bk = baseDesc(r.description);
        const ent = fileByBase.get(bk) ?? { desc: r.description, total: 0, rows: [] };
        ent.total += r.netAmount;
        ent.rows.push(r);
        fileByBase.set(bk, ent);
      }

      // Missing in BP: file rows whose key not in BP
      const missingInBp: any[] = [];
      // Mismatched: same description (or fuzzy match) but different amount
      const valueMismatches: any[] = [];
      const matchedFileKeys = new Set<string>();
      const matchedBpIds = new Set<string>();

      // PASSO 1: match agregado por baseDesc — junta "X parcela 01"+"X parcela 02"
      // numa só comparação contra "X" (€40k) do BP. Cobre o caso "Lulu Santos".
      const aggregatedFileKeys = new Set<string>();
      for (const [bk, agg] of fileByBase.entries()) {
        const bpCandidates = bpByBase.get(bk) ?? [];
        if (bpCandidates.length === 0) continue;
        // só vale a pena tratar como "agregado" quando há múltiplas linhas em algum lado
        if (agg.rows.length < 2 && bpCandidates.length < 2) continue;
        const bpTotal = bpCandidates.reduce((a, f) => a + (Number(f.amount) || 0), 0);
        const delta = +(agg.total - bpTotal).toFixed(2);
        aggregatedFileKeys.add(bk);
        for (const r of agg.rows) matchedFileKeys.add(`${normTxt(r.description)}|${moneyKey(r.netAmount)}`);
        for (const f of bpCandidates) matchedBpIds.add(f.id);
        if (Math.abs(delta) > 0.01) {
          valueMismatches.push({
            description: agg.desc,
            bpDescription: bpCandidates.map((f) => f.description).join(" + "),
            fileAmount: +agg.total.toFixed(2),
            bpAmount: +bpTotal.toFixed(2),
            delta,
            rowNumber: agg.rows[0].rowNumber,
            bpId: bpCandidates[0].id,
            aggregated: true,
            fileLines: agg.rows.length,
            bpLines: bpCandidates.length,
          });
        }
      }

      // PASSO 2: linhas que sobraram (sem match agregado)
      for (const r of fileRows) {
        const k = `${normTxt(r.description)}|${moneyKey(r.netAmount)}`;
        if (matchedFileKeys.has(k)) continue;
        if (aggregatedFileKeys.has(baseDesc(r.description))) continue;
        if (bpByKey.has(k)) {
          matchedFileKeys.add(k);
          matchedBpIds.add(bpByKey.get(k).id);
          continue;
        }
        const sameDesc = (bpByDesc.get(normTxt(r.description)) ?? []).filter((f) => !matchedBpIds.has(f.id));
        if (sameDesc.length > 0) {
          const best = sameDesc[0];
          valueMismatches.push({
            description: r.description,
            fileAmount: r.netAmount,
            bpAmount: Number(best.amount) || 0,
            delta: +(r.netAmount - (Number(best.amount) || 0)).toFixed(2),
            rowNumber: r.rowNumber,
            bpId: best.id,
          });
          matchedBpIds.add(best.id);
          continue;
        }
        let bestF: { f: any; score: number } | null = null;
        for (const f of bpRows) {
          if (matchedBpIds.has(f.id)) continue;
          const s = dice(r.description, f.description);
          if (s >= 0.7 && (!bestF || s > bestF.score)) bestF = { f, score: s };
        }
        if (bestF) {
          valueMismatches.push({
            description: r.description,
            bpDescription: bestF.f.description,
            fileAmount: r.netAmount,
            bpAmount: Number(bestF.f.amount) || 0,
            delta: +(r.netAmount - (Number(bestF.f.amount) || 0)).toFixed(2),
            rowNumber: r.rowNumber,
            bpId: bestF.f.id,
            fuzzyScore: +bestF.score.toFixed(2),
          });
          matchedBpIds.add(bestF.f.id);
        } else {
          missingInBp.push({
            rowNumber: r.rowNumber,
            description: r.description,
            supplier: r.supplier,
            netAmount: r.netAmount,
          });
        }
      }

      // Extra in BP: BP rows not matched against any file row
      const extraInBp: any[] = [];
      for (const f of bpRows) {
        if (matchedBpIds.has(f.id)) continue;
        extraInBp.push({
          id: f.id,
          description: f.description,
          amount: Number(f.amount) || 0,
          hasTransaction: !!f.transaction_id,
        });
      }

      // Sponsors compare (Pipe sheet vs current sponsorship_pipeline)
      const { data: existingSponsors } = await admin
        .from("sponsorship_pipeline")
        .select("id, supplier_name, stage, confirmed_amount, proposed_amount")
        .eq("event_id", eventId);
      const fileSponsors = (parsed.sponsors || []) as any[];
      const sponsorByName = new Map<string, any>();
      for (const s of (existingSponsors || [])) sponsorByName.set(normTxt(s.supplier_name), s);
      const sponsorMissing: any[] = [];
      const sponsorMismatch: any[] = [];
      const sponsorMatchedIds = new Set<string>();
      for (const s of fileSponsors) {
        const m = sponsorByName.get(normTxt(s.name));
        if (!m) { sponsorMissing.push(s); continue; }
        sponsorMatchedIds.add(m.id);
        const dC = +(s.confirmed - (Number(m.confirmed_amount) || 0)).toFixed(2);
        const dProp = +((s.pipe + s.proposal) - (Number(m.proposed_amount) || 0)).toFixed(2);
        if (Math.abs(dC) > 0.01 || Math.abs(dProp) > 0.01) {
          sponsorMismatch.push({ name: s.name, file: { confirmed: s.confirmed, pipe: s.pipe, proposal: s.proposal }, db: { confirmed: Number(m.confirmed_amount) || 0, proposed: Number(m.proposed_amount) || 0, stage: m.stage }, delta: { confirmed: dC, proposed: dProp } });
        }
      }
      const sponsorExtra = (existingSponsors || []).filter((s: any) => !sponsorMatchedIds.has(s.id))
        .map((s: any) => ({ id: s.id, name: s.supplier_name, stage: s.stage, confirmed: Number(s.confirmed_amount) || 0, proposed: Number(s.proposed_amount) || 0 }));

      const fileNetTotal = fileRows.reduce((a, r) => a + r.netAmount, 0);
      const bpNetTotal = bpRows.reduce((a: number, f: any) => a + (Number(f.amount) || 0), 0);

      return json({
        ok: true,
        phase: "compare",
        summary: {
          file: { lines: fileRows.length, net: +fileNetTotal.toFixed(2) },
          bp: { lines: bpRows.length, net: +bpNetTotal.toFixed(2), scope: "expense_only" },
          delta: { lines: bpRows.length - fileRows.length, net: +(bpNetTotal - fileNetTotal).toFixed(2) },
          missingInBp: missingInBp.length,
          extraInBp: extraInBp.length,
          valueMismatches: valueMismatches.length,
          sponsors: { missing: sponsorMissing.length, extra: sponsorExtra.length, mismatch: sponsorMismatch.length },
        },
        missingInBp,
        extraInBp,
        valueMismatches,
        sponsorMissing,
        sponsorExtra,
        sponsorMismatch,
      });
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
    // PHASE = "reset_reimport": apaga BP + TX do evento Coala (preserva mapa
    // descrição-base → category_id) e re-importa do zero, reaplicando as
    // categorias que o utilizador tinha ajustado linha-a-linha.
    // Patrocínios: NÃO toca (apenas faz check via phase=compare separadamente).
    // ===========================================================================
    if (phase === "reset_reimport") {
      // Helper: descrição base — remove sufixos de parcela / saldo / Nx
      const baseDesc = (s: string): string => {
        let x = normTxt(s);
        x = x.replace(/\s*\(\s*saldo\s*\)\s*$/i, "");
        x = x.replace(/\s*[-–]\s*parcela\s*\d+.*$/i, "");
        x = x.replace(/\s+parcela\s*\d+.*$/i, "");
        x = x.replace(/\s*[-–]\s*\d{1,2}\s*(de|\/)\s*\d{1,2}.*$/i, "");
        x = x.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\).*$/i, "");
        x = x.replace(/\s*[-–]\s*\d{1,2}\s*$/i, "");
        return x.trim();
      };

      // Snapshot do BP atual ANTES de apagar (recuperável)
      let bpVersionId: string | null = null;
      try {
        const { data: snapId } = await admin.rpc("create_bp_snapshot", {
          p_event_id: eventId,
          p_label: `Pré-RESET Coala ${fileVersion} (${new Date().toISOString().slice(0, 10)})`,
        });
        if (snapId) bpVersionId = snapId as string;
      } catch (e) {
        console.warn("create_bp_snapshot indisponível:", (e as Error).message);
      }

      // Construir mapa descricao-base → category_id a partir do BP atual
      const descBaseToCat = new Map<string, string>();
      const descBaseSupToCat = new Map<string, string>(); // (base|supplier_norm) → cat
      // Carregar suppliers para resolver supplier_id → name normalizado
      const supById = new Map<string, string>();
      for (const s of (existingSups || [])) supById.set(s.id, normTxt(String(s.name)));
      for (const f of (existingFcs || []) as any[]) {
        if (!f.category_id || !f.description) continue;
        const bk = baseDesc(f.description);
        if (bk && !descBaseToCat.has(bk)) descBaseToCat.set(bk, f.category_id);
      }
      // Também complementar via TX (que podem ter sido editadas independentemente)
      for (const t of (existingTxs || []) as any[]) {
        if (!t.category_id || !t.description) continue;
        const bk = baseDesc(t.description);
        if (bk && !descBaseToCat.has(bk)) descBaseToCat.set(bk, t.category_id);
        if (bk && t.supplier_id) {
          const supN = supById.get(t.supplier_id) ?? "";
          if (supN) descBaseSupToCat.set(`${bk}|${supN}`, t.category_id);
        }
      }

      // Apagar transações (cascade trata transaction_payments, documents, etc)
      const txIds = (existingTxs || []).map((t: any) => t.id);
      if (txIds.length > 0) {
        // payment_list_items: SET NULL via FK; mas transactions pode estar referenciada por outras tabelas com RESTRICT — usar cascade da BD onde existe
        const { error: delTxErr } = await admin.from("transactions").delete().in("id", txIds);
        if (delTxErr) {
          return json({ error: `Falha a apagar transações: ${delTxErr.message}` }, 500);
        }
      }

      // Apagar event_forecasts (todos do evento)
      const { error: delFcErr } = await admin.from("event_forecasts").delete().eq("event_id", eventId);
      if (delFcErr) {
        return json({ error: `Falha a apagar BP: ${delFcErr.message}` }, 500);
      }

      // Re-importar com mapa preservado
      const importBatchId = crypto.randomUUID();
      const newSupplierIds: string[] = [];
      const distinctSuppliers = new Set<string>();
      for (const r of parsed.rows) {
        if (r.excluded) continue;
        if (r.supplier) distinctSuppliers.add(r.supplier);
      }
      for (const name of distinctSuppliers) {
        if (supByName.has(name)) continue;
        const { data: ins } = await admin
          .from("suppliers")
          .insert({ name, company_id: ev.company_id, is_active: true })
          .select("id").single();
        if (ins) { supByName.set(name, ins.id); newSupplierIds.push(ins.id); }
      }

      const formalidadeMap: Record<string, string> = {
        "Fechado": "fechado", "Negociado": "negociacao", "Estimado": "estimado", "Cotação": "estimado",
      };

      const createdForecastIds: string[] = [];
      const createdTransactionIds: string[] = [];
      let preservedFromMap = 0;
      let fellbackToCC = 0;
      let fellbackToFallback = 0;
      // Tracking detalhado para painel de diff
      const failedForecasts: Array<{ row: number; description: string; supplier: string | null; netAmount: number; reason: string }> = [];
      const failedPaidTx: Array<{ row: number; description: string; supplier: string | null; expectedPaidGross: number; reason: string }> = [];
      // Soma esperada por categoria (BP líquido) — comparada com inserido depois
      const expectedNetByCat = new Map<string, number>();
      const expectedPaidByCat = new Map<string, number>();
      const catIdToCode = new Map<string, string>();
      const catIdToName = new Map<string, string>();
      for (const c of (allCats || []) as any[]) {
        catIdToCode.set(c.id, c.code ?? "");
        catIdToName.set(c.id, c.name ?? "");
      }

      const resolveCat = (r: ParsedRow): string => {
        const bk = baseDesc(r.description);
        const supN = r.supplier ? normTxt(r.supplier) : "";
        // 1) (base + supplier) → maior precisão
        if (bk && supN) {
          const hit = descBaseSupToCat.get(`${bk}|${supN}`);
          if (hit) { preservedFromMap++; return hit; }
        }
        // 2) só base
        if (bk) {
          const hit = descBaseToCat.get(bk);
          if (hit) { preservedFromMap++; return hit; }
        }
        // 3) Centro de custo do ficheiro → categoria
        if (r.rawCenterCusto) {
          const m = allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""));
          if (m) { fellbackToCC++; return m.id; }
        }
        // 4) Fallback "0.0.99 A Classificar"
        fellbackToFallback++;
        return fallback.id;
      };

      for (const r of parsed.rows) {
        if (r.excluded) continue;
        const categoryId = resolveCat(r);
        const supplierId = r.supplier ? supByName.get(r.supplier) ?? null : null;

        // Esperado por categoria (BP líquido)
        expectedNetByCat.set(categoryId, +(((expectedNetByCat.get(categoryId) ?? 0) + r.netAmount).toFixed(2)));
        // Esperado pago por categoria (bruto, só rows pagas/parciais)
        const expectedPaidGrossThis =
          r.status === "paid" ? r.grossAmount :
          r.status === "partial" && r.paidNet > 0 ? +(r.paidNet + r.paidIva).toFixed(2) : 0;
        if (expectedPaidGrossThis > 0) {
          expectedPaidByCat.set(categoryId, +(((expectedPaidByCat.get(categoryId) ?? 0) + expectedPaidGrossThis).toFixed(2)));
        }

        const { data: fc, error: fcErr } = await admin.from("event_forecasts").insert({
          company_id: ev.company_id, event_id: eventId, category_id: categoryId, type: "expense",
          description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
          status: "approved", approved_at: new Date().toISOString(), approved_by: user.email ?? user.id,
          formalidade: formalidadeMap[r.formalidade] ?? "estimado",
          notes: [`Coala ${fileVersion} (RESET)`, r.invoiceRef ? `Fatura ${r.invoiceRef}` : null].filter(Boolean).join(" • "),
        }).select("id").single();
        if (fc) createdForecastIds.push(fc.id);
        else failedForecasts.push({ row: r.rowNumber, description: r.description, supplier: r.supplier, netAmount: r.netAmount, reason: fcErr?.message ?? "insert falhou (sem erro)" });

        if (r.status === "pending") continue;
        if (r.status === "partial" && r.paidNet <= 0) continue;

        if (r.status === "partial" && r.paidNet > 0 && r.paidNet < r.netAmount) {
          const remainder = +(r.netAmount - r.paidNet).toFixed(2);
          const remainderIva = +(r.ivaAmount - r.paidIva).toFixed(2);
          const { data: t1, error: t1Err } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description, amount: r.paidNet,
            iva_rate: r.paidNet > 0 ? Math.round((r.paidIva / r.paidNet) * 100) : r.ivaRate,
            date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
            status: "paid", supplier_id: supplierId,
            paid_amount: +(r.paidNet + r.paidIva).toFixed(2),
            payment_date: r.paymentDate, due_date: r.dueDate, invoice_ref: r.invoiceRef,
          }).select("id").single();
          if (t1) createdTransactionIds.push(t1.id);
          else failedPaidTx.push({ row: r.rowNumber, description: r.description, supplier: r.supplier, expectedPaidGross: +(r.paidNet + r.paidIva).toFixed(2), reason: t1Err?.message ?? "insert TX paga falhou" });
          const { data: t2 } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description + " (saldo)", amount: remainder,
            iva_rate: remainder > 0 ? Math.round((remainderIva / remainder) * 100) : r.ivaRate,
            date: r.dueDate ?? new Date().toISOString().slice(0, 10),
            status: "pending", supplier_id: supplierId,
            due_date: r.dueDate, invoice_ref: r.invoiceRef,
          }).select("id").single();
          if (t2) createdTransactionIds.push(t2.id);
        } else if (r.status === "paid") {
          const { data: t, error: tErr } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
            date: r.paymentDate ?? r.dueDate ?? new Date().toISOString().slice(0, 10),
            status: "paid", supplier_id: supplierId,
            paid_amount: r.grossAmount, payment_date: r.paymentDate,
            due_date: r.dueDate, invoice_ref: r.invoiceRef,
          }).select("id").single();
          if (t) createdTransactionIds.push(t.id);
          else failedPaidTx.push({ row: r.rowNumber, description: r.description, supplier: r.supplier, expectedPaidGross: r.grossAmount, reason: tErr?.message ?? "insert TX paga falhou" });
        }
      }

      // ===========================================================================
      // RECONCILIAÇÃO OBRIGATÓRIA: somar BP/TX inseridos vs ficheiro (líquido)
      // Tolerância: 0,05 € (arredondamentos de cêntimo). Acima disso → erro.
      // ===========================================================================
      const TOL = 0.05;
      const expectedNet = Number(parsed.totals.netSum) || 0;
      const expectedGrossPaid = Number(parsed.totals.paidGrossSum) || 0;
      const expectedImportableLines = Number(parsed.totals.importableLines) || 0;

      // Soma real do BP inserido (com category_id para breakdown)
      const { data: insertedFcs, error: sumFcErr } = await admin
        .from("event_forecasts")
        .select("amount, category_id")
        .eq("event_id", eventId);
      if (sumFcErr) {
        return json({ error: `Reconciliação BP falhou: ${sumFcErr.message}` }, 500);
      }
      const actualBpNet = +((insertedFcs || []).reduce((a, f: any) => a + (Number(f.amount) || 0), 0)).toFixed(2);
      const bpDiff = +(actualBpNet - expectedNet).toFixed(2);
      const actualNetByCat = new Map<string, number>();
      for (const f of (insertedFcs || []) as any[]) {
        const k = f.category_id ?? "(null)";
        actualNetByCat.set(k, +(((actualNetByCat.get(k) ?? 0) + (Number(f.amount) || 0)).toFixed(2)));
      }

      // Soma real das TX (paid_amount = bruto efetivamente pago)
      const { data: insertedTxs, error: sumTxErr } = await admin
        .from("transactions")
        .select("paid_amount,status,category_id")
        .eq("event_id", eventId);
      if (sumTxErr) {
        return json({ error: `Reconciliação TX falhou: ${sumTxErr.message}` }, 500);
      }
      const actualPaidGross = +((insertedTxs || [])
        .filter((t: any) => t.status === "paid")
        .reduce((a, t: any) => a + (Number(t.paid_amount) || 0), 0)).toFixed(2);
      const paidDiff = +(actualPaidGross - expectedGrossPaid).toFixed(2);
      const actualPaidByCat = new Map<string, number>();
      for (const t of (insertedTxs || []) as any[]) {
        if (t.status !== "paid") continue;
        const k = t.category_id ?? "(null)";
        actualPaidByCat.set(k, +(((actualPaidByCat.get(k) ?? 0) + (Number(t.paid_amount) || 0)).toFixed(2)));
      }

      const linesDiff = (insertedFcs || []).length - expectedImportableLines;

      // Breakdown por categoria (só onde há diff > tolerância)
      const allCatKeys = new Set<string>([
        ...expectedNetByCat.keys(), ...actualNetByCat.keys(),
        ...expectedPaidByCat.keys(), ...actualPaidByCat.keys(),
      ]);
      const categoryBreakdown: Array<{
        categoryId: string; code: string; name: string;
        bpExpected: number; bpActual: number; bpDiff: number;
        paidExpected: number; paidActual: number; paidDiff: number;
      }> = [];
      for (const k of allCatKeys) {
        const bpE = +(expectedNetByCat.get(k) ?? 0).toFixed(2);
        const bpA = +(actualNetByCat.get(k) ?? 0).toFixed(2);
        const pdE = +(expectedPaidByCat.get(k) ?? 0).toFixed(2);
        const pdA = +(actualPaidByCat.get(k) ?? 0).toFixed(2);
        const bpD = +(bpA - bpE).toFixed(2);
        const pdD = +(pdA - pdE).toFixed(2);
        if (Math.abs(bpD) <= 0.005 && Math.abs(pdD) <= 0.005) continue;
        categoryBreakdown.push({
          categoryId: k,
          code: catIdToCode.get(k) ?? "",
          name: catIdToName.get(k) ?? "(sem categoria)",
          bpExpected: bpE, bpActual: bpA, bpDiff: bpD,
          paidExpected: pdE, paidActual: pdA, paidDiff: pdD,
        });
      }
      // Ordena por |bpDiff| + |paidDiff| desc, top 50
      categoryBreakdown.sort((a, b) => (Math.abs(b.bpDiff) + Math.abs(b.paidDiff)) - (Math.abs(a.bpDiff) + Math.abs(a.paidDiff)));
      const topCategoryDiffs = categoryBreakdown.slice(0, 50);

      const reconciliation = {
        ok: Math.abs(bpDiff) <= TOL && Math.abs(paidDiff) <= TOL && linesDiff === 0,
        bp: { expectedNet, actualBpNet, diff: bpDiff, tolerance: TOL },
        paid: { expectedGrossPaid, actualPaidGross, diff: paidDiff, tolerance: TOL },
        lines: { expected: expectedImportableLines, actual: (insertedFcs || []).length, diff: linesDiff },
        topCategoryDiffs,
        failedForecasts: failedForecasts.slice(0, 50),
        failedPaidTx: failedPaidTx.slice(0, 50),
        failedCounts: { forecasts: failedForecasts.length, paidTx: failedPaidTx.length },
      };

      const { data: run } = await admin.from("coala_import_runs").insert({
        company_id: ev.company_id, event_id: eventId, file_version: fileVersion, file_name: fileName ?? null,
        bp_version_id: bpVersionId, import_batch_id: importBatchId,
        status: reconciliation.ok ? "applied" : "applied_with_diff",
        totals: parsed.totals, validation_report: validation,
        pendencies_report: { reset_mode: true, preservedFromMap, fellbackToCC, fellbackToFallback,
          deletedForecasts: (existingFcs || []).length, deletedTransactions: txIds.length,
          reconciliation },
        created_transaction_ids: createdTransactionIds, created_forecast_ids: createdForecastIds,
        created_supplier_ids: newSupplierIds, applied_at: new Date().toISOString(), created_by: user.id,
      }).select("id").single();

      return json({
        ok: true, runId: run?.id ?? null, bpVersionId, phase: "reset_reimport",
        reconciliation,
        summary: {
          forecastsCreated: createdForecastIds.length,
          transactionsCreated: createdTransactionIds.length,
          suppliersCreated: newSupplierIds.length,
          deletedForecasts: (existingFcs || []).length,
          deletedTransactions: txIds.length,
          categoryMapping: {
            preservedFromAdjustedMap: preservedFromMap,
            fellbackToCenterOfCost: fellbackToCC,
            fellbackToAClassificar: fellbackToFallback,
          },
          totals: parsed.totals,
        },
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

      // ── Forecast dedupe (descrição+valor) + decisão manual/IA da fase preview
      const userDecision = decisions[String(r.rowNumber)];
      const fcKey = `${normTxt(r.description)}|${moneyKey(r.netAmount)}`;
      if (userDecision === "skip" || (userDecision !== "create" && fcKeySet.has(fcKey))) {
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

    // Pendency report — counts + detailed line lists for the final report
    const briefRow = (r: ParsedRow, extra?: string) => ({
      row: r.rowNumber,
      description: r.description,
      supplier: r.supplier,
      amount: r.netAmount,
      ...(extra ? { detail: extra } : {}),
    });
    const noCCRows = parsed.rows.filter((r: ParsedRow) => !r.excluded && !r.rawCenterCusto).map((r) => briefRow(r));
    const dateIntervalRows = parsed.rows.filter((r: ParsedRow) => !r.excluded && r.needsDateReview).map((r) => briefRow(r, r.dueDateRaw ?? ""));
    const formalidadeAmbiguousRows = parsed.rows.filter((r: ParsedRow) => !r.excluded && r.needsFormalidadeReview).map((r) => briefRow(r, r.formalidadeRaw ?? ""));
    const ivaSnappedRows = parsed.rows.filter((r: ParsedRow) => !r.excluded && r.warnings.some((w) => w.includes("IVA"))).map((r) => briefRow(r, `${r.ivaRateRaw}% → ${r.ivaRate}%`));
    const excludedABRows = parsed.rows.filter((r) => r.excluded).map((r) => briefRow(r, r.excludeReason ?? ""));

    const pendencies = {
      excludedAB: excludedABRows.length,
      noCC: noCCRows.length,
      dateInterval: dateIntervalRows.length,
      formalidadeAmbiguous: formalidadeAmbiguousRows.length,
      ivaSnapped: ivaSnappedRows.length,
      newSuppliers: newSupplierIds.length,
      skippedForecasts: skippedForecasts.length,
      skippedTransactions: skippedTransactions.length,
      details: {
        noCC: noCCRows,
        dateInterval: dateIntervalRows,
        formalidadeAmbiguous: formalidadeAmbiguousRows,
        ivaSnapped: ivaSnappedRows,
        excludedAB: excludedABRows,
      },
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
