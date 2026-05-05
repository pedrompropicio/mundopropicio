// Shared parser for the Coala BP XLSX importer.
// Pure logic — no Supabase calls. Safe to import in both edge functions
// (Deno) and any Node test runners. Uses xlsx (SheetJS).
//
// All decisions documented in mem://features/coala-importer (project memory).

// deno-lint-ignore-file no-explicit-any
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────
export const EXCLUDED_CC = [
  "a&b bebida",
  "a&b alimento",
  "repasse bebida",
  "repasse alimento",
  "bebida",
  "alimento",
];

export const FALLBACK_CATEGORY_CODE = "0.0.99"; // "A classificar"

const FORMALIDADE_MAP: Array<[RegExp, string]> = [
  [/^fechad/, "Fechado"],
  [/em\s*andamento|negociad/, "Negociado"],
  [/estimad|projeç|valor\s*estimado/, "Estimado"],
  [/oportunidade|nova?|aguardando|cotaç|reservad/, "Cotação"],
];

const VAT_SNAP_TARGETS = [0, 6, 13, 23];

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────
export type Status = "paid" | "pending" | "partial";
export type Formalidade = "Fechado" | "Negociado" | "Estimado" | "Cotação";

export interface ParsedRow {
  rowNumber: number;            // 1-indexed source row
  rawCC: string | null;
  rawCenterCusto: string | null;
  description: string;
  supplier: string | null;      // raw, will be UPPERCASED later
  invoiceRef: string | null;
  netAmount: number;            // Valor Total s/ IVA
  ivaAmount: number;            // raw IVA value (€)
  ivaRate: number;              // computed rate (snapped to 0/6/13/23)
  ivaRateRaw: number;           // pre-snap, for warning
  grossAmount: number;          // computed = net + iva
  paidNet: number;
  paidIva: number;
  paidGross: number;            // computed
  status: Status;
  paymentDate: string | null;   // YYYY-MM-DD
  dueDate: string | null;       // YYYY-MM-DD or null
  dueDateRaw: string | null;    // raw text if string interval
  paidVia: "PT" | "BR" | null;  // BR → paidByPartner=true
  formalidade: Formalidade;
  formalidadeRaw: string | null;
  excluded: boolean;            // A&B → skip import
  excludeReason: string | null;
  needsCategoryReview: boolean; // no L3 mapped → fallback
  needsDateReview: boolean;     // string interval
  needsFormalidadeReview: boolean;
  warnings: string[];
}

export interface ParsedSponsor {
  rowNumber: number;
  name: string;
  status: string | null;        // observation column
  confirmed: number;            // 2026 - Confirmados
  pipe: number;                 // 2026 - Pipe
  proposal: number;             // 2026 - Propostas
}

export interface ParseResult {
  fileVersion: string;
  rows: ParsedRow[];
  sponsors: ParsedSponsor[];
  totals: {
    rawLines: number;
    importableLines: number;
    excludedLines: number;
    netSum: number;
    ivaSum: number;
    grossSum: number;
    paidGrossSum: number;
    suppliersDistinct: number;
    sponsorsConfirmed: number;
    sponsorsPipe: number;
    sponsorsProposal: number;
  };
  fileTotalsRow: {              // values found at row 2 of "Base Custos"
    net: number | null;
    iva: number | null;
    paidNet: number | null;
    paidIva: number | null;
    paidGross: number | null;
  };
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
const norm = (s: any): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const cleanString = (s: any): string =>
  String(s ?? "").replace(/\s+/g, " ").trim();

const upperSupplier = (s: any): string | null => {
  const c = cleanString(s);
  return c ? c.toUpperCase() : null;
};

const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const snapVAT = (rate: number): number => {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  let best = VAT_SNAP_TARGETS[0];
  let bestDist = Math.abs(rate - best);
  for (const t of VAT_SNAP_TARGETS) {
    const d = Math.abs(rate - t);
    if (d < bestDist) { best = t; bestDist = d; }
  }
  return best;
};

const parseFormalidade = (raw: any): { value: Formalidade; needsReview: boolean } => {
  const n = norm(raw);
  if (!n) return { value: "Estimado", needsReview: true };
  for (const [re, val] of FORMALIDADE_MAP) {
    if (re.test(n)) return { value: val as Formalidade, needsReview: false };
  }
  return { value: "Estimado", needsReview: true };
};

// Convert Excel cell value → ISO date string YYYY-MM-DD (local) or null.
const toIsoDate = (v: any): { iso: string | null; raw: string | null; isInterval: boolean } => {
  if (v === null || v === undefined || v === "") {
    return { iso: null, raw: null, isInterval: false };
  }
  // openpyxl/xlsx returns a JS Date for true date cells
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return { iso: `${y}-${m}-${d}`, raw: null, isInterval: false };
  }
  if (typeof v === "number") {
    // Excel serial date → JS Date
    const utc = new Date(Math.round((v - 25569) * 86400 * 1000));
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc.getUTCDate()).padStart(2, "0");
    return { iso: `${y}-${m}-${d}`, raw: null, isInterval: false };
  }
  const s = String(v).trim();
  // Plain DD/MM/YYYY single date
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return { iso: `${yy}-${mm}-${dd}`, raw: null, isInterval: false };
  }
  // Otherwise: interval like "10/02 - 10/05" or "sem fatura" → keep raw, no due_date
  return { iso: null, raw: s, isInterval: true };
};

// ─────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────
export function parseCoalaXlsx(buffer: ArrayBuffer, fileVersion: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const warnings: string[] = [];

  // ---- Base Custos ------------------------------------------------
  const sheetName = wb.SheetNames.find((n) => norm(n) === "base custos");
  if (!sheetName) throw new Error('Aba "Base Custos" não encontrada no ficheiro.');
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });

  // Layout do XLSX Coala (V13+):
  //   matrix[0] = linha de totais consolidados (Σ Net, Σ IVA, Σ Pago Net, Σ Pago IVA, Σ Pago Bruto)
  //   matrix[1] = headers
  //   matrix[2..] = dados
  if (matrix.length < 3) throw new Error('Aba "Base Custos" sem dados.');
  const headers = matrix[1] || [];
  const colIdx = (label: string): number =>
    headers.findIndex((h: any) => norm(h) === norm(label));

  const C = {
    ccBase: colIdx("CC base"),
    formalidade: colIdx("Formalidade"),
    centroCusto: colIdx("Centro Custo"),
    descricao: colIdx("Descrição"),
    valorNet: colIdx("Valor Total s/ IVA"),
    iva: colIdx("IVA"),
    statusPgt: colIdx("Status PGT"),
    valorPagoNet: colIdx("Valor Pago s/ IVA"),
    valorIvaPago: colIdx("Valor IVA"),
    total: colIdx("Total"),
    dataPgt: colIdx("Data PGT"),
    dataFluxo: colIdx("Data Fluxo"),
    nomeEmpresa: colIdx("Nome Empresa"),
    numFatura: colIdx("Nº Fatura"),
    pagoVia: colIdx("Pago Via BR/PT"),
  };

  // Linha 0 = totais consolidados (R1 no XLSX)
  const r1 = matrix[0] || [];
  const fileTotalsRow = {
    net: C.valorNet >= 0 ? num(r1[C.valorNet]) || null : null,
    iva: C.iva >= 0 ? num(r1[C.iva]) || null : null,
    paidNet: C.valorPagoNet >= 0 ? num(r1[C.valorPagoNet]) || null : null,
    paidIva: C.valorIvaPago >= 0 ? num(r1[C.valorIvaPago]) || null : null,
    paidGross: C.total >= 0 ? num(r1[C.total]) || null : null,
  };

  const rows: ParsedRow[] = [];
  let netSum = 0, ivaSum = 0, grossSum = 0, paidGrossSum = 0, excludedCount = 0;
  const suppliers = new Set<string>();

  for (let r = 2; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c: any) => c === null || c === "")) continue;

    const cc       = row[C.ccBase] != null ? cleanString(row[C.ccBase]) : null;
    const cCusto   = row[C.centroCusto] != null ? cleanString(row[C.centroCusto]) : null;
    const desc     = cleanString(row[C.descricao]);
    if (!desc && !cCusto && !cc) continue; // empty row

    const netAmt   = num(row[C.valorNet]);
    if (netAmt <= 0) continue; // skip zero-value rows

    // Exclusion: A&B handled in the dedicated A&B module
    const ccNorm = norm(cc);
    const cCustoNorm = norm(cCusto);
    const isExcluded = EXCLUDED_CC.includes(ccNorm) || EXCLUDED_CC.includes(cCustoNorm);

    const ivaAmt   = num(row[C.iva]);
    const ivaRateRaw = netAmt > 0 ? +(ivaAmt / netAmt * 100).toFixed(2) : 0;
    const ivaRate    = snapVAT(ivaRateRaw);
    const grossAmt   = +(netAmt + ivaAmt).toFixed(2);

    const paidNet  = num(row[C.valorPagoNet]);
    const paidIva  = num(row[C.valorIvaPago]);
    const paidGross = +(paidNet + paidIva).toFixed(2);

    const statusRaw = norm(row[C.statusPgt]);
    let status: Status = "pending";
    if (/parcial/.test(statusRaw)) status = "partial";
    else if (/^pago/.test(statusRaw)) status = "paid";

    const dataPgt   = toIsoDate(row[C.dataPgt]);
    const dataFluxo = toIsoDate(row[C.dataFluxo]);

    const supplier = upperSupplier(row[C.nomeEmpresa]);
    if (supplier) suppliers.add(supplier);

    const pagoViaRaw = norm(row[C.pagoVia]);
    const paidVia: "PT" | "BR" | null =
      /pago\s*br/.test(pagoViaRaw) ? "BR" :
      /pago\s*pt/.test(pagoViaRaw) ? "PT" : null;

    const formalidade = parseFormalidade(row[C.formalidade]);

    const warnRow: string[] = [];
    if (ivaRateRaw !== 0 && Math.abs(ivaRateRaw - ivaRate) > 0.5) {
      warnRow.push(`IVA não-standard ${ivaRateRaw}% → snap para ${ivaRate}%`);
    }

    const parsed: ParsedRow = {
      rowNumber: r + 1,
      rawCC: cc,
      rawCenterCusto: cCusto,
      description: desc || cCusto || "(sem descrição)",
      supplier,
      invoiceRef: row[C.numFatura] != null ? cleanString(row[C.numFatura]) : null,
      netAmount: netAmt,
      ivaAmount: ivaAmt,
      ivaRate,
      ivaRateRaw,
      grossAmount: grossAmt,
      paidNet,
      paidIva,
      paidGross,
      status,
      paymentDate: dataPgt.iso,
      dueDate: dataFluxo.iso,
      dueDateRaw: dataFluxo.raw,
      paidVia,
      formalidade: formalidade.value,
      formalidadeRaw: row[C.formalidade] != null ? cleanString(row[C.formalidade]) : null,
      excluded: isExcluded,
      excludeReason: isExcluded ? "Custo A&B — gerido no módulo A&B" : null,
      needsCategoryReview: false, // filled later when category mapping resolves
      needsDateReview: dataFluxo.isInterval,
      needsFormalidadeReview: formalidade.needsReview,
      warnings: warnRow,
    };

    rows.push(parsed);
    if (isExcluded) {
      excludedCount++;
      continue;
    }
    netSum += netAmt;
    ivaSum += ivaAmt;
    grossSum += grossAmt;
    paidGrossSum += paidGross;
  }

  // ---- Pipe (sponsorships) ---------------------------------------
  const pipeName = wb.SheetNames.find((n) => norm(n) === "pipe");
  const sponsors: ParsedSponsor[] = [];
  let confirmedSum = 0, pipeSum = 0, proposalSum = 0;

  if (pipeName) {
    const pws = wb.Sheets[pipeName];
    const pmx = XLSX.utils.sheet_to_json<any[]>(pws, { header: 1, defval: null, raw: true, blankrows: false });
    // Layout: row 2 = header strip (col B status free, col C/D/E year buckets)
    // Sponsor names start at row 4, col B (index 1)
    for (let r = 3; r < pmx.length; r++) {
      const row = pmx[r];
      if (!row) continue;
      const name = cleanString(row[1]);
      if (!name) continue;
      const conf = num(row[2]);
      const pp   = num(row[3]);
      const prop = num(row[4]);
      if (conf === 0 && pp === 0 && prop === 0) continue;
      sponsors.push({
        rowNumber: r + 1,
        name,
        status: row[0] != null ? cleanString(row[0]) : null,
        confirmed: conf,
        pipe: pp,
        proposal: prop,
      });
      confirmedSum += conf;
      pipeSum += pp;
      proposalSum += prop;
    }
  } else {
    warnings.push('Aba "Pipe" não encontrada — patrocínios ignorados.');
  }

  return {
    fileVersion,
    rows,
    sponsors,
    totals: {
      rawLines: rows.length,
      importableLines: rows.filter((r) => !r.excluded).length,
      excludedLines: excludedCount,
      netSum: +netSum.toFixed(2),
      ivaSum: +ivaSum.toFixed(2),
      grossSum: +grossSum.toFixed(2),
      paidGrossSum: +paidGrossSum.toFixed(2),
      suppliersDistinct: suppliers.size,
      sponsorsConfirmed: +confirmedSum.toFixed(2),
      sponsorsPipe: +pipeSum.toFixed(2),
      sponsorsProposal: +proposalSum.toFixed(2),
    },
    fileTotalsRow,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Validation report (XLSX vs system reconciliation)
// ─────────────────────────────────────────────────────────────────────
export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  details?: any;
}

export function buildValidationReport(parsed: ParseResult): {
  issues: ValidationIssue[];
  hasErrors: boolean;
  summary: Record<string, number>;
} {
  const issues: ValidationIssue[] = [];
  const TOL_LINE = 0.05;
  const TOL_SUBTOTAL = 0.50;

  // 1. File header row 2 vs computed (paid section)
  const ft = parsed.fileTotalsRow;
  if (ft.paidGross != null && Math.abs(ft.paidGross - parsed.totals.paidGrossSum) > TOL_SUBTOTAL) {
    issues.push({
      level: "warning",
      code: "PAID_GROSS_MISMATCH",
      message: `Total Pago (R2 do XLSX = ${ft.paidGross.toFixed(2)} €) difere do calculado (${parsed.totals.paidGrossSum.toFixed(2)} €).`,
    });
  }

  // 2. Per-row gross consistency
  let lineErrors = 0;
  for (const r of parsed.rows) {
    if (r.excluded) continue;
    const expectedGross = +(r.netAmount + r.ivaAmount).toFixed(2);
    if (Math.abs(expectedGross - r.grossAmount) > TOL_LINE) lineErrors++;
  }
  if (lineErrors > 0) {
    issues.push({
      level: "error",
      code: "LINE_GROSS_MISMATCH",
      message: `${lineErrors} linhas com bruto inconsistente (Net + IVA ≠ Total).`,
    });
  }

  // 3. Counters of pendencies
  const noCC = parsed.rows.filter((r) => !r.excluded && !r.rawCenterCusto).length;
  if (noCC > 0) issues.push({
    level: "warning", code: "NO_CC", message: `${noCC} linhas sem Centro de Custo (vão para "0.0.99 A classificar").`,
  });

  const dateReview = parsed.rows.filter((r) => !r.excluded && r.needsDateReview).length;
  if (dateReview > 0) issues.push({
    level: "warning", code: "DATE_INTERVAL", message: `${dateReview} linhas com data em formato de intervalo (due_date = NULL).`,
  });

  const ivaSnap = parsed.rows.filter((r) => !r.excluded && r.warnings.some((w) => w.includes("IVA"))).length;
  if (ivaSnap > 0) issues.push({
    level: "info", code: "IVA_SNAP", message: `${ivaSnap} linhas com IVA não-standard ajustadas para 0/6/13/23.`,
  });

  const formReview = parsed.rows.filter((r) => !r.excluded && r.needsFormalidadeReview).length;
  if (formReview > 0) issues.push({
    level: "warning", code: "FORMALIDADE_AMBIGUOUS", message: `${formReview} linhas com formalidade ambígua → default "Estimado".`,
  });

  if (parsed.totals.excludedLines > 0) issues.push({
    level: "info", code: "AB_EXCLUDED", message: `${parsed.totals.excludedLines} linhas A&B excluídas (geridas no módulo A&B).`,
  });

  return {
    issues,
    hasErrors: issues.some((i) => i.level === "error"),
    summary: {
      errors: issues.filter((i) => i.level === "error").length,
      warnings: issues.filter((i) => i.level === "warning").length,
      info: issues.filter((i) => i.level === "info").length,
    },
  };
}
