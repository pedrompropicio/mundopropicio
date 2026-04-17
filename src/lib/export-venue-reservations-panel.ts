import jsPDF from "jspdf";
import { formatDatePTOptions } from "@/lib/utils";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface ReservationItem {
  id: string;
  date: string;
  venue_name: string;
  city_name: string;
  notes: string | null;
}

function formatDatePT(dateStr: string): string {
  return formatDatePTOptions(dateStr, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function exportVenueReservationsPanelPDF(reservations: ReservationItem[]) {
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
  doc.text("Reservas de Salas de Espetáculo", marginLeft, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const today = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Gerado em: ${today}  |  Total: ${reservations.length} reserva(s)`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Group by month
  const groups = new Map<string, ReservationItem[]>();
  reservations.forEach((r) => {
    const d = new Date(r.date + "T12:00:00");
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  sortedGroups.forEach(([monthKey, items], groupIndex) => {
    const [year, month] = monthKey.split("-");
    const monthLabel = `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;

    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = 14;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${monthLabel} (${items.length})`, marginLeft, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    const tableData = items.map((item, i) => [
      String(i + 1),
      formatDatePT(item.date),
      item.notes || "—",
      item.venue_name,
      item.city_name || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["#", "Data", "Notas", "Sala", "Cidade"]],
      body: tableData,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [100, 60, 150], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 245, 252] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 28 },
        2: { cellWidth: "auto" },
        3: { cellWidth: "auto" },
        4: { cellWidth: 30 },
      },
      margin: { left: marginLeft, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  });

  doc.save("Reservas_Salas.pdf");
}
