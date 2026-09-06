/**
 * Gerador de PDF mínimo (sem dependências) para comprovativos de veiculação.
 *
 * Só o necessário: A4 retrato, Helvetica / Helvetica-Bold, texto posicionado e
 * linhas horizontais. O texto fica extraível (pdftotext) porque é escrito como
 * strings WinAnsi, sem compressão.
 */

export interface PdfTextOp {
  kind: "text";
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  text: string;
  align?: "left" | "right";
}

export interface PdfLineOp {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type PdfOp = PdfTextOp | PdfLineOp;

const PAGE_W = 595.28;
const PAGE_H = 841.89;

/** Larguras aproximadas de Helvetica (unidades/1000) — suficiente para alinhar à direita. */
function textWidth(text: string, size: number): number {
  // média ponderada simples: 0.5 em para maiúsculas/dígitos, 0.45 para minúsculas
  let units = 0;
  for (const ch of text) {
    if (ch === " ") units += 278;
    else if (/[ilj.,:;'|!]/.test(ch)) units += 250;
    else if (/[A-Z0-9€]/.test(ch)) units += 600;
    else units += 500;
  }
  return (units / 1000) * size;
}

function escapeWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (code === 0x20ac) out += "\\200"; // € em WinAnsi
    else if (code < 128) out += ch;
    else if (code <= 255) out += "\\" + code.toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

export function buildPdf(pages: PdfOp[][]): Uint8Array {
  const contents: string[] = pages.map((ops) => {
    const parts: string[] = ["0.15 w"];
    for (const op of ops) {
      if (op.kind === "line") {
        parts.push(`${op.x1.toFixed(2)} ${(PAGE_H - op.y1).toFixed(2)} m ${op.x2.toFixed(2)} ${(PAGE_H - op.y2).toFixed(2)} l S`);
        continue;
      }
      const font = op.bold ? "/F2" : "/F1";
      let x = op.x;
      if (op.align === "right") x = op.x - textWidth(op.text, op.size);
      parts.push(
        `BT ${font} ${op.size} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_H - op.y).toFixed(2)} Tm (${escapeWinAnsi(op.text)}) Tj ET`,
      );
    }
    return parts.join("\n");
  });

  const objects: string[] = [];
  const pageCount = pages.length;
  // 1 catalog, 2 pages tree, 3 F1, 4 F2, then per page: page obj + content obj
  const pageObjIds = pages.map((_, i) => 5 + i * 2);
  const contentObjIds = pages.map((_, i) => 6 + i * 2);

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (let i = 0; i < pageCount; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjIds[i]} 0 R >>`,
    );
    objects.push(`__STREAM__${i}`);
  }

  const encoder = new TextEncoder();
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(encoder.encode(pdf).length);
    const body = objects[i].startsWith("__STREAM__")
      ? (() => {
          const idx = Number(objects[i].slice("__STREAM__".length));
          const stream = contents[idx];
          return `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
        })()
      : objects[i];
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(pdf);
}

export const PDF_PAGE_WIDTH = PAGE_W;
export const PDF_PAGE_HEIGHT = PAGE_H;
