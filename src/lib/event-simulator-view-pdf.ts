/**
 * Captura um nó DOM e gera um PDF A4 com escala automática.
 * Usado pelos botões "PDF desta vista" / "PDF Dashboard" do Simulador.
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportNodeToPdf(
  node: HTMLElement,
  filename: string,
  opts: { orientation?: "p" | "l"; title?: string } = {},
) {
  const orientation = opts.orientation ?? "l";
  // Capture the node honoring its real background colour (so dark theme stays dark)
  // and walk up the DOM to find a non-transparent ancestor as fallback.
  const resolveBg = (el: HTMLElement | null): string => {
    let cur: HTMLElement | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      cur = cur.parentElement;
    }
    return "#ffffff";
  };
  const bg = resolveBg(node);
  const canvas = await html2canvas(node, {
    scale: 3,
    backgroundColor: bg,
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    onclone: (doc) => {
      // Force-disable backdrop filters which html2canvas doesn't render and
      // which produce washed-out captures of glass cards.
      doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const cs = doc.defaultView?.getComputedStyle(el);
        if (cs && (cs.backdropFilter !== "none" || (cs as any).webkitBackdropFilter !== "none")) {
          el.style.backdropFilter = "none";
          (el.style as any).webkitBackdropFilter = "none";
        }
      });
    },
  });

  const pdf = new jsPDF(orientation, "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - (opts.title ? 8 : 0);

  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  let topOffset = margin;
  if (opts.title) {
    pdf.setFontSize(11);
    pdf.text(opts.title, margin, margin + 4);
    topOffset = margin + 8;
  }

  // Se couber numa página, desenha direto
  if (imgH <= usableH) {
    pdf.addImage(imgData, "PNG", margin, topOffset, imgW, imgH);
  } else {
    // Multipágina: corta a imagem em fatias
    const sliceHeightPx = (usableH * canvas.width) / imgW; // altura de cada fatia em px do canvas
    let yPx = 0;
    let pageIdx = 0;
    while (yPx < canvas.height) {
      const h = Math.min(sliceHeightPx, canvas.height - yPx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d")!;
      ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h);
      const sliceImg = slice.toDataURL("image/png");
      const sliceMm = (h * imgW) / canvas.width;
      if (pageIdx > 0) pdf.addPage("a4", orientation);
      const top = pageIdx === 0 ? topOffset : margin;
      pdf.addImage(sliceImg, "PNG", margin, top, imgW, sliceMm);
      yPx += h;
      pageIdx++;
    }
  }

  pdf.save(filename);
}
