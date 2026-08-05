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
  /** 1-based row number in the original Excel sheet */
  excelRow?: number;
  /** Raw cell values from Excel for this row (description, cost, iva, total, status) */
  rawValues?: Record<string, string>;
}

export interface ParsedSheet {
  sheetName: string;
  rows: ParsedRow[];
  warnings: string[];
}

const STANDARD_IVA_RATES = [0, 6, 13, 23];

/**
 * Extract a Google Drive / Docs file ID from a URL, when present.
 * Supports the common patterns:
 *   - https://drive.google.com/file/d/<ID>/view
 *   - https://drive.google.com/open?id=<ID>
 *   - https://docs.google.com/document/d/<ID>/edit
 * Returns null for non-Drive URLs.
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const s = String(url);
  // /d/<ID>/ pattern (file, document, spreadsheets, presentation)
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  // ?id=<ID>
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function snapIvaRate(calculated: number, rates: readonly number[] = STANDARD_IVA_RATES): number {
  let closest = rates[0];
  let minDiff = Math.abs(calculated - closest);
  for (const rate of rates) {
    const diff = Math.abs(calculated - rate);
    if (diff < minDiff) { minDiff = diff; closest = rate; }
  }
  return closest;
}

function norm(s: string): string {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function toSentenceCase(s: string): string {
  if (!s) return s;
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
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

/**
 * Extract hyperlink targets per row from a worksheet.
 * Excel allows a cell to display text (cell.v) while carrying a separate hyperlink (cell.l.Target).
 * Also captures =HYPERLINK("url","label") formulas and bare URLs (with or without https://)
 * embedded in cell text. Returns a map of rowIndex (0-based) -> array of unique URLs found
 * in that row. URLs are normalised to include the https:// prefix.
 */
function extractHyperlinksByRow(ws: XLSX.WorkSheet): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!ws || !ws["!ref"]) return map;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  // Match URLs in plain text, with or without protocol. Captures the URL up to the first whitespace
  // or closing quote/parenthesis. Drive/Dropbox/SharePoint links are most common.
  const URL_REGEX = /(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]{2,}(?:\/[^\s"')\]>]*)?/gi;
  const KNOWN_HOSTS = /(drive\.google\.com|docs\.google\.com|dropbox\.com|onedrive|sharepoint|wetransfer|mega\.nz|box\.com|icloud\.com)/i;

  const normaliseUrl = (raw: string): string | null => {
    let s = String(raw).trim();
    if (!s) return null;
    // Strip surrounding quotes/parens
    s = s.replace(/^["'(<\[]+|["')>\]]+$/g, "");
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    // Bare URL — only auto-prefix if it looks like a known host or has at least one dot + slash
    if (KNOWN_HOSTS.test(s) || /^[\w-]+(\.[\w-]+)+\//.test(s)) return `https://${s}`;
    return null;
  };

  const extractFromHyperlinkFormula = (formula: string): string[] => {
    // Matches HYPERLINK("url", ...) or HYPERLINK('url', ...) — case-insensitive, optional spaces
    const out: string[] = [];
    const re = /HYPERLINK\s*\(\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(formula)) !== null) {
      const url = normaliseUrl(m[1]);
      if (url) out.push(url);
    }
    return out;
  };

  const extractFromText = (text: string): string[] => {
    const out: string[] = [];
    const matches = String(text).match(URL_REGEX);
    if (!matches) return out;
    for (const raw of matches) {
      const url = normaliseUrl(raw);
      if (url) out.push(url);
    }
    return out;
  };

  for (let r = range.s.r; r <= range.e.r; r++) {
    const seen = new Set<string>();
    const urls: string[] = [];
    const push = (u: string | null | undefined) => {
      if (!u) return;
      if (seen.has(u)) return;
      seen.add(u);
      urls.push(u);
    };
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      // 1) Native Excel hyperlink (cell.l.Target)
      const target = (cell as any).l?.Target;
      if (typeof target === "string") push(normaliseUrl(target));
      // 2) =HYPERLINK("url", "label") formulas (cell.f)
      const formula = (cell as any).f;
      if (typeof formula === "string" && /HYPERLINK/i.test(formula)) {
        for (const u of extractFromHyperlinkFormula(formula)) push(u);
      }
      // 3) Bare URLs / domain-only URLs in cell display value (cell.v / cell.w)
      const display = (cell as any).w ?? (cell as any).v;
      if (typeof display === "string" && display.length > 4) {
        for (const u of extractFromText(display)) push(u);
      }
    }
    if (urls.length > 0) map.set(r, urls);
  }
  return map;
}

/**
 * `allowedIvaRates` — taxas do país do evento de DESTINO do import
 * (ES 21/10/4/0). Sem parâmetro, comporta-se como antes (PT).
 */
export function parseXlsxPL(buffer: ArrayBuffer, allowedIvaRates: readonly number[] = STANDARD_IVA_RATES): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "array", cellHTML: false });
  const sheets: ParsedSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hyperlinksByRow = extractHyperlinksByRow(ws);
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
      const desc = toSentenceCase(String(row[descIdx] ?? "").trim());
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
      const ivaRate = snapIvaRate(calculatedRate, allowedIvaRates);

      // Validação CIVA: o IVA do ficheiro deve bater com base × taxa (±0,01€).
      // Se divergir, registamos warning e usamos o valor matematicamente correto.
      if (finalBase > 0 && ivaRate > 0) {
        const expectedIva = Math.round(finalBase * (ivaRate / 100) * 100) / 100;
        const ivaDiff = Math.round((finalIva - expectedIva) * 100) / 100;
        if (Math.abs(ivaDiff) > 0.01) {
          warnings.push(
            `Linha ${i + 1} ("${desc}"): IVA do ficheiro (${finalIva.toFixed(2)}€) difere do cálculo correto (${expectedIva.toFixed(2)}€ a ${ivaRate}%). Usando valor calculado.`,
          );
          finalIva = expectedIva;
        }
      }

      const specification = specIdx >= 0 ? toSentenceCase(String(row[specIdx] ?? "").trim()) || null : null;

      let status: "paid" | "approved" = "paid";
      if (statusIdx >= 0) {
        const parsed = parseStatus(String(row[statusIdx] ?? ""));
        if (parsed) status = parsed;
      }

      const attachments: string[] = [];
      const seenAttach = new Set<string>();
      // 1) Plain-text URLs in trailing columns (legacy behavior)
      for (let c = attachStartIdx; c < row.length; c++) {
        const val = String(row[c] ?? "").trim();
        if (val && val.length > 2 && !seenAttach.has(val)) {
          seenAttach.add(val);
          attachments.push(val);
        }
      }
      // 2) Excel hyperlinks (cell.l.Target) anywhere in the row — captures Drive/Dropbox links
      //    hidden behind display text like "invoice.pdf"
      const rowLinks = hyperlinksByRow.get(i) || [];
      for (const link of rowLinks) {
        if (!seenAttach.has(link)) {
          seenAttach.add(link);
          attachments.push(link);
        }
      }

      const rawValues: Record<string, string> = {
        descricao: String(row[descIdx] ?? ""),
      };
      if (specIdx >= 0) rawValues.especificacao = String(row[specIdx] ?? "");
      if (costIdx >= 0) rawValues.custo = String(costRaw);
      if (ivaIdx >= 0) rawValues.iva = String(row[ivaIdx] ?? "");
      if (totalIdx >= 0) rawValues.total = String(totalRaw);
      if (statusIdx >= 0) rawValues.status = String(row[statusIdx] ?? "");

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
        excelRow: i + 1, // 1-based Excel row number
        rawValues,
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
  categories: { id: string; name: string; code: string; type: string; parent_id?: string | null }[],
  userInstructions?: string,
): Promise<Record<number, string>> {
  const leafCategories = getExpenseLeafCategories(categories);
  const matchCategoryFallback = createExpenseCategoryMatcher(leafCategories);

  const descriptions = rows.map((r) => ({
    description: r.description,
    specification: r.specification,
  }));

  try {
    const { data, error } = await supabase.functions.invoke("match-categories", {
      body: { descriptions, categories: leafCategories, instructions: userInstructions ?? "" },
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
  parentEventId?: string,
  userInstructions?: string,
): Promise<ImportResult> {
  let created = 0;
  const errors: string[] = [];


  // Use AI to match categories
  const aiMatches = await matchCategoriesWithAI(rows, categories, userInstructions);

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
      let ticketRevenueGross = 0;
      if (zones && zones.length > 0) {
        const zoneIds = zones.map((z) => z.id);
        const { data: lots } = await supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds);
        if (lots) {
          ticketRevenueNet = lots.reduce((sum, lot) => {
            const netPrice = lot.price / (1 + (lot.iva_rate || 6) / 100);
            return sum + netPrice * lot.quantity;
          }, 0);
          ticketRevenueGross = lots.reduce((sum, lot) => sum + lot.price * lot.quantity, 0);
        }
      }

      const { data: existingForecasts } = await supabase
        .from("event_forecasts")
        .select("type, category_id, amount")
        .eq("event_id", eventId).is("version_id", null);

      const cacheLines = calculateCacheLinesForPL(
        cacheConfigs as unknown as CacheConfig[],
        (deductions || []) as unknown as CacheDeduction[],
        ticketRevenueNet,
        existingForecasts || [],
        ticketRevenueGross
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

    // Build attachment_refs from row.attachments (only http(s) URLs)
    const attachmentRefs = (row.attachments || [])
      .map((a) => String(a).trim())
      .filter((a) => /^https?:\/\//i.test(a))
      .map((url) => ({ url }));

    const { error: forecastError } = await supabase
      .from("event_forecasts")
      .insert({
        event_id: eventId,
        type: "expense" as const,
        description: row.description,
        specification: row.specification,
        amount: roundMoney(row.baseAmount),
        iva_rate: row.ivaRate,
        category_id: categoryId,
        status: "draft",
        attachment_refs: attachmentRefs as any,
      } as any);

    if (forecastError) {
      errors.push(`Previsão "${row.description}": ${forecastError.message}`);
      continue;
    }

    created++;
  }

  return { created, errors };
}

// ============================================================
// Layer B: Re-import only the attachment links from a spreadsheet
// ============================================================

export interface OrphanLinkRow {
  /** Excel sheet the orphan came from */
  sheetName: string;
  /** Row description as parsed from XLSX */
  description: string;
  /** Row base amount (no IVA) */
  baseAmount: number;
  /** Links from this row that could NOT be matched */
  links: string[];
}

export interface AttachLinksResult {
  attached: number;        // links inserted
  skipped: number;         // links that already existed
  rowsWithoutMatch: number; // BP rows with no matching forecast (sub or master)
  rowsWithoutTx: number;    // matched forecasts that lack transaction_id
  matchedInMaster: number; // links that matched a forecast in the Master event (fallback)
  errors: string[];
  /** Detailed list of orphan rows (for manual resolution UI) */
  orphans: OrphanLinkRow[];
}

/** Extract a friendly file name from a URL (last segment, strip query). */
function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).slice(0, 120);
  } catch {
    return url.slice(0, 80);
  }
}

/**
 * Find a matching forecast for an XLSX row using a layered strategy:
 *  1. Primary pool — match by description AND (net OR gross within 1 cent)
 *  2. Master pool  — match by description AND (net OR gross within 1 cent)
 *  3. Master pool  — match by description only (last resort, since Master often
 *     stores aggregated values that differ per sub-event)
 *
 * The XLSX baseAmount is the value the user typed in the spreadsheet, which can
 * be either net (without VAT) or gross (with VAT) depending on how the BP was
 * filled. We therefore tolerate both. The pure-description fallback only fires
 * for the Master pool to avoid wrong matches on sub-events that may share names.
 */
export type ForecastLike = {
  id: string;
  event_id: string;
  description: string;
  amount: number;
  iva_rate?: number | null;
  transaction_id?: string | null;
  attachment_refs?: any;
};

export function findForecastMatch(
  rowDescription: string,
  rowBaseAmount: number,
  primary: ForecastLike[],
  master: ForecastLike[],
  /**
   * Optional: aggregated value across ALL sheets/sub-events for this same
   * normalized description. Used as a Master-only secondary signal because
   * rateio (split) lines on the Master correspond to the SUM of sub-event
   * lines in the XLSX, not the individual ones.
   */
  aggregatedAmountForDesc?: number,
): { forecast: ForecastLike; fromMaster: boolean } | null {
  const descKey = norm(rowDescription);
  // Tolerância: maior entre 1€ absoluto e 0,5% do valor.
  // Apanha arredondamentos típicos de cachês/grandes valores
  // (ex.: 67 917,85€ no XLSX vs 67 918,00€ no BP).
  const tolFor = (target: number) => Math.max(1, Math.abs(target) * 0.005);
  const matchesAmount = (f: ForecastLike, target: number): boolean => {
    const net = Number(f.amount) || 0;
    const ivaPct = Number(f.iva_rate ?? 0) || 0;
    const gross = roundMoney(net * (1 + ivaPct / 100));
    const tol = tolFor(target);
    return Math.abs(net - target) <= tol || Math.abs(gross - target) <= tol;
  };

  // 1) Primary pool — strict match (desc + amount, individual row)
  const inPrimary = primary.find(
    (f) => norm(String(f.description)) === descKey && matchesAmount(f, rowBaseAmount),
  );
  if (inPrimary) return { forecast: inPrimary, fromMaster: false };

  // 2) Master pool — strict match by individual row amount
  const inMasterTight = master.find(
    (f) => norm(String(f.description)) === descKey && matchesAmount(f, rowBaseAmount),
  );
  if (inMasterTight) return { forecast: inMasterTight, fromMaster: true };

  // 3) Master pool — match by AGGREGATED amount across all sub-event sheets
  //    (rateio: Master forecast value = sum of all sub-event rows for same desc)
  if (aggregatedAmountForDesc != null) {
    const inMasterAggregated = master.find(
      (f) => norm(String(f.description)) === descKey && matchesAmount(f, aggregatedAmountForDesc),
    );
    if (inMasterAggregated) return { forecast: inMasterAggregated, fromMaster: true };
  }

  // 4) Primary pool — value match + partial description similarity
  //    Catches sub-event rows where the XLSX description differs from the BP
  //    description but the amount and at least one significant token match.
  //    Example: "Hotel porto palacio(artista)" 1067€ <-> BP "Hotel - Artistas" 1067€
  //    Restricted to primary pool to avoid Master rateio ambiguity. Requires a
  //    UNIQUE candidate (>1 match aborts) to prevent false positives.
  const xlsxTokens = new Set(
    descKey.split(/[^a-z0-9]+/).filter((t) => t.length >= 3),
  );
  if (xlsxTokens.size > 0) {
    const candidates = primary.filter((f) => {
      if (!matchesAmount(f, rowBaseAmount)) return false;
      const fTokens = new Set(
        norm(String(f.description)).split(/[^a-z0-9]+/).filter((t) => t.length >= 3),
      );
      // Require at least one shared significant token
      for (const t of xlsxTokens) {
        if (fTokens.has(t)) return true;
      }
      return false;
    });
    if (candidates.length === 1) return { forecast: candidates[0], fromMaster: false };
  }

  // 5) Master pool — description-only fallback (last resort)
  const inMasterDescOnly = master.find((f) => norm(String(f.description)) === descKey);
  if (inMasterDescOnly) return { forecast: inMasterDescOnly, fromMaster: true };

  return null;
}

/**
 * Build a map { normalizedDescription -> sum of baseAmount } across a flat
 * list of XLSX rows. Used to derive aggregated values for matching against
 * Master rateio lines.
 */
export function buildAggregatedAmountByDesc(
  rows: Array<{ description: string; baseAmount: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = norm(r.description);
    if (!key) continue;
    out.set(key, roundMoney((out.get(key) ?? 0) + (Number(r.baseAmount) || 0)));
  }
  return out;
}

function splitForecastPools(
  forecasts: ForecastLike[],
  eventIds: string[],
  parentEventId?: string,
): { primaryForecasts: ForecastLike[]; masterForecasts: ForecastLike[] } {
  if (parentEventId) {
    const primaryEventIds = new Set(eventIds);
    return {
      primaryForecasts: forecasts.filter((f) => primaryEventIds.has(f.event_id)),
      masterForecasts: forecasts.filter((f) => f.event_id === parentEventId),
    };
  }

  if (eventIds.length > 1) {
    const masterEventId = eventIds[0];
    const childEventIds = new Set(eventIds.slice(1));
    return {
      primaryForecasts: forecasts.filter((f) => childEventIds.has(f.event_id)),
      masterForecasts: forecasts.filter((f) => f.event_id === masterEventId),
    };
  }

  const primaryEventIds = new Set(eventIds);
  return {
    primaryForecasts: forecasts.filter((f) => primaryEventIds.has(f.event_id)),
    masterForecasts: [],
  };
}

async function resolvePendingOrphansForMatch(
  anchorEventId: string,
  rowDescription: string,
  links: string[],
  forecastId: string,
  resolvedBy: string,
) {
  const resolvedAt = new Date().toISOString();
  for (const link of links) {
    await supabase
      .from("bp_orphan_attachments")
      .update({
        status: "resolved",
        resolved_at: resolvedAt,
        resolved_by: resolvedBy,
        resolved_forecast_ids: [forecastId],
      } as any)
      .eq("event_id", anchorEventId)
      .eq("row_description", rowDescription)
      .eq("link_url", link)
      .eq("status", "pending");
  }
}

/**
 * Read a BP spreadsheet and attach its column G–K links to existing transactions
 * generated from the BP. Matching key: (description normalized + baseAmount within 1 cent).
 * Skips when the same file_url already exists for that transaction.
 */
export async function attachLinksFromXlsx(
  buffer: ArrayBuffer,
  eventIds: string[],
  uploadedBy: string,
  /** Optional Master event id used as fallback when sub-event BP has no match */
  parentEventId?: string,
): Promise<AttachLinksResult> {
  const result: AttachLinksResult = {
    attached: 0,
    skipped: 0,
    rowsWithoutMatch: 0,
    rowsWithoutTx: 0,
    matchedInMaster: 0,
    errors: [],
    orphans: [],
  };

  const sheets = parseXlsxPL(buffer);
  // Preserve the originating sheet name for each row so we can group orphans.
  type RowWithSheet = ParsedRow & { _sheet: string };
  const allRows: RowWithSheet[] = sheets.flatMap((s) =>
    s.rows
      .filter((r) => (r.attachments || []).some((a) => /^https?:\/\//i.test(a)))
      .map((r) => ({ ...r, _sheet: s.sheetName }))
  );
  if (allRows.length === 0) return result;

  // Build the full list of events to scan: requested events + optional Master fallback
  const lookupEventIds = Array.from(new Set([...eventIds, ...(parentEventId ? [parentEventId] : [])]));

  // Load all forecasts for the given events with their transaction_id and iva_rate
  // (iva_rate is needed so we can also try matching by gross value, since the
  // XLSX BP can store either net or gross amounts in column F).
  const { data: forecasts, error: forecastErr } = await supabase
    .from("event_forecasts")
    .select("id, event_id, description, amount, iva_rate, transaction_id, attachment_refs")
    .in("event_id", lookupEventIds).is("version_id", null);

  if (forecastErr) {
    result.errors.push(`Erro ao carregar BP: ${forecastErr.message}`);
    return result;
  }

  // Pre-load existing transaction_documents to detect duplicates
  const txIds = (forecasts || []).map((f: any) => f.transaction_id).filter(Boolean) as string[];
  const existingByTx = new Map<string, Set<string>>();
  if (txIds.length > 0) {
    const { data: existingDocs } = await supabase
      .from("transaction_documents")
      .select("transaction_id, file_url")
      .in("transaction_id", txIds);
    for (const d of existingDocs || []) {
      const set = existingByTx.get((d as any).transaction_id) ?? new Set<string>();
      set.add((d as any).file_url);
      existingByTx.set((d as any).transaction_id, set);
    }
  }

  const anchorEventId = eventIds[0];
  const { primaryForecasts, masterForecasts } = splitForecastPools(
    ((forecasts || []) as ForecastLike[]),
    eventIds,
    parentEventId,
  );

  // Pre-compute aggregated baseAmount per normalized description across ALL
  // sheets in this XLSX. This lets us resolve Master "rateio" forecasts whose
  // value equals the sum of the same line across all sub-events.
  const aggregatedByDesc = buildAggregatedAmountByDesc(allRows);

  for (const row of allRows) {
    const links = (row.attachments || [])
      .map((a) => String(a).trim())
      .filter((a) => /^https?:\/\//i.test(a));
    if (links.length === 0) continue;

    const aggregated = aggregatedByDesc.get(norm(row.description));
    const found = findForecastMatch(
      row.description,
      row.baseAmount,
      primaryForecasts as any,
      masterForecasts as any,
      aggregated,
    );
    let match = found?.forecast;
    const matchedInMaster = found?.fromMaster ?? false;

    if (!match) {
      result.rowsWithoutMatch++;
      result.orphans.push({
        sheetName: row._sheet,
        description: row.description,
        baseAmount: row.baseAmount,
        links,
      });
      continue;
    }
    if (matchedInMaster) result.matchedInMaster++;

    // Always update forecast.attachment_refs (merge unique by url)
    const currentRefs: { url: string }[] = Array.isArray((match as any).attachment_refs)
      ? ((match as any).attachment_refs as any[]).filter((r) => r && typeof r.url === "string")
      : [];
    const refUrls = new Set(currentRefs.map((r) => r.url));
    let refsChanged = false;
    for (const link of links) {
      if (!refUrls.has(link)) {
        currentRefs.push({ url: link });
        refUrls.add(link);
        refsChanged = true;
      }
    }
    if (refsChanged) {
      await supabase
        .from("event_forecasts")
        .update({ attachment_refs: currentRefs as any } as any)
        .eq("id", (match as any).id);
    }

    if (!(match as any).transaction_id) {
      await resolvePendingOrphansForMatch(
        anchorEventId,
        row.description,
        links,
        (match as any).id,
        uploadedBy,
      );
      result.rowsWithoutTx++;
      continue;
    }

    const txId = (match as any).transaction_id as string;
    const existing = existingByTx.get(txId) ?? new Set<string>();

    for (const link of links) {
      const fileUrl = `ref://${link}`;
      if (existing.has(fileUrl)) {
        result.skipped++;
        continue;
      }

      const { error: insertErr } = await supabase.from("transaction_documents").insert({
        transaction_id: txId,
        name: fileNameFromUrl(link),
        file_url: fileUrl,
        doc_type: "outro",
        uploaded_by: uploadedBy,
        is_accounting: true,
      } as any);

      if (insertErr) {
        result.errors.push(`Erro ao anexar a "${row.description}": ${insertErr.message}`);
        continue;
      }

      existing.add(fileUrl);
      existingByTx.set(txId, existing);
      result.attached++;
    }

    await resolvePendingOrphansForMatch(
      anchorEventId,
      row.description,
      links,
      (match as any).id,
      uploadedBy,
    );
  }

  // Persist orphans into bp_orphan_attachments (anchored to primary event = first eventId).
  // We anchor to the first event id since that's the BP context where the user will resolve them.
  if (result.orphans.length > 0 && eventIds.length > 0) {
    const rowsToUpsert = result.orphans.flatMap((o) =>
      o.links.map((url) => ({
        event_id: anchorEventId,
        sheet_name: o.sheetName,
        row_description: o.description,
        row_base_amount: o.baseAmount,
        link_url: url,
        status: "pending",
      })),
    );
    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from("bp_orphan_attachments")
        .upsert(rowsToUpsert as any, {
          onConflict: "event_id,link_url,row_description",
          ignoreDuplicates: true,
        });
      if (upsertErr) {
        result.errors.push(`Erro ao registar órfãos: ${upsertErr.message}`);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Reprocess orphan attachments
// ---------------------------------------------------------------------------

export interface ReprocessOrphansResult {
  scanned: number;
  resolved: number;
  attached: number; // transaction_documents inserted
  skipped: number;  // links already present
  stillOrphan: number;
  errors: string[];
}

/**
 * Re-run the matching engine against all *pending* `bp_orphan_attachments`
 * for a given event tree (anchor + sub-events + master). Any orphan that now
 * finds a forecast match has its link merged into the forecast's
 * attachment_refs and inserted into transaction_documents (if a transaction
 * already exists). Successfully resolved orphans are marked as 'resolved'.
 *
 * This is the recovery path used after the matching logic itself has been
 * improved — instead of forcing a full re-import, we replay the new logic
 * over the queued orphans only.
 */
export async function reprocessOrphanAttachments(
  anchorEventId: string,
  /** Sub-event ids whose forecasts should be considered "primary" candidates */
  childEventIds: string[],
  /** Master event id (when the anchor IS a sub-event) — searched as fallback */
  parentEventId: string | undefined,
  resolvedBy: string,
): Promise<ReprocessOrphansResult> {
  const out: ReprocessOrphansResult = {
    scanned: 0, resolved: 0, attached: 0, skipped: 0, stillOrphan: 0, errors: [],
  };

  // Load pending orphans for the anchor event
  const { data: orphans, error: orphansErr } = await supabase
    .from("bp_orphan_attachments")
    .select("id, event_id, sheet_name, row_description, row_base_amount, link_url, status")
    .eq("event_id", anchorEventId)
    .eq("status", "pending");
  if (orphansErr) {
    out.errors.push(`Erro ao carregar órfãos: ${orphansErr.message}`);
    return out;
  }
  out.scanned = (orphans ?? []).length;
  if (out.scanned === 0) return out;

  // Build forecast pool: anchor + children + (master OR anchor as master)
  const primaryEventIds = Array.from(new Set([anchorEventId, ...childEventIds]));
  const masterEventId = parentEventId ?? anchorEventId;
  const lookupEventIds = Array.from(new Set([...primaryEventIds, masterEventId]));

  const { data: forecasts, error: fErr } = await supabase
    .from("event_forecasts")
    .select("id, event_id, description, amount, iva_rate, transaction_id, attachment_refs")
    .in("event_id", lookupEventIds).is("version_id", null);
  if (fErr) {
    out.errors.push(`Erro ao carregar BP: ${fErr.message}`);
    return out;
  }

  const primaryForecasts = (forecasts ?? []).filter((f: any) => primaryEventIds.includes(f.event_id));
  const masterForecasts = (forecasts ?? []).filter((f: any) => f.event_id === masterEventId);

  // Pre-load existing transaction_documents to detect duplicates
  const txIds = (forecasts ?? []).map((f: any) => f.transaction_id).filter(Boolean) as string[];
  const existingByTx = new Map<string, Set<string>>();
  if (txIds.length > 0) {
    const { data: existingDocs } = await supabase
      .from("transaction_documents")
      .select("transaction_id, file_url")
      .in("transaction_id", txIds);
    for (const d of existingDocs ?? []) {
      const set = existingByTx.get((d as any).transaction_id) ?? new Set<string>();
      set.add((d as any).file_url);
      existingByTx.set((d as any).transaction_id, set);
    }
  }

  // Aggregated baseAmount per description across pending orphans (one row per
  // sheet/sub-event). Enables matching against Master rateio lines whose value
  // equals the SUM of all sub-event rows for the same description.
  const aggregatedByDesc = buildAggregatedAmountByDesc(
    (orphans ?? []).map((o: any) => ({
      description: o.row_description,
      baseAmount: Number(o.row_base_amount) || 0,
    })),
  );

  for (const orphan of orphans ?? []) {
    const aggregated = aggregatedByDesc.get(norm((orphan as any).row_description));
    const found = findForecastMatch(
      (orphan as any).row_description,
      Number((orphan as any).row_base_amount) || 0,
      primaryForecasts as any,
      masterForecasts as any,
      aggregated,
    );
    if (!found) {
      out.stillOrphan++;
      continue;
    }

    const f = found.forecast;
    const link = String((orphan as any).link_url);

    // 1) Merge into forecast.attachment_refs
    const currentRefs: { url: string }[] = Array.isArray(f.attachment_refs)
      ? (f.attachment_refs as any[]).filter((r) => r && typeof r.url === "string")
      : [];
    const refUrls = new Set(currentRefs.map((r) => r.url));
    if (!refUrls.has(link)) {
      currentRefs.push({ url: link });
      const { error: upErr } = await supabase
        .from("event_forecasts")
        .update({ attachment_refs: currentRefs as any } as any)
        .eq("id", f.id);
      if (upErr) {
        out.errors.push(`Erro ao gravar refs em "${f.description}": ${upErr.message}`);
        continue;
      }
    }

    // 2) Insert into transaction_documents (if transaction exists)
    if (f.transaction_id) {
      const fileUrl = `ref://${link}`;
      const existing = existingByTx.get(f.transaction_id) ?? new Set<string>();
      if (existing.has(fileUrl)) {
        out.skipped++;
      } else {
        const { error: insertErr } = await supabase.from("transaction_documents").insert({
          transaction_id: f.transaction_id,
          name: fileNameFromUrl(link),
          file_url: fileUrl,
          doc_type: "outro",
          uploaded_by: resolvedBy,
          is_accounting: true,
        } as any);
        if (insertErr) {
          out.errors.push(`Erro a anexar "${f.description}": ${insertErr.message}`);
          continue;
        }
        existing.add(fileUrl);
        existingByTx.set(f.transaction_id, existing);
        out.attached++;
      }
    }

    // 3) Mark orphan as resolved
    const { error: resolveErr } = await supabase
      .from("bp_orphan_attachments")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        resolved_forecast_ids: [f.id],
      } as any)
      .eq("id", (orphan as any).id);
    if (resolveErr) {
      out.errors.push(`Erro a marcar órfão como resolvido: ${resolveErr.message}`);
      continue;
    }
    out.resolved++;
  }

  return out;
}
