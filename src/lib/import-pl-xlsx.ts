import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes } from "@/lib/utils";
import { createExpenseCategoryMatcher, getExpenseLeafCategories, normalizeCategoryCodeKey } from "@/lib/pl-category-matching";

export interface ParsedRow {
  description: string;
  specification: string | null;
  baseAmount: number;
  ivaAmount: number;
  total: number;
  ivaRate: number;
  attachments: string[];
  status: "paid" | "approved";
  hasFormulaError?: boolean;
}

export interface ParsedSheet {
  sheetName: string;
  rows: ParsedRow[];
  warnings: string[];
}

const STANDARD_IVA_RATES = [0, 6, 13, 23];

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function snapIvaRate(calculated: number): number {
  let closest = STANDARD_IVA_RATES[0];
  let minDiff = Math.abs(calculated - closest);
  for (const rate of STANDARD_IVA_RATES) {
    const diff = Math.abs(calculated - rate);
    if (diff < minDiff) { minDiff = diff; closest = rate; }
  }
  return closest;
}

function norm(s: string): string {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isCacheDescription(desc: string): boolean {
  const n = norm(desc);
  return n.includes("cache");
}

function findColumn(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) => {
    const n = norm(h);
    return keywords.some((kw) => n.includes(kw));
  });
}

function parseStatus(val: string): "paid" | "approved" | null {
  const n = norm(val);
  if (!n) return null;
  if (n === "pago" || n === "lancado" || n === "lançado") return "paid";
  if (n.includes("pago parcial") || n.includes("pagar") || n.includes("pendente") || n.includes("aberto") || n.includes("fluxo") || n.includes("outros")) return "approved";
  return "paid";
}

function hasFormulaError(val: any): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  return s.includes("#REF") || s.includes("#VALUE") || s.includes("#N/A") || s.includes("#DIV");
}

function parseNum(val: any): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || hasFormulaError(val)) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function isSkippableLine(desc: string, costRaw: any, totalRaw: any): boolean {
  const n = norm(desc);
  if (n.startsWith("total") || n.startsWith("subtotal")) return true;
  if (isCacheDescription(desc)) return false;
  // If raw values contain formula errors, this is a real data row — don't skip
  if (hasFormulaError(costRaw) || hasFormulaError(totalRaw)) return false;
  const costVal = parseNum(costRaw);
  const totalVal = parseNum(totalRaw);
  if (costVal === 0 && totalVal === 0) return true;
  return false;
}

function findHeaderRow(raw: any[][]): number {
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const row = raw[i].map((v: any) => norm(String(v || "")));
    if (row.some((c) => c.includes("descri")) && row.some((c) => c.includes("custo") || c.includes("valor") || c.includes("total"))) {
      return i;
    }
  }
  return -1;
}

export function parseXlsxPL(buffer: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: ParsedSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length < 2) { sheets.push({ sheetName, rows: [], warnings: ["Aba vazia"] }); continue; }

    const headerIdx = findHeaderRow(raw);
    if (headerIdx < 0) { sheets.push({ sheetName, rows: [], warnings: ["Cabeçalho não encontrado"] }); continue; }

    const headers = raw[headerIdx].map((h: any) => String(h));
    const descIdx = findColumn(headers, "descri");
    const specIdx = findColumn(headers, "especific");
    const costIdx = findColumn(headers, "custo", "valor", "base");
    const ivaIdx = findColumn(headers, "iva");
    const totalIdx = findColumn(headers, "total");
    let statusIdx = findColumn(headers, "status", "estado");

    // If status column header is empty, try to detect by checking data values
    if (statusIdx < 0 && totalIdx >= 0) {
      const candidateIdx = totalIdx + 1;
      if (candidateIdx < headers.length) {
        const statusKeywords = ["pago", "lancado", "lançado", "fluxo", "pendente", "aberto", "outros"];
        let matchCount = 0;
        for (let r = headerIdx + 1; r < Math.min(raw.length, headerIdx + 20); r++) {
          const val = norm(String(raw[r]?.[candidateIdx] ?? ""));
          if (val && statusKeywords.some((kw) => val.includes(kw))) matchCount++;
        }
        if (matchCount >= 2) statusIdx = candidateIdx;
      }
    }

    const knownCols = new Set([descIdx, specIdx, costIdx, ivaIdx, totalIdx, statusIdx].filter((i) => i >= 0));
    const maxKnown = Math.max(...knownCols, 0);
    const attachStartIdx = maxKnown + 1;

    const warnings: string[] = [];
    if (descIdx < 0) { warnings.push("Coluna de descrição não encontrada"); continue; }

    const rows: ParsedRow[] = [];

    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      const desc = String(row[descIdx] ?? "").trim();
      if (!desc) continue;

      const costRaw = costIdx >= 0 ? row[costIdx] : "";
      const totalRaw = totalIdx >= 0 ? row[totalIdx] : "";

      if (isSkippableLine(desc, costRaw, totalRaw)) continue;

      const rowHasFormulaError = hasFormulaError(costRaw) || hasFormulaError(totalRaw);
      const cost = parseNum(costRaw);
      const iva = ivaIdx >= 0 ? parseNum(row[ivaIdx]) : 0;
      const total = parseNum(totalRaw);

      let finalBase: number;
      let finalIva: number;
      if (total > 0 && cost > 0 && total < cost) {
        finalBase = total - iva;
        finalIva = iva;
        if (finalBase <= 0) { finalBase = total; finalIva = 0; }
      } else {
        finalBase = cost || (total - iva) || total;
        finalIva = iva || (total > 0 && cost > 0 ? total - cost : 0);
        if (finalBase <= 0 && total > 0) { finalBase = total; finalIva = 0; }
      }

      const calculatedRate = finalBase > 0 ? (finalIva / finalBase) * 100 : 0;
      const ivaRate = snapIvaRate(calculatedRate);

      const specification = specIdx >= 0 ? String(row[specIdx] ?? "").trim() || null : null;

      let status: "paid" | "approved" = "paid";
      if (statusIdx >= 0) {
        const parsed = parseStatus(String(row[statusIdx] ?? ""));
        if (parsed) status = parsed;
      }

      const attachments: string[] = [];
      for (let c = attachStartIdx; c < row.length; c++) {
        const val = String(row[c] ?? "").trim();
        if (val && val.length > 2) attachments.push(val);
      }

      rows.push({
        description: desc,
        specification,
        baseAmount: roundMoney(Math.abs(finalBase)),
        ivaAmount: roundMoney(Math.abs(finalIva)),
        total: roundMoney(Math.abs(total || finalBase + finalIva)),
        ivaRate,
        attachments,
        status,
        hasFormulaError: rowHasFormulaError,
      });
    }

    sheets.push({ sheetName, rows, warnings });
  }

  return sheets;
}

interface ImportResult {
  created: number;
  errors: string[];
}

/**
 * Use AI to match expense descriptions to chart of accounts categories.
 */
async function matchCategoriesWithAI(
  rows: ParsedRow[],
  categories: { id: string; name: string; code: string; type: string; parent_id?: string | null }[]
): Promise<Record<number, string>> {
  const leafCategories = getExpenseLeafCategories(categories);
  const matchCategoryFallback = createExpenseCategoryMatcher(leafCategories);

  const descriptions = rows.map((r) => ({
    description: r.description,
    specification: r.specification,
  }));

  try {
    const { data, error } = await supabase.functions.invoke("match-categories", {
      body: { descriptions, categories: leafCategories },
    });

    if (error || !data?.matches) {
      console.warn("AI category matching failed:", error);
      return rows.reduce<Record<number, string>>((acc, row, index) => {
        const match = matchCategoryFallback(row);
        if (match) acc[index] = match;
        return acc;
      }, {});
    }

    const codeToId: Record<string, string> = {};
    leafCategories.forEach((c) => { codeToId[normalizeCategoryCodeKey(c.code)] = c.id; });

    const result: Record<number, string> = {};
    for (const match of data.matches) {
      const catId = codeToId[normalizeCategoryCodeKey(match.category_code)];
      if (catId) result[match.index] = catId;
    }

    rows.forEach((row, index) => {
      if (result[index]) return;
      const fallbackCategoryId = matchCategoryFallback(row);
      if (fallbackCategoryId) result[index] = fallbackCategoryId;
    });

    return result;
  } catch (e) {
    console.warn("AI category matching error:", e);
    return rows.reduce<Record<number, string>>((acc, row, index) => {
      const match = matchCategoryFallback(row);
      if (match) acc[index] = match;
      return acc;
    }, {});
  }
}

export async function importPLToEvent(
  rows: ParsedRow[],
  eventId: string,
  eventDate: string,
  categories: { id: string; name: string; code: string; type: string; parent_id?: string | null }[],
  userEmail: string,
  parentEventId?: string
): Promise<ImportResult> {
  let created = 0;
  const errors: string[] = [];

  const { data: histAccount } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("name", "Histórico / Ajuste")
    .single();

  // Use AI to match categories
  const aiMatches = await matchCategoriesWithAI(rows, categories);

  // Fallback: simple word matching
  const expenseCategories = getExpenseLeafCategories(categories);
  const matchCategoryFallback = createExpenseCategoryMatcher(expenseCategories);

  // Sort rows by AI-matched category code
  const sortedRows = [...rows].map((row, originalIndex) => {
    const aiCatId = aiMatches[originalIndex];
    const catId = aiCatId || matchCategoryFallback(row);
    const cat = catId ? categories.find((c) => c.id === catId) : null;
    return { ...row, _categoryId: catId, _categoryCode: cat?.code ?? "Z.Z.ZZ" };
  }).sort((a, b) => compareHierarchicalCodes(a._categoryCode, b._categoryCode));

  // Resolve cachê from cache config for rows with zero/formula-error amounts
  const cacheRowIndices = sortedRows
    .map((r, i) => ({ idx: i, row: r }))
    .filter(({ row }) => {
      return isCacheDescription(row.description) &&
        (row.baseAmount === 0 && row.total === 0);
    });

  if (cacheRowIndices.length > 0) {
    const lookupEventId = parentEventId || eventId;
    const { data: cacheConfigs } = await supabase
      .from("event_cache_configs")
      .select("*")
      .eq("event_id", lookupEventId);

    if (cacheConfigs && cacheConfigs.length > 0) {
      const configIds = cacheConfigs.map((c) => c.id);
      const { data: deductions } = await supabase
        .from("event_cache_deductions")
        .select("*")
        .in("cache_config_id", configIds);

      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId);

      let ticketRevenueNet = 0;
      if (zones && zones.length > 0) {
        const zoneIds = zones.map((z) => z.id);
        const { data: lots } = await supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds);
        if (lots) {
          ticketRevenueNet = lots.reduce((sum, lot) => {
            const netPrice = lot.price / (1 + (lot.iva_rate || 6) / 100);
            return sum + netPrice * lot.quantity;
          }, 0);
        }
      }

      const { data: existingForecasts } = await supabase
        .from("event_forecasts")
        .select("type, category_id, amount")
        .eq("event_id", eventId);

      const cacheLines = calculateCacheLinesForPL(
        cacheConfigs as unknown as CacheConfig[],
        (deductions || []) as unknown as CacheDeduction[],
        ticketRevenueNet,
        existingForecasts || []
      );

      const totalCacheAmount = cacheLines.reduce((s, c) => s + c.amount, 0);

      if (totalCacheAmount > 0 && cacheRowIndices.length > 0) {
        const firstIdx = cacheRowIndices[0].idx;
        sortedRows[firstIdx] = {
          ...sortedRows[firstIdx],
          baseAmount: roundMoney(totalCacheAmount),
          ivaAmount: 0,
          total: roundMoney(totalCacheAmount),
          ivaRate: 0,
          hasFormulaError: false,
        };
        for (let i = cacheRowIndices.length - 1; i >= 1; i--) {
          sortedRows.splice(cacheRowIndices[i].idx, 1);
        }
      }
    }
  }

  for (const row of sortedRows) {
    const categoryId = (row as any)._categoryId ?? matchCategoryFallback(row);

    // Skip rows that still have zero amount after cache resolution (formula errors without resolution)
    if (row.baseAmount === 0 && row.total === 0 && row.hasFormulaError) {
      errors.push(`"${row.description}": valor com erro de fórmula (#REF!) — ignorado`);
      continue;
    }

    const totalWithIva = roundMoney(row.total || (row.baseAmount * (1 + row.ivaRate / 100)));

    const { data: forecast, error: forecastError } = await supabase
      .from("event_forecasts")
      .insert({
        event_id: eventId,
        type: "expense" as const,
        description: row.description,
        specification: row.specification,
        amount: roundMoney(row.baseAmount),
        iva_rate: row.ivaRate,
        category_id: categoryId,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userEmail,
      })
      .select("id")
      .single();

    if (forecastError) {
      errors.push(`Previsão "${row.description}": ${forecastError.message}`);
      continue;
    }

    const isPaid = row.status === "paid";
    const { data: newTx, error: txError } = await supabase
      .from("transactions")
      .insert({
        description: row.description,
        specification: row.specification,
        type: "expense",
        amount: totalWithIva,
        iva_rate: row.ivaRate,
        event_id: eventId,
        category_id: categoryId,
        date: eventDate,
        status: isPaid ? "paid" : "approved",
        paid_amount: isPaid ? totalWithIva : 0,
        payment_date: isPaid ? eventDate : null,
        account_id: isPaid && histAccount ? histAccount.id : null,
      })
      .select("id")
      .single();

    if (txError) {
      errors.push(`Transação "${row.description}": ${txError.message}`);
      continue;
    }

    await supabase.from("event_forecasts").update({ transaction_id: newTx.id }).eq("id", forecast!.id);

    if (row.attachments.length > 0 && newTx) {
      const docs = row.attachments.map((att) => ({
        transaction_id: newTx.id,
        name: att,
        file_url: att.startsWith("http") ? att : `ref://${att}`,
        doc_type: "link_externo" as const,
        uploaded_by: userEmail,
      }));
      await supabase.from("transaction_documents").insert(docs);
    }

    created++;
  }

  return { created, errors };
}
