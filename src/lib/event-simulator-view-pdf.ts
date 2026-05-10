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
 *  3. Cada secção é colocada no espaço restante ou numa página nova.
 *     Secções maiores que A4 são reduzidas para caber numa página — nunca são
 *     fatiadas no meio de cards/tabelas.
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

async function captureSectionCanvas(
  section: HTMLElement,
  bg: string,
  forceWidth: number,
): Promise<HTMLCanvasElement> {
  const prevWidth = section.style.width;
  const prevMaxWidth = section.style.maxWidth;
  const prevMinWidth = section.style.minWidth;
  const prevAlignSelf = section.style.alignSelf;

  section.style.width = `${forceWidth}px`;
  section.style.maxWidth = `${forceWidth}px`;
  section.style.minWidth = `${forceWidth}px`;
  section.style.alignSelf = "stretch";
  await new Promise((r) => requestAnimationFrame(r));

  try {
    return await captureCanvas(section, bg, forceWidth);
  } finally {
    section.style.width = prevWidth;
    section.style.maxWidth = prevMaxWidth;
    section.style.minWidth = prevMinWidth;
    section.style.alignSelf = prevAlignSelf;
  }
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

  const forceWidth = opts.forceWidth ?? (orientation === "l" ? 1000 : 860);

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

  // ----- Modo deck: páginas desenhadas explicitamente para PDF -----
  const pageTargets = Array.from(node.querySelectorAll<HTMLElement>("[data-pdf-page]"));
  if (pageTargets.length > 0) {
    for (const page of pageTargets) {
      if (page.offsetHeight === 0 || page.offsetWidth === 0) continue;
      pdf.addPage("a4", orientation);
      drawHeader(pdf, opts.title, pageW);

      const canvas = await captureSectionCanvas(page, bg, forceWidth);
      const naturalH = (canvas.height * usableW) / canvas.width;
      const scale = naturalH > usableH ? usableH / naturalH : 1;
      const imgW = usableW * scale;
      const imgH = naturalH * scale;
      const x = MARGIN_MM + (usableW - imgW) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, topY, imgW, imgH);
    }

    node.style.width = prevWidth;
    node.style.maxWidth = prevMaxWidth;
    node.style.minWidth = prevMinWidth;

    const total = (pdf as any).internal.getNumberOfPages();
    for (let p = 2; p <= total; p++) {
      pdf.setPage(p);
      drawFooter(pdf, opts.subtitle, p - 1, total - 1, pageW, pageH);
    }

    pdf.save(filename);
    return;
  }

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

    if (section.hasAttribute("data-pdf-break-before") && curY > topY) {
      pdf.addPage("a4", orientation);
      drawHeader(pdf, opts.title, pageW);
      curY = topY;
    }

    const canvas = await captureSectionCanvas(section, bg, forceWidth);
    const naturalH = (canvas.height * usableW) / canvas.width;
    let scale = naturalH > usableH ? usableH / naturalH : 1;
    let imgW = usableW * scale;
    let imgH = naturalH * scale;
    const remaining = bottomY - curY;

    if (imgH > remaining && curY > topY) {
      const scaleToRemaining = remaining / naturalH;
      if (remaining > usableH * 0.45 && scaleToRemaining >= 0.56) {
        scale = scaleToRemaining;
        imgW = usableW * scale;
        imgH = naturalH * scale;
      } else {
        pdf.addPage("a4", orientation);
        drawHeader(pdf, opts.title, pageW);
        curY = topY;
      }
    }

    const x = MARGIN_MM + (usableW - imgW) / 2;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, curY, imgW, imgH);
    curY += imgH + SECTION_GAP_MM;
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
