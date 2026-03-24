import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface ParsedRow {
  description: string;
  baseAmount: number;
  ivaAmount: number;
  total: number;
  ivaRate: number;
  driveLink: string | null;
  status: "paid" | "approved";
}

const STANDARD_IVA_RATES = [0, 6, 13, 23];

function snapIvaRate(calculated: number): number {
  let closest = STANDARD_IVA_RATES[0];
  let minDiff = Math.abs(calculated - closest);
  for (const rate of STANDARD_IVA_RATES) {
    const diff = Math.abs(calculated - rate);
    if (diff < minDiff) {
      minDiff = diff;
      closest = rate;
    }
  }
  return closest;
}

function findColumn(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) => {
    const norm = (h || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return keywords.some((kw) => norm.includes(kw));
  });
}

function isGoogleDriveLink(val: string): boolean {
  if (!val) return false;
  return /drive\.google|docs\.google|googleapis\.com/.test(val);
}

export function parseXlsxPL(buffer: ArrayBuffer): { rows: ParsedRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (raw.length < 2) return { rows: [], warnings: ["Ficheiro vazio ou sem dados"] };

  const headers = raw[0].map((h: any) => String(h));
  const descIdx = findColumn(headers, "descri");
  const baseIdx = findColumn(headers, "valor", "custo s/", "base", "s/ iva", "sem iva");
  const ivaIdx = findColumn(headers, "iva");
  const totalIdx = findColumn(headers, "total", "custo+iva", "custo + iva", "c/ iva");
  const linkIdx = headers.findIndex((h) => {
    const norm = (h || "").toString().toLowerCase().trim();
    return norm.includes("link") || norm.includes("anexo") || norm.includes("url") || norm.includes("drive");
  });
  const statusIdx = findColumn(headers, "status", "estado");

  const warnings: string[] = [];
  if (descIdx < 0) warnings.push("Coluna de descrição não encontrada");
  if (baseIdx < 0 && totalIdx < 0) warnings.push("Coluna de valor não encontrada");

  if (descIdx < 0) return { rows: [], warnings };

  const rows: ParsedRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const desc = String(row[descIdx] ?? "").trim();
    if (!desc) continue;

    const base = parseFloat(String(row[baseIdx] ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
    const iva = ivaIdx >= 0 ? parseFloat(String(row[ivaIdx] ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0 : 0;
    const total = totalIdx >= 0
      ? parseFloat(String(row[totalIdx] ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0
      : base + iva;

    // Determine base amount
    let finalBase = base || (total - iva);
    let finalIva = iva || (total - base);
    if (finalBase <= 0 && total > 0) {
      finalBase = total;
      finalIva = 0;
    }

    // Calculate IVA rate
    let calculatedRate = finalBase > 0 ? (finalIva / finalBase) * 100 : 0;
    const ivaRate = snapIvaRate(calculatedRate);

    // Drive link
    let driveLink: string | null = null;
    if (linkIdx >= 0) {
      const linkVal = String(row[linkIdx] ?? "").trim();
      if (linkVal && (isGoogleDriveLink(linkVal) || linkVal.startsWith("http"))) {
        driveLink = linkVal;
      }
    }

    // Status
    let status: "paid" | "approved" = "paid";
    if (statusIdx >= 0) {
      const statusVal = String(row[statusIdx] ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (statusVal.includes("pagar") || statusVal.includes("pendente") || statusVal.includes("aberto")) {
        status = "approved";
      }
    }

    rows.push({ description: desc, baseAmount: Math.abs(finalBase), ivaAmount: Math.abs(finalIva), total: Math.abs(total), ivaRate, driveLink, status });
  }

  return { rows, warnings };
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

  // Simple category matching by description keywords
  function matchCategory(description: string): string | null {
    const descNorm = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const cat of expenseCategories) {
      const catNorm = cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const words = catNorm.split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => descNorm.includes(w))) {
        return cat.id;
      }
    }
    return null;
  }

  for (const row of rows) {
    const categoryId = matchCategory(row.description);
    const totalWithIva = row.baseAmount * (1 + row.ivaRate / 100);

    // Create forecast (auto-approved)
    const forecastPayload = {
      event_id: eventId,
      type: "expense" as const,
      description: row.description,
      amount: row.baseAmount,
      iva_rate: row.ivaRate,
      category_id: categoryId,
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: userEmail,
    };

    const { data: forecast, error: forecastError } = await supabase
      .from("event_forecasts")
      .insert(forecastPayload)
      .select("id")
      .single();

    if (forecastError) {
      errors.push(`Previsão "${row.description}": ${forecastError.message}`);
      continue;
    }

    // Create transaction
    const isPaid = row.status === "paid";
    const transactionPayload: any = {
      description: row.description,
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
    };

    const { data: newTx, error: txError } = await supabase
      .from("transactions")
      .insert(transactionPayload)
      .select("id")
      .single();

    if (txError) {
      errors.push(`Transação "${row.description}": ${txError.message}`);
      continue;
    }

    // Link forecast to transaction
    await supabase.from("event_forecasts").update({ transaction_id: newTx.id }).eq("id", forecast.id);

    // Store drive link as document reference
    if (row.driveLink && newTx) {
      await supabase.from("transaction_documents").insert({
        transaction_id: newTx.id,
        name: `Anexo - ${row.description}`,
        file_url: row.driveLink,
        doc_type: "link_externo",
        uploaded_by: userEmail,
      });
    }

    created++;
  }

  return { created, errors };
}
