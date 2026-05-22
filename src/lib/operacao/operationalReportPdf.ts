import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { inferEtapaPhase, PHASE_LABELS, PHASE_ORDER, type EtapaPhase } from "./inferEtapaPhase";

export type ReportDetail = "compact" | "medium" | "full";

export interface ReportOptions {
  eventId: string;
  phases: EtapaPhase[];
  statuses: string[]; // pending / in_progress / blocked / done / cancelled
  detail: ReportDetail;
  includePhotos: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluída",
  cancelled: "Cancelada",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRange(a?: string | null, b?: string | null): string {
  if (!a && !b) return "Sem data";
  if (a && b) return `${fmtDate(a)} → ${fmtDate(b)}`;
  return fmtDate(a ?? b);
}

async function fetchData(eventId: string) {
  const { data: event } = await supabase
    .from("events")
    .select("id,name,date,location")
    .eq("id", eventId)
    .maybeSingle();

  const { data: frentes } = await supabase
    .from("operacao_frentes")
    .select("id,name,type,color,display_order,current_lead_id")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("display_order");

  const { data: etapas } = await supabase
    .from("operacao_etapas")
    .select("id,frente_id,name,escopo,status,display_order,planned_start,planned_end,responsible_profile_id,supplier_id")
    .in("frente_id", (frentes ?? []).map((f) => f.id).length ? (frentes ?? []).map((f) => f.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("display_order");

  // Lookups
  const profileIds = new Set<string>();
  (frentes ?? []).forEach((f) => f.current_lead_id && profileIds.add(f.current_lead_id));
  (etapas ?? []).forEach((e) => e.responsible_profile_id && profileIds.add(e.responsible_profile_id));
  const supplierIds = new Set<string>();
  (etapas ?? []).forEach((e) => e.supplier_id && supplierIds.add(e.supplier_id));

  const [{ data: profiles }, { data: suppliers }] = await Promise.all([
    profileIds.size
      ? supabase.from("profiles").select("id,full_name").in("id", Array.from(profileIds))
      : Promise.resolve({ data: [] as any[] }),
    supplierIds.size
      ? supabase.from("suppliers").select("id,name").in("id", Array.from(supplierIds))
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return {
    event,
    frentes: frentes ?? [],
    etapas: etapas ?? [],
    profilesById: new Map((profiles ?? []).map((p: any) => [p.id, p.full_name])),
    suppliersById: new Map((suppliers ?? []).map((s: any) => [s.id, s.name])),
  };
}

async function fetchRegistros(etapaIds: string[]) {
  if (!etapaIds.length) return new Map<string, any[]>();
  const { data: registros } = await supabase
    .from("operacao_registros")
    .select("id,etapa_id,kind,text,transcribed_text,created_at,author_profile_id")
    .in("etapa_id", etapaIds)
    .order("created_at", { ascending: true });

  const regs = registros ?? [];
  const { data: media } = regs.length
    ? await supabase
        .from("operacao_registro_media")
        .select("registro_id,file_url,file_type,thumbnail_url")
        .in("registro_id", regs.map((r: any) => r.id))
        .eq("file_type", "photo")
    : { data: [] as any[] };

  const mediaByReg = new Map<string, any[]>();
  (media ?? []).forEach((m: any) => {
    const arr = mediaByReg.get(m.registro_id) ?? [];
    arr.push(m);
    mediaByReg.set(m.registro_id, arr);
  });

  const byEtapa = new Map<string, any[]>();
  regs.forEach((r: any) => {
    const arr = byEtapa.get(r.etapa_id) ?? [];
    arr.push({ ...r, media: mediaByReg.get(r.id) ?? [] });
    byEtapa.set(r.etapa_id, arr);
  });
  return byEtapa;
}

async function imageUrlToDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    // If it's a storage path, get signed URL
    let fetchUrl = url;
    if (!url.startsWith("http")) {
      const { data } = await supabase.storage.from("operacao-media").createSignedUrl(url, 3600);
      if (!data?.signedUrl) return null;
      fetchUrl = data.signedUrl;
    }
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });

    // Get dimensions and resize via canvas to max 600px
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const MAX = 600;
    const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL("image/jpeg", 0.75), w, h };
  } catch {
    return null;
  }
}

export async function generateOperationalReport(opts: ReportOptions): Promise<void> {
  const { event, frentes, etapas, profilesById, suppliersById } = await fetchData(opts.eventId);
  if (!event) throw new Error("Evento não encontrado");

  // Filter etapas by phase + status
  const enriched = etapas
    .map((e) => ({ ...e, _phase: inferEtapaPhase(e, event) }))
    .filter((e) => opts.phases.includes(e._phase) && opts.statuses.includes(e.status));

  // Optionally load registos
  const registrosByEtapa =
    opts.detail === "full" ? await fetchRegistros(enriched.map((e) => e.id)) : new Map<string, any[]>();

  // ---------- PDF ----------
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Relatório Operacional", margin, y);
  y += 24;
  doc.setFontSize(14);
  doc.text(event.name ?? "", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${event.location ?? "—"} · ${fmtDate(event.date)}`, margin, y);
  y += 14;
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-PT")} · Fases: ${opts.phases.map((p) => PHASE_LABELS[p]).join(", ")} · Detalhe: ${opts.detail}`,
    margin,
    y
  );
  y += 20;
  doc.setTextColor(0);

  // Summary table — status × phase counts
  const counts: Record<string, Record<string, number>> = {};
  opts.phases.forEach((p) => {
    counts[p] = {};
    opts.statuses.forEach((s) => (counts[p][s] = 0));
  });
  enriched.forEach((e) => {
    counts[e._phase][e.status] = (counts[e._phase][e.status] ?? 0) + 1;
  });

  autoTable(doc, {
    startY: y,
    head: [["Fase", ...opts.statuses.map((s) => STATUS_LABEL[s] ?? s), "Total"]],
    body: opts.phases.map((p) => {
      const row = [PHASE_LABELS[p]];
      let total = 0;
      opts.statuses.forEach((s) => {
        row.push(String(counts[p][s] ?? 0));
        total += counts[p][s] ?? 0;
      });
      row.push(String(total));
      return row;
    }),
    foot: [
      [
        "Total",
        ...opts.statuses.map((s) =>
          String(opts.phases.reduce((acc, p) => acc + (counts[p][s] ?? 0), 0))
        ),
        String(enriched.length),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ----- For each phase -----
  for (const phase of opts.phases) {
    const phaseEtapas = enriched.filter((e) => e._phase === phase);
    if (!phaseEtapas.length) continue;

    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setFillColor(30, 41, 59);
    doc.setTextColor(255);
    doc.rect(margin, y - 14, pageW - margin * 2, 22, "F");
    doc.text(`FASE — ${PHASE_LABELS[phase].toUpperCase()}`, margin + 8, y + 2);
    doc.setTextColor(0);
    y += 22;

    // Group by frente type: zone first, then service
    const renderGroup = async (typeLabel: string, frenteType: "zone" | "service") => {
      const groupFrentes = frentes
        .filter((f) => f.type === frenteType)
        .filter((f) => phaseEtapas.some((e) => e.frente_id === f.id));
      if (!groupFrentes.length) return;

      ensureSpace(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(80);
      doc.text(typeLabel.toUpperCase(), margin, y);
      y += 14;
      doc.setTextColor(0);

      for (const f of groupFrentes) {
        const items = phaseEtapas.filter((e) => e.frente_id === f.id);
        if (!items.length) continue;
        await renderFrente(f, items);
      }
    };

    const renderFrente = async (f: any, items: any[]) => {
      ensureSpace(40);
      // Frente header
      const [fr, fg, fb] = f.color ? hexToRgb(f.color) : [99, 102, 241];
      doc.setFillColor(fr, fg, fb);
      doc.rect(margin, y, 4, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(f.name, margin + 10, y + 11);
      const leadName = f.current_lead_id ? profilesById.get(f.current_lead_id) : null;
      if (leadName) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`· ${leadName}`, margin + 10 + doc.getTextWidth(f.name) + 4, y + 11);
        doc.setTextColor(0);
      }
      y += 18;

      if (opts.detail === "compact") {
        // single table
        autoTable(doc, {
          startY: y,
          head: [["Etapa", "Status", "Datas", "Responsável"]],
          body: items.map((e) => [
            e.name,
            STATUS_LABEL[e.status] ?? e.status,
            fmtRange(e.planned_start, e.planned_end),
            e.responsible_profile_id ? profilesById.get(e.responsible_profile_id) ?? "—" : "—",
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [241, 245, 249], textColor: 0 },
          margin: { left: margin + 8, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
        return;
      }

      // medium / full
      for (const e of items) {
        ensureSpace(40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`• ${e.name}`, margin + 12, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(
          `${STATUS_LABEL[e.status] ?? e.status} · ${fmtRange(e.planned_start, e.planned_end)}`,
          margin + 12,
          y + 12
        );
        doc.setTextColor(0);
        y += 22;

        const meta: string[] = [];
        if (e.responsible_profile_id) {
          const n = profilesById.get(e.responsible_profile_id);
          if (n) meta.push(`Responsável: ${n}`);
        }
        if (e.supplier_id) {
          const n = suppliersById.get(e.supplier_id);
          if (n) meta.push(`Fornecedor: ${n}`);
        }
        if (e.escopo) meta.push(`Escopo: ${e.escopo}`);
        if (meta.length) {
          ensureSpace(14 * meta.length);
          doc.setFontSize(9);
          meta.forEach((m) => {
            const lines = doc.splitTextToSize(m, pageW - margin * 2 - 16);
            doc.text(lines, margin + 16, y);
            y += 11 * lines.length;
          });
          y += 4;
        }

        // Registos (full mode)
        if (opts.detail === "full") {
          const regs = registrosByEtapa.get(e.id) ?? [];
          if (regs.length) {
            ensureSpace(14);
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text("Registos:", margin + 16, y);
            doc.setTextColor(0);
            y += 12;
            for (const r of regs) {
              const author = profilesById.get(r.author_profile_id) ?? "—";
              const when = new Date(r.created_at).toLocaleString("pt-PT", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              const text = r.text ?? r.transcribed_text ?? "(sem texto)";
              const head = `${when} · ${author}`;
              const lines = doc.splitTextToSize(text, pageW - margin * 2 - 24);
              ensureSpace(11 + 11 * lines.length + 6);
              doc.setFontSize(8);
              doc.setTextColor(120);
              doc.text(head, margin + 20, y);
              y += 10;
              doc.setTextColor(0);
              doc.setFontSize(9);
              doc.text(lines, margin + 20, y);
              y += 11 * lines.length + 4;

              if (opts.includePhotos && r.media?.length) {
                for (const m of r.media as any[]) {
                  const img = await imageUrlToDataUrl(m.file_url);
                  if (!img) continue;
                  const targetW = 180;
                  const targetH = (img.h / img.w) * targetW;
                  ensureSpace(targetH + 8);
                  try {
                    doc.addImage(img.data, "JPEG", margin + 20, y, targetW, targetH);
                  } catch {
                    /* skip */
                  }
                  y += targetH + 8;
                }
              }
            }
            y += 4;
          }
        }
      }
      y += 6;
    };

    await renderGroup("Zonas Físicas", "zone");
    await renderGroup("Serviços Transversais", "service");
  }

  doc.save(`relatorio-operacional-${(event.name ?? "evento").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [99, 102, 241];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
