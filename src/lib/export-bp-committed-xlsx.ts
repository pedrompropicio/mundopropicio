/**
 * CAMADA DE ESCRITA do relatório de fecho em Excel (exceljs).
 *
 * Gémeo do `export-bp-committed-pdf.ts`: consome EXACTAMENTE a mesma camada de
 * dados (`buildClosingReportData` em `bp-closing-data.ts`). Aqui não há uma
 * única consulta à BD nem um único número recalculado — se o Excel e o PDF
 * divergirem num cêntimo, o relatório dos sócios perde valor.
 *
 * Diferença face ao PDF: os subtotais são FÓRMULAS vivas (=SUM/=E+F), para a
 * gestora financeira poder mexer num valor e ver o ficheiro inteiro recalcular.
 */
import ExcelJS from "exceljs";
import { fetchExportBranding, type ExportBranding } from "@/lib/export-header";
import {
  buildClosingReportData,
  fetchCommittedBpBundle,
  type ClosingReportData,
  type CommittedBpBundle,
  type OutRow,
} from "@/lib/bp-closing-data";

export const SYSTEM_NAME = "MP Gestão Eventos";
const SHEET_NAME = "BP Previsto + Excedido";
const MONEY_FMT = '#,##0.00';

const HEADER = ["Código", "Descrição", "Pagador", "Anexos", "Valor s/IVA", "IVA", "Total c/IVA"];
const WIDTHS = [11, 62, 17, 13, 16, 14, 16];

/** Data por extenso em pt-PT, tolerante a data inválida. */
function longDatePT(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const CANDIDATE_RATES = [0, 4, 6, 10, 13, 21, 23];

/**
 * Taxa de IVA da linha reconstruída a partir dos números já montados pela camada
 * de dados (iva/base). Encaixa nas taxas legais quando está a menos de 0,05 pp,
 * para a fórmula ficar legível (`=ROUND(E13*23/100,2)`).
 */
function lineRate(row: OutRow): number {
  if (!row.base) return 0;
  const raw = (row.iva / row.base) * 100;
  const snapped = CANDIDATE_RATES.find((r) => Math.abs(raw - r) < 0.05);
  return snapped ?? Math.round(raw * 10000) / 10000;
}

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/**
 * Rede de segurança: extrai base64 puro de um data URL de imagem. O contrato de
 * `fetchExportBranding()` já garante data URL ou null — aqui só se valida o
 * essencial (prefixo `data:image/` + `;base64,` + corpo não vazio), para não
 * rejeitar base64 legítimo. Sem base64 válido → sem imagem (texto em G1/G2).
 */
export function logoAsBase64(src?: string | null): { data: string; ext: "png" | "jpeg" } | null {
  if (!src || !src.startsWith("data:image/")) return null;
  const comma = src.indexOf(",");
  if (comma < 0 || !src.slice(0, comma).includes(";base64")) return null;
  const data = src.slice(comma + 1).replace(/\s+/g, "");
  if (!data) return null;
  return { data, ext: src.startsWith("data:image/jpeg") ? "jpeg" : "png" };
}



/** Constrói o workbook (testável fora do browser). */
export function buildCommittedBpWorkbook(
  bundle: CommittedBpBundle,
  branding: ExportBranding,
): ExcelJS.Workbook {
  const data: ClosingReportData = buildClosingReportData(bundle);
  const rows = data.expenses.rows.filter((r) => r.kind !== "total");

  const wb = new ExcelJS.Workbook();
  wb.creator = SYSTEM_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet(SHEET_NAME, {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      // fitToHeight: 0 → deixa correr por N páginas em vez de esmagar tudo numa.
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddFooter: `&L${SYSTEM_NAME}&RPágina &P de &N`,
      evenFooter: `&L${SYSTEM_NAME}&RPágina &P de &N`,
    },
    // ySplit: 5 → painéis fixos em A6 (cabeçalho sempre visível).
    // Sem xSplit e sem topLeftCell deslocado, o ficheiro abre em A1 e não
    // "salta" para a direita como acontecia na versão anterior.
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });

  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Bloco de topo ───────────────────────────────────────────────────────────
  const place = [bundle.event.venueName, bundle.event.cityName || bundle.event.location]
    .filter(Boolean)
    .join(" · ");
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = `${bundle.event.name} — Business Plan de despesas`;
  ws.getCell("A1").font = { name: "Arial", size: 15, bold: true };
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value =
    "Visão previsto + excedido · valores por linha, com totais por nível · documento de conferência para os sócios";
  ws.getCell("A2").font = { name: "Arial", size: 9, color: { argb: "FF6B7280" } };
  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = [longDatePT(bundle.event.date), place].filter(Boolean).join(" · ");
  ws.getCell("A3").font = { name: "Arial", size: 9, color: { argb: "FF6B7280" } };

  // Logótipo (opcional — nunca deve fazer a exportação falhar nem pendurar).
  // ATENÇÃO: `wb.addImage({ base64 })` exige base64 REAL. Se lhe passarmos um URL
  // de asset (o fallback do branding é um import de PNG, não um data URL), o
  // jszip rejeita "Invalid base64 input" FORA do fluxo do await e o
  // `writeBuffer()` fica pendente para sempre — foi o bug do botão preso.
  //
  // REGRA: o texto do nome da empresa é ALTERNATIVA ao logótipo, nunca
  // acompanhamento. Com imagem válida, o logo ocupa as linhas 1–2 no canto
  // superior direito e o endereço desce para a linha 3.
  const logo = logoAsBase64(branding.logoDataUrl);
  let logoDrawn = false;
  if (logo) {
    try {
      const imgId = wb.addImage({ base64: logo.data, extension: logo.ext as any });
      ws.addImage(imgId, {
        tl: { col: 6.05, row: 0.1 },
        ext: { width: 150, height: 31 }, // proporção original (~0.205)
        editAs: "oneCell",
      } as any);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  if (!logoDrawn) {
    ws.getCell("G1").value = branding.displayName || SYSTEM_NAME;
    ws.getCell("G1").font = { name: "Arial", size: 10, bold: true };
    ws.getCell("G1").alignment = { horizontal: "right" };
    ws.getCell("G2").value = "mpgestaoeventos.com";
    ws.getCell("G2").font = { name: "Arial", size: 8, color: { argb: "FF6B7280" } };
    ws.getCell("G2").alignment = { horizontal: "right" };
  } else {
    ws.getCell("G3").value = "mpgestaoeventos.com";
    ws.getCell("G3").font = { name: "Arial", size: 8, color: { argb: "FF6B7280" } };
    ws.getCell("G3").alignment = { horizontal: "right", vertical: "top" };
  }

  // Espaço vertical para o logótipo (linhas 1–2 ≈ 42px) sem tocar na linha 5.
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 14;



  // ── Cabeçalho da tabela (linha 5) ──────────────────────────────────────────
  const head = ws.getRow(5);
  HEADER.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF1F2937");
    c.alignment = { horizontal: i >= 4 ? "right" : "left", vertical: "middle" };
  });
  head.height = 18;

  // ── Corpo hierárquico com fórmulas vivas ───────────────────────────────────
  // Cada nível guarda as linhas Excel dos filhos, para os subtotais serem somas
  // de células e não valores fixos.
  const FIRST_ROW = 6;
  const l1Rows: number[] = [];
  const l2RowsOfCurrentL1: number[][] = [];
  const l3RowsOfCurrentL2: number[][] = [];
  const lineRowsOfCurrentL3: number[][] = [];
  const pending: { excelRow: number; kind: OutRow["kind"] }[] = [];

  // índices para saber quem pertence a quem
  let curL1: number | null = null;
  let curL2: number | null = null;
  let curL3: number | null = null;
  const childrenOf = new Map<number, number[]>(); // excelRow do pai → excelRows dos filhos
  const addChild = (parent: number | null, child: number) => {
    if (parent == null) return;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
  };

  rows.forEach((r, i) => {
    const excelRow = FIRST_ROW + i;
    const row = ws.getRow(excelRow);

    row.getCell(1).value = r.code || null;
    row.getCell(2).value = r.kind === "line" ? `      ${r.label}` : r.label;
    row.getCell(3).value = r.payer || null;
    row.getCell(4).value = r.docs > 0 ? `${r.docs} ${r.docs === 1 ? "Anexo" : "Anexos"}` : null;

    if (r.kind === "line") {
      row.getCell(5).value = Number(r.base.toFixed(2));
      row.getCell(6).value = { formula: `ROUND(E${excelRow}*${lineRate(r)}/100,2)` } as any;
    }
    row.getCell(7).value = { formula: `E${excelRow}+F${excelRow}` } as any;

    [5, 6, 7].forEach((c) => {
      row.getCell(c).numFmt = MONEY_FMT;
      row.getCell(c).alignment = { horizontal: "right" };
    });
    row.getCell(4).alignment = { horizontal: "right" };
    row.font = { name: "Arial", size: 9 };

    if (r.kind === "l1") {
      curL1 = excelRow; curL2 = null; curL3 = null;
      l1Rows.push(excelRow);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = fill("FF1F2937");
        c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      });
    } else if (r.kind === "l2") {
      curL2 = excelRow; curL3 = null;
      addChild(curL1, excelRow);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = fill("FFBEC3CA");
        c.font = { name: "Arial", size: 9, bold: true };
      });
    } else if (r.kind === "l3") {
      curL3 = excelRow;
      addChild(curL2, excelRow);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = fill("FFE4E7EB");
        c.font = { name: "Arial", size: 9, bold: true };
      });
    } else {
      addChild(curL3, excelRow);
    }
    [5, 6, 7].forEach((c) => { row.getCell(c).numFmt = MONEY_FMT; });
    pending.push({ excelRow, kind: r.kind });
  });

  // Subtotais como somas das células dos filhos (bottom-up já não é preciso:
  // as fórmulas referem-se umas às outras e o Excel resolve a cadeia).
  const sumFormula = (children: number[], col: "E" | "F") =>
    children.length ? children.map((r) => `${col}${r}`).join("+") : "0";

  for (const { excelRow, kind } of pending) {
    if (kind === "line") continue;
    const children = childrenOf.get(excelRow) ?? [];
    if (kind === "l3") {
      // linhas contíguas → SUM de intervalo, mais legível
      const first = children[0];
      const last = children[children.length - 1];
      ws.getCell(`E${excelRow}`).value = children.length
        ? ({ formula: `SUM(E${first}:E${last})` } as any)
        : 0;
      ws.getCell(`F${excelRow}`).value = children.length
        ? ({ formula: `SUM(F${first}:F${last})` } as any)
        : 0;
    } else {
      ws.getCell(`E${excelRow}`).value = { formula: sumFormula(children, "E") } as any;
      ws.getCell(`F${excelRow}`).value = { formula: sumFormula(children, "F") } as any;
    }
  }

  // ── TOTAL GERAL ─────────────────────────────────────────────────────────────
  const totalRowIdx = FIRST_ROW + rows.length + 1;
  const tr = ws.getRow(totalRowIdx);
  tr.getCell(2).value = "TOTAL GERAL";
  const totalDocs = data.expenses.totals.docs;
  tr.getCell(4).value = totalDocs > 0 ? `${totalDocs} Anexos` : null;
  tr.getCell(5).value = { formula: sumFormula(l1Rows, "E") } as any;
  tr.getCell(6).value = { formula: sumFormula(l1Rows, "F") } as any;
  tr.getCell(7).value = { formula: `E${totalRowIdx}+F${totalRowIdx}` } as any;
  tr.eachCell({ includeEmpty: true }, (c) => {
    c.fill = fill("FF111827");
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  });
  [5, 6, 7].forEach((c) => {
    tr.getCell(c).numFmt = MONEY_FMT;
    tr.getCell(c).alignment = { horizontal: "right" };
  });
  tr.getCell(4).alignment = { horizontal: "right" };

  ws.pageSetup.printTitlesRow = "5:5";
  return wb;
}

export function committedBpXlsxFileName(eventName: string): string {
  const safe = eventName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  return `BP-previsto-excedido-${safe}.xlsx`;
}

/** Promessa com prazo: nenhuma etapa da exportação pode ficar pendente para sempre. */
function comPrazo<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tempo excedido em "${etapa}" (${ms / 1000}s)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function exportCommittedBpToXLSX(opts: { eventId: string; includeChildren?: boolean }) {
  const t0 = Date.now();
  const marca = (etapa: string) => console.info(`[bp-xlsx] ${etapa} +${Date.now() - t0}ms`);

  const bundle = await comPrazo(
    fetchCommittedBpBundle(opts.eventId, opts.includeChildren ?? true),
    60_000,
    "leitura dos dados",
  );
  marca("bundle");

  // O logótipo é decoração: 3s e segue sem ele.
  let branding: ExportBranding = { displayName: SYSTEM_NAME, logoDataUrl: null };
  try {
    branding = await comPrazo(fetchExportBranding(), 3_000, "branding");
  } catch {
    /* segue sem logótipo */
  }
  marca("branding");

  const wb = buildCommittedBpWorkbook(bundle, branding);
  marca("workbook");
  const buf = await comPrazo(wb.xlsx.writeBuffer(), 30_000, "escrita do ficheiro");
  marca("writeBuffer");

  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = committedBpXlsxFileName(bundle.event.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
