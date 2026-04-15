import { useState, useRef, useMemo } from "react";
import { parseTicketlineXlsx, isTicketlineFormat, type TicketlineDailySale } from "@/lib/parse-ticketline-xlsx";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, AlertCircle, Loader2, HelpCircle, AlertTriangle, CheckCircle2, Link2, Plus, Download } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { generateImportReportPdf } from "@/lib/export-import-report";
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
  open?: boolean;
  onClose?: () => void;
}

interface ExtractedRow {
  zona: string;
  tipo_bilhete: string;
  preco_unitario: number;
  quantidade_total: number;
  quantidade_vendida: number;
  valor_vendido: number;
  iva_rate: number;
}

interface ZoneMapping {
  pdfZone: string;
  mappedZoneId: string | null; // null = create new
  rows: ExtractedRow[];
}

type ImportType = "setup" | "sales";

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

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// Fuzzy match: checks if normalized strings share significant overlap
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check word overlap
  const wordsA = na.split(" ").filter(w => w.length > 2);
  const wordsB = nb.split(" ").filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= Math.min(wordsA.length, wordsB.length) * 0.5;
}

export function TicketImportModal({ events: eventsProp, selectedEventId: preSelectedEventId, selectedSessionId, open: controlledOpen, onClose }: TicketImportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const [importType, setImportType] = useState<ImportType>("sales");
  const [eventId, setEventId] = useState(preSelectedEventId || "");
  const [loadType, setLoadType] = useState<"realizado" | "previsto">("realizado");
  const [file, setFile] = useState<File | null>(null);
  const [extractedRows, setExtractedRows] = useState<ExtractedRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [ticketOfficeId, setTicketOfficeId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [pdfPeriodFrom, setPdfPeriodFrom] = useState<string | null>(null);
  const [pdfPeriodTo, setPdfPeriodTo] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([]);
  const [headerWarnings, setHeaderWarnings] = useState<string[]>([]);
  const [totalWarnings, setTotalWarnings] = useState<string[]>([]);
  const [zoneMappings, setZoneMappings] = useState<ZoneMapping[]>([]);
  const [pdfHeader, setPdfHeader] = useState<any>(null);
  const [ticketlineDailySales, setTicketlineDailySales] = useState<TicketlineDailySale[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch events
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

  const { data: allTicketOffices = [] } = useQuery({
    queryKey: ["ticket_offices_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("type", "ticket_office")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch assignments for the selected event to filter ticket offices
  const { data: eventOfficeAssignments = [] } = useQuery({
    queryKey: ["event_office_assignments_for_import", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id")
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },
    enabled: open && !!eventId,
  });

  // Filter ticket offices: if event has assignments, show only those; otherwise show all
  const ticketOffices = useMemo(() => {
    if (!eventId || eventOfficeAssignments.length === 0) return allTicketOffices;
    const assignedIds = new Set(eventOfficeAssignments.map((a: any) => a.financial_account_id));
    return allTicketOffices.filter((to: any) => assignedIds.has(to.id));
  }, [allTicketOffices, eventOfficeAssignments, eventId]);

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
  const selectedSession = eventSessions.find((s: any) => s.id === effectiveSessionId) ?? null;
  const requiresSessionSelection = eventSessions.length > 1 && !effectiveSessionId;

  // Fetch existing zones for reconciliation
  const { data: existingZones = [] } = useQuery({
    queryKey: ["existing_zones_for_reconciliation", eventId, effectiveSessionId],
    queryFn: async () => {
      if (!eventId) return [];
      let query = supabase
        .from("event_ticket_zones")
        .select("id, name, session_id, total_capacity")
        .eq("event_id", eventId);
      if (effectiveSessionId) {
        query = query.eq("session_id", effectiveSessionId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!eventId,
  });

  const selectedEvent = events.find(e => e.id === eventId);

  const handleClose = () => {
    if (isControlled) { onClose?.(); } else { setInternalOpen(false); }
    setImportType("sales");
    setEventId(preSelectedEventId || "");
    setLoadType("realizado");
    setFile(null);
    setExtractedRows([]);
    setExtracting(false);
    setTicketOfficeId("");
    setManualSessionId("");
    setPdfPeriodFrom(null);
    setPdfPeriodTo(null);
    setShowDuplicateConfirm(false);
    setDuplicateWarnings([]);
    setHeaderWarnings([]);
    setTotalWarnings([]);
    setZoneMappings([]);
    setTicketlineDailySales([]);
    setPdfHeader(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Auto-match PDF zones to existing zones
  const buildZoneMappings = (rows: ExtractedRow[], zones: any[]): ZoneMapping[] => {
    const pdfZoneNames = [...new Set(rows.map(r => r.zona))];
    return pdfZoneNames.map(pdfZone => {
      // Try exact match first
      let match = zones.find(z => normalize(z.name) === normalize(pdfZone));
      // Try fuzzy match
      if (!match) {
        match = zones.find(z => fuzzyMatch(z.name, pdfZone));
      }
      return {
        pdfZone,
        mappedZoneId: match?.id || null,
        rows: rows.filter(r => r.zona === pdfZone),
      };
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }
    setFile(f);
    setExtractedRows([]);
    setZoneMappings([]);
    setExtracting(true);

    const isExcel = /\.(xlsx|xls)$/i.test(f.name);

    try {
      let filtered: ExtractedRow[] = [];

      if (isExcel) {
        // --- XLSX path: parse locally ---
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        if (!isTicketlineFormat(wb)) {
          toast({ title: "Formato não reconhecido", description: "O ficheiro não é um 'Resumo de Operações' da Ticketline.", variant: "destructive" });
          setExtracting(false);
          return;
        }
        const result = parseTicketlineXlsx(buf);

        setPdfHeader({
          event_name: result.header.event_name,
          period_from: result.header.period_from,
          period_to: result.header.period_to,
          session_date: result.header.event_date,
          session_time: result.header.event_time,
          total_quantity_sold: result.totalSoldQty,
          total_revenue: result.totalSoldValue,
        });
        if (result.header.period_from) setPdfPeriodFrom(result.header.period_from);
        if (result.header.period_to) setPdfPeriodTo(result.header.period_to);

        // Auto-detect ticket office name "Ticketline"
        if (ticketOffices.length > 0 && !ticketOfficeId) {
          const match = ticketOffices.find((to: any) => normalize(to.name).includes("ticketline"));
          if (match) {
            setTicketOfficeId((match as any).id);
            toast({ title: `Bilheteira detectada: ${(match as any).name}` });
          }
        }

        // Store raw daily sales for day-by-day import
        setTicketlineDailySales(result.sales);

        // Aggregate sales by zone (summing across all dates for the import REVIEW view only)
        const zoneMap = new Map<string, ExtractedRow>();
        for (const s of result.sales) {
          const key = `${s.zone}||${s.lot}`;
          const existing = zoneMap.get(key);
          if (existing) {
            existing.quantidade_vendida += s.quantity;
            existing.valor_vendido += s.total_value;
          } else {
            zoneMap.set(key, {
              zona: s.zone,
              tipo_bilhete: s.lot || "Regular",
              preco_unitario: s.unit_price,
              quantidade_total: 0,
              quantidade_vendida: s.quantity,
              valor_vendido: s.total_value,
              iva_rate: 6,
            });
          }
        }
        filtered = Array.from(zoneMap.values()).filter(r => r.preco_unitario >= 1.00);

        // Validate totals
        const tw: string[] = [];
        const extractedSold = filtered.reduce((s, r) => s + r.quantidade_vendida, 0);
        if (Math.abs(extractedSold - result.totalSoldQty) > 1) {
          tw.push(`Vendidos extraídos: ${extractedSold.toLocaleString("pt-PT")} ≠ TOTAL XLSX: ${result.totalSoldQty.toLocaleString("pt-PT")}`);
        }
        const extractedRev = filtered.reduce((s, r) => s + r.valor_vendido, 0);
        if (Math.abs(extractedRev - result.totalSoldValue) > 1) {
          tw.push(`Receita extraída: ${extractedRev.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€ ≠ TOTAL XLSX: ${result.totalSoldValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€`);
        }
        setTotalWarnings(tw);

        // Validate header against selected event
        const warnings: string[] = [];
        if (result.header.event_name && selectedEvent) {
          if (!fuzzyMatch(result.header.event_name, selectedEvent.name)) {
            warnings.push(`Nome no XLSX: "${result.header.event_name}" ≠ Evento: "${selectedEvent.name}"`);
          }
        }
        setHeaderWarnings(warnings);

      } else {
        // --- PDF path: call edge function ---
        const base64 = await fileToBase64(f);
        const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
          body: { pdf_base64: base64 },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setPdfHeader(data);
        if (data.period_from) setPdfPeriodFrom(data.period_from);
        if (data.period_to) setPdfPeriodTo(data.period_to);

        // Auto-detect ticket office
        if (data.ticket_office_name && ticketOffices.length > 0) {
          const pdfName = normalize(data.ticket_office_name);
          const match = ticketOffices.find((to: any) => normalize(to.name).includes(pdfName) || pdfName.includes(normalize(to.name)));
          if (match && !ticketOfficeId) {
            setTicketOfficeId((match as any).id);
            toast({ title: `Bilheteira detectada: ${(match as any).name}` });
          }
        }

        // Validate header
        const warnings: string[] = [];
        if (data.event_name && selectedEvent) {
          if (!fuzzyMatch(data.event_name, selectedEvent.name)) {
            warnings.push(`Nome no PDF: "${data.event_name}" ≠ Evento: "${selectedEvent.name}"`);
          }
        }
        if (data.session_date && selectedSession) {
          if (data.session_date !== selectedSession.date) {
            warnings.push(`Data no PDF: ${data.session_date} ≠ Sessão: ${selectedSession.date}`);
          }
        }
        if (data.session_time && selectedSession?.start_time) {
          const pdfTime = data.session_time.slice(0, 5);
          const sessionTime = selectedSession.start_time.slice(0, 5);
          if (pdfTime !== sessionTime) {
            warnings.push(`Hora no PDF: ${data.session_time} ≠ Sessão: ${sessionTime}`);
          }
        }
        setHeaderWarnings(warnings);

        const rows: ExtractedRow[] = (data.rows || []).map((r: any) => ({
          zona: String(r.zona || "Geral"),
          tipo_bilhete: String(r.tipo_bilhete || "Normal"),
          preco_unitario: parseFloat(r.preco_unitario) || 0,
          quantidade_total: parseInt(r.quantidade_total) || 0,
          quantidade_vendida: parseInt(r.quantidade_vendida) || 0,
          valor_vendido: parseFloat(r.valor_vendido) || 0,
          iva_rate: parseInt(r.iva_rate) || 6,
        }));
        filtered = rows.filter(r => r.preco_unitario >= 1.00);

        // Validate totals
        const tw: string[] = [];
        const pdfTotalSold = data.total_quantity_sold != null ? Number(data.total_quantity_sold) : null;
        const pdfTotalRevenue = data.total_revenue != null ? Number(data.total_revenue) : null;
        if (pdfTotalSold !== null) {
          const extractedSold = filtered.reduce((s, r) => s + r.quantidade_vendida, 0);
          if (Math.abs(extractedSold - pdfTotalSold) > 1) {
            tw.push(`Vendidos extraídos: ${extractedSold.toLocaleString("pt-PT")} ≠ TOTAL PDF: ${pdfTotalSold.toLocaleString("pt-PT")}`);
          }
        }
        if (pdfTotalRevenue !== null) {
          const extractedRev = filtered.reduce((s, r) => s + r.valor_vendido, 0);
          if (Math.abs(extractedRev - pdfTotalRevenue) > 1) {
            tw.push(`Receita extraída: ${extractedRev.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€ ≠ TOTAL PDF: ${pdfTotalRevenue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€`);
          }
        }
        setTotalWarnings(tw);
      }

      if (filtered.length === 0) {
        toast({ title: "Nenhum dado encontrado no ficheiro", variant: "destructive" });
      } else {
        setExtractedRows(filtered);
        const mappings = buildZoneMappings(filtered, existingZones);
        setZoneMappings(mappings);
        const matched = mappings.filter(m => m.mappedZoneId).length;
        const unmatched = mappings.filter(m => !m.mappedZoneId).length;
        toast({ title: `${filtered.length} linhas em ${mappings.length} zonas (${matched} mapeadas, ${unmatched} novas)` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao extrair dados do ficheiro", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  // Update zone mapping
  const updateZoneMapping = (pdfZone: string, newZoneId: string | null) => {
    setZoneMappings(prev => prev.map(m =>
      m.pdfZone === pdfZone ? { ...m, mappedZoneId: newZoneId } : m
    ));
  };

  // Summary stats
  const summary = useMemo(() => {
    const totalSold = extractedRows.reduce((s, r) => s + r.quantidade_vendida, 0);
    const totalRevenue = extractedRows.reduce((s, r) => s + r.valor_vendido, 0);
    const totalAll = extractedRows.reduce((s, r) => s + r.quantidade_total, 0);
    return { totalSold, totalRevenue, totalAll };
  }, [extractedRows]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || extractedRows.length === 0) throw new Error("Selecione evento e ficheiro");
      if (requiresSessionSelection) throw new Error("Selecione a sessão correta antes de importar.");

      const effectiveFrom = pdfPeriodFrom || new Date().toISOString().slice(0, 10);
      const effectiveTo = pdfPeriodTo || effectiveFrom;
      const notesText = `Upload vendas período ${effectiveFrom} a ${effectiveTo}`;

      let imported = 0;
      let zonesCreated = 0;
      let lotsCreated = 0;

      // Cache for newly created zones/lots
      const zoneIdCache = new Map<string, string>();
      const lotIdCache = new Map<string, string>();

      for (const mapping of zoneMappings) {
        let zoneId = mapping.mappedZoneId;

        // Create zone if not mapped
        if (!zoneId) {
          const totalCap = mapping.rows.reduce((s, r) => s + r.quantidade_total, 0);
          const { data: newZone, error } = await supabase
            .from("event_ticket_zones")
            .insert({
              event_id: eventId,
              session_id: effectiveSessionId || null,
              name: mapping.pdfZone,
              total_capacity: totalCap,
            })
            .select("id")
            .single();
          if (error) throw error;
          zoneId = newZone.id;
          zonesCreated++;
        }
        zoneIdCache.set(mapping.pdfZone, zoneId);

        // Get existing lots for this zone
        const { data: existingLots } = await supabase
          .from("event_ticket_lots")
          .select("id, name, price, iva_rate")
          .eq("zone_id", zoneId);

        const allLots = [...(existingLots || [])];
        let lotNumber = allLots.length;

        for (const row of mapping.rows) {
          // Try to match lot by tipo_bilhete name or price
          let matchedLot = allLots.find(l =>
            normalize(l.name) === normalize(row.tipo_bilhete) &&
            Math.abs(Number(l.price) - row.preco_unitario) < 0.01
          );
          if (!matchedLot) {
            matchedLot = allLots.find(l => normalize(l.name) === normalize(row.tipo_bilhete));
          }
          if (!matchedLot) {
            matchedLot = allLots.find(l => Math.abs(Number(l.price) - row.preco_unitario) < 0.01);
          }

          if (!matchedLot) {
            // Create new lot
            lotNumber++;
            const quantity = importType === "setup" ? row.quantidade_total : 0;
            const { data: newLot, error } = await supabase
              .from("event_ticket_lots")
              .insert({
                zone_id: zoneId,
                name: row.tipo_bilhete,
                quantity,
                price: row.preco_unitario,
                iva_rate: row.iva_rate,
                lot_number: lotNumber,
              })
              .select("id, name, price, iva_rate")
              .single();
            if (error) throw error;
            matchedLot = newLot;
            allLots.push(newLot);
            lotsCreated++;
          } else if (importType === "setup") {
            // Update lot quantity if setup mode
            await supabase
              .from("event_ticket_lots")
              .update({ quantity: row.quantidade_total, price: row.preco_unitario })
              .eq("id", matchedLot.id);
          }

          // Register sales if there are any
          if (row.quantidade_vendida > 0 && (importType === "sales" || loadType === "realizado")) {
            // If we have Ticketline daily granularity, insert one record per date
            const isTicketline = ticketlineDailySales.length > 0;
            if (isTicketline) {
              // Find daily sales matching this zone+lot combination
              const dailyForThisLot = ticketlineDailySales.filter(s => {
                const sZone = s.zone;
                const sLot = s.lot || "Regular";
                return normalize(sZone) === normalize(mapping.pdfZone)
                  && normalize(sLot) === normalize(row.tipo_bilhete)
                  && Math.abs(s.unit_price - row.preco_unitario) < 0.02;
              });
              for (const dailySale of dailyForThisLot) {
                if (dailySale.quantity <= 0) continue;
                const { error } = await supabase.from("ticket_sales").insert({
                  lot_id: matchedLot.id,
                  zone_id: zoneId,
                  sale_date: dailySale.date,
                  sale_date_to: null,
                  quantity: dailySale.quantity,
                  unit_price: dailySale.unit_price,
                  financial_account_id: ticketOfficeId || null,
                  notes: `Importação dia ${dailySale.date}`,
                  source: "import",
                } as any);
                if (error) throw error;
                imported++;
              }
            } else {
              const { error } = await supabase.from("ticket_sales").insert({
                lot_id: matchedLot.id,
                zone_id: zoneId,
                sale_date: effectiveFrom,
                sale_date_to: effectiveTo !== effectiveFrom ? effectiveTo : null,
                quantity: row.quantidade_vendida,
                unit_price: row.preco_unitario,
                financial_account_id: ticketOfficeId || null,
                notes: notesText,
                source: "import",
              } as any);
              if (error) throw error;
              imported++;
            }
          }
        }
      }

      return { imported, zonesCreated, lotsCreated };
    },
    onSuccess: async (result) => {
      await supabase.from("ticket_import_logs").insert({
        event_id: eventId,
        financial_account_id: ticketOfficeId || null,
        import_type: importType,
        period_from: pdfPeriodFrom || new Date().toISOString().slice(0, 10),
        period_to: pdfPeriodTo || pdfPeriodFrom || new Date().toISOString().slice(0, 10),
        file_name: file?.name || null,
        rows_imported: result?.imported || 0,
        zones_created: result?.zonesCreated || 0,
        lots_created: result?.lotsCreated || 0,
      } as any);
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-sales"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_import_logs"] });
      queryClient.invalidateQueries({ queryKey: ["to_event_sales"] });
      queryClient.invalidateQueries({ queryKey: ["to_event_zones"] });
      queryClient.invalidateQueries({ queryKey: ["to_event_lots"] });
      queryClient.invalidateQueries({ queryKey: ["to_import_logs"] });
      queryClient.invalidateQueries({ queryKey: ["to_event_txns"] });
      const parts: string[] = [];
      if (result?.imported) parts.push(`${result.imported} vendas importadas`);
      if (result?.zonesCreated) parts.push(`${result.zonesCreated} novas zonas`);
      if (result?.lotsCreated) parts.push(`${result.lotsCreated} novos lotes`);
      toast({ title: parts.join(", ") || "Importação concluída" });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const handleGenerateReport = async () => {
    if (!pdfHeader || extractedRows.length === 0) return;
    
    const existingZoneNames: Record<string, string> = {};
    existingZones.forEach((z: any) => { existingZoneNames[z.id] = z.name; });
    
    const selectedTicketOffice = ticketOffices.find((to: any) => to.id === ticketOfficeId);
    
    const doc = generateImportReportPdf({
      fileName: file?.name || "desconhecido.pdf",
      eventName: selectedEvent?.name || "Evento não selecionado",
      sessionLabel: selectedSession?.label,
      sessionDate: selectedSession?.date,
      sessionTime: selectedSession?.start_time?.slice(0, 5),
      ticketOfficeName: (selectedTicketOffice as any)?.name,
      pdfHeader,
      extractedRows,
      zoneMappings,
      existingZoneNames,
      headerWarnings,
      totalWarnings,
      importType,
    });

    // Download locally
    const pdfBlob = doc.output("blob");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const reportName = `relatorio_importacao_${timestamp}.pdf`;
    
    // Also try to upload to storage for 7-day retention
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const { error } = await supabase.storage
        .from("import-reports")
        .upload(reportName, uint8, { contentType: "application/pdf", upsert: true });
      if (!error) {
        toast({ title: "Relatório guardado no sistema por 7 dias" });
      }
    } catch {
      // Upload failed, user still gets the download
    }

    // Trigger download
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportName;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Relatório PDF gerado com sucesso" });
  };

  const checkDuplicatesAndImport = async () => {
    if (!eventId) { toast({ title: "Selecione um evento", variant: "destructive" }); return; }
    if (requiresSessionSelection) { toast({ title: "Selecione a sessão", variant: "destructive" }); return; }

    try {
      const effectiveFrom = pdfPeriodFrom || new Date().toISOString().slice(0, 10);
      const effectiveTo = pdfPeriodTo || effectiveFrom;
      let logQuery = supabase
        .from("ticket_import_logs")
        .select("*")
        .eq("event_id", eventId)
        .lte("period_from", effectiveTo)
        .gte("period_to", effectiveFrom);
      // If a ticket office is selected, only warn about imports for the same ticket office
      if (ticketOfficeId) logQuery = logQuery.eq("financial_account_id", ticketOfficeId);
      const { data: existingLogs } = await logQuery;

      if (existingLogs && existingLogs.length > 0) {
        setDuplicateWarnings(existingLogs);
        // Show warning inline but don't block — let user decide
        setShowDuplicateConfirm(true);
        return;
      }
      importMutation.mutate();
    } catch {
      importMutation.mutate();
    }
  };

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
              Importa dados de PDFs (Ticketline, BOL) ou XLSX Ticketline. Pode usar para configuração inicial (zonas/lotes) ou para registar vendas reais.
            </PopoverContent>
          </Popover>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Importar Bilheteira
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Import type */}
            <div>
              <Label className="text-xs text-muted-foreground">Tipo de importação</Label>
              <RadioGroup value={importType} onValueChange={(v) => setImportType(v as ImportType)} className="mt-1 flex gap-4">
                <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${importType === "sales" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="sales" />
                  Importar Vendas
                </label>
                <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${importType === "setup" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="setup" />
                  Configuração Inicial
                </label>
              </RadioGroup>
            </div>

            {/* Event + Session + Ticket Office */}
            <div className="grid grid-cols-2 gap-3">
              {!preSelectedEventId && (
                <div className="col-span-2">
                  <Label>Evento</Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o evento…" /></SelectTrigger>
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

              {eventSessions.length > 0 && !selectedSessionId && (
                <div>
                  <Label>Sessão</Label>
                  <Select value={manualSessionId} onValueChange={setManualSessionId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {eventSessions.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.label} ({s.date})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ticketOffices.length > 0 && (
                <div>
                  <Label>Bilheteira <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                  <Select value={ticketOfficeId} onValueChange={setTicketOfficeId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {ticketOffices.map((to: any) => (
                        <SelectItem key={to.id} value={to.id}>{to.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Setup-specific: load type */}
            {importType === "setup" && (
              <div>
                <Label>Tipo de Carga</Label>
                <RadioGroup value={loadType} onValueChange={(v) => setLoadType(v as any)} className="mt-1 flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="realizado" id="realizado" />
                    <Label htmlFor="realizado" className="cursor-pointer font-normal text-sm">Realizado</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="previsto" id="previsto" />
                    <Label htmlFor="previsto" className="cursor-pointer font-normal text-sm">Previsto</Label>
                  </div>
                </RadioGroup>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {loadType === "previsto" ? "Cria zonas e lotes sem registar vendas" : "Cria zonas, lotes e regista vendas"}
                </p>
              </div>
            )}

            {/* File upload */}
            <div>
              <Label>Ficheiro (PDF ou Excel)</Label>
              <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-5 mt-1 transition-colors hover:border-primary/50 hover:bg-primary/5 ${extracting ? "opacity-50 pointer-events-none" : ""}`}>
                {extracting ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">
                  {extracting ? "A extrair dados com IA…" : file ? file.name : "Clique para selecionar ficheiro (PDF ou Excel)"}
                </span>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".pdf,.xlsx,.xls" disabled={extracting} />
              </label>
            </div>

            {/* PDF Header info */}
            {pdfHeader && (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Dados do cabeçalho do ficheiro</p>
                {pdfHeader.event_name && <p>Evento: <span className="font-medium text-foreground">{pdfHeader.event_name}</span></p>}
                {pdfHeader.venue_name && <p>Local: <span className="font-medium text-foreground">{pdfHeader.venue_name}</span></p>}
                {pdfHeader.session_date && <p>Sessão: <span className="font-medium text-foreground">{pdfHeader.session_date} {pdfHeader.session_time || ""}</span></p>}
                {pdfPeriodFrom && <p>Período: <span className="font-medium text-foreground">{pdfPeriodFrom} a {pdfPeriodTo || pdfPeriodFrom}</span></p>}
              </div>
            )}

            {/* Header mismatch warnings */}
            {headerWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-warning">Divergência entre PDF e evento selecionado</p>
                  {headerWarnings.map((w, i) => <p key={i} className="text-muted-foreground">{w}</p>)}
                </div>
              </div>
            )}

            {/* Total validation warnings */}
            {totalWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-destructive">Totais extraídos ≠ TOTAL do PDF</p>
                  {totalWarnings.map((w, i) => <p key={i} className="text-muted-foreground">{w}</p>)}
                </div>
              </div>
            )}

            {/* Zone reconciliation */}
            {zoneMappings.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground flex justify-between">
                  <span>Mapeamento de Zonas — {zoneMappings.length} zonas do PDF</span>
                  <span>
                    {summary.totalSold.toLocaleString("pt-PT")} vendidos • {summary.totalRevenue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
                  {zoneMappings.map((mapping) => {
                    const zoneTotal = mapping.rows.reduce((s, r) => s + r.quantidade_vendida, 0);
                    const zoneRevenue = mapping.rows.reduce((s, r) => s + r.valor_vendido, 0);
                    return (
                      <div key={mapping.pdfZone} className="px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium flex-1">{mapping.pdfZone}</span>
                          <span className="text-[10px] text-muted-foreground">{zoneTotal} vendidos • {zoneRevenue.toFixed(2)}€</span>
                          {mapping.mappedZoneId ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                              <Link2 className="h-3 w-3" /> Mapeada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                              <Plus className="h-3 w-3" /> Nova
                            </span>
                          )}
                        </div>
                        <Select
                          value={mapping.mappedZoneId || "__new__"}
                          onValueChange={(v) => updateZoneMapping(mapping.pdfZone, v === "__new__" ? null : v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__">
                              <span className="flex items-center gap-1">
                                <Plus className="h-3 w-3" /> Criar nova zona "{mapping.pdfZone}"
                              </span>
                            </SelectItem>
                            {existingZones.map((z: any) => (
                              <SelectItem key={z.id} value={z.id}>
                                <span className="flex items-center gap-1">
                                  <Link2 className="h-3 w-3" /> {z.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Sub-rows */}
                        <div className="mt-1 ml-3 space-y-0.5">
                          {mapping.rows.map((r, i) => (
                            <div key={i} className="flex items-center text-[10px] text-muted-foreground gap-2">
                              <span className="flex-1 truncate">{r.tipo_bilhete}</span>
                              <span className="font-mono">{r.preco_unitario.toFixed(2)}€</span>
                              <span className="font-mono">{r.quantidade_vendida}/{r.quantidade_total}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              {extractedRows.length > 0 && (
                <Button variant="secondary" onClick={handleGenerateReport}>
                  <Download className="h-4 w-4 mr-2" /> Gerar Relatório
                </Button>
              )}
              <Button
                onClick={checkDuplicatesAndImport}
                disabled={!eventId || extractedRows.length === 0 || importMutation.isPending || extracting || requiresSessionSelection}
              >
                {importMutation.isPending ? "A importar…" : `Importar ${summary.totalSold.toLocaleString("pt-PT")} vendas`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate warning — non-blocking, allows proceeding */}
      <AlertDialog open={showDuplicateConfirm} onOpenChange={setShowDuplicateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Período com importações anteriores
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium text-foreground">Existem importações anteriores para este período. Cancelamentos e ajustes da bilheteira podem justificar uma nova importação.</p>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  {duplicateWarnings.map((w: any, i: number) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{w.period_from} — {w.period_to}</span>
                      {w.file_name && <span className="text-muted-foreground ml-2">({w.file_name})</span>}
                      <span className="text-muted-foreground ml-2">• {w.rows_imported} linhas</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">Os dados existentes serão mantidos. Apenas novos registos serão adicionados.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => { setShowDuplicateConfirm(false); importMutation.mutate(); }}
            >
              Continuar importação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Legacy exports
export const TotalTicketLoadModal = TicketImportModal;
export const DailySalesUploadModal = TicketImportModal;
