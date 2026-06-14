/**
 * PDF "Folha de Síntese Mensal — Sócios" (uma página A4).
 *
 * Cabeçalho com nome da empresa + mês + duas secções:
 *   1) Resultado do Mês (vindo de computeDREEmpresarialMonthly)
 *   2) Disposição de Caixa (bridge a nível empresa, com 2 subtotais)
 * + Nota curta de reconciliação.
 *
 * Não recalcula nada — recebe valores prontos.
 */
import jsPDF from "jspdf";
import { formatCurrency } from "@/lib/mock-data";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface DREGeralMensalPDF {
  companyName: string;
  year: number;
  monthIndex: number; // 0-11
  result: {
    receitasEventos: number;
    custosDirectosEventos: number;
    resultadoEventos: number;
    distribuicaoSocios: number;
    margemEventos: number; // = resultadoEventos - distribuicaoSocios (se houver)
    custosCorporativos: number; // valor positivo (a subtrair)
    resultadoEmpresa: number;
    hasPartners: boolean;
  };
  cash: {
    realized: number; // Σ realized (RPC)
    receitasAReceber: number; // approved income não pago, sinal +
    retidoBilheteira: number; // helper, sinal +
    despesasComprometidas: number; // approved expense não pago, valor positivo
    sociosPorLiquidar: number; // partner_paid_expenses, valor positivo
    caixaFirme: number; // realized - despesasComprometidas - sociosPorLiquidar
    caixaPotencial: number; // caixaFirme + receitasAReceber + retidoBilheteira
  };
}

export function exportDREGeralMensalPDF(d: DREGeralMensalPDF) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = M;

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(d.companyName, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Folha de Síntese Mensal — Sócios", M, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`${MONTHS[d.monthIndex]} ${d.year}`, M, y);
  y += 6;
  doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  y += 6;

  // ── Secção 1: Resultado do Mês ──
  drawSectionTitle(doc, "1. Resultado do Mês", M, y);
  y += 7;

  const lines1: Array<[string, number, boolean?, boolean?]> = [
    ["Receitas de Eventos", d.result.receitasEventos],
    ["(-) Custos Directos de Eventos", -d.result.custosDirectosEventos],
    ["= Resultado Líquido de Eventos", d.result.resultadoEventos, true],
  ];
  if (d.result.hasPartners) {
    lines1.push(["(-) Distribuição Sócios", -d.result.distribuicaoSocios]);
    lines1.push(["= Margem da Empresa (Eventos)", d.result.margemEventos, true]);
  }
  lines1.push(["(-) Custos Corporativos", -d.result.custosCorporativos]);
  lines1.push(["= RESULTADO DA EMPRESA", d.result.resultadoEmpresa, true, true]);

  for (const [label, val, total, grand] of lines1) {
    y = drawRow(doc, label, val, y, M, W - M, { total: !!total, grand: !!grand });
  }
  y += 4;

  // ── Secção 2: Disposição de Caixa ──
  drawSectionTitle(doc, "2. Disposição de Caixa (a nível empresa)", M, y);
  y += 7;

  const lines2: Array<[string, number, boolean?, boolean?, string?]> = [
    ["Realizado de caixa (pool líquido)", d.cash.realized, false, false],
    ["(-) Despesas comprometidas (aprovadas por pagar)", -d.cash.despesasComprometidas, false, false],
    ["(-) Sócios externos por liquidar", -d.cash.sociosPorLiquidar, false, false],
    ["= Caixa firme disponível", d.cash.caixaFirme, true, false],
    ["(+) Receitas a receber", d.cash.receitasAReceber, false, false, "condicionada"],
    ["(+) Retido em bilheteira", d.cash.retidoBilheteira, false, false, "condicionada"],
    ["= Caixa potencial para distribuição", d.cash.caixaPotencial, true, true, "inclui condicionada"],
  ];

  for (const [label, val, total, grand, tag] of lines2) {
    y = drawRow(doc, label, val, y, M, W - M, { total: !!total, grand: !!grand, tag });
  }
  y += 5;

  // Nota de reconciliação
  doc.setDrawColor(200);
  doc.setFillColor(248, 248, 250);
  const noteH = 18;
  doc.rect(M, y, W - 2 * M, noteH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  doc.text("Porque RESULTADO ≠ CAIXA:", M + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const note = "O lucro contabilístico pode estar retido em bilheteira (a repassar), por receber (receitas aprovadas ainda não cobradas) ou consumido por compromissos já assumidos mas ainda não pagos. A caixa firme é a posição actual no pool líquido; a potencial inclui parcelas condicionadas.";
  const wrapped = doc.splitTextToSize(note, W - 2 * M - 6);
  doc.text(wrapped, M + 3, y + 10);
  y += noteH + 4;

  // Rodapé
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.setFont("helvetica", "italic");
  doc.text(
    `Gerado a ${new Date().toLocaleString("pt-PT")} — Camada paralela ao DRE/BP/Acerto de Sócios; não altera nenhum desses cálculos.`,
    M, H - 8
  );

  const safeMonth = String(d.monthIndex + 1).padStart(2, "0");
  doc.save(`DRE-Geral-Mensal-${d.year}-${safeMonth}.pdf`);
}

function drawSectionTitle(doc: jsPDF, label: string, x: number, y: number) {
  doc.setFillColor(30, 30, 40);
  doc.rect(x, y - 4.5, doc.internal.pageSize.getWidth() - 2 * x, 6, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x + 2, y);
  doc.setTextColor(0);
}

function drawRow(
  doc: jsPDF, label: string, val: number, y: number, x0: number, x1: number,
  opts: { total?: boolean; grand?: boolean; tag?: string }
): number {
  const h = opts.grand ? 8 : opts.total ? 7 : 6;
  if (opts.grand) {
    doc.setFillColor(225, 235, 245);
    doc.rect(x0, y - 4.5, x1 - x0, h, "F");
  } else if (opts.total) {
    doc.setFillColor(240, 240, 245);
    doc.rect(x0, y - 4.5, x1 - x0, h, "F");
  }
  doc.setFont("helvetica", opts.grand || opts.total ? "bold" : "normal");
  doc.setFontSize(opts.grand ? 10 : 9);
  doc.setTextColor(val < 0 ? 180 : 0, val < 0 ? 40 : 0, val < 0 ? 40 : 0);
  // label
  doc.setTextColor(20);
  let labelText = label;
  if (opts.tag) labelText = `${label}  [${opts.tag}]`;
  doc.text(labelText, x0 + 2, y);
  // value
  doc.setTextColor(val < 0 ? 180 : 20, val < 0 ? 40 : 20, val < 0 ? 40 : 20);
  doc.text(formatCurrency(val), x1 - 2, y, { align: "right" });
  doc.setTextColor(0);
  return y + h;
}
