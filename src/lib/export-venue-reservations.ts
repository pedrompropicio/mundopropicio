import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";

interface VenueReservationItem {
  name: string;
  date: string;
  venue_name: string;
  city_name: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  planning: "Planeamento",
  confirmed: "Confirmado",
  active: "Ativo",
  completed: "Concluído",
};

function formatDatePT(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function exportVenueReservationsToPDF(
  items: VenueReservationItem[],
  monthLabel: string
) {
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
  doc.text("Relatório de Salas Reservadas", marginLeft, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Mês: ${monthLabel}  |  Total: ${items.length} reserva(s)`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const tableData = sorted.map((item, i) => [
    String(i + 1),
    formatDatePT(item.date),
    item.name,
    item.venue_name,
    item.city_name || "—",
    STATUS_LABELS[item.status] || item.status,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Data", "Evento", "Sala de Espetáculo", "Cidade", "Estado"]],
    body: tableData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
      3: { cellWidth: "auto" },
      4: { cellWidth: 30 },
      5: { cellWidth: 28 },
    },
    margin: { left: marginLeft, right: 14 },
  });

  const filename = `Salas_Reservadas_${monthLabel.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}