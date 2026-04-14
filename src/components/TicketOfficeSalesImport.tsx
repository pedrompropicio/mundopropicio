import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle, Loader2, Plus, Info } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import * as XLSX from "xlsx";
import { isTicketlineFormat, parseTicketlineXlsx, type TicketlineParseResult } from "@/lib/parse-ticketline-xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ParsedSale {
  date: string;
  event_name: string;
  zone: string;
  lot: string;
  quantity: number;
  unit_price: number;
  matched_event_id?: string;
  matched_zone_id?: string;
  matched_lot_id?: string;
  status: "matched" | "unmatched" | "partial" | "new_lot";
  suggested_lot_type?: "promo" | "special";
}

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

const PRICE_TOLERANCE = 0.02; // 2 cêntimos de tolerância

export function TicketOfficeSalesImport({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedSale[]>([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [extracting, setExtracting] = useState(false);
  const [ticketlineData, setTicketlineData] = useState<TicketlineParseResult | null>(null);

  const { data: ticketOffices = [] } = useQuery({
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
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events_for_matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, status")
        .in("status", ["planning", "confirmed", "active", "completed"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: zonesAndLots = [] } = useQuery({
    queryKey: ["zones_lots_for_matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name, event_id, event_ticket_lots(id, name, lot_number, price, lot_type)");
      if (error) throw error;
      return data;
    },
  });

  const matchRowsForEvent = (rawRows: { date: string; zone: string; lot: string; quantity: number; unit_price: number }[], eventId: string): ParsedSale[] => {
    const eventZones = zonesAndLots.filter((z: any) => z.event_id === eventId);

    return rawRows.map((row) => {
      let matchedZone: any = null;
      let matchedLot: any = null;
      let status: ParsedSale["status"] = "partial";
      let suggestedLotType: "promo" | "special" | undefined;

      // Normalize zone name for matching
      const rowZoneNorm = row.zone.toLowerCase().trim();
      matchedZone = eventZones.find((z: any) => z.name.toLowerCase().trim() === rowZoneNorm);

      if (matchedZone) {
        const lots = (matchedZone as any).event_ticket_lots || [];

        // 1) Match by lot name + price
        matchedLot = lots.find((l: any) =>
          l.name.toLowerCase().trim() === row.lot.toLowerCase().trim() &&
          Math.abs(Number(l.price) - row.unit_price) <= PRICE_TOLERANCE
        );

        // 2) Match by price only
        if (!matchedLot) {
          matchedLot = lots.find((l: any) =>
            Math.abs(Number(l.price) - row.unit_price) <= PRICE_TOLERANCE
          );
        }

        status = matchedLot ? "matched" : "new_lot";
        if (!matchedLot) suggestedLotType = "promo";
      }

      return {
        ...row,
        event_name: "",
        matched_event_id: eventId,
        matched_zone_id: matchedZone?.id,
        matched_lot_id: matchedLot?.id,
        status,
        suggested_lot_type: suggestedLotType,
      };
    }).filter((r) => r.quantity > 0 && r.unit_price >= 1);
  };

  const matchRows = (rawRows: { date: string; event_name: string; zone: string; lot: string; quantity: number; unit_price: number }[]): ParsedSale[] => {
    return rawRows.map((row) => {
      const matchedEvent = events.find(
        (ev: any) => ev.name.toLowerCase().trim() === row.event_name.toLowerCase().trim()
      );

      let matchedZone: any = null;
      let matchedLot: any = null;
      let status: ParsedSale["status"] = "unmatched";
      let suggestedLotType: "promo" | "special" | undefined;

      if (matchedEvent) {
        const eventZones = zonesAndLots.filter((z: any) => z.event_id === matchedEvent.id);
        matchedZone = eventZones.find((z: any) => z.name.toLowerCase().trim() === row.zone.toLowerCase().trim());

        if (matchedZone) {
          const lots = (matchedZone as any).event_ticket_lots || [];
          matchedLot = lots.find((l: any) =>
            l.name.toLowerCase().trim() === row.lot.toLowerCase().trim() &&
            Math.abs(Number(l.price) - row.unit_price) <= PRICE_TOLERANCE
          );
          if (!matchedLot) {
            matchedLot = lots.find((l: any) =>
              Math.abs(Number(l.price) - row.unit_price) <= PRICE_TOLERANCE
            );
          }
          status = matchedLot ? "matched" : "new_lot";
          if (!matchedLot) suggestedLotType = "promo";
        } else {
          status = "partial";
        }
      }

      return {
        ...row,
        matched_event_id: matchedEvent?.id,
        matched_zone_id: matchedZone?.id,
        matched_lot_id: matchedLot?.id,
        status,
        suggested_lot_type: suggestedLotType,
      };
    }).filter((r) => r.quantity > 0 && r.unit_price >= 1);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máx. 10MB)");
      return;
    }
    setFileName(file.name);

    const isPdf = file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      setExtracting(true);
      try {
        const base64 = await fileToBase64(file);
        const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
          body: { pdf_base64: base64, extraction_type: "daily_sales" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const rows = (data.rows || []).map((r: any) => ({
          date: new Date().toISOString().slice(0, 10),
          event_name: "",
          zone: String(r.zona || ""),
          lot: String(r.lote || ""),
          quantity: parseInt(r.quantidade) || 0,
          unit_price: parseFloat(r.preco_unitario) || 0,
        }));

        const filtered = rows.filter((r: any) => r.quantity > 0 && r.unit_price >= 1);
        if (filtered.length === 0) {
          toast.error("Nenhum dado encontrado no PDF");
          return;
        }

        const matched = matchRows(filtered);
        setParsedRows(matched);
        setStep("review");
        toast.success(`${filtered.length} linhas extraídas do PDF via IA`);
      } catch (err: any) {
        toast.error("Erro ao extrair dados do PDF", { description: err.message });
      } finally {
        setExtracting(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });

          // Check if this is a Ticketline format
          if (isTicketlineFormat(workbook)) {
            const result = parseTicketlineXlsx(ev.target?.result as ArrayBuffer);
            setTicketlineData(result);

            if (result.sales.length === 0) {
              toast.error("Nenhuma venda encontrada no ficheiro Ticketline");
              return;
            }

            // If an event is already selected, match immediately
            if (selectedEventId) {
              const matched = matchRowsForEvent(result.sales, selectedEventId);
              setParsedRows(matched);
              setStep("review");
            } else {
              // Go to review step — user needs to select event first
              setStep("review");
            }
            toast.success(`Formato Ticketline detectado: ${result.sales.length} vendas em ${result.summary.length} dias`);
            return;
          }

          // Generic XLSX/CSV format
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(sheet);

          if (json.length === 0) {
            toast.error("Ficheiro vazio ou formato inválido");
            return;
          }

          const rawRows = json.map((row: any) => ({
            date: parseDate(row["Data"] || row["data"] || row["DATE"]),
            event_name: String(row["Evento"] || row["evento"] || row["EVENT"] || "").trim(),
            zone: String(row["Zona"] || row["zona"] || row["ZONE"] || "").trim(),
            lot: String(row["Lote"] || row["lote"] || row["LOT"] || "").trim(),
            quantity: Number(row["Quantidade"] || row["quantidade"] || row["QTY"] || 0),
            unit_price: Number(row["Preço Unitário"] || row["preco_unitario"] || row["PRICE"] || row["Preço"] || row["preco"] || 0),
          }));

          const matched = matchRows(rawRows);
          setParsedRows(matched);
          setStep("review");
        } catch (err) {
          toast.error("Erro ao processar ficheiro");
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const parseDate = (val: any): string => {
    if (!val) return new Date().toISOString().slice(0, 10);
    if (typeof val === "number") {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().slice(0, 10);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  };

  const matchedRows = parsedRows.filter((r) => r.status === "matched");
  const newLotRows = parsedRows.filter((r) => r.status === "new_lot");
  const unmatchedRows = parsedRows.filter((r) => r.status !== "matched" && r.status !== "new_lot");

  const importableRows = [...matchedRows, ...newLotRows];

  const matchedDates = useMemo(() => [...new Set(importableRows.map(r => r.date))], [importableRows]);
  const matchedZoneIds = useMemo(() => [...new Set(importableRows.map(r => r.matched_zone_id).filter(Boolean))], [importableRows]);

  const { data: existingSalesForDates = [] } = useQuery({
    queryKey: ["existing-sales-check", matchedDates, matchedZoneIds],
    queryFn: async () => {
      if (matchedDates.length === 0 || matchedZoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("sale_date, zone_id, lot_id, quantity")
        .in("sale_date", matchedDates)
        .in("zone_id", matchedZoneIds as string[]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: step === "review" && matchedDates.length > 0,
  });

  const duplicateDateWarnings = useMemo(() => {
    if (existingSalesForDates.length === 0) return [];
    const warnings: { date: string; zone: string; existingQty: number }[] = [];
    const seen = new Set<string>();
    for (const row of importableRows) {
      const key = `${row.date}_${row.matched_zone_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = existingSalesForDates.filter(
        (s: any) => s.sale_date === row.date && s.zone_id === row.matched_zone_id
      );
      if (existing.length > 0) {
        const totalQty = existing.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
        warnings.push({ date: row.date, zone: row.zone, existingQty: totalQty });
      }
    }
    return warnings;
  }, [importableRows, existingSalesForDates]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficeId) throw new Error("Selecione uma bilheteira");

      // Step 1: Create new lots for "new_lot" rows
      const createdLots = new Map<string, string>(); // key: "zoneId_price" → lot_id
      for (const row of newLotRows) {
        if (!row.matched_zone_id) continue;
        const key = `${row.matched_zone_id}_${row.unit_price}`;
        if (createdLots.has(key)) continue;

        // Find next lot_number for this zone
        const zone = zonesAndLots.find((z: any) => z.id === row.matched_zone_id);
        const existingLots = (zone as any)?.event_ticket_lots || [];
        const maxLotNumber = existingLots.reduce((max: number, l: any) => Math.max(max, l.lot_number || 0), 0);

        const lotName = row.lot || `Promo ${formatCurrency(row.unit_price)}`;
        const { data: newLot, error } = await supabase
          .from("event_ticket_lots")
          .insert({
            zone_id: row.matched_zone_id,
            name: lotName,
            lot_number: maxLotNumber + 1,
            price: row.unit_price,
            lot_type: row.suggested_lot_type || "promo",
            quantity: 0,
          })
          .select("id")
          .single();

        if (error) throw new Error(`Erro ao criar lote "${lotName}": ${error.message}`);
        createdLots.set(key, newLot.id);
      }

      // Step 2: Build insert rows
      const toInsert = importableRows.map((r) => {
        let lotId = r.matched_lot_id || null;
        if (r.status === "new_lot" && r.matched_zone_id) {
          const key = `${r.matched_zone_id}_${r.unit_price}`;
          lotId = createdLots.get(key) || null;
        }
        return {
          zone_id: r.matched_zone_id!,
          lot_id: lotId,
          sale_date: r.date,
          quantity: r.quantity,
          unit_price: r.unit_price,
          financial_account_id: selectedOfficeId,
          notes: `Importação ${fileName}`,
          source: "import" as const,
        };
      });

      if (toInsert.length === 0) throw new Error("Nenhuma venda para importar");

      const { error } = await supabase.from("ticket_sales").insert(toInsert);
      if (error) throw error;

      return { salesCount: toInsert.length, lotsCreated: createdLots.size };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ticket_sales"] });
      queryClient.invalidateQueries({ queryKey: ["zones_lots_for_matching"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      const lotMsg = result.lotsCreated > 0 ? ` (${result.lotsCreated} lotes promo criados)` : "";
      toast.success(`${result.salesCount} vendas importadas com sucesso${lotMsg}`);
      handleClose();
    },
    onError: (err: any) => {
      toast.error("Erro na importação", { description: err.message });
    },
  });

  const handleClose = () => {
    setParsedRows([]);
    setFileName("");
    setStep("upload");
    setSelectedOfficeId("");
    setSelectedEventId("");
    setExtracting(false);
    setTicketlineData(null);
    onClose();
  };

  const handleEventSelectForTicketline = (eventId: string) => {
    setSelectedEventId(eventId);
    if (ticketlineData) {
      const matched = matchRowsForEvent(ticketlineData.sales, eventId);
      setParsedRows(matched);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Vendas de Bilheteira</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Bilheteira *</Label>
              <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a bilheteira de origem" />
                </SelectTrigger>
                <SelectContent>
                  {ticketOffices.map((to: any) => (
                    <SelectItem key={to.id} value={to.id}>{to.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="glass rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-medium">Formatos aceites</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">PDF Ticketline</span> — A IA extrai automaticamente zonas, lotes, quantidades e preços do relatório
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">CSV / Excel</span> — Colunas: <strong>Data</strong>, <strong>Evento</strong>, <strong>Zona</strong>, <strong>Quantidade</strong>, <strong>Preço Unitário</strong> (+ opcional: <strong>Lote</strong>)
                  </div>
                </div>
              </div>
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={handleFileUpload}
                className="hidden"
                disabled={extracting}
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={!selectedOfficeId || extracting}
                variant="outline"
                className="w-full"
              >
                {extracting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {extracting ? "A extrair dados com IA…" : fileName || "Carregar ficheiro (PDF, CSV ou Excel)"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            {/* Ticketline header info */}
            {ticketlineData && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Info className="h-4 w-4 text-primary" />
                  <span>Ficheiro Ticketline detectado</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Evento: <strong className="text-foreground">{ticketlineData.header.event_name}</strong></span>
                  <span>Data do evento: <strong className="text-foreground">{ticketlineData.header.event_date || "—"}</strong></span>
                  <span>Período: <strong className="text-foreground">{ticketlineData.header.period_from} a {ticketlineData.header.period_to}</strong></span>
                  <span>Total vendido: <strong className="text-foreground">{ticketlineData.totalSoldQty.toLocaleString("pt-PT")} bilhetes — {formatCurrency(ticketlineData.totalSoldValue)}</strong></span>
                </div>

                {/* Event selector */}
                <div className="pt-1">
                  <Label className="text-xs">Associar ao evento *</Label>
                  <Select value={selectedEventId} onValueChange={handleEventSelectForTicketline}>
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Selecione o evento no sistema" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Match stats (only show after matching) */}
            {(parsedRows.length > 0) && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" /> {matchedRows.length} correspondidas
              </span>
              {newLotRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-blue-500">
                  <Plus className="h-4 w-4" /> {newLotRows.length} novos lotes promo
                </span>
              )}
              {unmatchedRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-amber-500">
                  <AlertCircle className="h-4 w-4" /> {unmatchedRows.length} sem correspondência
                </span>
              )}
            </div>
            )}

            {newLotRows.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2">
                <Plus className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-blue-500">Lotes promo a criar automaticamente</p>
                  <p className="text-muted-foreground">
                    {newLotRows.length} linha(s) com preços sem lote correspondente. Serão criados novos lotes do tipo <Badge variant="outline" className="text-[10px] px-1 py-0 bg-warning/15 text-warning border-warning/30">Promo</Badge> na importação.
                  </p>
                </div>
              </div>
            )}

            {duplicateDateWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-warning">Datas com vendas já registadas</p>
                  {duplicateDateWarnings.map((w, i) => (
                    <p key={i} className="text-muted-foreground">
                      {new Date(w.date).toLocaleDateString("pt-PT")} — {w.zone}: {w.existingQty.toLocaleString()} bilhetes existentes
                    </p>
                  ))}
                  <p className="text-muted-foreground italic">A importação não será bloqueada mas poderá resultar em duplicações.</p>
                </div>
              </div>
            )}

            {importableRows.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Vendas a importar ({importableRows.length})
                </h4>
                <div className="overflow-x-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Zona</TableHead>
                        <TableHead className="text-xs">Lote</TableHead>
                        <TableHead className="text-xs text-right">Qtd</TableHead>
                        <TableHead className="text-xs text-right">Preço</TableHead>
                        <TableHead className="text-xs">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importableRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-xs">{r.zone}</TableCell>
                          <TableCell className="text-xs">{r.lot || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{r.quantity}</TableCell>
                          <TableCell className="text-xs text-right">{formatCurrency(r.unit_price)}</TableCell>
                          <TableCell className="text-xs">
                            {r.status === "matched" ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-emerald-500 border-emerald-500/30">OK</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-warning/15 text-warning border-warning/30">Novo lote</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {unmatchedRows.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2">
                  Sem correspondência (não serão importadas)
                </h4>
                <div className="overflow-x-auto max-h-32">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Evento</TableHead>
                        <TableHead className="text-xs">Zona</TableHead>
                        <TableHead className="text-xs">Lote</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatchedRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.event_name}</TableCell>
                          <TableCell className="text-xs">{r.zone}</TableCell>
                          <TableCell className="text-xs">{r.lot}</TableCell>
                          <TableCell className="text-xs text-amber-500">
                            {r.status === "unmatched" ? "Evento não encontrado" : "Zona não encontrada"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => { setStep("upload"); setParsedRows([]); setFileName(""); }}>
                Voltar
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={importableRows.length === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? "A importar…" : `Importar ${importableRows.length} vendas`}
              </Button>
            </>
          )}
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
