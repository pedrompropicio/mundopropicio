/**
 * Exportação PDF do BI de Vendas (ecrã de detalhe de um tour).
 *
 * Convenção do projeto: jsPDF + jspdf-autotable, cabeçalho institucional via
 * `src/lib/export-header.ts` (o nome da empresa vem SEMPRE do branding).
 * O gráfico é desenhado com primitivas do jsPDF — sem html2canvas, sem imagens.
 *
 * Duas versões:
 * - "internal": 3 folhas, carimbo USO INTERNO, notas de diagnóstico.
 * - "partner": 2 folhas, sem diagnóstico; onde a lotação não é fiável escreve
 *   apenas um traço (o sócio/artista não precisa de ler os nossos problemas).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchExportBranding, drawPdfExportHeader } from "@/lib/export-header";

const nfInt = new Intl.NumberFormat("pt-PT");
const nfMoney = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const money = (v: number) => `${nfMoney.format(Number(v || 0))} €`;
const int = (v: number) => nfInt.format(Number(v || 0));
const dec1 = (v: number) => nf1.format(Number(v || 0));
const pct = (v: number) => `${nfInt.format(Math.round(v))}%`;
const fmtDay = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

import { tractionText, type Traction } from "@/lib/traction";

export type EventSalesPdfVariant = "internal" | "partner";

export interface EventSalesPdfCity {
  id: string;
  name: string;
  date: string | null;
  qty: number;
  value: number;
  med: number;
  variacao: Traction;
  total: number;
  /** Origem da série (bilheteira) — só usada na versão interna. */
  source: string | null;
}

export interface EventSalesPdfParams {
  variant: EventSalesPdfVariant;
  companyId?: string | null;
  tourName: string;
  /** Período analisado (dias de calendário) e respetivas fronteiras. */
  days: number;
  periodStart: string;
  periodEnd: string;
  withIva: boolean;
  /** Taxa a escrever no cabeçalho; null quando o tour mistura taxas. */
  ivaRate: number | null;
  totalQty: number;
  totalValue: number;
  qty: number;
  value: number;
  med: number;
  medValue: number;
  variacao: Traction;
  /**
   * Ocupação da sala (bilheteira): `occupied` / `capacity`. Só se usa quando
   * `trustworthy`. NÃO é o mesmo que os bilhetes vendidos por nós.
   */
  capacity: { trustworthy: boolean; capacity: number | null; occupied: number | null; issue: string | null };
  points: { date: string; qty: number; value: number; ma: number | null }[];
  cities: EventSalesPdfCity[];
  /** Eventos com lotação não fiável (motivo do get_event_capacity_quality). */
  qualityIssues: { name: string; issue: string }[];
}

const M = 14;
const PAGE_W = 210;
const PAGE_H = 297;

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tour";

/** Data/hora de extração em Lisboa. */
function lisbonStamp() {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

/** Gráfico de barras + média móvel de 7 dias, só com primitivas do jsPDF. */
function drawBars(doc: jsPDF, points: EventSalesPdfParams["points"], y: number): number {
  const x0 = M;
  const w = PAGE_W - M * 2;
  const h = 48;
  const axis = 6;
  if (points.length === 0) return y;

  const max = Math.max(...points.map((p) => Math.max(p.qty, p.ma ?? 0)), 1);
  const bw = w / points.length;
  const yOf = (v: number) => y + h - (v / max) * h;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(x0, y + h, x0 + w, y + h);

  doc.setFillColor(60, 90, 180);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const bh = y + h - yOf(p.qty);
    if (bh > 0) doc.rect(x0 + i * bw + bw * 0.15, yOf(p.qty), Math.max(bw * 0.7, 0.4), bh, "F");
  }

  doc.setDrawColor(215, 140, 30);
  doc.setLineWidth(0.5);
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.ma === null) {
      prev = null;
      continue;
    }
    const cur = { x: x0 + i * bw + bw / 2, y: yOf(p.ma) };
    if (prev) doc.line(prev.x, prev.y, cur.x, cur.y);
    prev = cur;
  }

  // eixo x: todas as datas até 14 dias, ~10 acima disso (regra do ecrã)
  const step = points.length <= 14 ? 1 : Math.ceil(points.length / 10);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  for (let i = 0; i < points.length; i++) {
    if (!(i === 0 || i === points.length - 1 || i % step === 0)) continue;
    doc.text(ddmm(points[i].date), x0 + i * bw + bw / 2, y + h + axis - 1.5, { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  return y + h + axis + 2;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(text, M, y);
  return y + 3;
}

/** Identificação compacta no topo das folhas de anexo. Devolve o y para o conteúdo. */
function pageIdent(doc: jsPDF, tourName: string, meta: string): number {
  const y = 14;
  const usable = PAGE_W - M * 2;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(tourName, M, y);
  const nameW = doc.getTextWidth(tourName);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  const metaW = doc.getTextWidth(meta);
  // Nome comprido: o meta desce para uma segunda linha em vez de passar a margem.
  const wraps = nameW + 3 + metaW > usable;
  const metaY = wraps ? y + 4.2 : y;
  doc.text(meta, wraps ? M : M + nameW + 3, metaY);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(M, metaY + 2.5, PAGE_W - M, metaY + 2.5);
  doc.setDrawColor(0, 0, 0);
  return metaY + 8;
}

interface KpiCell {
  rotulo: string;
  valor: string;
  nota?: string;
}

/**
 * Faixa de indicadores em grelha fixa (2 linhas × 4 colunas), desenhada à mão.
 * Uma autoTable dava larguras de coluna dependentes do texto e desalinhava as
 * células com nota (3 linhas) contra as sem nota (2 linhas).
 */
function drawKpiGrid(doc: jsPDF, kpis: KpiCell[], y: number): number {
  const usable = PAGE_W - M * 2;
  const colW = usable / 4;
  const rowH = 15;
  for (let row = 0; row < 2; row++) {
    const top = y + row * rowH;
    for (let col = 0; col < 4; col++) {
      const cell = kpis[row * 4 + col];
      if (!cell) continue;
      const x = M + col * colW;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(cell.rotulo, x, top + 3.5);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(cell.valor, x, top + 8.6);
      if (cell.nota) {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(cell.nota, x, top + 12.3);
      }
    }
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(M, top + rowH - 1, PAGE_W - M, top + rowH - 1);
  }
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  return y + 2 * rowH;
}

export async function exportEventSalesPdf(params: EventSalesPdfParams) {
  const internal = params.variant === "internal";
  const branding = await fetchExportBranding(params.companyId ?? null);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const stamp = lisbonStamp();

  const ivaLine = params.withIva
    ? `Valores com IVA${params.ivaRate != null ? ` (taxa ${dec1(params.ivaRate)}%)` : ""}`
    : `Valores sem IVA${params.ivaRate != null ? ` (taxa ${dec1(params.ivaRate)}% deduzida)` : " (taxa do evento deduzida linha a linha)"}`;
  const periodLine = `Período analisado: ${params.days} dias — ${fmtDay(params.periodStart)} a ${fmtDay(params.periodEnd)}`;
  const sfx = params.withIva ? "" : " s/ IVA";
  const identMeta = `${params.days} dias — ${fmtDay(params.periodStart)} a ${fmtDay(params.periodEnd)} · ${
    params.withIva ? "com IVA" : "sem IVA"
  }${params.ivaRate != null ? ` (${dec1(params.ivaRate)}%)` : ""}`;

  // ── FOLHA 1 — síntese ────────────────────────────────────────────────
  let y = drawPdfExportHeader(doc, {
    branding,
    title: `Vendas — ${params.tourName}`,
    subtitles: [periodLine, ivaLine, `Extração: ${stamp} (Lisboa)`],
  });

  if (internal) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(190, 40, 40);
    doc.text("USO INTERNO", PAGE_W - M, 16, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // OCUPAÇÃO DA SALA = occupied/capacity da bilheteira (inclui cortesias,
  // protocolo, reservas e canais que não registamos). Nunca os nossos bilhetes.
  const salaOk = params.capacity.trustworthy && !!params.capacity.capacity;
  const salaPctNum = salaOk
    ? (Number(params.capacity.occupied || 0) / Number(params.capacity.capacity)) * 100
    : null;
  const occ = salaPctNum === null ? "—" : pct(salaPctNum);
  const occSub = salaOk
    ? `${int(Number(params.capacity.occupied || 0))} de ${int(Number(params.capacity.capacity))} lugares`
    : "";

  const [tracVal, tracNote] = tractionText(params.variacao, nfInt).split("\n");

  const kpis: KpiCell[] = [
    { rotulo: "Total do evento (bilhetes)", valor: int(params.totalQty) },
    { rotulo: `Total do evento (receita)${sfx}`, valor: money(params.totalValue) },
    { rotulo: "Bilhetes no período", valor: int(params.qty) },
    { rotulo: `Receita no período${sfx}`, valor: money(params.value) },
    { rotulo: "Média diária (bilhetes)", valor: `${dec1(params.med)} /dia` },
    { rotulo: `Média diária${sfx}`, valor: money(params.medValue) },
    { rotulo: "Tração vs. período anterior", valor: tracVal, nota: tracNote },
    { rotulo: "Ocupação da sala", valor: occ, nota: occSub || undefined },
  ];

  y = drawKpiGrid(doc, kpis, y) + 7;

  // parágrafo de leitura gerado dos números
  const vPct = params.variacao.pct;
  const dir = vPct === null ? null : vPct >= 0 ? "acima" : "abaixo";
  let reading =
    `Nos últimos ${int(params.days)} dias vendeu ${int(params.qty)} bilhetes, uma média de ${dec1(params.med)} por dia` +
    (dir ? `, ${pct(Math.abs(vPct as number))} ${dir} dos ${int(params.days)} dias anteriores` : "") +
    `. O acumulado é ${int(params.totalQty)} bilhetes` +
    (params.withIva ? "" : " (receita apresentada sem IVA)") +
    ".";
  if (salaOk) {
    reading +=
      ` A ocupação da sala, segundo a bilheteira, é de ${occ} (${occSub}) — inclui cortesias, protocolo,` +
      ` reservas e canais que não registamos, e é um número distinto dos bilhetes vendidos por nós.`;
  } else if (internal) {
    reading += " Não há observação de lotação da bilheteira utilizável, pelo que a ocupação da sala não é apresentada.";
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const wrapped = doc.splitTextToSize(reading, PAGE_W - M * 2);
  doc.text(wrapped, M, y);
  y += wrapped.length * 4.4 + 5;

  y = sectionTitle(doc, "Bilhetes por dia (linha = média móvel de 7 dias)", y);
  y = drawBars(doc, params.points, y + 3) + 5;

  const last7 = params.points.slice(-7);
  y = sectionTitle(doc, "Últimos 7 dias", y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Dia", "Bilhetes", `Receita${sfx}`]],
    body: last7.map((p) => [fmtDay(p.date), int(p.qty), money(p.value)]),
    foot: [[
      "TOTAL",
      int(last7.reduce((a, p) => a + p.qty, 0)),
      money(last7.reduce((a, p) => a + Number(p.value || 0), 0)),
    ]],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // ── FOLHA 2 — anexo analítico ────────────────────────────────────────
  doc.addPage();
  y = pageIdent(doc, params.tourName, identMeta);
  y = sectionTitle(doc, "Anexo analítico — por cidade", y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Cidade", "Data", "Bilhetes", `Receita${sfx}`, "Média/dia", "Tração", "Acumulado"]],
    body: params.cities.map((c) => [
      c.name,
      fmtDay(c.date),
      int(c.qty),
      money(c.value),
      dec1(c.med),
      tractionText(c.variacao, nfInt),
      int(c.total),
    ]),
    foot: [[
      "TOTAL",
      "",
      int(params.qty),
      money(params.value),
      dec1(params.med),
      "",
      int(params.totalQty),
    ]],
    styles: { fontSize: 7.5, cellPadding: 1.4 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    margin: { left: M, right: M },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  y = sectionTitle(doc, "Série diária do período", y);
  autoTable(doc, {
    startY: y + 2,
    head: [["Dia", "Bilhetes", `Receita${sfx}`, "Média móvel 7d"]],
    body: params.points.map((p) => [
      fmtDay(p.date),
      int(p.qty),
      money(p.value),
      p.ma === null ? "—" : dec1(p.ma),
    ]),
    foot: [[
      "TOTAL",
      int(params.points.reduce((a, p) => a + p.qty, 0)),
      money(params.points.reduce((a, p) => a + Number(p.value || 0), 0)),
      "",
    ]],
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // ── FOLHA 3 — só versão interna ──────────────────────────────────────
  if (internal) {
    doc.addPage();
    y = pageIdent(doc, params.tourName, identMeta);
    y = sectionTitle(doc, "Qualidade dos dados — lotação", y);
    if (params.qualityIssues.length === 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Sem problemas de lotação detetados neste tour.", M, y + 4);
      y += 10;
    } else {
      autoTable(doc, {
        startY: y + 2,
        head: [["Evento", "Motivo"]],
        body: params.qualityIssues.map((q) => [q.name, q.issue || "—"]),
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: [40, 40, 40] },
        margin: { left: M, right: M },
      });
      y = (doc as any).lastAutoTable.finalY + 7;
    }

    y = sectionTitle(doc, "Origem da série por cidade", y);
    autoTable(doc, {
      startY: y + 2,
      head: [["Cidade", "Origem"]],
      body: params.cities.map((c) => [c.name, c.source || "—"]),
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: M, right: M },
    });
  }

  // ── rodapés + numeração ──────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    const footer = internal
      ? "Origem: bilheteiras (mirrors diários) e registo de vendas. A média diária é sobre dias de calendário. Uso interno."
      : `Dados de bilheteira · Extração ${stamp}`;
    // A última linha do rodapé assenta sempre em PAGE_H - 10, à altura do
    // número da página; as anteriores sobem, para não invadir a margem.
    const footerLines: string[] = doc.splitTextToSize(footer, PAGE_W - M * 2 - 34);
    doc.text(footerLines, M, PAGE_H - 10 - (footerLines.length - 1) * 3.2);
    doc.text(`página ${int(i)} de ${int(total)}`, PAGE_W - M, PAGE_H - 10, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`vendas-${slug(params.tourName)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
