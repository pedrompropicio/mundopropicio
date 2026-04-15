import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, MapPin, Ticket, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";

interface ForecastLot {
  name: string;
  quantity: number;
  convites: number;
  price: number;
  revenue: number;
  lot_type: string;
}

interface ForecastZone {
  name: string;
  capacity: number;
  lots: ForecastLot[];
}

interface ForecastPage {
  venue_name: string;
  event_date: string;
  event_time: string;
  total_quantity: number;
  total_revenue: number;
  total_revenue_net: number;
  iva_rate: number;
  commission_rate: number;
  ticket_medio: number;
  zones: ForecastZone[];
  /** Runtime: mapped event ID */
  mapped_event_id?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-select master event (e.g. when opened from a tour) */
  masterEventId?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro"));
    reader.readAsDataURL(file);
  });
}

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

function fuzzyVenueMatch(venueName: string, eventName: string): boolean {
  const nv = normalize(venueName);
  const ne = normalize(eventName);
  if (ne.includes(nv) || nv.includes(ne)) return true;
  const venueWords = nv.split(" ").filter(w => w.length > 3);
  return venueWords.some(w => ne.includes(w));
}

export function TicketForecastImportModal({ open, onClose, masterEventId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [pages, setPages] = useState<ForecastPage[]>([]);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  const { data: events = [] } = useQuery({
    queryKey: ["events_for_forecast_import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, parent_event_id, event_type, status, date")
        .in("status", ["planning", "confirmed", "active"])
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Get sub-events of the master event (for tour mapping)
  const availableEvents = useMemo(() => {
    if (masterEventId) {
      const children = events.filter(e => e.parent_event_id === masterEventId);
      if (children.length > 0) return children;
    }
    return events;
  }, [events, masterEventId]);

  const handleClose = () => {
    setFile(null);
    setPages([]);
    setExpandedPages(new Set());
    setExtracting(false);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) {
      toast({ title: "Formato inválido", description: "Selecione um ficheiro PDF", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setFile(f);
    setPages([]);
    setExtracting(true);

    try {
      const base64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
        body: { pdf_base64: base64 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.source !== "previsao_receitas" || !data?.pages) {
        toast({
          title: "Formato não reconhecido",
          description: "O PDF não foi identificado como uma Previsão de Receitas. Utilize o módulo de importação padrão para PDFs de bilheteira (Ticketline/BOL).",
          variant: "destructive",
        });
        return;
      }

      const parsedPages: ForecastPage[] = (data.pages || []).map((p: any) => ({
        venue_name: p.venue_name || "Desconhecido",
        event_date: p.event_date || "",
        event_time: p.event_time || "",
        total_quantity: Number(p.total_quantity) || 0,
        total_revenue: Number(p.total_revenue) || 0,
        total_revenue_net: Number(p.total_revenue_net) || 0,
        iva_rate: Number(p.iva_rate) || 6,
        commission_rate: Number(p.commission_rate) || 2,
        ticket_medio: Number(p.ticket_medio) || 0,
        zones: (p.zones || []).map((z: any) => ({
          name: z.name || "Geral",
          capacity: Number(z.capacity) || 0,
          lots: (z.lots || []).map((l: any) => ({
            name: l.name || "Lote",
            quantity: Number(l.quantity) || 0,
            convites: Number(l.convites) || 0,
            price: Number(l.price) || 0,
            revenue: Number(l.revenue) || 0,
            lot_type: l.lot_type || "regular",
          })),
        })),
        mapped_event_id: undefined,
      }));

      // Auto-map pages to events by venue name / event name
      for (const page of parsedPages) {
        const match = availableEvents.find(ev =>
          fuzzyVenueMatch(page.venue_name, ev.name) ||
          (ev.name && normalize(ev.name).includes(normalize(page.venue_name.split(" ")[0])))
        );
        if (match) page.mapped_event_id = match.id;
      }

      setPages(parsedPages);
      setExpandedPages(new Set(parsedPages.map((_, i) => i)));

      const totalZones = parsedPages.reduce((s, p) => s + p.zones.length, 0);
      const totalLots = parsedPages.reduce((s, p) => s + p.zones.reduce((zs, z) => zs + z.lots.length, 0), 0);
      toast({ title: `${parsedPages.length} páginas extraídas — ${totalZones} zonas, ${totalLots} lotes` });
    } catch (err: any) {
      toast({ title: "Erro ao extrair dados", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const updatePageMapping = (pageIdx: number, eventId: string) => {
    setPages(prev => prev.map((p, i) => i === pageIdx ? { ...p, mapped_event_id: eventId } : p));
  };

  const togglePage = (idx: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const allMapped = pages.length > 0 && pages.every(p => !!p.mapped_event_id);
  const hasDuplicateEvents = useMemo(() => {
    const ids = pages.map(p => p.mapped_event_id).filter(Boolean);
    return new Set(ids).size < ids.length;
  }, [pages]);

  const importMutation = useMutation({
    mutationFn: async () => {
      let totalZonesCreated = 0;
      let totalLotsCreated = 0;

      for (const page of pages) {
        if (!page.mapped_event_id) continue;
        const eventId = page.mapped_event_id;

        for (const zone of page.zones) {
          // Create zone
          const { data: newZone, error: zoneError } = await supabase
            .from("event_ticket_zones")
            .insert({
              event_id: eventId,
              name: zone.name,
              total_capacity: zone.capacity,
            })
            .select("id")
            .single();
          if (zoneError) throw zoneError;
          totalZonesCreated++;

          // Create lots
          for (let i = 0; i < zone.lots.length; i++) {
            const lot = zone.lots[i];
            const { error: lotError } = await supabase
              .from("event_ticket_lots")
              .insert({
                zone_id: newZone.id,
                name: lot.name,
                quantity: lot.quantity,
                price: lot.price,
                iva_rate: page.iva_rate,
                lot_number: i + 1,
                lot_type: lot.lot_type,
              });
            if (lotError) throw lotError;
            totalLotsCreated++;
          }
        }
      }

      return { totalZonesCreated, totalLotsCreated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots"] });
      toast({ title: `Importação concluída — ${result.totalZonesCreated} zonas e ${result.totalLotsCreated} lotes criados` });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const lotTypeBadge: Record<string, string> = {
    promo: "bg-warning/15 text-warning border-warning/30",
    special: "bg-primary/15 text-primary border-primary/30",
    regular: "",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Importar Previsão de Receitas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Importa ficheiros PDF de planeamento de bilheteira (Previsão de Receitas). Cada página do PDF será mapeada a um evento, criando automaticamente zonas e lotes.
            </p>
          </div>

          {/* File upload */}
          <div>
            <Label>Ficheiro PDF</Label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-5 mt-1 transition-colors hover:border-primary/50 hover:bg-primary/5 ${extracting ? "opacity-50 pointer-events-none" : ""}`}>
              {extracting ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground">
                {extracting ? "A extrair dados com IA…" : file ? file.name : "Clique para selecionar PDF de Previsão de Receitas"}
              </span>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".pdf" disabled={extracting} />
            </label>
          </div>

          {/* Pages preview */}
          {pages.length > 0 && (
            <div className="space-y-3">
              {pages.map((page, pageIdx) => {
                const expanded = expandedPages.has(pageIdx);
                const totalLots = page.zones.reduce((s, z) => s + z.lots.length, 0);
                const totalQty = page.zones.reduce((s, z) => s + z.lots.reduce((ls, l) => ls + l.quantity, 0), 0);
                const mappedEvent = availableEvents.find(e => e.id === page.mapped_event_id);

                return (
                  <div key={pageIdx} className="rounded-xl border border-border overflow-hidden">
                    {/* Page header */}
                    <button
                      type="button"
                      onClick={() => togglePage(pageIdx)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    >
                      {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <MapPin className="h-4 w-4 text-primary" />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm">{page.venue_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{page.event_date} {page.event_time}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{page.zones.length} zonas</span>
                        <span>{totalLots} lotes</span>
                        <span className="font-mono">{totalQty.toLocaleString("pt-PT")} bilhetes</span>
                        <span className="font-mono font-semibold text-foreground">{formatCurrency(page.total_revenue)}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-4 py-3 space-y-3">
                        {/* Event mapping */}
                        <div>
                          <Label className="text-xs text-muted-foreground">Evento destino</Label>
                          <Select
                            value={page.mapped_event_id || ""}
                            onValueChange={(v) => updatePageMapping(pageIdx, v)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecione o evento…" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableEvents.map(ev => (
                                <SelectItem key={ev.id} value={ev.id}>
                                  {ev.parent_event_id ? `  ↳ ${ev.name}` : ev.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {mappedEvent && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Mapeado: {mappedEvent.name}
                            </p>
                          )}
                        </div>

                        {/* Summary */}
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
                            <p className="text-muted-foreground">Receita Bruta</p>
                            <p className="font-mono font-semibold">{formatCurrency(page.total_revenue)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
                            <p className="text-muted-foreground">Receita Líquida</p>
                            <p className="font-mono font-semibold">{formatCurrency(page.total_revenue_net)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
                            <p className="text-muted-foreground">IVA {page.iva_rate}%</p>
                            <p className="font-mono font-semibold">{formatCurrency(page.total_revenue - page.total_revenue_net)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-center">
                            <p className="text-muted-foreground">Ticket Médio</p>
                            <p className="font-mono font-semibold">{formatCurrency(page.ticket_medio)}</p>
                          </div>
                        </div>

                        {/* Zones & lots */}
                        <div className="rounded-lg border border-border/50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/20 text-muted-foreground">
                                <th className="px-3 py-1.5 text-left font-medium">Zona / Lote</th>
                                <th className="px-2 py-1.5 text-right font-medium">Qtd.</th>
                                <th className="px-2 py-1.5 text-right font-medium">Conv.</th>
                                <th className="px-2 py-1.5 text-right font-medium">Preço</th>
                                <th className="px-3 py-1.5 text-right font-medium">Receita</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                              {page.zones.map((zone, zi) => (
                                <>
                                  <tr key={`z-${zi}`} className="bg-muted/10">
                                    <td className="px-3 py-1.5 font-semibold" colSpan={2}>
                                      {zone.name}
                                      <span className="text-muted-foreground font-normal ml-1">(cap. {zone.capacity.toLocaleString("pt-PT")})</span>
                                    </td>
                                    <td colSpan={3} className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                                      {zone.lots.reduce((s, l) => s + l.revenue, 0).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€
                                    </td>
                                  </tr>
                                  {zone.lots.map((lot, li) => (
                                    <tr key={`l-${zi}-${li}`}>
                                      <td className="px-3 py-1 pl-6 flex items-center gap-1.5">
                                        {lot.name}
                                        {lot.lot_type !== "regular" && (
                                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${lotTypeBadge[lot.lot_type] || ""}`}>
                                            {lot.lot_type === "promo" ? "Promo" : "Especial"}
                                          </Badge>
                                        )}
                                      </td>
                                      <td className="px-2 py-1 text-right font-mono">{lot.quantity.toLocaleString("pt-PT")}</td>
                                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">{lot.convites || "—"}</td>
                                      <td className="px-2 py-1 text-right font-mono">{lot.price.toFixed(2)}€</td>
                                      <td className="px-3 py-1 text-right font-mono">{lot.revenue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}€</td>
                                    </tr>
                                  ))}
                                </>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Warnings */}
          {hasDuplicateEvents && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">Duas ou mais páginas estão mapeadas ao mesmo evento. Verifique o mapeamento.</p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!allMapped || hasDuplicateEvents || importMutation.isPending || pages.length === 0}
            >
              {importMutation.isPending
                ? "A importar…"
                : `Criar ${pages.reduce((s, p) => s + p.zones.length, 0)} zonas e ${pages.reduce((s, p) => s + p.zones.reduce((zs, z) => zs + z.lots.length, 0), 0)} lotes`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
