import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { inferEtapaPhase, PHASE_LABELS, PHASE_ORDER, type EtapaPhase } from "./inferEtapaPhase";

export type ReportDetail = "compact" | "medium" | "full";
export type ReportGroupBy = "frente" | "day";

export interface ReportOptions {
  eventId: string;
  phases: EtapaPhase[];
  statuses: string[]; // pending / in_progress / blocked / done / cancelled
  detail: ReportDetail;
  includePhotos: boolean;
  groupBy?: ReportGroupBy;
  /** Se omitido ou vazio → todas as frentes. */
  frenteIds?: string[];
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

async function fetchRegistros(filter: { etapaIds: string[]; frenteIds: string[] }) {
  const { etapaIds, frenteIds } = filter;
  if (!etapaIds.length && !frenteIds.length) {
    return { byEtapa: new Map<string, any[]>(), byFrente: new Map<string, any[]>() };
  }

  let query = supabase
    .from("operacao_registros")
    .select("id,etapa_id,frente_id,kind,text,transcribed_text,created_at,author_profile_id")
    .order("created_at", { ascending: true });

  const orParts: string[] = [];
  if (etapaIds.length) orParts.push(`etapa_id.in.(${etapaIds.join(",")})`);
  if (frenteIds.length) orParts.push(`and(etapa_id.is.null,frente_id.in.(${frenteIds.join(",")}))`);
  query = query.or(orParts.join(","));

  const { data: registros } = await query;
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
  const byFrente = new Map<string, any[]>();
  regs.forEach((r: any) => {
    const enriched = { ...r, media: mediaByReg.get(r.id) ?? [] };
    if (r.etapa_id) {
      const arr = byEtapa.get(r.etapa_id) ?? [];
      arr.push(enriched);
      byEtapa.set(r.etapa_id, arr);
    } else if (r.frente_id) {
      const arr = byFrente.get(r.frente_id) ?? [];
      arr.push(enriched);
      byFrente.set(r.frente_id, arr);
    }
  });
  return { byEtapa, byFrente };
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
  const fetched = await fetchData(opts.eventId);
  if (!fetched.event) throw new Error("Evento não encontrado");
  const { event, profilesById, suppliersById } = fetched;

  // Aplica filtro de frentes (zonas/serviços) — se omitido/vazio, todas.
  const frenteFilter = opts.frenteIds && opts.frenteIds.length > 0 ? new Set(opts.frenteIds) : null;
  const frentes = frenteFilter
    ? fetched.frentes.filter((f) => frenteFilter.has(f.id))
    : fetched.frentes;
  const allowedFrenteIds = new Set(frentes.map((f) => f.id));
  const etapas = fetched.etapas.filter((e) => allowedFrenteIds.has(e.frente_id));

  // Enrich all etapas with phase; then filter view by phase+status
  const enrichedAll = etapas.map((e) => ({ ...e, _phase: inferEtapaPhase(e, event) }));
  const enriched = enrichedAll.filter(
    (e) => opts.phases.includes(e._phase) && opts.statuses.includes(e.status)
  );


  // Load registos for all visible etapas + frente-level orphan registos (full mode)
  const { byEtapa: registrosByEtapa, byFrente: registrosByFrente } =
    opts.detail === "full" || opts.groupBy === "day"
      ? await fetchRegistros({
          etapaIds: enriched.map((e) => e.id),
          frenteIds: frentes.map((f) => f.id),
        })
      : { byEtapa: new Map<string, any[]>(), byFrente: new Map<string, any[]>() };

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

  // ----- Render a frente block: header + etapas (or empty hint) -----
  const renderFrente = async (f: any) => {
    const items = enriched
      .filter((e) => e.frente_id === f.id)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

    ensureSpace(50);
    const [fr, fg, fb] = f.color ? hexToRgb(f.color) : [99, 102, 241];
    doc.setFillColor(fr, fg, fb);
    doc.rect(margin, y, 4, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const nameWidth = doc.getTextWidth(f.name);
    doc.text(f.name, margin + 10, y + 11);
    const leadName = f.current_lead_id ? profilesById.get(f.current_lead_id) : null;
    if (leadName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`· ${leadName}`, margin + 10 + nameWidth + 6, y + 11);
      doc.setTextColor(0);
    }
    // count tag on the right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    const tag = items.length
      ? `${items.length} ${items.length === 1 ? "etapa" : "etapas"}`
      : "sem etapas";
    doc.text(tag, pageW - margin, y + 11, { align: "right" });
    doc.setTextColor(0);
    y += 22;

    const frenteRegs = opts.detail === "full" ? registrosByFrente.get(f.id) ?? [] : [];

    if (!items.length && !frenteRegs.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text("Sem etapas para os filtros selecionados.", margin + 12, y);
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
      y += 16;
      return;
    }

    // Inline helper to render a list of registos at given indent
    const renderRegistroBlock = async (regs: any[], labelPrefix: string, indent: number) => {
      ensureSpace(16);
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text(`${labelPrefix} (${regs.length}):`, margin + indent, y);
      doc.setTextColor(0);
      y += 13;
      for (const r of regs) {
        const author = profilesById.get(r.author_profile_id) ?? "—";
        const when = new Date(r.created_at).toLocaleString("pt-PT", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const text = r.text ?? r.transcribed_text ?? "";
        const head = `${when} · ${author}`;
        const textWidth = pageW - margin * 2 - indent - 8;
        const lines = text ? doc.splitTextToSize(text, textWidth) : [];

        ensureSpace(14);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(head, margin + indent + 4, y);
        y += 10;
        doc.setTextColor(0);

        // Texto descritivo como legenda — logo após o cabeçalho
        if (lines.length) {
          ensureSpace(11 * lines.length + 4);
          doc.setFontSize(9);
          doc.text(lines, margin + indent + 4, y);
          y += 11 * lines.length + 4;
        }

        // Imagens maiores: 1 sozinha ocupa largura disponível; pares em 2 colunas largas
        if (opts.includePhotos && r.media?.length) {
          const MAX_IMG_H = 110;
          const availW = pageW - margin * 2 - indent - 4;
          const loaded: { data: string; w: number; h: number }[] = [];
          for (const m of r.media as any[]) {
            const img = await imageUrlToDataUrl(m.file_url);
            if (img) loaded.push(img);
          }
          const single = loaded.length === 1;
          const colW = single ? availW : (availW - 6) / 2;
          const fit = (img: { w: number; h: number }) => {
            const natH = (img.h / img.w) * colW;
            if (natH <= MAX_IMG_H) return { w: colW, h: natH, x: 0 };
            const w = (img.w / img.h) * MAX_IMG_H;
            return { w, h: MAX_IMG_H, x: (colW - w) / 2 };
          };
          const step = single ? 1 : 2;
          for (let i = 0; i < loaded.length; i += step) {
            const a = loaded[i];
            const b = !single ? loaded[i + 1] : null;
            const fa = fit(a);
            const fb = b ? fit(b) : null;
            const rowH = Math.max(fa.h, fb?.h ?? 0);
            ensureSpace(rowH + 6);
            try {
              doc.addImage(a.data, "JPEG", margin + indent + 4 + fa.x, y, fa.w, fa.h);
              if (b && fb) {
                doc.addImage(b.data, "JPEG", margin + indent + 4 + colW + 6 + fb.x, y, fb.w, fb.h);
              }
            } catch {
              /* skip */
            }
            y += rowH + 6;
          }
        }

        // Separador subtil entre registos
        doc.setDrawColor(230);
        doc.setLineWidth(0.2);
        doc.line(margin + indent + 4, y, pageW - margin - 4, y);
        y += 6;
      }
      y += 2;
    };

    if (!items.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text("Sem etapas. Registos da frente abaixo:", margin + 12, y);
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
      y += 16;
      await renderRegistroBlock(frenteRegs, "Registos da frente", 12);
      y += 8;
      return;
    }


    if (opts.detail === "compact") {
      autoTable(doc, {
        startY: y,
        head: [["Etapa", "Fase", "Status", "Datas", "Responsável"]],
        body: items.map((e) => [
          e.name,
          PHASE_LABELS[e._phase],
          STATUS_LABEL[e.status] ?? e.status,
          fmtRange(e.planned_start, e.planned_end),
          e.responsible_profile_id ? profilesById.get(e.responsible_profile_id) ?? "—" : "—",
        ]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [241, 245, 249], textColor: 0 },
        margin: { left: margin + 8, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
      return;
    }

    // medium / full
    for (const e of items) {
      ensureSpace(50);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`• ${e.name}`, margin + 12, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(
        `${PHASE_LABELS[e._phase]}  ·  ${STATUS_LABEL[e.status] ?? e.status}  ·  ${fmtRange(e.planned_start, e.planned_end)}`,
        margin + 16,
        y
      );
      doc.setTextColor(0);
      y += 13;

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
        doc.setFontSize(9);
        for (const m of meta) {
          const lines = doc.splitTextToSize(m, pageW - margin * 2 - 18);
          ensureSpace(11 * lines.length + 2);
          doc.text(lines, margin + 16, y);
          y += 11 * lines.length;
        }
        y += 4;
      }

      // Registos da etapa (full mode)
      if (opts.detail === "full") {
        const regs = registrosByEtapa.get(e.id) ?? [];
        if (regs.length) {
          await renderRegistroBlock(regs, "Registos", 16);
        } else {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(140);
          doc.text("Sem registos.", margin + 16, y);
          doc.setTextColor(0);
          doc.setFont("helvetica", "normal");
          y += 12;
        }
      }
      y += 4;
    }

    // Registos da frente (sem etapa) — full mode
    if (frenteRegs.length) {
      await renderRegistroBlock(frenteRegs, "Registos da frente (sem etapa)", 12);
    }

    y += 8;
  };

  // ----- Render section header + group of frentes -----
  const renderSection = async (label: string, predicate: (f: any) => boolean) => {
    const groupFrentes = frentes
      .filter(predicate)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    if (!groupFrentes.length) return;

    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setFillColor(30, 41, 59);
    doc.setTextColor(255);
    doc.rect(margin, y - 14, pageW - margin * 2, 22, "F");
    doc.text(label.toUpperCase(), margin + 8, y + 2);
    doc.setTextColor(0);
    y += 22;

    for (const f of groupFrentes) {
      await renderFrente(f);
    }
  };

  if (opts.groupBy === "day") {
    // ---- Chronological day-by-day ----
    const etapaById = new Map(enriched.map((e) => [e.id, e]));
    const frenteById = new Map(frentes.map((f) => [f.id, f]));
    type Entry = { reg: any; frente: any; etapa: any | null };
    const entries: Entry[] = [];
    for (const [etapaId, regs] of registrosByEtapa) {
      const etapa = etapaById.get(etapaId);
      if (!etapa) continue; // etapa fora dos filtros
      const frente = frenteById.get(etapa.frente_id);
      if (!frente) continue;
      for (const reg of regs) entries.push({ reg, frente, etapa });
    }
    for (const [frenteId, regs] of registrosByFrente) {
      const frente = frenteById.get(frenteId);
      if (!frente) continue;
      for (const reg of regs) entries.push({ reg, frente, etapa: null });
    }
    entries.sort((a, b) => a.reg.created_at.localeCompare(b.reg.created_at));

    // group by day key YYYY-MM-DD (local)
    const byDay = new Map<string, Entry[]>();
    for (const e of entries) {
      const d = new Date(e.reg.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }
    const dayKeys = Array.from(byDay.keys()).sort();

    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setFillColor(30, 41, 59);
    doc.setTextColor(255);
    doc.rect(margin, y - 14, pageW - margin * 2, 22, "F");
    doc.text("CRONOLÓGICO (DIA A DIA)", margin + 8, y + 2);
    doc.setTextColor(0);
    y += 22;

    if (!dayKeys.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text("Sem registos para os filtros selecionados.", margin, y);
      doc.setTextColor(0);
    }

    for (const dayKey of dayKeys) {
      const dayEntries = byDay.get(dayKey)!;
      const dayDate = new Date(dayKey + "T00:00:00");
      const dayLabel = dayDate.toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      ensureSpace(30);
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, pageW - margin * 2, 18, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(dayLabel, margin + 8, y + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `${dayEntries.length} ${dayEntries.length === 1 ? "registo" : "registos"}`,
        pageW - margin - 8,
        y + 12,
        { align: "right" }
      );
      doc.setTextColor(0);
      y += 22;

      for (const entry of dayEntries) {
        const { reg, frente, etapa } = entry;
        const author = profilesById.get(reg.author_profile_id) ?? "—";
        const when = new Date(reg.created_at).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const text = reg.text ?? reg.transcribed_text ?? "";

        ensureSpace(40);
        // colored bar by frente
        const [fr, fg, fb] = frente.color ? hexToRgb(frente.color) : [99, 102, 241];
        doc.setFillColor(fr, fg, fb);
        doc.rect(margin, y, 3, 12, "F");

        // header: hora · frente / etapa
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const ctx = etapa ? `${frente.name} / ${etapa.name}` : `${frente.name}`;
        doc.text(`${when} · ${ctx}`, margin + 8, y + 9);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(author, pageW - margin - 4, y + 9, { align: "right" });
        doc.setTextColor(0);
        y += 14;

        if (text) {
          const textW = pageW - margin * 2 - 12;
          const lines = doc.splitTextToSize(text, textW);
          ensureSpace(11 * lines.length + 2);
          doc.setFontSize(9);
          doc.text(lines, margin + 8, y);
          y += 11 * lines.length + 2;
        }

        if (opts.includePhotos && reg.media?.length) {
          const MAX_IMG_H = 110;
          const availW = pageW - margin * 2 - 12;
          const loaded: { data: string; w: number; h: number }[] = [];
          for (const m of reg.media as any[]) {
            const img = await imageUrlToDataUrl(m.file_url);
            if (img) loaded.push(img);
          }
          const single = loaded.length === 1;
          const colW = single ? availW : (availW - 6) / 2;
          const fit = (img: { w: number; h: number }) => {
            const natH = (img.h / img.w) * colW;
            if (natH <= MAX_IMG_H) return { w: colW, h: natH, x: 0 };
            const w = (img.w / img.h) * MAX_IMG_H;
            return { w, h: MAX_IMG_H, x: (colW - w) / 2 };
          };
          const step = single ? 1 : 2;
          for (let i = 0; i < loaded.length; i += step) {
            const a = loaded[i];
            const b = !single ? loaded[i + 1] : null;
            const fa = fit(a);
            const fb = b ? fit(b) : null;
            const rowH = Math.max(fa.h, fb?.h ?? 0);
            ensureSpace(rowH + 6);
            try {
              doc.addImage(a.data, "JPEG", margin + 8 + fa.x, y, fa.w, fa.h);
              if (b && fb) {
                doc.addImage(b.data, "JPEG", margin + 8 + colW + 6 + fb.x, y, fb.w, fb.h);
              }
            } catch { /* skip */ }
            y += rowH + 6;
          }
        }

        doc.setDrawColor(230);
        doc.setLineWidth(0.2);
        doc.line(margin + 8, y, pageW - margin - 4, y);
        y += 6;
      }
      y += 6;
    }
  } else {
    await renderSection("Zonas Físicas", (f) => f.type === "zone");
    await renderSection("Serviços Transversais", (f) => f.type === "service");
    await renderSection("Outras frentes", (f) => f.type !== "zone" && f.type !== "service");
  }

  doc.save(`relatorio-operacional-${(event.name ?? "evento").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [99, 102, 241];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
