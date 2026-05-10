/**
 * PDF da vista do Simulador — captura por secções com paginação inteligente.
 *
 * Estratégia:
 *  1. Força uma largura "desktop" no nó capturado (1400px landscape, 1100px portrait)
 *     para que grids `lg:grid-cols-*` colapsem para o layout grande mesmo quando
 *     o utilizador está num viewport mobile.
 *  2. Procura `[data-pdf-section]` dentro do nó. Se existirem, captura cada um
 *     individualmente — assim cards e blocos nunca são partidos a meio.
 *     Caso contrário, faz fallback para os filhos directos do nó.
 *  3. Cada secção é colocada numa página inteira ou no espaço restante; só faz
 *     fatiamento quando a secção isolada é maior que uma página A4.
 *  4. Adiciona capa, cabeçalho com título e rodapé com paginação.
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Orientation = "p" | "l";

export interface ExportNodeOpts {
  orientation?: Orientation;
  /** Título principal (capa + cabeçalho de cada página). */
  title?: string;
  /** Subtítulo (capa + rodapé). */
  subtitle?: string;
  /** Override da largura desktop forçada na captura. */
  forceWidth?: number;
}

const MARGIN_MM = 10;
const HEADER_H_MM = 11;
const FOOTER_H_MM = 8;
const SECTION_GAP_MM = 4;

function resolveBg(el: HTMLElement | null): string {
  let cur: HTMLElement | null = el;
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    cur = cur.parentElement;
  }
  return "#ffffff";
}

function disableBackdropFilters(doc: Document) {
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = doc.defaultView?.getComputedStyle(el);
    if (
      cs &&
      (cs.backdropFilter !== "none" || (cs as any).webkitBackdropFilter !== "none")
    ) {
      el.style.backdropFilter = "none";
      (el.style as any).webkitBackdropFilter = "none";
    }
  });
}

async function captureCanvas(
  el: HTMLElement,
  bg: string,
  windowWidth: number,
): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2.25,
    backgroundColor: bg,
    useCORS: true,
    logging: false,
    windowWidth,
    onclone: (doc) => disableBackdropFilters(doc),
  });
}

function drawHeader(pdf: jsPDF, title: string | undefined, pageW: number) {
  if (!title) return;
  pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(40);
  pdf.text(title, MARGIN_MM, MARGIN_MM + 6);
  pdf.setDrawColor(220);
  pdf.setLineWidth(0.2);
  pdf.line(
    MARGIN_MM,
    MARGIN_MM + HEADER_H_MM - 2,
    pageW - MARGIN_MM,
    MARGIN_MM + HEADER_H_MM - 2,
  );
  pdf.setTextColor(0);
}

function drawFooter(
  pdf: jsPDF,
  subtitle: string | undefined,
  pageIdx: number,
  pageTotal: number,
  pageW: number,
  pageH: number,
) {
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(140);
  const y = pageH - MARGIN_MM - 1;
  if (subtitle) pdf.text(subtitle, MARGIN_MM, y);
  pdf.text(
    `Página ${pageIdx} / ${pageTotal}`,
    pageW - MARGIN_MM,
    y,
    { align: "right" },
  );
  pdf.setTextColor(0);
}

export async function exportNodeToPdf(
  node: HTMLElement,
  filename: string,
  opts: ExportNodeOpts = {},
): Promise<void> {
  const orientation: Orientation = opts.orientation ?? "l";
  const pdf = new jsPDF(orientation, "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN_MM * 2;
  const topY = MARGIN_MM + HEADER_H_MM;
  const bottomY = pageH - MARGIN_MM - FOOTER_H_MM;
  const usableH = bottomY - topY;

  const forceWidth = opts.forceWidth ?? (orientation === "l" ? 1400 : 1100);

  // Forçar largura desktop temporariamente — recupera grids lg:* mesmo em mobile.
  const prevWidth = node.style.width;
  const prevMaxWidth = node.style.maxWidth;
  const prevMinWidth = node.style.minWidth;
  node.style.width = `${forceWidth}px`;
  node.style.maxWidth = `${forceWidth}px`;
  node.style.minWidth = `${forceWidth}px`;
  // Aguarda o reflow + recharts re-render
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 250));

  const bg = resolveBg(node);

  // ----- Capa -----
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold").setFontSize(28);
  pdf.text(opts.title ?? "Simulador", MARGIN_MM, pageH / 2 - 4);
  if (opts.subtitle) {
    pdf.setFont("helvetica", "normal").setFontSize(13).setTextColor(180);
    const lines = pdf.splitTextToSize(opts.subtitle, usableW);
    pdf.text(lines, MARGIN_MM, pageH / 2 + 8);
  }
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(150);
  pdf.text(
    `MP Gestão Eventos · ${new Date().toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`,
    MARGIN_MM,
    pageH - MARGIN_MM - 2,
  );
  pdf.setTextColor(0);

  // ----- Identificar secções -----
  let targets: HTMLElement[] = Array.from(
    node.querySelectorAll<HTMLElement>("[data-pdf-section]"),
  );
  if (targets.length === 0) {
    targets = Array.from(node.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement,
    );
  }
  if (targets.length === 0) targets = [node];

  pdf.addPage("a4", orientation);
  drawHeader(pdf, opts.title, pageW);
  let curY = topY;

  for (const section of targets) {
    if (section.offsetHeight === 0 || section.offsetWidth === 0) continue;

    const canvas = await captureCanvas(section, bg, forceWidth);
    const imgW = usableW;
    const imgH = (canvas.height * imgW) / canvas.width;

    // Cabe inteira em A4?
    if (imgH <= usableH) {
      const remaining = bottomY - curY;
      if (imgH > remaining && curY > topY) {
        pdf.addPage("a4", orientation);
        drawHeader(pdf, opts.title, pageW);
        curY = topY;
      }
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN_MM, curY, imgW, imgH);
      curY += imgH + SECTION_GAP_MM;
    } else {
      // Secção maior que A4 → começa em página nova e fatia.
      if (curY > topY) {
        pdf.addPage("a4", orientation);
        drawHeader(pdf, opts.title, pageW);
        curY = topY;
      }
      const sliceHeightPx = (usableH * canvas.width) / imgW;
      let yPx = 0;
      let first = true;
      while (yPx < canvas.height) {
        if (!first) {
          pdf.addPage("a4", orientation);
          drawHeader(pdf, opts.title, pageW);
          curY = topY;
        }
        const h = Math.min(sliceHeightPx, canvas.height - yPx);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = h;
        const ctx = slice.getContext("2d")!;
        // pinta fundo para evitar transparência preta
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, h);
        ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
        const sliceMm = (h * imgW) / canvas.width;
        pdf.addImage(slice.toDataURL("image/png"), "PNG", MARGIN_MM, topY, imgW, sliceMm);
        curY = topY + sliceMm + SECTION_GAP_MM;
        yPx += h;
        first = false;
      }
    }
  }

  // Restaura estilos do nó
  node.style.width = prevWidth;
  node.style.maxWidth = prevMaxWidth;
  node.style.minWidth = prevMinWidth;

  // Cabeçalho/rodapé com numeração — ignora a capa (página 1)
  const total = (pdf as any).internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    pdf.setPage(p);
    drawFooter(pdf, opts.subtitle, p - 1, total - 1, pageW, pageH);
  }

  pdf.save(filename);
}
