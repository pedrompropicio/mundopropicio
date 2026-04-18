/**
 * Matching engine for the BP bulk-attachment workflow.
 *
 * Given a list of files (uploaded from a ZIP or folder) and the BP forecasts
 * for one or more events, suggest the best forecast for each file using a
 * cascade of strategies:
 *
 *   1. Drive ID present in the file name -> exact match against forecast.attachment_refs
 *   2. Supplier name present in the file name -> match against forecast supplier
 *   3. Textual similarity (token overlap) between file name and forecast description
 */
import { extractDriveFileId } from "./import-pl-xlsx";

export interface BpForecastForMatch {
  id: string;
  event_id: string;
  description: string;
  amount: number;
  /** Optional supplier name pulled from the linked transaction's supplier */
  supplier_name?: string | null;
  /** Existing attachment_refs (used to match by Drive ID) */
  attachment_refs?: Array<{ url?: string }>;
}

export interface FileMatch {
  fileName: string;
  forecastId: string | null;
  score: number; // 0..1
  strategy: "drive-id" | "supplier" | "similarity" | "none";
}

/** Lower-case, strip diacritics, drop punctuation, collapse whitespace. */
function normalise(s: string): string {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{1,5}$/, "") // strip extension
    .replace(/[._\-()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenise after normalisation, drop very short tokens and noise words. */
const NOISE = new Set([
  "factura", "fatura", "recibo", "comprovativo", "comprovante", "invoice",
  "doc", "documento", "scan", "img", "image", "foto", "pdf", "jpg", "png",
  "copia", "copy", "novo", "new", "final",
]);
function tokens(s: string): string[] {
  return normalise(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !NOISE.has(t));
}

/** Jaccard similarity between two token sets. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True if the supplier appears as a contiguous substring inside the file name. */
function supplierAppearsInFile(supplier: string, fileName: string): boolean {
  const sup = normalise(supplier);
  if (sup.length < 3) return false;
  const fn = normalise(fileName);
  if (fn.includes(sup)) return true;
  const supTokens = tokens(supplier);
  if (supTokens.length === 0) return false;
  return supTokens.some((t) => fn.includes(t) && t.length >= 4);
}

export interface MatchOptions {
  fileNames: string[];
  forecasts: BpForecastForMatch[];
  /** Minimum similarity score to keep a Strategy 3 suggestion (default 0.25). */
  minSimilarity?: number;
}

/** Run the cascade and return a suggestion per file. */
export function matchFilesToForecasts(opts: MatchOptions): FileMatch[] {
  const { fileNames, forecasts } = opts;
  const minSim = opts.minSimilarity ?? 0.25;
  const results: FileMatch[] = [];

  // Pre-compute Drive ID lookup from existing attachment_refs.
  const driveIdToForecast = new Map<string, string>();
  for (const f of forecasts) {
    const refs = Array.isArray(f.attachment_refs) ? f.attachment_refs : [];
    for (const ref of refs) {
      const url = ref?.url;
      if (!url) continue;
      const id = extractDriveFileId(url);
      if (id && !driveIdToForecast.has(id)) driveIdToForecast.set(id, f.id);
    }
  }

  // Pre-compute description tokens once.
  const descTokens = new Map<string, string[]>();
  for (const f of forecasts) {
    const combined = [f.description, f.supplier_name || ""].join(" ");
    descTokens.set(f.id, tokens(combined));
  }

  for (const fileName of fileNames) {
    // Strategy 1 — Drive ID embedded in file name
    const driveId = extractDriveFileId(fileName) ||
      (fileName.match(/[a-zA-Z0-9_-]{25,}/)?.[0] ?? null);
    if (driveId && driveIdToForecast.has(driveId)) {
      results.push({ fileName, forecastId: driveIdToForecast.get(driveId)!, score: 1, strategy: "drive-id" });
      continue;
    }

    // Strategy 2 — Supplier name in file name
    const supplierMatches = forecasts.filter(
      (f) => f.supplier_name && supplierAppearsInFile(f.supplier_name, fileName),
    );
    if (supplierMatches.length === 1) {
      results.push({ fileName, forecastId: supplierMatches[0].id, score: 0.92, strategy: "supplier" });
      continue;
    }
    if (supplierMatches.length > 1) {
      const fileTokens = tokens(fileName);
      let best: { id: string; score: number } | null = null;
      for (const f of supplierMatches) {
        const score = jaccard(fileTokens, descTokens.get(f.id) ?? []);
        if (!best || score > best.score) best = { id: f.id, score };
      }
      if (best) {
        results.push({ fileName, forecastId: best.id, score: 0.7 + best.score * 0.25, strategy: "supplier" });
        continue;
      }
    }

    // Strategy 3 — Pure textual similarity against description
    const fileTokens = tokens(fileName);
    let best: { id: string; score: number } | null = null;
    for (const f of forecasts) {
      const score = jaccard(fileTokens, descTokens.get(f.id) ?? []);
      if (!best || score > best.score) best = { id: f.id, score };
    }
    if (best && best.score >= minSim) {
      results.push({ fileName, forecastId: best.id, score: best.score, strategy: "similarity" });
      continue;
    }

    results.push({ fileName, forecastId: null, score: 0, strategy: "none" });
  }

  return results;
}