import jsPDF from "jspdf";
import autoTableRaw from "jspdf-autotable";
import { sanitizePdfText, sanitizePdfRows } from "@/lib/pdf-text";
import { formatCurrency } from "@/lib/mock-data";
import { formatEventDate, type ArtistCacheReport } from "@/lib/cache-report";

// Todo o texto das tabelas passa pelo saneador (jsPDF/WinAnsi não tem U+2212).
const autoTable = (doc: jsPDF, opts: any) =>
  autoTableRaw(doc, { ...opts, head: sanitizePdfRows(opts.head), body: sanitizePdfRows(opts.body), foot: sanitizePdfRows(opts.foot) });

export interface EventMeta { id: string; name: string; date: string | null; city: string | null; venue: string | null }

export interface CachePdfBlock {
  /** Cidade/evento a que respeita cada secção. */
  reports: ArtistCacheReport[];
}

export interface CachePdfInput {
  title: string;
  companyName: string;
  logo: { dataUrl: string; w: number; h: number } | null;
  /** Resumo da turnê (só quando é a turnê inteira). */
  tourSummary?: { tourName: string; reports: ArtistCacheReport[]; meta: Record<string, EventMeta> };
  /** Uma secção por cidade/evento. */
  sections: { meta: EventMeta; reports: ArtistCacheReport[] }[];
  fileName: string;
}

const HEAD = { fillColor: [59, 130, 246] as [number, number, number], fontSize: 8 };
const BOLD = new Set(["CACHÊ LÍQUIDO A PAGAR", "Cachê da cidade", "Cachê Bruto", "CUSTOS EXTRAS A DESCONTAR", "Total da turnê"]);

/** Linhas da tabela de UMA cidade para UM artista (mesmos números do ecrã). */
export function cityRowsFor(report: ArtistCacheReport, cityId: string): string[][] {
  const rows: string[][] = [];
  const c = report.cities.find((x) => x.cityId === cityId);
  if (!report.isVariable) {
    rows.push(["Cachê Fixo", formatCurrency(report.grossTotal)]);
    return rows;
  }
  const r = c?.result;
  rows.push([`Receita real de bilheteira (${r?.revenueBasisLabel || "-"})`, formatCurrency(r?.revenueBasis ?? 0)]);
  for (const d of r?.deductionDetails ?? []) rows.push([`  (-) ${d.categoryCode} ${d.categoryName}`, formatCurrency(-d.amount)]);
  if ((r?.fixedPctRate ?? 0) > 0) rows.push([`  (-) Dedução fixa (${r!.fixedPctRate}%)`, formatCurrency(-(r!.fixedPctDeduction))]);
  rows.push(["Total deduções", formatCurrency(-(r?.totalDeduction ?? 0))]);
  rows.push(["Base de cálculo", formatCurrency(r?.baseForCalc ?? 0)]);
  rows.push([`Percentagem do artista (${r?.percentage ?? 0}%)`, formatCurrency(r?.calculatedAmount ?? 0)]);
  if ((r?.minimumGuaranteed ?? 0) > 0) rows.push([`Mínimo garantido ${formatCurrency(r!.minimumGuaranteed)}`, r!.isUsingMinimum ? "aplicado" : "não aplicado"]);
  if (c?.settlement?.adjusted_amount != null) rows.push(["Ajuste da cidade", formatCurrency(Number(c.settlement.adjusted_amount))]);
  else if (c?.settlement?.is_finalized && c.settlement.real_amount != null) rows.push(["Snapshot do fecho da cidade", formatCurrency(Number(c.settlement.real_amount))]);
  rows.push(["Cachê da cidade", formatCurrency(c?.amount ?? 0)]);
  return rows;
}

export async function exportArtistCachePdf(input: CachePdfInput) {
  const doc = new jsPDF();
  const rawText = doc.text.bind(doc);
  (doc as any).text = (t: string | string[], ...rest: any[]) =>
    rawText((Array.isArray(t) ? t.map(sanitizePdfText) : sanitizePdfText(t)) as any, ...(rest as [any, any]));
  const pageW = doc.internal.pageSize.getWidth();
  const m = 14;

  const header = (eventLines?: EventMeta): number => {
    let y = 12;
    if (input.logo) {
      const h = 12;
      const w = Math.min(50, (input.logo.w / input.logo.h) * h);
      doc.addImage(input.logo.dataUrl, /image\/jpe?g/.test(input.logo.dataUrl) ? "JPEG" : "PNG", m, y, w, h);
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(input.companyName, pageW - m, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(input.title, pageW - m, y + 10, { align: "right" });
    y += 18;
    if (eventLines) {
      autoTable(doc, {
        startY: y, theme: "plain", styles: { fontSize: 8, cellPadding: 0.8 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 22 } },
        body: [
          ["Evento", eventLines.name],
          ["Cidade", eventLines.city ?? "-"],
          ["Local", eventLines.venue ?? "-"],
          ["Data", formatEventDate(eventLines.date) || "-"],
        ],
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
    return y;
  };

  const table = (y: number, rows: string[][]) => {
    autoTable(doc, {
      startY: y, head: [["Descrição", "Valor"]], body: rows, theme: "striped",
      headStyles: HEAD, styles: { fontSize: 8 }, columnStyles: { 1: { halign: "right" } },
      didParseCell: (d: any) => { if (BOLD.has(String(d.cell.raw))) d.cell.styles.fontStyle = "bold"; },
    });
    return (doc as any).lastAutoTable.finalY + 8;
  };

  const extrasRows = (extras: any[], total: number): string[][] => extras.length === 0 ? [] : [
    ["", ""], ["CUSTOS EXTRAS A DESCONTAR", ""],
    ...extras.map((e) => [`  (-) ${e.description}`, formatCurrency(-Number(e.amount))]),
    ["Total extras", formatCurrency(-total)],
  ];

  let first = true;
  const newPage = () => { if (!first) doc.addPage(); first = false; };

  if (input.tourSummary) {
    newPage();
    let y = header();
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`Resumo da turnê — ${input.tourSummary.tourName}`, m, y); y += 6;
    doc.setFont("helvetica", "normal");
    for (const rep of input.tourSummary.reports) {
      if (y > 240) { doc.addPage(); y = header(); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(rep.config.artist_name, m, y); y += 4;
      doc.setFont("helvetica", "normal");
      const rows: string[][] = rep.cities.map((c) => {
        const mt = input.tourSummary!.meta[c.cityId];
        return [`${mt?.name ?? c.cityId} (${formatEventDate(mt?.date)})`, formatCurrency(c.amount)];
      });
      rows.push(["Cachê Bruto", formatCurrency(rep.grossTotal)]);
      rows.push(...extrasRows(rep.extras, rep.extrasTotal));
      rows.push(["CACHÊ LÍQUIDO A PAGAR", formatCurrency(rep.netTotal)]);
      y = table(y, rows);
    }
  }

  for (const sec of input.sections) {
    newPage();
    let y = header(sec.meta);
    for (const rep of sec.reports) {
      if (y > 240) { doc.addPage(); y = header(sec.meta); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text(`${rep.config.artist_name} · ${rep.isVariable ? "Variável" : "Fixo"}`, m, y); y += 4;
      doc.setFont("helvetica", "normal");
      const city = rep.cities.find((c) => c.cityId === sec.meta.id);
      const rows = cityRowsFor(rep, sec.meta.id);
      if (!input.tourSummary) {
        // Cidade isolada ou evento simples: fecha com extras e líquido.
        rows.push(...extrasRows(rep.extras, rep.extrasTotal));
        rows.push(["CACHÊ LÍQUIDO A PAGAR", formatCurrency(rep.netTotal)]);
      } else if (city && city.extras.length > 0) {
        rows.push(...extrasRows(city.extras, city.extrasTotal));
      }
      y = table(y, rows);
    }
  }

  const total = doc.getNumberOfPages();
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const gen = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5); doc.setTextColor(140);
    doc.text(`Gerado em ${gen}`, m, pageH - 8);
    doc.text(`pág. ${p}/${total}`, pageW - m, pageH - 8, { align: "right" });
    doc.setTextColor(0);
  }
  doc.save(input.fileName);
}

/** Converte um URL de imagem (logo da empresa ou fallback) em data URL + dimensões. */
export async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl: string = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((res) => {
      const img = new Image(); img.onload = () => res({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 }); img.onerror = () => res({ w: 4, h: 1 }); img.src = dataUrl;
    });
    // jsPDF só aceita PNG/JPEG: rasteriza noutros formatos (svg/webp).
    if (!/^data:image\/(png|jpe?g)/.test(dataUrl)) {
      const canvas = document.createElement("canvas");
      canvas.width = dims.w; canvas.height = dims.h;
      const img = new Image(); img.src = dataUrl; await new Promise((r) => { img.onload = r; img.onerror = r; });
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      return { dataUrl: canvas.toDataURL("image/png"), ...dims };
    }
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}
