import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedRow {
  description: string;
  specification: string | null;
  baseAmount: number;
  ivaAmount: number;
  total: number;
  ivaRate: number;
  attachments: string[];
  status: "paid" | "approved";
}

export interface ParsedSheet {
  sheetName: string;
  rows: ParsedRow[];
  warnings: string[];
}

const STANDARD_IVA_RATES = [0, 6, 13, 23];

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
  // Unknown status — treat as paid
  return "paid";
}

function parseNum(val: any): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || s.includes("#REF") || s.includes("#VALUE") || s.includes("#N/A") || s.includes("#DIV")) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function isSkippableLine(desc: string, cost: any, total: any): boolean {
  const n = norm(desc);
  if (n.startsWith("total") || n.startsWith("subtotal")) return true;
  // Section headers: have description but no cost/total values
  const costVal = parseNum(cost);
  const totalVal = parseNum(total);
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

    // If status column header is empty, try to detect by checking data values in the column after TOTAL
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

    // Attachment columns: everything after the known columns (typically col G onwards)
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

      const cost = parseNum(costRaw);
      const iva = ivaIdx >= 0 ? parseNum(row[ivaIdx]) : 0;
      const total = parseNum(totalRaw);

      // Determine base and IVA amounts
      let finalBase = cost || (total - iva) || total;
      let finalIva = iva || (total > 0 && cost > 0 ? total - cost : 0);
      if (finalBase <= 0 && total > 0) { finalBase = total; finalIva = 0; }

      // Calculate IVA rate
      const calculatedRate = finalBase > 0 ? (finalIva / finalBase) * 100 : 0;
      const ivaRate = snapIvaRate(calculatedRate);

      // Specification
      const specification = specIdx >= 0 ? String(row[specIdx] ?? "").trim() || null : null;

      // Status
      let status: "paid" | "approved" = "paid"; // default
      if (statusIdx >= 0) {
        const parsed = parseStatus(String(row[statusIdx] ?? ""));
        if (parsed) status = parsed;
      }

      // Attachments: collect non-empty values from columns after the last known column
      const attachments: string[] = [];
      for (let c = attachStartIdx; c < row.length; c++) {
        const val = String(row[c] ?? "").trim();
        if (val && val.length > 2) attachments.push(val);
      }

      rows.push({
        description: desc,
        specification,
        baseAmount: Math.abs(finalBase),
        ivaAmount: Math.abs(finalIva),
        total: Math.abs(total || finalBase + finalIva),
        ivaRate,
        attachments,
        status,
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

export async function importPLToEvent(
  rows: ParsedRow[],
  eventId: string,
  eventDate: string,
  categories: { id: string; name: string; code: string; type: string }[],
  userEmail: string
): Promise<ImportResult> {
  let created = 0;
  const errors: string[] = [];

  // Find "Histórico / Ajuste" account
  const { data: histAccount } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("name", "Histórico / Ajuste")
    .single();

  const expenseCategories = categories.filter((c) => c.type === "expense");

  function matchCategory(description: string): string | null {
    const descNorm = norm(description);
    for (const cat of expenseCategories) {
      const catNorm = norm(cat.name);
      const words = catNorm.split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => descNorm.includes(w))) return cat.id;
    }
    return null;
  }

  for (const row of rows) {
    const categoryId = matchCategory(row.description);
    const totalWithIva = row.baseAmount * (1 + row.ivaRate / 100);

    // Create forecast (auto-approved)
    const { data: forecast, error: forecastError } = await supabase
      .from("event_forecasts")
      .insert({
        event_id: eventId,
        type: "expense" as const,
        description: row.description,
        specification: row.specification,
        amount: row.baseAmount,
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

    // Create transaction
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

    // Link forecast to transaction
    await supabase.from("event_forecasts").update({ transaction_id: newTx.id }).eq("id", forecast!.id);

    // Store attachments as document references
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
