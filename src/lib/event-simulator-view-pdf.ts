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
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
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
