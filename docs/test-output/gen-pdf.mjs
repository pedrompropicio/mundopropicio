// Replica EXATA de src/lib/export-dre-geral-mensal.ts para correr em Node
// (a função do app usa doc.save() do navegador). Mantém o mesmo layout/conteúdo.
import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatCurrency(v) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v||0));
}

const d = {
  companyName: "Mundo Propício",
  year: 2026, monthIndex: 5,
  result: {
    receitasEventos: 22547.17,
    custosDirectosEventos: 13000,
    resultadoEventos: 9547.17,
    distribuicaoSocios: 0,
    margemEventos: 9547.17,
    custosCorporativos: 0,
    resultadoEmpresa: 9547.17,
    hasPartners: false,
  },
  cash: {
    realized: 7000,
    receitasAReceber: 5000,
    retidoBilheteira: 3160211.23,
    despesasComprometidas: 146682.41,
    sociosPorLiquidar: 80283.43,
    caixaFirme: -219965.84,
    caixaPotencial: 2945245.39,
  },
};

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = doc.internal.pageSize.getWidth();
const H = doc.internal.pageSize.getHeight();
const M = 14;
let y = M;

doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text(d.companyName, M, y); y+=6;
doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(100);
doc.text("Folha de Síntese Mensal — Sócios", M, y); y+=5;
doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(0);
doc.text(`${MONTHS[d.monthIndex]} ${d.year}`, M, y); y+=6;
doc.setDrawColor(180); doc.line(M, y, W-M, y); y+=6;

function title(label){ doc.setFillColor(30,30,40); doc.rect(M, y-4.5, W-2*M, 6, "F"); doc.setTextColor(255); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(label, M+2, y); doc.setTextColor(0); y+=7; }
function row(label, val, opts={}){
  const h = opts.grand?8:opts.total?7:6;
  if(opts.grand){ doc.setFillColor(225,235,245); doc.rect(M,y-4.5,W-2*M,h,"F"); }
  else if(opts.total){ doc.setFillColor(240,240,245); doc.rect(M,y-4.5,W-2*M,h,"F"); }
  doc.setFont("helvetica", opts.grand||opts.total?"bold":"normal");
  doc.setFontSize(opts.grand?10:9);
  doc.setTextColor(20);
  const t = opts.tag ? `${label}  [${opts.tag}]` : label;
  doc.text(t, M+2, y);
  doc.setTextColor(val<0?180:20, val<0?40:20, val<0?40:20);
  doc.text(formatCurrency(val), W-M-2, y, { align: "right" });
  doc.setTextColor(0); y+=h;
}

title("1. Resultado do Mês");
row("Receitas de Eventos", d.result.receitasEventos);
row("(-) Custos Directos de Eventos", -d.result.custosDirectosEventos);
row("= Resultado Líquido de Eventos", d.result.resultadoEventos, {total:true});
if(d.result.hasPartners){
  row("(-) Distribuição Sócios", -d.result.distribuicaoSocios);
  row("= Margem da Empresa (Eventos)", d.result.margemEventos, {total:true});
}
row("(-) Custos Corporativos", -d.result.custosCorporativos);
row("= RESULTADO DA EMPRESA", d.result.resultadoEmpresa, {total:true, grand:true});
y+=4;

title("2. Disposição de Caixa (a nível empresa)");
row("Realizado de caixa (pool líquido)", d.cash.realized);
row("(-) Despesas comprometidas (aprovadas por pagar)", -d.cash.despesasComprometidas);
row("(-) Sócios externos por liquidar", -d.cash.sociosPorLiquidar);
row("= Caixa firme disponível", d.cash.caixaFirme, {total:true});
row("(+) Receitas a receber", d.cash.receitasAReceber, {tag:"condicionada"});
row("(+) Retido em bilheteira", d.cash.retidoBilheteira, {tag:"condicionada"});
row("= Caixa potencial para distribuição", d.cash.caixaPotencial, {total:true, grand:true, tag:"inclui condicionada"});
y+=5;

doc.setDrawColor(200); doc.setFillColor(248,248,250);
const nh=18; doc.rect(M,y,W-2*M,nh,"FD");
doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(60);
doc.text("Porque RESULTADO ≠ CAIXA:", M+3, y+5);
doc.setFont("helvetica","normal"); doc.setFontSize(8);
const note = "O lucro contabilístico pode estar retido em bilheteira (a repassar), por receber (receitas aprovadas ainda não cobradas) ou consumido por compromissos já assumidos mas ainda não pagos. A caixa firme é a posição actual no pool líquido; a potencial inclui parcelas condicionadas.";
doc.text(doc.splitTextToSize(note, W-2*M-6), M+3, y+10);
y+=nh+4;

doc.setFontSize(7); doc.setTextColor(140); doc.setFont("helvetica","italic");
doc.text(`Gerado (TESTE F2) a ${new Date().toLocaleString("pt-PT")} — dados de seed ZZ_TESTE_F2.`, M, H-8);

const ab = doc.output("arraybuffer");
writeFileSync("docs/test-output/dre-geral-mensal-teste.pdf", Buffer.from(ab));
console.log("OK", "docs/test-output/dre-geral-mensal-teste.pdf", Buffer.from(ab).length, "bytes");
