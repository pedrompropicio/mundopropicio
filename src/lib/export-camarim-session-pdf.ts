import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDatePT } from "@/lib/utils";
import {
  SESSION_STATUS_LABELS,
  SESSION_MODE_LABELS,
  PAYMENT_ORIGIN_LABELS,
  ITEM_STATUS_LABELS,
  formatCurrency,
  type CamarimSessionStatus,
  type CamarimItemStatus,
  type CamarimItemPaymentOrigin,
} from "@/lib/camarim-helpers";

/**
 * Relatório PDF de uma sessão de camarim (leitura apenas).
 * Usa o padrão do app: jspdf + jspdf-autotable, valores em pt-PT.
 */

const slug = (s: string) =>
  (s || "sessao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "sessao";

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-PT");
};

export async function exportCamarimSessionPdf(sessionId: string, generatedBy?: string | null) {
  const { data: sessionRow, error: sErr } = await supabase
    .from("camarim_sessions" as any)
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sErr) throw sErr;
  const session = sessionRow as any;

  const [itemsRes, fundsRes, eventsRes, companyRes, profileRes] = await Promise.all([
    supabase
      .from("camarim_items" as any)
      .select(
        "id, service_description, supplier_name_raw, document_number, document_date, base_amount, iva_amount, total_amount, payment_origin, analytic_tag, status, approved_without_document, has_document, created_at",
      )
      .eq("session_id", sessionId),
    supabase.from("camarim_fund_moves" as any).select("move_type, amount").eq("session_id", sessionId),
    supabase
      .from("camarim_session_events" as any)
      .select("is_primary, events:event_id(name, date)")
      .eq("session_id", sessionId),
    session.company_id
      ? supabase.from("companies" as any).select("display_name, legal_name").eq("id", session.company_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    session.responsible_profile_id
      ? supabase
          .from("profiles" as any)
          .select("full_name, email")
          .eq("id", session.responsible_profile_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const rawItems = ((itemsRes.data ?? []) as any[]).filter((i) => i.status !== "split");
  const items = rawItems.sort((a, b) =>
    String(a.document_date ?? a.created_at ?? "").localeCompare(String(b.document_date ?? b.created_at ?? "")),
  );
  const funds = (fundsRes.data ?? []) as any[];
  const eventLinks = (eventsRes.data ?? []) as any[];
  const company = (companyRes as any)?.data ?? null;
  const responsible = (profileRes as any)?.data ?? null;

  const ccy = session.currency ?? "EUR";
  const fmt = (n: number) => formatCurrency(Number(n ?? 0), ccy);

  const advances = funds
    .filter((f) => f.move_type === "advance" || f.move_type === "reinforcement")
    .reduce((a, f) => a + Number(f.amount ?? 0), 0);
  const refunds = funds.filter((f) => f.move_type === "refund").reduce((a, f) => a + Number(f.amount ?? 0), 0);
  const totalGross = items.reduce((a, i) => a + Number(i.total_amount ?? 0), 0);
  const totalIva = items.reduce((a, i) => a + Number(i.iva_amount ?? 0), 0);
  const totalBase = items.reduce(
    (a, i) => a + (Number(i.base_amount ?? 0) || Number(i.total_amount ?? 0) - Number(i.iva_amount ?? 0)),
    0,
  );
  const spentFromAdvance = items
    .filter((i) => i.payment_origin === "advance")
    .reduce((a, i) => a + Number(i.total_amount ?? 0), 0);
  const cashOnHand = advances - refunds - spentFromAdvance;
  const noDocCount = items.filter((i) => i.approved_without_document || i.has_document === false).length;

  const eventNames = eventLinks
    .map((l) => l.events?.name)
    .filter(Boolean)
    .join(", ");
  const primaryEvent = eventLinks.find((l) => l.is_primary)?.events?.name ?? eventLinks[0]?.events?.name ?? "";

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 32;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatório de Camarim", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const headerLines = [
    `Empresa: ${company?.display_name ?? company?.legal_name ?? "—"}`,
    `Evento(s): ${eventNames || "—"}`,
    `Sessão: ${session.title ?? "—"}  ·  Modo: ${SESSION_MODE_LABELS[session.mode as keyof typeof SESSION_MODE_LABELS] ?? session.mode}`,
    `Responsável: ${responsible?.full_name ?? responsible?.email ?? "—"}`,
    `Período: ${formatDatePT(session.opened_at)} → ${
      session.closed_at ? formatDatePT(session.closed_at) : "aberta"
    }${session.integrated_at ? `  ·  Integrada em ${formatDatePT(session.integrated_at)}` : ""}`,
    `Estado: ${SESSION_STATUS_LABELS[session.status as CamarimSessionStatus] ?? session.status}`,
  ];
  for (const line of headerLines) {
    doc.text(line, margin, y);
    y += 12;
  }
  y += 6;

  // Resumo
  autoTable(doc, {
    startY: y,
    head: [["Resumo", "Valor"]],
    body: [
      ["Orçamento", fmt(session.budget_amount)],
      ["Fundos entregues (adiantamentos + reforços)", fmt(advances)],
      ["Devoluções", fmt(refunds)],
      ["Total gasto c/IVA", fmt(totalGross)],
      ["Base s/IVA", fmt(totalBase)],
      ["IVA total", fmt(totalIva)],
      ["Nº de contas / itens", String(items.length)],
      ["Caixa em mão / troco", fmt(cashOnHand)],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: "left" },
    columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 110, halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Itens
  autoTable(doc, {
    startY: y,
    head: [["Data", "Estabelecimento", "Descrição", "Nº doc.", "Base s/IVA", "IVA", "Total c/IVA", "Pagamento", "Tag", "Estado"]],
    body: items.map((i) => {
      const base = Number(i.base_amount ?? 0) || Number(i.total_amount ?? 0) - Number(i.iva_amount ?? 0);
      const noDoc = i.approved_without_document || i.has_document === false;
      return [
        formatDatePT(i.document_date ?? i.created_at) || "—",
        i.supplier_name_raw || "—",
        i.service_description || "—",
        (i.document_number || "—") + (noDoc ? " (sem doc.)" : ""),
        fmt(base),
        fmt(i.iva_amount),
        fmt(i.total_amount),
        PAYMENT_ORIGIN_LABELS[i.payment_origin as CamarimItemPaymentOrigin] ?? i.payment_origin ?? "—",
        i.analytic_tag || "—",
        ITEM_STATUS_LABELS[i.status as CamarimItemStatus] ?? i.status,
      ];
    }),
    foot: [["", "", "", "TOTAL", fmt(totalBase), fmt(totalIva), fmt(totalGross), "", "", `${items.length} itens`]],
    styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: "left" },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 120 },
      2: { cellWidth: 160 },
      3: { cellWidth: 80 },
      4: { cellWidth: 62, halign: "right" },
      5: { cellWidth: 55, halign: "right" },
      6: { cellWidth: 66, halign: "right" },
      7: { cellWidth: 100 },
      8: { cellWidth: 60 },
      9: { cellWidth: 60 },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (noDocCount > 0) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    const note = doc.splitTextToSize(
      `(sem doc.) — ${noDocCount} item(ns) sem documento fiscal válido, aprovado(s) mediante justificação registada na sessão. Não são dedutíveis em IVA.`,
      pageW - margin * 2,
    );
    if (y > doc.internal.pageSize.getHeight() - margin - 30) {
      doc.addPage();
      y = margin;
    }
    doc.text(note, margin, y);
    doc.setTextColor(0);
  }

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(`Gerado em ${fmtDateTime(new Date().toISOString())}${generatedBy ? ` por ${generatedBy}` : ""}`, margin, pageH - 14);
    doc.text(`pág. ${p}/${total}`, pageW - margin, pageH - 14, { align: "right" });
    doc.setTextColor(0);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`camarim-${slug(primaryEvent || session.title)}-${stamp}.pdf`);
}
