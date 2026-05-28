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

const jwtRole = (authHeader: string | null): string | null => {
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Permite chamadas internas (ex.: sync-coala-from-drive) com service_role
    const isServiceRole = auth === `Bearer ${SERVICE_ROLE}` || jwtRole(auth) === "service_role";

    let user: { id: string } | null = null;
    if (!isServiceRole) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: { user: u } } = await userClient.auth.getUser();
      if (!u) return json({ error: "Sessão inválida" }, 401);
      user = { id: u.id };
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      SERVICE_ROLE,
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

    // Permissions: must be admin/manager/editor (skip se service_role interno)
    if (!isServiceRole) {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", user!.id);
      const allowedRoles = new Set(["admin", "manager", "editor", "platform_admin"]);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      if (![...roleSet].some((r) => allowedRoles.has(r as string))) {
        return json({ error: "Sem permissão para importar BP." }, 403);
      }
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
      String(s ?? "")
        .normalize("NFKC")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
        .replace(/[\u00AD\u034F\u17B4\u17B5]/g, "")
        .replace(/[\p{Cc}\p{Cf}]/gu, "")
        .replace(/[•·●○◦‣⁃▪▫■□◆◇★☆]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const moneyKey = (n: number) => Math.round(n * 100); // tolerância 0.005€

    // ── Dedupe pre-load (também precisamos para preview)
    const { data: existingFcs } = await admin
      .from("event_forecasts")
      .select("id, category_id, description, amount, transaction_id, type")
      .eq("event_id", eventId)
      .is("version_id", null);
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
      // Excluir forecasts ligados a sponsorship_pipeline (geridos pelo módulo de patrocínios)
      const { data: spForecastLinks } = await admin
        .from("sponsorship_pipeline")
        .select("linked_forecast_id, linked_transaction_id")
        .eq("event_id", eventId);
      const protectedFcIds = new Set<string>(
        (spForecastLinks || []).map((r: any) => r.linked_forecast_id).filter((x: any) => typeof x === "string"),
      );
      const protectedTxIds = new Set<string>(
        (spForecastLinks || []).map((r: any) => r.linked_transaction_id).filter((x: any) => typeof x === "string"),
      );

      const bpRows = ((existingFcs || []) as any[]).filter((f) => f.type === "expense" && !protectedFcIds.has(f.id));
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
      const pendingFile: ParsedRow[] = [];
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
          pendingFile.push(r);
        }
      }

      // PASSO 2.5: match por VALOR EXATO entre file rows pendentes e BP rows.
      // Aceita como rename APENAS se Dice ≥ 0.55 (defesa contra falsos positivos
      // tipo "Plataforma diária extra" ↔ "Custos com influencers" só por terem
      // o mesmo valor). Senão, vai para missingInBp para humano decidir.
      const renameOnly: any[] = [];
      const RENAME_DICE_MIN = 0.55;
      for (const r of pendingFile) {
        const target = moneyKey(r.netAmount);
        const candidates = bpRows.filter(
          (f) => !matchedBpIds.has(f.id) && moneyKey(Number(f.amount) || 0) === target,
        );
        if (candidates.length === 0) {
          missingInBp.push({
            rowNumber: r.rowNumber,
            description: r.description,
            supplier: r.supplier,
            netAmount: r.netAmount,
          });
          continue;
        }
        // escolhe o melhor por Dice
        let pick: any = null;
        let pickScore = -1;
        for (const f of candidates) {
          const s = dice(r.description, f.description);
          if (s > pickScore) { pick = f; pickScore = s; }
        }
        if (pick && pickScore >= RENAME_DICE_MIN) {
          renameOnly.push({
            rowNumber: r.rowNumber,
            description: r.description,
            bpDescription: pick.description,
            fileAmount: r.netAmount,
            bpAmount: Number(pick.amount) || 0,
            delta: 0,
            bpId: pick.id,
            fuzzyScore: +pickScore.toFixed(2),
            ambiguous: candidates.length > 1 ? candidates.length : undefined,
          });
          matchedBpIds.add(pick.id);
        } else {
          // valor bate mas descrição muito diferente → trata como nova linha;
          // o utilizador escolhe se vincula a um candidato top-N na UI
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
          transactionId: f.transaction_id ?? null,
        });
      }

      // Enriquecer "missingInBp" com Top-3 candidatos do BP (Dice ≥ 0.45 ou valor ±20%)
      const unmatchedBp = bpRows.filter((f) => !matchedBpIds.has(f.id));
      for (const m of missingInBp) {
        const target = Number(m.netAmount) || 0;
        const scored = unmatchedBp.map((f) => {
          const amt = Number(f.amount) || 0;
          const valueDelta = Math.abs(amt - target);
          const valueRatio = target > 0 ? valueDelta / target : 1;
          const descScore = dice(m.description, f.description);
          const valueScore = valueRatio <= 0.20 ? 1 - valueRatio / 0.20 : 0;
          const combined = descScore * 0.6 + valueScore * 0.4;
          return { f, descScore, valueDelta, valueRatio, combined };
        }).filter((x) => x.descScore >= 0.45 || x.valueRatio <= 0.20);
        scored.sort((a, b) => b.combined - a.combined);
        m.bpCandidates = scored.slice(0, 3).map((x) => ({
          id: x.f.id,
          description: x.f.description,
          amount: Number(x.f.amount) || 0,
          delta: +(target - (Number(x.f.amount) || 0)).toFixed(2),
          fuzzyScore: +x.descScore.toFixed(2),
          hasTransaction: !!x.f.transaction_id,
        }));
      }

      // PASSO 3: detector de split 1→N — uma linha BP corresponde a N linhas
      // do ficheiro cuja soma bate ±2%. Reduz falsos "missingInBp" quando
      // o utilizador desmembrou uma rubrica em sub-itens.
      const splitPending: any[] = [];
      const findSumCombination = (
        pool: any[], target: number, tolPct: number, maxK: number,
      ): any[] | null => {
        const tol = Math.max(0.01, target * tolPct);
        // limitar pool a candidatos plausíveis (≤ target+tol) e até 50 maiores
        const cands = pool
          .filter((r) => r.netAmount > 0 && r.netAmount <= target + tol)
          .sort((a, b) => b.netAmount - a.netAmount)
          .slice(0, 50);
        let found: any[] | null = null;
        const recurse = (idx: number, remaining: number, picked: any[]): boolean => {
          if (Math.abs(remaining) <= tol && picked.length >= 2) {
            found = picked.slice();
            return true;
          }
          if (picked.length >= maxK) return false;
          if (idx >= cands.length) return false;
          if (remaining < -tol) return false;
          for (let i = idx; i < cands.length; i++) {
            picked.push(cands[i]);
            if (recurse(i + 1, remaining - cands[i].netAmount, picked)) return true;
            picked.pop();
          }
          return false;
        };
        recurse(0, target, []);
        return found;
      };
      const unmatchedBpForSplit = bpRows.filter((f) => !matchedBpIds.has(f.id));
      for (const bp of unmatchedBpForSplit) {
        const target = Number(bp.amount) || 0;
        if (target < 100) continue;
        for (let k = 2; k <= 4; k++) {
          const combo = findSumCombination(missingInBp, target, 0.02, k);
          if (combo) {
            const sumActual = combo.reduce((a: number, r: any) => a + r.netAmount, 0);
            splitPending.push({
              bpId: bp.id,
              bpDescription: bp.description,
              bpAmount: target,
              fileRows: combo.map((r: any) => ({
                rowNumber: r.rowNumber, description: r.description, netAmount: r.netAmount,
              })),
              sumDelta: +(sumActual - target).toFixed(2),
            });
            for (const c of combo) {
              const idx = missingInBp.findIndex((m) => m.rowNumber === c.rowNumber);
              if (idx >= 0) missingInBp.splice(idx, 1);
            }
            // remover bp da extraInBp se lá estiver
            const eIdx = extraInBp.findIndex((e: any) => e.id === bp.id);
            if (eIdx >= 0) extraInBp.splice(eIdx, 1);
            matchedBpIds.add(bp.id);
            break;
          }
        }
      }

      // ── TX DIFF — espelho do BP, agora aplicado às transações
      // (protectedTxIds já carregado no topo via spForecastLinks)

      // Pool TX consideradas no diff (despesa, não-sponsor)
      const txPool = ((existingTxs || []) as any[]).filter((t) => !protectedTxIds.has(t.id));
      // Linhas do ficheiro que devem materializar TX (paid + partial>0)
      const fileTxRows = fileRows.filter((r) =>
        r.status === "paid" || (r.status === "partial" && r.paidNet > 0),
      );

      // Index TX por (descNorm|cents) e por desc
      const txByKey = new Map<string, any>();
      const txByDesc = new Map<string, any[]>();
      for (const t of txPool) {
        txByKey.set(`${normTxt(t.description)}|${moneyKey(Number(t.amount) || 0)}`, t);
        const k = normTxt(t.description);
        const arr = txByDesc.get(k) ?? [];
        arr.push(t);
        txByDesc.set(k, arr);
      }

      const txMatchedIds = new Set<string>();
      const txMissing: any[] = [];
      const txValueMismatches: any[] = [];
      const pendingTxFile: ParsedRow[] = [];

      for (const r of fileTxRows) {
        const k = `${normTxt(r.description)}|${moneyKey(r.netAmount)}`;
        if (txByKey.has(k)) {
          const t = txByKey.get(k);
          if (!txMatchedIds.has(t.id)) { txMatchedIds.add(t.id); continue; }
        }
        const sameDesc = (txByDesc.get(normTxt(r.description)) ?? []).filter((t) => !txMatchedIds.has(t.id));
        if (sameDesc.length > 0) {
          const best = sameDesc[0];
          const isPaid = best.status === "paid" || Number(best.paid_amount || 0) > 0.005;
          txValueMismatches.push({
            rowNumber: r.rowNumber, description: r.description, txDescription: best.description,
            fileAmount: r.netAmount, txAmount: Number(best.amount) || 0,
            delta: +(r.netAmount - (Number(best.amount) || 0)).toFixed(2),
            txId: best.id, txStatus: best.status, txIsPaid: isPaid,
          });
          txMatchedIds.add(best.id);
          continue;
        }
        pendingTxFile.push(r);
      }

      // Match por valor exato pendentes ↔ TX restantes — Dice ≥ 0.55 obrigatório
      for (const r of pendingTxFile) {
        const target = moneyKey(r.netAmount);
        const cands = txPool.filter((t) => !txMatchedIds.has(t.id) && moneyKey(Number(t.amount) || 0) === target);
        if (cands.length >= 1) {
          let pick = cands[0]; let pickScore = -1;
          for (const t of cands) {
            const s = dice(r.description, t.description);
            if (s > pickScore) { pick = t; pickScore = s; }
          }
          if (pickScore >= RENAME_DICE_MIN) {
            const isPaid = pick.status === "paid" || Number(pick.paid_amount || 0) > 0.005;
            txValueMismatches.push({
              rowNumber: r.rowNumber, description: r.description, txDescription: pick.description,
              fileAmount: r.netAmount, txAmount: Number(pick.amount) || 0, delta: 0,
              txId: pick.id, txStatus: pick.status, txIsPaid: isPaid,
              renameOnly: true, fuzzyScore: +Math.max(0, pickScore).toFixed(2),
              ambiguous: cands.length > 1 ? cands.length : undefined,
            });
            txMatchedIds.add(pick.id);
            continue;
          }
        }
        // fuzzy ≥ 0.7 sem match de valor
        let bestF: { t: any; score: number } | null = null;
        for (const t of txPool) {
          if (txMatchedIds.has(t.id)) continue;
          const s = dice(r.description, t.description);
          if (s >= 0.7 && (!bestF || s > bestF.score)) bestF = { t, score: s };
        }
        if (bestF) {
          const isPaid = bestF.t.status === "paid" || Number(bestF.t.paid_amount || 0) > 0.005;
          txValueMismatches.push({
            rowNumber: r.rowNumber, description: r.description, txDescription: bestF.t.description,
            fileAmount: r.netAmount, txAmount: Number(bestF.t.amount) || 0,
            delta: +(r.netAmount - (Number(bestF.t.amount) || 0)).toFixed(2),
            txId: bestF.t.id, txStatus: bestF.t.status, txIsPaid: isPaid,
            fuzzyScore: +bestF.score.toFixed(2),
          });
          txMatchedIds.add(bestF.t.id);
        } else {
          txMissing.push({
            rowNumber: r.rowNumber, description: r.description,
            supplier: r.supplier, netAmount: r.netAmount,
            grossAmount: r.grossAmount, status: r.status,
            paymentDate: r.paymentDate, paidVia: r.paidVia,
          });
        }
      }

      // TX extra (no sistema, sem linha equivalente no XLSX) — sponsorship já filtrada
      const txExtra: any[] = [];
      for (const t of txPool) {
        if (txMatchedIds.has(t.id)) continue;
        const isPaid = t.status === "paid" || Number(t.paid_amount || 0) > 0.005;
        txExtra.push({
          id: t.id, description: t.description, amount: Number(t.amount) || 0,
          status: t.status, isPaid, paymentDate: t.payment_date,
        });
      }

      // Sponsors compare (Pipe sheet vs current sponsorship_pipeline) — não confundir
      // com a proteção de TX/forecasts: aqui é só comparação de números esperados.
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

      // ── Severity classifier — espelho com circuit breaker
      // Regra: planilha = verdade absoluta. Só vão a "review" desvios absurdos
      // (>= €10k absoluto OU >= 500% relativo) ou splits com baixa confiança.
      const ABS_THRESHOLD = 10000;   // €10k absoluto
      const PCT_THRESHOLD = 5.0;     // 500% (delta/base)
      const SPLIT_SUM_ABS_TOL = 200;  // €200 absoluto (auto se sumDelta < €200)
      const SPLIT_SUM_PCT_TOL = 0.05; // 5% relativo (auto se delta/base < 5%)
      const classifySeverity = (item: any, kind: string): "auto" | "review" => {
        switch (kind) {
          case "missingInBp": return "auto";
          case "extraInBp":   return "auto"; // Opção C: apaga sempre (com ou sem TX)
          case "renameOnly":  return "auto"; // delta=0, zero risco
          case "txMissing":   return "auto"; // Pago BR também é auto (supplier+partner fixos)
          case "txExtra":     return "auto"; // Opção B: apaga mesmo paga (Santander sem saldo)
          case "valueMismatch":
          case "txValueMismatch": {
            const delta = Math.abs(Number(item.delta) || 0);
            const base = Number(item.bpAmount ?? item.txAmount ?? 0);
            const pct = base > 0 ? delta / base : 0;
            if (delta >= ABS_THRESHOLD) return "review";
            if (pct >= PCT_THRESHOLD) return "review";
            return "auto";
          }
          case "splitPending": {
            const target = Number(item.bpAmount) || 0;
            const sumDelta = Math.abs(Number(item.sumDelta) || 0);
            const pct = target > 0 ? sumDelta / target : 0;
            // Auto se ABSOLUTO pequeno OU PERCENTUAL pequeno (não AND)
            if (sumDelta < SPLIT_SUM_ABS_TOL) return "auto";
            if (pct < SPLIT_SUM_PCT_TOL) return "auto";
            return "review";
          }
        }
        return "review";
      };
      for (const i of missingInBp) i.severity = classifySeverity(i, "missingInBp");
      for (const i of extraInBp) i.severity = classifySeverity(i, "extraInBp");
      for (const i of valueMismatches) i.severity = classifySeverity(i, "valueMismatch");
      for (const i of renameOnly) i.severity = classifySeverity(i, "renameOnly");
      for (const i of splitPending) i.severity = classifySeverity(i, "splitPending");
      for (const i of txMissing) i.severity = classifySeverity(i, "txMissing");
      for (const i of txValueMismatches) i.severity = classifySeverity(i, "txValueMismatch");
      for (const i of txExtra) i.severity = classifySeverity(i, "txExtra");

      const countSeverity = (arr: any[], sev: string) => arr.filter((x) => x.severity === sev).length;
      const autoCount =
        countSeverity(missingInBp, "auto") + countSeverity(extraInBp, "auto") +
        countSeverity(valueMismatches, "auto") + countSeverity(renameOnly, "auto") +
        countSeverity(splitPending, "auto") + countSeverity(txMissing, "auto") +
        countSeverity(txValueMismatches, "auto") + countSeverity(txExtra, "auto");
      const reviewCount =
        countSeverity(missingInBp, "review") + countSeverity(extraInBp, "review") +
        countSeverity(valueMismatches, "review") + countSeverity(renameOnly, "review") +
        countSeverity(splitPending, "review") + countSeverity(txMissing, "review") +
        countSeverity(txValueMismatches, "review") + countSeverity(txExtra, "review");

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
          renameOnly: renameOnly.length,
          splitPending: splitPending.length,
          tx: {
            fileLinesPaid: fileTxRows.length,
            poolSize: txPool.length,
            missing: txMissing.length,
            mismatches: txValueMismatches.length,
            extra: txExtra.length,
          },
          sponsors: { missing: sponsorMissing.length, extra: sponsorExtra.length, mismatch: sponsorMismatch.length },
          severity: { auto: autoCount, review: reviewCount },
          protected: { forecasts: protectedFcIds.size, transactions: protectedTxIds.size },
        },
        missingInBp,
        extraInBp,
        valueMismatches,
        renameOnly,
        splitPending,
        txMissing,
        txValueMismatches,
        txExtra,
        sponsorMissing,
        sponsorExtra,
        sponsorMismatch,
      });
    }

    // ===========================================================================
    // PHASE = "auto_apply": aplica APENAS items severity='auto' do diff de uma run base
    // Body extra: { basedOnRunId, configId? }  — fileBase64/eventId/fileVersion já vêm
    // ===========================================================================
    if (phase === "auto_apply") {
      const { basedOnRunId, configId: bodyConfigId, maxAutoDeletes = 0 } = body ?? {};
      if (!basedOnRunId) return json({ error: "auto_apply requer basedOnRunId" }, 400);

      const { data: baseRun } = await admin
        .from("coala_sync_runs")
        .select("id, config_id, diff")
        .eq("id", basedOnRunId)
        .maybeSingle();
      if (!baseRun || !baseRun.diff) {
        return json({ error: "Run base sem diff" }, 404);
      }
      const configId = bodyConfigId ?? baseRun.config_id;
      const diff: any = baseRun.diff ?? {};

      // ── safeMode (default 0): bloqueia auto_apply se houver QUALQUER DELETE auto.
      // Cobre extraInBp, txExtra, splitPending (cada split apaga 1 forecast original).
      const autoExtraInBp = (diff.extraInBp ?? []).filter((x: any) => x.severity === "auto").length;
      const autoTxExtra = (diff.txExtra ?? []).filter((x: any) => x.severity === "auto").length;
      const autoSplitPending = (diff.splitPending ?? []).filter((x: any) => x.severity === "auto").length;
      const autoDeleteCount = autoExtraInBp + autoTxExtra + autoSplitPending;
      const safeCap = Number(maxAutoDeletes);
      if (autoDeleteCount > safeCap) {
        await admin.from("coala_sync_runs").update({
          status: "needs_review",
          diff: {
            ...diff,
            safeModeBlock: {
              maxAutoDeletes: safeCap,
              autoDeleteCount,
              extraInBp: autoExtraInBp,
              txExtra: autoTxExtra,
              splitPending: autoSplitPending,
              blockedAt: new Date().toISOString(),
            },
          },
        }).eq("id", basedOnRunId);
        return json({
          ok: false, phase: "auto_apply", blocked: true, reason: "safeMode",
          maxAutoDeletes: safeCap, autoDeleteCount,
          message: `auto_apply bloqueado: ${autoDeleteCount} DELETE(s) auto excedem maxAutoDeletes=${safeCap}. Revisão manual obrigatória.`,
        }, 409);
      }


      // Snapshot BP (STRICT — abort se falhar; sem snapshot não há recovery)
      let bpVersionId: string | null = null;
      try {
        const { data: snapId, error: snapErr } = await admin.rpc("create_bp_snapshot", {
          _event_id: eventId,
          _description: `Pré-auto_apply Coala ${new Date().toISOString()}`,
          _created_by_label: "coala-auto-sync",
        });
        if (snapErr) throw new Error(snapErr.message);
        if (!snapId) throw new Error("create_bp_snapshot devolveu NULL (sem snapshot, sem recovery)");
        bpVersionId = snapId as string;
        console.log(`[auto_apply] bp_versions snapshot criado: ${bpVersionId}`);
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[auto_apply] ABORTADO — snapshot BP falhou: ${msg}`);
        return json({ error: `auto_apply abortado — snapshot BP falhou: ${msg}` }, 500);
      }

      // Protected IDs (sponsorship)
      const { data: spLinks } = await admin
        .from("sponsorship_pipeline")
        .select("linked_forecast_id, linked_transaction_id")
        .eq("event_id", eventId);
      const protectedFcIds = new Set<string>(
        (spLinks || []).map((r: any) => r.linked_forecast_id).filter((x: any) => typeof x === "string"),
      );
      const protectedTxIds = new Set<string>(
        (spLinks || []).map((r: any) => r.linked_transaction_id).filter((x: any) => typeof x === "string"),
      );

      // Index parsed rows by rowNumber for full data
      const rowByNum = new Map<number, ParsedRow>();
      for (const r of parsed.rows) {
        if (!r.excluded) rowByNum.set(r.rowNumber, r);
      }

      // Pre-create suppliers needed (for missingInBp + txMissing severity=auto)
      const neededSuppliers = new Set<string>();
      for (const it of (diff.missingInBp ?? [])) {
        if (it.severity === "auto" && it.supplier && !supByName.has(it.supplier)) {
          neededSuppliers.add(it.supplier);
        }
      }
      for (const it of (diff.txMissing ?? [])) {
        if (it.severity === "auto" && it.supplier && !supByName.has(it.supplier) && it.paidVia !== "BR") {
          neededSuppliers.add(it.supplier);
        }
      }
      const newSupplierIds: string[] = [];
      for (const rawName of neededSuppliers) {
        const name = String(rawName || "").trim().toUpperCase();
        if (!name || supByName.has(name)) continue;
        const { data: ins } = await admin
          .from("suppliers")
          .insert({ name, company_id: ev.company_id, is_active: true })
          .select("id").single();
        if (ins) { supByName.set(name, ins.id); newSupplierIds.push(ins.id); }
      }

      // BR partner heuristic (defense in depth — should already be 'review')
      const { data: epRows } = await admin
        .from("event_partners")
        .select("id, supplier_id, suppliers!inner(name)")
        .eq("event_id", eventId);
      const brPartnerCandidates = (epRows || []).filter((ep: any) => {
        const n = normTxt(ep.suppliers?.name ?? "");
        return /\bbr\b/.test(n) || n.includes("brasil") || n.includes("brazil") || n.includes("coala br");
      });
      const brPartnerId: string | null =
        brPartnerCandidates.length === 1 ? brPartnerCandidates[0].id : null;

      const formalidadeMap: Record<string, string> = {
        "Fechado": "fechado", "Negociado": "negociacao", "Estimado": "estimado", "Cotação": "estimado",
      };
      const resolveCatForRow = (r: ParsedRow): string => {
        if (r.rawCenterCusto) {
          const m = allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""));
          if (m) return m.id;
        }
        return fallback.id;
      };

      const audit = {
        forecastsInserted: 0,
        forecastsDeleted: 0,
        forecastsAmountUpdated: 0,
        forecastsRenamed: 0,
        txInserted: 0,
        txDeleted: 0,
        txAmountUpdated: 0,
        suppliersCreated: newSupplierIds.length,
        skipped: [] as Array<{ kind: string; reason: string; id?: string; rowNumber?: number }>,
        errors: [] as Array<{ kind: string; error: string; ref?: any }>,
      };

      // 1) missingInBp (auto) → INSERT forecast
      for (const it of (diff.missingInBp ?? [])) {
        if (it.severity !== "auto") continue;
        const r = rowByNum.get(it.rowNumber);
        if (!r) { audit.skipped.push({ kind: "missingInBp", reason: "row not in parsed", rowNumber: it.rowNumber }); continue; }
        const categoryId = resolveCatForRow(r);
        const { error } = await admin.from("event_forecasts").insert({
          company_id: ev.company_id, event_id: eventId, category_id: categoryId, type: "expense",
          description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
          status: "approved", approved_at: new Date().toISOString(),
          approved_by: "system:coala-auto-sync",
          formalidade: formalidadeMap[r.formalidade] ?? "estimado",
          notes: ["Coala auto-sync", r.invoiceRef ? `Fatura ${r.invoiceRef}` : null].filter(Boolean).join(" • "),
        });
        if (error) audit.errors.push({ kind: "missingInBp", error: error.message, ref: it.rowNumber });
        else audit.forecastsInserted++;
      }

      // 2) extraInBp (auto) → DELETE forecast (+ TX ligada se houver) + snapshot
      for (const it of (diff.extraInBp ?? [])) {
        if (it.severity !== "auto") continue;
        if (protectedFcIds.has(it.id)) { audit.skipped.push({ kind: "extraInBp", reason: "sponsorship-protected", id: it.id }); continue; }
        const { data: snap } = await admin.from("event_forecasts").select("*").eq("id", it.id).maybeSingle();
        if (!snap) { audit.skipped.push({ kind: "extraInBp", reason: "row gone", id: it.id }); continue; }
        const linkedTxId: string | null = (snap as any).transaction_id ?? it.transactionId ?? null;

        // Apaga TX ligada primeiro (se houver e não estiver protegida)
        if (linkedTxId && !protectedTxIds.has(linkedTxId)) {
          const { data: txSnap } = await admin.from("transactions").select("*").eq("id", linkedTxId).maybeSingle();
          if (txSnap) {
            const { error: txErr } = await admin.from("transactions").delete().eq("id", linkedTxId);
            if (txErr) { audit.errors.push({ kind: "extraInBp-tx", error: txErr.message, ref: linkedTxId }); }
            else {
              await admin.from("coala_sync_deletes").insert({
                config_id: configId, run_id: basedOnRunId,
                target_table: "transactions", target_id: linkedTxId,
                snapshot: txSnap, reason: "auto_apply: extraInBp cascade (TX ligada)",
              });
              audit.txDeleted++;
            }
          }
        } else if (linkedTxId && protectedTxIds.has(linkedTxId)) {
          audit.skipped.push({ kind: "extraInBp-tx", reason: "sponsorship-protected", id: linkedTxId });
        }

        const { error } = await admin.from("event_forecasts").delete().eq("id", it.id);
        if (error) { audit.errors.push({ kind: "extraInBp", error: error.message, ref: it.id }); continue; }
        await admin.from("coala_sync_deletes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "event_forecasts", target_id: it.id,
          snapshot: snap, reason: linkedTxId ? "auto_apply: extra in BP (com TX ligada)" : "auto_apply: extra in BP",
        });
        audit.forecastsDeleted++;
      }

      // 3) valueMismatches (auto) → UPDATE forecast.amount + audit
      for (const it of (diff.valueMismatches ?? [])) {
        if (it.severity !== "auto") continue;
        const fcId = it.bpId;
        if (!fcId || protectedFcIds.has(fcId)) { audit.skipped.push({ kind: "valueMismatch", reason: "no bpId or protected", id: fcId }); continue; }
        const oldVal = Number(it.bpAmount) || 0;
        const newVal = Number(it.fileAmount) || 0;
        // Skip no-op (evita poluir value_changes com old==new)
        if (Math.abs(oldVal - newVal) < 0.005) {
          audit.skipped.push({ kind: "valueMismatch", reason: "no-op (old==new)", id: fcId });
          continue;
        }
        const { error } = await admin.from("event_forecasts").update({ amount: newVal }).eq("id", fcId);
        if (error) { audit.errors.push({ kind: "valueMismatch", error: error.message, ref: fcId }); continue; }
        await admin.from("coala_sync_value_changes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "event_forecasts", target_id: fcId,
          field: "amount", old_value: oldVal, new_value: newVal,
        });
        audit.forecastsAmountUpdated++;
      }

      // 4) renameOnly (auto, dice≥0.85) → UPDATE forecast.description + audit
      for (const it of (diff.renameOnly ?? [])) {
        if (it.severity !== "auto") continue;
        const fcId = it.bpId;
        if (!fcId || protectedFcIds.has(fcId)) continue;
        const oldDesc = String(it.bpDescription ?? "");
        const newDesc = String(it.description ?? "");
        if (!newDesc || oldDesc === newDesc) continue;
        const { error } = await admin.from("event_forecasts").update({ description: newDesc }).eq("id", fcId);
        if (error) { audit.errors.push({ kind: "renameOnly", error: error.message, ref: fcId }); continue; }
        await admin.from("coala_sync_value_changes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "event_forecasts", target_id: fcId,
          field: "description", old_value: oldDesc, new_value: newDesc,
        });
        audit.forecastsRenamed++;
      }

      // 5) txMissing (auto) → INSERT transaction
      // Pago BR: supplier+partner fixos (regra de negócio Coala 2026)
      const COALA_BR_SUPPLIER_ID = "d42cdc45-ab7a-4ff5-9ff9-cfe785c211c1"; // COALA BRASIL (MANDO)
      const COALA_BR_PARTNER_ID  = "bfdbd7dc-b424-47ed-aae8-b15fb540a557"; // event_partners (sócio BR)
      for (const it of (diff.txMissing ?? [])) {
        if (it.severity !== "auto") continue;
        const r = rowByNum.get(it.rowNumber);
        if (!r) { audit.skipped.push({ kind: "txMissing", reason: "row not in parsed", rowNumber: it.rowNumber }); continue; }
        const categoryId = resolveCatForRow(r);
        const payDate = r.paymentDate ?? today();
        const isPagoBR = it.paidVia === "BR";
        const supplierId = isPagoBR
          ? COALA_BR_SUPPLIER_ID
          : (r.supplier ? supByName.get(r.supplier) ?? null : null);
        const accountId = isPagoBR ? null : defaultAccountId;

        const { data: t, error } = await admin.from("transactions").insert({
          company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
          date: payDate, status: "paid", supplier_id: supplierId,
          paid_amount: r.grossAmount, payment_date: payDate,
          due_date: r.dueDate, invoice_ref: r.invoiceRef,
          account_id: accountId,
        }).select("id").single();
        if (error || !t) {
          audit.errors.push({ kind: isPagoBR ? "txMissing-BR" : "txMissing", error: error?.message ?? "no id", ref: it.rowNumber });
          continue;
        }
        if (isPagoBR) {
          // schema partner_paid_expenses: id, event_id, partner_id, transaction_id, notes, paid_date, company_id
          // (não tem coluna amount — valor vem da transação ligada)
          const { error: ppeErr } = await admin.from("partner_paid_expenses").insert({
            company_id: ev.company_id,
            event_id: eventId,
            partner_id: COALA_BR_PARTNER_ID,
            transaction_id: t.id,
            paid_date: payDate,
            notes: "Coala auto-sync (Pago BR)",
          });
          if (ppeErr) {
            console.error(`[auto_apply] partner_paid_expenses INSERT falhou para tx=${t.id}: ${ppeErr.message}`);
            audit.errors.push({ kind: "partner_paid_expenses", error: ppeErr.message, ref: t.id });
          }
        }
        audit.txInserted++;
      }

      // 6) txValueMismatches (auto, !isPaid) → UPDATE tx.amount + audit
      for (const it of (diff.txValueMismatches ?? [])) {
        if (it.severity !== "auto") continue;
        const txId = it.txId;
        if (!txId || protectedTxIds.has(txId)) continue;
        if (it.txIsPaid) { audit.skipped.push({ kind: "txValueMismatch", reason: "tx is paid", id: txId }); continue; }
        const oldVal = Number(it.txAmount) || 0;
        const newVal = Number(it.fileAmount) || 0;
        if (Math.abs(oldVal - newVal) < 0.005) {
          audit.skipped.push({ kind: "txValueMismatch", reason: "no-op (old==new)", id: txId });
          continue;
        }
        const { error } = await admin.from("transactions").update({ amount: newVal }).eq("id", txId);
        if (error) { audit.errors.push({ kind: "txValueMismatch", error: error.message, ref: txId }); continue; }
        await admin.from("coala_sync_value_changes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "transactions", target_id: txId,
          field: "amount", old_value: oldVal, new_value: newVal,
        });
        audit.txAmountUpdated++;
      }

      // 7) txExtra (auto, paga ou não) → DELETE transaction + snapshot
      // Conta Santander em Live é sem controle de saldo: apagar TX paga não causa
      // inconsistência bancária. Planilha = verdade absoluta.
      for (const it of (diff.txExtra ?? [])) {
        if (it.severity !== "auto") continue;
        if (protectedTxIds.has(it.id)) { audit.skipped.push({ kind: "txExtra", reason: "sponsorship-protected", id: it.id }); continue; }
        const { data: snap } = await admin.from("transactions").select("*").eq("id", it.id).maybeSingle();
        if (!snap) continue;
        const { error } = await admin.from("transactions").delete().eq("id", it.id);
        if (error) { audit.errors.push({ kind: "txExtra", error: error.message, ref: it.id }); continue; }
        await admin.from("coala_sync_deletes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "transactions", target_id: it.id,
          snapshot: snap, reason: it.isPaid ? "auto_apply: extra TX (paga)" : "auto_apply: extra TX",
        });
        audit.txDeleted++;
      }

      // 8) splitPending (auto, soma bate <1%) → INSERT N forecasts + DELETE original
      for (const it of (diff.splitPending ?? [])) {
        if (it.severity !== "auto") continue;
        const bpId: string | null = it.bpId ?? null;
        if (!bpId || protectedFcIds.has(bpId)) {
          audit.skipped.push({ kind: "splitPending", reason: "no bpId or protected", id: bpId ?? undefined });
          continue;
        }
        const { data: origSnap } = await admin.from("event_forecasts").select("*").eq("id", bpId).maybeSingle();
        if (!origSnap) { audit.skipped.push({ kind: "splitPending", reason: "row gone", id: bpId }); continue; }

        const fileRowsArr: any[] = Array.isArray(it.fileRows) ? it.fileRows : [];
        if (fileRowsArr.length < 2) { audit.skipped.push({ kind: "splitPending", reason: "fileRows < 2", id: bpId }); continue; }

        // INSERT N novos forecasts a partir das fileRows (replicar lógica reset_reimport)
        const insertedIds: string[] = [];
        let insertErr = false;
        for (const fr of fileRowsArr) {
          const r = rowByNum.get(fr.rowNumber);
          if (!r) { audit.skipped.push({ kind: "splitPending", reason: "row not in parsed", rowNumber: fr.rowNumber }); insertErr = true; break; }
          const categoryId = resolveCatForRow(r);
          const { data: ins, error } = await admin.from("event_forecasts").insert({
            company_id: ev.company_id, event_id: eventId, category_id: categoryId, type: "expense",
            description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
            status: "approved", approved_at: new Date().toISOString(),
            approved_by: "system:coala-auto-sync",
            formalidade: formalidadeMap[r.formalidade] ?? "estimado",
            notes: ["Coala auto-sync (split)", `de bp ${bpId}`, r.invoiceRef ? `Fatura ${r.invoiceRef}` : null].filter(Boolean).join(" • "),
          }).select("id").single();
          if (error || !ins) { audit.errors.push({ kind: "splitPending-insert", error: error?.message ?? "no id", ref: fr.rowNumber }); insertErr = true; break; }
          insertedIds.push(ins.id);
          await admin.from("coala_sync_value_changes").insert({
            config_id: configId, run_id: basedOnRunId,
            target_table: "event_forecasts", target_id: ins.id,
            field: "split_created", old_value: 0, new_value: r.netAmount,
          });
          audit.forecastsInserted++;
        }
        if (insertErr) {
          // Rollback inserts
          if (insertedIds.length) await admin.from("event_forecasts").delete().in("id", insertedIds);
          continue;
        }

        // DELETE original
        const { error: delErr } = await admin.from("event_forecasts").delete().eq("id", bpId);
        if (delErr) {
          audit.errors.push({ kind: "splitPending-delete", error: delErr.message, ref: bpId });
          if (insertedIds.length) await admin.from("event_forecasts").delete().in("id", insertedIds);
          continue;
        }
        await admin.from("coala_sync_deletes").insert({
          config_id: configId, run_id: basedOnRunId,
          target_table: "event_forecasts", target_id: bpId,
          snapshot: origSnap, reason: `auto_apply: split 1→${insertedIds.length}`,
        });
        audit.forecastsDeleted++;
      }

      // Audit run record
      await admin.from("coala_import_runs").insert({
        company_id: ev.company_id, event_id: eventId,
        file_version: fileVersion, file_name: fileName ?? null,
        bp_version_id: bpVersionId,
        status: audit.errors.length === 0 ? "auto_applied" : "auto_applied_with_errors",
        totals: parsed.totals, validation_report: validation,
        pendencies_report: { auto_apply: true, basedOnRunId, audit },
        applied_at: new Date().toISOString(), created_by: user?.id ?? null,
      });

      return json({
        ok: true,
        phase: "auto_apply",
        bpVersionId,
        basedOnRunId,
        audit,
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
          _event_id: eventId,
          _description: `Pré-RESET Coala ${fileVersion} (${new Date().toISOString().slice(0, 10)})`,
          _created_by_label: "coala-auto-sync",
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

      // PROTEGER patrocínios: TX e forecasts ligados a sponsorship_pipeline
      // (linked_transaction_id / linked_forecast_id) NÃO devem ser apagados.
      // Caso contrário os cards do Pipeline ficam órfãos e o histórico de
      // patrocínios desaparece do BP/Tx, obrigando a recovery manual.
      const { data: pipelineLinks } = await admin
        .from("sponsorship_pipeline")
        .select("linked_transaction_id, linked_forecast_id")
        .eq("event_id", eventId);
      const protectedTxIds = new Set<string>(
        (pipelineLinks || [])
          .map((r: any) => r.linked_transaction_id)
          .filter((x: unknown): x is string => typeof x === "string"),
      );
      const protectedFcIds = new Set<string>(
        (pipelineLinks || [])
          .map((r: any) => r.linked_forecast_id)
          .filter((x: unknown): x is string => typeof x === "string"),
      );

      // Apagar transações (excepto as ligadas a patrocínios)
      const txIds = (existingTxs || [])
        .map((t: any) => t.id)
        .filter((id: string) => !protectedTxIds.has(id));
      if (txIds.length > 0) {
        const { error: delTxErr } = await admin.from("transactions").delete().in("id", txIds);
        if (delTxErr) {
          return json({ error: `Falha a apagar transações: ${delTxErr.message}` }, 500);
        }
      }

      // Apagar event_forecasts (excepto os ligados a patrocínios)
      const fcIdsToDelete = (existingFcs || [])
        .map((f: any) => f.id)
        .filter((id: string) => !protectedFcIds.has(id));
      if (fcIdsToDelete.length > 0) {
        const { error: delFcErr } = await admin
          .from("event_forecasts")
          .delete()
          .in("id", fcIdsToDelete);
        if (delFcErr) {
          return json({ error: `Falha a apagar BP: ${delFcErr.message}` }, 500);
        }
      }

      // Re-importar com mapa preservado
      const importBatchId = crypto.randomUUID();
      const newSupplierIds: string[] = [];
      const distinctSuppliers = new Set<string>();
      for (const r of parsed.rows) {
        if (r.excluded) continue;
        if (r.supplier) distinctSuppliers.add(r.supplier);
      }
      for (const rawName of distinctSuppliers) {
        const name = String(rawName || "").trim().toUpperCase();
        if (!name || supByName.has(name)) continue;
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
      let autoLearnedExact = 0;
      let autoLearnedFuzzy = 0;
      let ccProtectedConflicts = 0;
      // Tracking detalhado para painel de diff
      const failedForecasts: Array<{ row: number; description: string; supplier: string | null; netAmount: number; reason: string }> = [];
      const failedPaidTx: Array<{ row: number; description: string; supplier: string | null; expectedPaidGross: number; reason: string }> = [];
      const autoLearnedMeta: Array<{ row: number; description: string; supplier: string | null; categoryId: string; categoryCode: string; ruleId: string; matchedVia: 'exact' | 'fuzzy'; similarity?: number; confirmedCount: number }> = [];
      const ccProtectedLog: Array<{ row: number; description: string; supplier: string | null; xlsxSuggestedCC: string; systemCC: string; systemCategoryId: string }> = [];
      // Frente D: regras aprendidas rejeitadas por conflito L2 com CC do XLSX
      const rejectedLearningMeta: Array<{ row: number; description: string; supplier: string | null; ruleId: string; ruleCategoryId: string; ruleCategoryCode: string; xlsxCategoryId: string; xlsxCategoryCode: string; reason: 'l2_mismatch' }> = [];
      let rejectedLearningCount = 0;
      // Soma esperada por categoria (BP líquido) — comparada com inserido depois
      const expectedNetByCat = new Map<string, number>();
      const expectedPaidByCat = new Map<string, number>();
      const catIdToCode = new Map<string, string>();
      const catIdToName = new Map<string, string>();
      for (const c of (allCats || []) as any[]) {
        catIdToCode.set(c.id, c.code ?? "");
        catIdToName.set(c.id, c.name ?? "");
      }

      // ───────────────────────────────────────────────────────────
      // FRENTE 2: carregar regras de aprendizado supplier→categoria
      // (cross-event para a mesma empresa)
      // ───────────────────────────────────────────────────────────
      type LearnedRule = { id: string; supplier_id: string; description_normalized: string; category_id: string; confirmed_count: number };
      const learnedRulesBySupplier = new Map<string, LearnedRule[]>();
      try {
        const { data: rules } = await admin
          .from("coala_supplier_category_map")
          .select("id, supplier_id, description_normalized, category_id, confirmed_count")
          .eq("company_id", ev.company_id);
        for (const rl of (rules || []) as LearnedRule[]) {
          if (!catIdToCode.has(rl.category_id)) continue; // categoria desactivada
          const arr = learnedRulesBySupplier.get(rl.supplier_id) ?? [];
          arr.push(rl);
          learnedRulesBySupplier.set(rl.supplier_id, arr);
        }
      } catch (e) {
        console.warn("[learning] load failed:", (e as Error).message);
      }

      // Trigram similarity em JS (Sørensen-Dice sobre trigramas) — só usado se NÃO houve match exacto
      const trigrams = (s: string): Set<string> => {
        const padded = `  ${s}  `;
        const out = new Set<string>();
        for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
        return out;
      };
      const similarity = (a: string, b: string): number => {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const A = trigrams(a), B = trigrams(b);
        let inter = 0;
        for (const t of A) if (B.has(t)) inter++;
        return (2 * inter) / (A.size + B.size);
      };

      // Helper: devolve L2 id de uma categoria (L1→null, L2→self, L3→parent)
      const catById = new Map<string, any>();
      for (const c of (allCats || []) as any[]) catById.set(c.id, c);
      const getL2Id = (catId: string | null | undefined): string | null => {
        if (!catId) return null;
        const cur = catById.get(catId);
        if (!cur || !cur.parent_id) return null;
        const parent = catById.get(cur.parent_id);
        if (!parent) return null;
        return parent.parent_id ? parent.id : cur.id;
      };

      const resolveCat = (r: ParsedRow, supplierId: string | null): { catId: string; learned?: { ruleId: string; via: 'exact' | 'fuzzy'; sim?: number; confirmedCount: number } } => {
        const bk = baseDesc(r.description);
        const supN = r.supplier ? normTxt(r.supplier) : "";
        // 1) (base + supplier) → maior precisão (in-memory, mesmo evento)
        if (bk && supN) {
          const hit = descBaseSupToCat.get(`${bk}|${supN}`);
          if (hit) { preservedFromMap++; return { catId: hit }; }
        }
        // 2) só base (in-memory, mesmo evento)
        if (bk) {
          const hit = descBaseToCat.get(bk);
          if (hit) { preservedFromMap++; return { catId: hit }; }
        }
        // Pré-resolver categoria do XLSX (centro de custo) para validação L2 (Frente D)
        const xlsxCat = r.rawCenterCusto
          ? allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""))
          : null;
        const xlsxL2 = xlsxCat ? getL2Id(xlsxCat.id) : null;

        // 3) Learning table — match exacto por (supplier_id + descrição normalizada)
        if (supplierId) {
          const rules = learnedRulesBySupplier.get(supplierId);
          if (rules && rules.length > 0) {
            const descNorm = normTxt(r.description);
            const tryRule = (rl: LearnedRule, via: 'exact' | 'fuzzy', sim?: number) => {
              // Frente D: validar L2 contra CC do XLSX
              if (xlsxL2) {
                const ruleL2 = getL2Id(rl.category_id);
                if (ruleL2 && ruleL2 !== xlsxL2) {
                  rejectedLearningCount++;
                  rejectedLearningMeta.push({
                    row: r.rowNumber,
                    description: r.description,
                    supplier: r.supplier,
                    ruleId: rl.id,
                    ruleCategoryId: rl.category_id,
                    ruleCategoryCode: catIdToCode.get(rl.category_id) ?? "",
                    xlsxCategoryId: xlsxCat!.id,
                    xlsxCategoryCode: catIdToCode.get(xlsxCat!.id) ?? "",
                    reason: 'l2_mismatch',
                  });
                  return null;
                }
              }
              if (via === 'exact') autoLearnedExact++; else autoLearnedFuzzy++;
              return { catId: rl.category_id, learned: { ruleId: rl.id, via, sim, confirmedCount: rl.confirmed_count } };
            };
            const exact = rules.find((rl) => rl.description_normalized === descNorm);
            if (exact) {
              const res = tryRule(exact, 'exact');
              if (res) return res;
            }
            // 3b) Fuzzy ≥ 0.85
            let best: { rule: LearnedRule; sim: number } | null = null;
            for (const rl of rules) {
              const sim = similarity(descNorm, rl.description_normalized);
              if (sim >= 0.85 && (!best || sim > best.sim)) best = { rule: rl, sim };
            }
            if (best) {
              const res = tryRule(best.rule, 'fuzzy', best.sim);
              if (res) return res;
            }
          }
        }
        // 4) Centro de custo do ficheiro → categoria
        if (xlsxCat) { fellbackToCC++; return { catId: xlsxCat.id }; }
        // 5) Fallback "0.0.99 A Classificar"
        fellbackToFallback++;
        return { catId: fallback.id };
      };

      for (const r of parsed.rows) {
        if (r.excluded) continue;
        const supplierId = r.supplier ? supByName.get(r.supplier) ?? null : null;
        const resolved = resolveCat(r, supplierId);
        const categoryId = resolved.catId;
        if (resolved.learned) {
          autoLearnedMeta.push({
            row: r.rowNumber,
            description: r.description,
            supplier: r.supplier,
            categoryId,
            categoryCode: catIdToCode.get(categoryId) ?? "",
            ruleId: resolved.learned.ruleId,
            matchedVia: resolved.learned.via,
            similarity: resolved.learned.sim,
            confirmedCount: resolved.learned.confirmedCount,
          });
          // Detectar conflito: XLSX traz CC e learning diz outra coisa
          if (r.rawCenterCusto) {
            const xlsxCat = allCats.find((c: any) => c.parent_id != null && norm(c.name) === norm(r.rawCenterCusto || ""));
            if (xlsxCat && xlsxCat.id !== categoryId) {
              ccProtectedConflicts++;
              ccProtectedLog.push({
                row: r.rowNumber,
                description: r.description,
                supplier: r.supplier,
                xlsxSuggestedCC: r.rawCenterCusto,
                systemCC: catIdToName.get(categoryId) ?? "",
                systemCategoryId: categoryId,
              });
            }
          }
        }

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
          status: "approved", approved_at: new Date().toISOString(), approved_by: user?.email ?? user?.id ?? "system:sync-coala",
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
          const payDate = r.paymentDate ?? today();
          const { data: t1, error: t1Err } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description, amount: r.paidNet,
            iva_rate: r.paidNet > 0 ? Math.round((r.paidIva / r.paidNet) * 100) : r.ivaRate,
            date: payDate,
            status: "paid", supplier_id: supplierId,
            paid_amount: +(r.paidNet + r.paidIva).toFixed(2),
            payment_date: payDate, due_date: r.dueDate, invoice_ref: r.invoiceRef,
            account_id: defaultAccountId,
          }).select("id").single();
          if (t1) createdTransactionIds.push(t1.id);
          else failedPaidTx.push({ row: r.rowNumber, description: r.description, supplier: r.supplier, expectedPaidGross: +(r.paidNet + r.paidIva).toFixed(2), reason: t1Err?.message ?? "insert TX paga falhou" });
          const { data: t2 } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description + " (saldo)", amount: remainder,
            iva_rate: remainder > 0 ? Math.round((remainderIva / remainder) * 100) : r.ivaRate,
            date: r.dueDate ?? today(),
            status: "pending", supplier_id: supplierId,
            due_date: r.dueDate, invoice_ref: r.invoiceRef,
          }).select("id").single();
          if (t2) createdTransactionIds.push(t2.id);
        } else if (r.status === "paid") {
          const payDate = r.paymentDate ?? today();
          const { data: t, error: tErr } = await admin.from("transactions").insert({
            company_id: ev.company_id, event_id: eventId, type: "expense", category_id: categoryId,
            description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
            date: payDate,
            status: "paid", supplier_id: supplierId,
            paid_amount: r.grossAmount, payment_date: payDate,
            due_date: r.dueDate, invoice_ref: r.invoiceRef,
            account_id: defaultAccountId,
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
        .eq("event_id", eventId)
        .is("version_id", null);
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
          autoLearnedExact, autoLearnedFuzzy, ccProtectedConflicts,
          rejectedLearningCount,
          autoLearnedMeta: autoLearnedMeta.slice(0, 500),
          ccProtectedLog: ccProtectedLog.slice(0, 200),
          rejectedLearningMeta: rejectedLearningMeta.slice(0, 500),
          deletedForecasts: (existingFcs || []).length, deletedTransactions: txIds.length,
          reconciliation },
        created_transaction_ids: createdTransactionIds, created_forecast_ids: createdForecastIds,
        created_supplier_ids: newSupplierIds, applied_at: new Date().toISOString(), created_by: user?.id ?? null,
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
            autoLearnedExact,
            autoLearnedFuzzy,
            ccProtectedConflicts,
            rejectedLearningCount,
          },
          autoLearnedMeta: autoLearnedMeta.slice(0, 100),
          ccProtectedLog: ccProtectedLog.slice(0, 50),
          rejectedLearningMeta: rejectedLearningMeta.slice(0, 100),
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
    for (const rawName of distinctSuppliers) {
      const name = String(rawName || "").trim().toUpperCase();
      if (!name || supByName.has(name)) continue;
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
        _event_id: eventId,
        _description: `Pré-import Coala ${fileVersion} (${new Date().toISOString().slice(0, 10)})`,
        _created_by_label: "coala-auto-sync",
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
            approved_by: user?.email ?? user?.id ?? "system:sync-coala",
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
        const payDate = r.paymentDate ?? today();
        const t1Id = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description, amount: r.paidNet,
          iva_rate: r.paidNet > 0 ? Math.round((r.paidIva / r.paidNet) * 100) : r.ivaRate,
          date: payDate,
          status: "paid", supplier_id: supplierId,
          paid_amount: +(r.paidNet + r.paidIva).toFixed(2),
          payment_date: payDate, due_date: r.dueDate, invoice_ref: r.invoiceRef,
          account_id: defaultAccountId,
        });
        const t2Id = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description + " (saldo)", amount: remainder,
          iva_rate: remainder > 0 ? Math.round((remainderIva / remainder) * 100) : r.ivaRate,
          date: r.dueDate ?? today(),
          status: "pending", supplier_id: supplierId,
          due_date: r.dueDate, invoice_ref: r.invoiceRef,
        }, r.description + " (saldo)");
        if (t1Id) createdTransactionIds.push(t1Id);
        if (t2Id) createdTransactionIds.push(t2Id);
        continue;
      }

      if (r.status === "paid") {
        const payDate = r.paymentDate ?? today();
        const tId = await insertTxIfNew(r, {
          event_id: eventId, type: "expense", category_id: categoryId,
          description: r.description, amount: r.netAmount, iva_rate: r.ivaRate,
          date: payDate,
          status: "paid", supplier_id: supplierId,
          paid_amount: r.grossAmount, payment_date: payDate,
          due_date: r.dueDate, invoice_ref: r.invoiceRef,
          account_id: defaultAccountId,
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
        created_by: user?.id ?? null,
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
