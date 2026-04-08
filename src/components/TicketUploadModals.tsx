import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, AlertCircle, Loader2, ArrowLeft, HelpCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Event {
  id: string;
  name: string;
  parent_event_id: string | null;
  event_type: string;
  status: string;
}

interface TicketImportModalProps {
  events?: Event[];
  selectedEventId?: string;
  selectedSessionId?: string | null;
  /** When true, opens externally (controlled mode) */
  open?: boolean;
  onClose?: () => void;
}

interface ParsedRow {
  zona: string;
  lote: string;
  quantidade: number;
  quantidade_vendida: number;
  preco: number;
  iva_rate?: number;
}

interface ParsedSaleRow {
  zona: string;
  lote: string;
  quantidade: number;
  preco_unitario: number;
}

type ImportType = "setup" | "sales";
type Step = "choose" | "form";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro"));
    reader.readAsDataURL(file);
  });
}

// Normalize helper: lowercase, remove accents, collapse whitespace
const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export function TicketImportModal({ events: eventsProp, selectedEventId: preSelectedEventId, selectedSessionId, open: controlledOpen, onClose }: TicketImportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const [importType, setImportType] = useState<ImportType>("sales");
  const [step, setStep] = useState<Step>("choose");
  const [eventId, setEventId] = useState(preSelectedEventId || "");
  const [loadType, setLoadType] = useState<"realizado" | "previsto">("realizado");
  const [saleDateFrom, setSaleDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [saleDateTo, setSaleDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [setupPreview, setSetupPreview] = useState<ParsedRow[]>([]);
  const [salesPreview, setSalesPreview] = useState<ParsedSaleRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [ticketOfficeId, setTicketOfficeId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [pdfPeriodFrom, setPdfPeriodFrom] = useState<string | null>(null);
  const [pdfPeriodTo, setPdfPeriodTo] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([]);
  const [headerMismatchWarnings, setHeaderMismatchWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch events internally if not provided via props
  const { data: fetchedEvents = [] } = useQuery({
    queryKey: ["events_for_import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, parent_event_id, event_type, status")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open && !eventsProp,
  });

  const events = eventsProp || fetchedEvents;

  const { data: ticketOffices = [] } = useQuery({
    queryKey: ["ticket_offices_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_offices")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: eventSessions = [] } = useQuery({
    queryKey: ["event_sessions_for_import", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, label, date, sort_order, start_time")
        .eq("event_id", eventId)
        .order("date", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: open && !!eventId,
  });

  const effectiveSessionId = selectedSessionId ?? (manualSessionId || (eventSessions.length === 1 ? eventSessions[0].id : null));
  const selectedSession = eventSessions.find((session: any) => session.id === effectiveSessionId) ?? null;
  const requiresSessionSelection = eventSessions.length > 1 && !effectiveSessionId;

  const handleClose = () => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
    setStep("choose");
    setImportType("sales");
    setEventId(preSelectedEventId || "");
    setLoadType("realizado");
    setSaleDateFrom(new Date().toISOString().slice(0, 10));
    setSaleDateTo(new Date().toISOString().slice(0, 10));
    setFile(null);
    setSetupPreview([]);
    setSalesPreview([]);
    setExtracting(false);
    setTicketOfficeId("");
    setManualSessionId("");
    setPdfPeriodFrom(null);
    setPdfPeriodTo(null);
    setShowDuplicateConfirm(false);
    setDuplicateWarnings([]);
    setHeaderMismatchWarnings([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── File handling ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }
    setFile(f);
    setSetupPreview([]);
    setSalesPreview([]);
    setExtracting(true);

    try {
      const base64 = await fileToBase64(f);
      const extraction_type = importType === "setup" ? "total" : "daily_sales";
      const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
        body: { pdf_base64: base64, extraction_type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Extract period from PDF header if available
      const periodFrom = data.period_from || null;
      const periodTo = data.period_to || null;
      if (periodFrom) {
        setPdfPeriodFrom(periodFrom);
        setSaleDateFrom(periodFrom);
      }
      if (periodTo) {
        setPdfPeriodTo(periodTo);
        setSaleDateTo(periodTo);
      }

      // Auto-detect ticket office from PDF
      if (data.ticket_office_name && ticketOffices.length > 0) {
        const pdfName = normalize(data.ticket_office_name);
        const match = ticketOffices.find(to => normalize(to.name).includes(pdfName) || pdfName.includes(normalize(to.name)));
        if (match && !ticketOfficeId) {
          setTicketOfficeId(match.id);
          toast({ title: `Bilheteira detectada: ${match.name}` });
        }
      }

      // ── Cross-validate PDF header vs selected event/session ──
      const warnings: string[] = [];
      const pdfEventName = data.event_name || null;
      const pdfEventDate = data.event_date || null;
      const pdfEventTime = data.event_time || null;

      if (pdfEventName && selectedEvent) {
        const pdfNorm = normalize(pdfEventName);
        const appNorm = normalize(selectedEvent.name);
        if (!appNorm.includes(pdfNorm) && !pdfNorm.includes(appNorm)) {
          warnings.push(`Nome do evento no PDF: "${pdfEventName}" ≠ App: "${selectedEvent.name}"`);
        }
      }

      if (pdfEventDate && selectedSession) {
        const sessionDate = selectedSession.date;
        if (pdfEventDate !== sessionDate) {
          const pdfDateFmt = new Date(pdfEventDate + "T12:00:00").toLocaleDateString("pt-PT");
          const sessionDateFmt = new Date(sessionDate + "T12:00:00").toLocaleDateString("pt-PT");
          warnings.push(`Data do evento no PDF: ${pdfDateFmt} ≠ Sessão selecionada: ${sessionDateFmt}`);
        }
      }

      if (pdfEventTime && selectedSession?.start_time) {
        const pdfTimeNorm = pdfEventTime.replace("h", ":").replace("H", ":").slice(0, 5);
        const sessionTimeNorm = selectedSession.start_time.slice(0, 5);
        if (pdfTimeNorm !== sessionTimeNorm) {
          warnings.push(`Hora do evento no PDF: ${pdfEventTime} ≠ Sessão: ${sessionTimeNorm}`);
        }
      }

      setHeaderMismatchWarnings(warnings);

      if (importType === "setup") {
        const rows: ParsedRow[] = (data.rows || []).map((r: any) => ({
          zona: String(r.zona || "Geral"),
          lote: String(r.lote || "Lote"),
          quantidade: parseInt(r.quantidade_total ?? r.quantidade) || 0,
          quantidade_vendida: parseInt(r.quantidade_vendida) ?? parseInt(r.quantidade_total ?? r.quantidade) ?? 0,
          preco: parseFloat(r.preco) || 0,
          iva_rate: parseInt(r.iva_rate) || 6,
        }));
        const filtered = rows.filter(r => r.preco >= 1.00);
        const discarded = rows.length - filtered.length;
        if (filtered.length === 0) {
          toast({ title: "Nenhum dado encontrado no PDF", variant: "destructive" });
        } else {
          setSetupPreview(filtered);
          const msg = discarded > 0
            ? `${filtered.length} linhas extraídas (${discarded} descartadas por preço < 1€)`
            : `${filtered.length} linhas extraídas do PDF`;
          const periodMsg = periodFrom ? ` | Período: ${new Date(periodFrom + "T12:00:00").toLocaleDateString("pt-PT")} a ${new Date((periodTo || periodFrom) + "T12:00:00").toLocaleDateString("pt-PT")}` : "";
          toast({ title: msg + periodMsg });
        }
      } else {
        const rows: ParsedSaleRow[] = (data.rows || []).map((r: any) => ({
          zona: String(r.zona || ""),
          lote: String(r.lote || ""),
          quantidade: parseInt(r.quantidade) || 0,
          preco_unitario: parseFloat(r.preco_unitario) || 0,
        }));
        const filtered = rows.filter(r => r.preco_unitario >= 1.00);
        if (filtered.length === 0) {
          toast({ title: "Nenhum dado encontrado no PDF", variant: "destructive" });
        } else {
          setSalesPreview(filtered);
          const periodMsg = periodFrom ? ` | Período: ${new Date(periodFrom + "T12:00:00").toLocaleDateString("pt-PT")} a ${new Date((periodTo || periodFrom) + "T12:00:00").toLocaleDateString("pt-PT")}` : "";
          toast({ title: `${filtered.length} linhas extraídas do PDF${periodMsg}` });
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao extrair dados do PDF", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  // ── Setup import mutation ──
  const setupMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || setupPreview.length === 0) throw new Error("Selecione evento e ficheiro");
      if (requiresSessionSelection) throw new Error("Selecione a sessão correta antes de importar.");

      const selectedEvent = events.find(e => e.id === eventId);
      const isCompleted = selectedEvent?.status === "completed";

      let preExistingZonesQuery = supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId)
        .limit(1);

      if (effectiveSessionId) {
        preExistingZonesQuery = preExistingZonesQuery.eq("session_id", effectiveSessionId);
      }

      const { data: preExistingZones } = await preExistingZonesQuery;
      const hadPlanning = (preExistingZones?.length ?? 0) > 0;
      const salesOnlyMode = loadType === "realizado" && isCompleted && !hadPlanning;

      const zoneMap = new Map<string, ParsedRow[]>();
      setupPreview.forEach(r => {
        const existing = zoneMap.get(r.zona) || [];
        existing.push(r);
        zoneMap.set(r.zona, existing);
      });

      for (const [zoneName, lots] of zoneMap) {
        let existingZoneQuery = supabase
          .from("event_ticket_zones")
          .select("id, name")
          .eq("event_id", eventId)
          .ilike("name", zoneName);

        if (effectiveSessionId) {
          existingZoneQuery = existingZoneQuery.eq("session_id", effectiveSessionId);
        }

        const { data: existingZones } = await existingZoneQuery;

        let zoneId: string;
        if (existingZones && existingZones.length > 0) {
          zoneId = existingZones[0].id;
        } else {
          const totalCap = salesOnlyMode
            ? lots.reduce((s, l) => s + (l.quantidade_vendida || 0), 0)
            : lots.reduce((s, l) => s + l.quantidade, 0);
          const { data: newZone, error } = await supabase
            .from("event_ticket_zones")
            .insert({ event_id: eventId, session_id: effectiveSessionId || null, name: zoneName, total_capacity: totalCap })
            .select("id")
            .single();
          if (error) throw error;
          zoneId = newZone.id;
        }

        const { data: existingLots } = await supabase
          .from("event_ticket_lots")
          .select("id")
          .eq("zone_id", zoneId);
        const baseNumber = (existingLots?.length || 0);

        const sortedLots = [...lots].sort((a, b) => a.preco - b.preco);

        for (let i = 0; i < sortedLots.length; i++) {
          const lot = sortedLots[i];
          const lotQuantity = salesOnlyMode ? (lot.quantidade_vendida || 0) : lot.quantidade;
          const { error } = await supabase.from("event_ticket_lots").insert({
            zone_id: zoneId,
            name: lot.lote,
            quantity: lotQuantity,
            price: lot.preco,
            iva_rate: lot.iva_rate || 6,
            lot_number: baseNumber + i + 1,
          });
          if (error) throw error;

          if (loadType === "realizado" && lot.quantidade_vendida > 0) {
            const { data: createdLots } = await supabase
              .from("event_ticket_lots")
              .select("id")
              .eq("zone_id", zoneId)
              .eq("name", lot.lote)
              .order("created_at", { ascending: false })
              .limit(1);

            if (createdLots && createdLots.length > 0) {
              await supabase.from("ticket_sales").insert({
                zone_id: zoneId,
                lot_id: createdLots[0].id,
                sale_date: pdfPeriodFrom || saleDateFrom,
                quantity: lot.quantidade_vendida,
                unit_price: lot.preco,
                ticket_office_id: ticketOfficeId || null,
                notes: "Carga total via upload PDF",
                source: "import",
              });
            }
          }
        }
      }
    },
    onSuccess: async () => {
      // Log the import
      const { error: logError } = await supabase.from("ticket_import_logs").insert({
        event_id: eventId,
        ticket_office_id: ticketOfficeId || null,
        import_type: "setup",
        period_from: pdfPeriodFrom || saleDateFrom,
        period_to: pdfPeriodTo || saleDateTo,
        file_name: file?.name || (selectedSession ? `${selectedSession.label}.pdf` : null),
        rows_imported: setupPreview.length,
      });
      if (logError) console.error("Import log error:", logError);
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-sales"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_import_logs"] });
      toast({ title: `Configuração ${loadType === "realizado" ? "realizada" : "prevista"} importada com sucesso!` });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  // ── Sales import mutation ──
  const salesMutation = useMutation({
    mutationFn: async () => {
      console.log("salesMutation started", { eventId, salesPreviewLen: salesPreview.length, effectiveSessionId });
      if (!eventId || salesPreview.length === 0) throw new Error("Selecione evento e ficheiro");
      if (requiresSessionSelection) throw new Error("Selecione a sessão correta antes de importar.");

      let zonesQuery = supabase
        .from("event_ticket_zones")
        .select("id, name, session_id")
        .eq("event_id", eventId);

      if (effectiveSessionId) {
        zonesQuery = zonesQuery.eq("session_id", effectiveSessionId);
      }

      const { data: zones } = await zonesQuery;

      const zoneIds = (zones || []).map(z => z.id);
      const { data: lots } = zoneIds.length > 0
        ? await supabase.from("event_ticket_lots").select("id, name, zone_id, price, iva_rate").in("zone_id", zoneIds)
        : { data: [] as any[] };

      let imported = 0;
      let autoCreatedLots = 0;
      let autoCreatedZones = 0;
      let skipped = 0;
      const effectiveFrom = pdfPeriodFrom || saleDateFrom;
      const effectiveTo = pdfPeriodTo || saleDateTo;
      const notesText = effectiveFrom === effectiveTo ? `Upload vendas ${effectiveFrom}` : `Upload vendas período ${effectiveFrom} a ${effectiveTo}`;

      const allZones = [...(zones || [])];
      const allLots = [...(lots || [])];

      for (const row of salesPreview) {
        let matchedZone = row.zona
          ? allZones.find(z => normalize(z.name) === normalize(row.zona))
          : null;

        if (!matchedZone && row.zona) {
          const { data: newZone, error: zoneError } = await supabase
            .from("event_ticket_zones")
            .insert({ event_id: eventId, session_id: effectiveSessionId || null, name: row.zona, total_capacity: 0 })
            .select("id, name, session_id")
            .single();
          if (zoneError) throw zoneError;
          matchedZone = newZone;
          allZones.push(newZone);
          autoCreatedZones++;
        }

        if (!matchedZone) { skipped++; continue; }

        let matchedLot: any = null;
        if (row.lote) {
          matchedLot = allLots.find(l =>
            normalize(l.name) === normalize(row.lote) && l.zone_id === matchedZone!.id
          );
          if (!matchedLot) {
            matchedLot = allLots.find(l => normalize(l.name) === normalize(row.lote));
          }
        }

        if (!matchedLot && matchedZone && row.lote) {
          const zoneLots = allLots.filter(l => l.zone_id === matchedZone!.id);
          const inheritedIvaRate = zoneLots.length > 0 ? zoneLots[0].iva_rate : 6;
          const nextLotNumber = zoneLots.length + 1;

          const { data: newLot, error: lotError } = await supabase
            .from("event_ticket_lots")
            .insert({
              zone_id: matchedZone.id,
              name: row.lote,
              quantity: 0,
              price: row.preco_unitario || 0,
              iva_rate: inheritedIvaRate,
              lot_number: nextLotNumber,
            })
            .select("id, name, zone_id, price, iva_rate")
            .single();

          if (lotError) throw lotError;
          matchedLot = newLot;
          allLots.push(newLot);
          autoCreatedLots++;
        }

        if (matchedLot) {
          const { error } = await supabase.from("ticket_sales").insert({
            lot_id: matchedLot.id,
            zone_id: matchedLot.zone_id || matchedZone?.id || null,
            sale_date: effectiveFrom,
            quantity: row.quantidade,
            unit_price: row.preco_unitario || Number(matchedLot.price),
            ticket_office_id: ticketOfficeId || null,
            notes: notesText,
            source: "import",
          });
          if (error) throw error;
          imported++;
        } else if (matchedZone) {
          const { error } = await supabase.from("ticket_sales").insert({
            zone_id: matchedZone.id,
            lot_id: null,
            sale_date: effectiveFrom,
            quantity: row.quantidade,
            unit_price: row.preco_unitario || 0,
            ticket_office_id: ticketOfficeId || null,
            notes: notesText,
            source: "import",
          });
          if (error) throw error;
          imported++;
        } else {
          skipped++;
        }
      }

      if (imported === 0) throw new Error(`Nenhuma venda importada. ${skipped} linhas sem correspondência de zona/lote.`);

      return { imported, autoCreatedLots, autoCreatedZones, skipped };
    },
    onSuccess: async (result) => {
      // Log the import
      const { error: logError } = await supabase.from("ticket_import_logs").insert({
        event_id: eventId,
        ticket_office_id: ticketOfficeId || null,
        import_type: "sales",
        period_from: pdfPeriodFrom || saleDateFrom,
        period_to: pdfPeriodTo || saleDateTo,
        file_name: file?.name || (selectedSession ? `${selectedSession.label}.pdf` : null),
        rows_imported: result?.imported || 0,
        rows_skipped: result?.skipped || 0,
        zones_created: result?.autoCreatedZones || 0,
        lots_created: result?.autoCreatedLots || 0,
      });
      if (logError) console.error("Import log error:", logError);
      queryClient.invalidateQueries({ queryKey: ["ticket-sales"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_import_logs"] });
      const parts: string[] = [`${result?.imported} vendas importadas`];
      if (result?.autoCreatedZones) parts.push(`${result.autoCreatedZones} novas zonas criadas`);
      if (result?.autoCreatedLots) parts.push(`${result.autoCreatedLots} novos lotes criados`);
      if (result?.skipped) parts.push(`${result.skipped} linhas ignoradas`);
      toast({ title: parts.join(", ") });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const preview = importType === "setup" ? setupPreview : salesPreview;
  const isPending = importType === "setup" ? setupMutation.isPending : salesMutation.isPending;

  const checkDuplicatesAndImport = async () => {
    if (!eventId) {
      toast({ title: "Selecione um evento", variant: "destructive" });
      return;
    }

    if (requiresSessionSelection) {
      toast({ title: "Selecione a sessão correta antes de importar", variant: "destructive" });
      return;
    }

    try {
      const effectiveFrom = pdfPeriodFrom || saleDateFrom;
      const effectiveTo = pdfPeriodTo || saleDateTo;

      const { data: existingLogs, error: logError } = await supabase
        .from("ticket_import_logs")
        .select("*")
        .eq("event_id", eventId)
        .eq("import_type", importType)
        .lte("period_from", effectiveTo)
        .gte("period_to", effectiveFrom)
        .ilike("file_name", effectiveSessionId && selectedSession ? `%${selectedSession.label}%` : `%`);

      if (logError) {
        console.error("Duplicate check error:", logError);
      }

      if (!logError && existingLogs && existingLogs.length > 0) {
        setDuplicateWarnings(existingLogs);
        setShowDuplicateConfirm(true);
        return;
      }

      executeImport();
    } catch (err: any) {
      console.error("checkDuplicatesAndImport error:", err);
      toast({ title: "Erro ao verificar duplicados", description: err.message, variant: "destructive" });
    }
  };

  const executeImport = () => {
    if (importType === "setup") {
      setupMutation.mutate();
    } else {
      salesMutation.mutate();
    }
  };

  const selectedEvent = events.find(e => e.id === eventId);

  return (
    <>
      {!isControlled && (
        <div className="flex items-center gap-1">
          <Button variant="outline" onClick={() => setInternalOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar PDF
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="text-xs max-w-[240px]">
              Importa dados de PDFs Ticketline. Pode usar para configuração inicial (zonas/lotes) ou para registar vendas reais.
            </PopoverContent>
          </Popover>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Importar PDF Ticketline
            </DialogTitle>
          </DialogHeader>

          {step === "choose" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">O que pretende fazer com este PDF?</p>

              <RadioGroup value={importType} onValueChange={(v) => setImportType(v as ImportType)} className="space-y-3">
                <label htmlFor="type-sales" className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${importType === "sales" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <RadioGroupItem value="sales" id="type-sales" className="mt-0.5" />
                  <div>
                    <span className="font-medium text-sm">Importar Vendas</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Regista vendas reais sem alterar o planejamento existente. Ideal para importações periódicas.
                    </p>
                  </div>
                </label>

                <label htmlFor="type-setup" className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${importType === "setup" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <RadioGroupItem value="setup" id="type-setup" className="mt-0.5" />
                  <div>
                    <span className="font-medium text-sm">Configuração Inicial</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cria zonas, lotes e capacidades a partir do PDF. Use apenas na primeira configuração da bilheteira.
                    </p>
                  </div>
                </label>
              </RadioGroup>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button onClick={() => setStep("form")}>Continuar</Button>
              </DialogFooter>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => { setStep("choose"); setFile(null); setSetupPreview([]); setSalesPreview([]); if (fileRef.current) fileRef.current.value = ""; }} className="text-xs -mt-2">
                <ArrowLeft className="h-3 w-3 mr-1" /> Voltar
              </Button>

              {/* Event selector (only if not pre-selected) */}
              {!preSelectedEventId && (
                <div>
                  <Label>Evento</Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione o evento…" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.parent_event_id ? `  ↳ ${e.name}` : e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Ticket office (optional) */}
              {ticketOffices.length > 0 && (
                <div>
                  <Label>Bilheteira <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Select value={ticketOfficeId} onValueChange={setTicketOfficeId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione a bilheteira…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketOffices.map((to: any) => (
                        <SelectItem key={to.id} value={to.id}>{to.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {eventSessions.length > 0 && !selectedSessionId && (
                <div>
                  <Label>Sessão</Label>
                  <Select value={manualSessionId} onValueChange={setManualSessionId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione a sessão correta…" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventSessions.map((session: any) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSession && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Importação será associada à sessão {selectedSession.label}.
                    </p>
                  )}
                </div>
              )}

              {/* Setup-specific: load type */}
              {importType === "setup" && (
                <div>
                  <Label>Tipo de Carga</Label>
                  <RadioGroup value={loadType} onValueChange={(v) => setLoadType(v as any)} className="mt-2 flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="realizado" id="realizado" />
                      <Label htmlFor="realizado" className="cursor-pointer font-normal">Realizado</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="previsto" id="previsto" />
                      <Label htmlFor="previsto" className="cursor-pointer font-normal">Previsto</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {loadType === "previsto"
                      ? "Cria zonas e lotes sem registar vendas"
                      : "Cria zonas, lotes e regista vendas automaticamente"}
                  </p>
                </div>
              )}

              {/* Sales-specific: date range */}
              {importType === "sales" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Início</Label>
                    <DatePicker value={saleDateFrom} onChange={setSaleDateFrom} placeholder="De…" />
                  </div>
                  <div>
                    <Label>Data Fim</Label>
                    <DatePicker value={saleDateTo} onChange={setSaleDateTo} placeholder="Até…" />
                  </div>
                  {pdfPeriodFrom && (
                    <p className="col-span-2 text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Período detectado do PDF: {new Date(pdfPeriodFrom + "T12:00:00").toLocaleDateString("pt-PT")} a {new Date((pdfPeriodTo || pdfPeriodFrom) + "T12:00:00").toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>
              )}

              {/* File upload */}
              <div>
                <Label>Ficheiro PDF</Label>
                <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 mt-1 transition-colors hover:border-primary/50 hover:bg-primary/5 ${extracting ? "opacity-50 pointer-events-none" : ""}`}>
                  {extracting ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {extracting ? "A extrair dados com IA…" : file ? file.name : "Clique para selecionar PDF (max 10MB)"}
                  </span>
                  <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".pdf" disabled={extracting} />
                </label>
                <p className="text-[10px] text-muted-foreground mt-1">
                  A IA extrairá automaticamente zonas, lotes, quantidades e preços do PDF
                </p>
              </div>

              {/* Preview table — Setup */}
              {importType === "setup" && setupPreview.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    Dados extraídos — {setupPreview.length} linhas
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="text-left px-3 py-1">Zona</th>
                          <th className="text-left px-3 py-1">Lote</th>
                          <th className="text-right px-3 py-1">Total</th>
                          <th className="text-right px-3 py-1">Vendidos</th>
                          <th className="text-right px-3 py-1">Preço</th>
                          <th className="text-right px-3 py-1">IVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setupPreview.map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="px-3 py-1">{r.zona}</td>
                            <td className="px-3 py-1">{r.lote}</td>
                            <td className="px-3 py-1 text-right font-mono">{r.quantidade.toLocaleString()}</td>
                            <td className="px-3 py-1 text-right font-mono">{r.quantidade_vendida.toLocaleString()}</td>
                            <td className="px-3 py-1 text-right font-mono">{r.preco.toFixed(2)}€</td>
                            <td className="px-3 py-1 text-right font-mono">{r.iva_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Preview table — Sales */}
              {importType === "sales" && salesPreview.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    Dados extraídos — {salesPreview.length} linhas
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="text-left px-3 py-1">Zona</th>
                          <th className="text-left px-3 py-1">Lote</th>
                          <th className="text-right px-3 py-1">Qtd</th>
                          <th className="text-right px-3 py-1">Preço Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesPreview.map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="px-3 py-1">{r.zona || "—"}</td>
                            <td className="px-3 py-1">{r.lote}</td>
                            <td className="px-3 py-1 text-right font-mono">{r.quantidade.toLocaleString()}</td>
                            <td className="px-3 py-1 text-right font-mono">{r.preco_unitario ? `${r.preco_unitario.toFixed(2)}€` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button
                  onClick={checkDuplicatesAndImport}
                  disabled={!eventId || preview.length === 0 || isPending || extracting || requiresSessionSelection}
                >
                  {isPending ? "A importar…" : importType === "setup"
                    ? `Importar ${loadType === "realizado" ? "Realizado" : "Previsto"}`
                    : `Importar ${salesPreview.length} vendas`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate import confirmation */}
      <AlertDialog open={showDuplicateConfirm} onOpenChange={setShowDuplicateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Importação possivelmente duplicada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium text-foreground">
                  Já existem importações registadas para este evento com período sobreponível:
                </p>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  {duplicateWarnings.map((w: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">
                        {new Date(w.period_from + "T12:00:00").toLocaleDateString("pt-PT")} — {new Date(w.period_to + "T12:00:00").toLocaleDateString("pt-PT")}
                      </span>
                      {w.file_name && <span className="text-muted-foreground ml-2">({w.file_name})</span>}
                      <span className="text-muted-foreground ml-2">• {w.rows_imported} linhas importadas</span>
                      <span className="text-muted-foreground ml-2">• {new Date(w.created_at).toLocaleDateString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-destructive font-medium">
                  Continuar poderá resultar em vendas duplicadas. Tem a certeza que pretende prosseguir?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowDuplicateConfirm(false); executeImport(); }}
            >
              Importar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Keep legacy exports for backward compatibility during transition
export const TotalTicketLoadModal = TicketImportModal;
export const DailySalesUploadModal = TicketImportModal;
