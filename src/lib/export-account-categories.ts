import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";

interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
}

export function exportAccountCategoriesToPDF(categories: Category[]) {
  const doc = new jsPDF({ orientation: "portrait" });
  const marginLeft = 14;
  let y = 14;

  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  doc.setFontSize(16);
  doc.text("Plano de Contas", marginLeft, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  const level1 = categories.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const tableData: any[][] = [];

  level1.forEach((l1) => {
    tableData.push([
      { content: l1.code, styles: { fontStyle: "bold" as const, fillColor: [230, 230, 230] as [number, number, number] } },
      { content: l1.name, styles: { fontStyle: "bold" as const, fillColor: [230, 230, 230] as [number, number, number] } },
      { content: l1.type === "income" ? "Receita" : "Despesa", styles: { fontStyle: "bold" as const, fillColor: [230, 230, 230] as [number, number, number], halign: "center" as const } },
    ]);

    const l2Items = getChildren(l1.id);
    l2Items.forEach((l2) => {
      tableData.push([
        { content: `   ${l2.code}`, styles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] } },
        { content: l2.name, styles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] } },
        { content: l2.type === "income" ? "Receita" : "Despesa", styles: { fillColor: [242, 242, 242] as [number, number, number], halign: "center" as const } },
      ]);

      const l3Items = getChildren(l2.id);
      l3Items.forEach((l3) => {
        tableData.push([
          `      ${l3.code}`,
          l3.name,
          { content: l3.type === "income" ? "Receita" : "Despesa", styles: { halign: "center" as const } },
        ]);
      });
    });
  });

  autoTable(doc, {
    startY: y,
    head: [["Código", "Categoria", "Tipo"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 30 },
      2: { cellWidth: 25 },
    },
    margin: { left: marginLeft, right: 14 },
  });

  doc.save(`Plano_Contas_${new Date().toISOString().slice(0, 10)}.pdf`);
}
