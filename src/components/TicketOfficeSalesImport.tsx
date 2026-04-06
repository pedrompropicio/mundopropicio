import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import * as XLSX from "xlsx";

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
  status: "matched" | "unmatched" | "partial";
}

export function TicketOfficeSalesImport({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedSale[]>([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"upload" | "review">("upload");

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
        .select("id, name, event_id, event_ticket_lots(id, name, lot_number, price)");
      if (error) throw error;
      return data;
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(sheet);

        if (json.length === 0) {
          toast.error("Ficheiro vazio ou formato inválido");
          return;
        }

        // Expected columns: Data, Evento, Zona, Lote, Quantidade, Preço Unitário
        const parsed: ParsedSale[] = json.map((row: any) => {
          const date = parseDate(row["Data"] || row["data"] || row["DATE"]);
          const eventName = String(row["Evento"] || row["evento"] || row["EVENT"] || "").trim();
          const zone = String(row["Zona"] || row["zona"] || row["ZONE"] || "").trim();
          const lot = String(row["Lote"] || row["lote"] || row["LOT"] || "").trim();
          const quantity = Number(row["Quantidade"] || row["quantidade"] || row["QTY"] || 0);
          const unitPrice = Number(row["Preço Unitário"] || row["preco_unitario"] || row["PRICE"] || row["Preço"] || row["preco"] || 0);

          // Match event by name
          const matchedEvent = events.find(
            (ev: any) => ev.name.toLowerCase().trim() === eventName.toLowerCase()
          );

          // Match zone and lot
          let matchedZone: any = null;
          let matchedLot: any = null;
          if (matchedEvent) {
            const eventZones = zonesAndLots.filter((z: any) => z.event_id === matchedEvent.id);
            matchedZone = eventZones.find((z: any) => z.name.toLowerCase().trim() === zone.toLowerCase());
            if (matchedZone) {
              const lots = (matchedZone as any).event_ticket_lots || [];
              matchedLot = lots.find((l: any) => l.name.toLowerCase().trim() === lot.toLowerCase());
            }
          }

          const status: ParsedSale["status"] = matchedEvent && matchedZone && matchedLot ? "matched"
            : matchedEvent && matchedZone ? "matched"
            : matchedEvent ? "partial"
            : "unmatched";

          return {
            date,
            event_name: eventName,
            zone,
            lot,
            quantity,
            unit_price: unitPrice,
            matched_event_id: matchedEvent?.id,
            matched_zone_id: matchedZone?.id,
            matched_lot_id: matchedLot?.id,
            status,
          };
        }).filter((r: ParsedSale) => r.quantity > 0 && r.unit_price >= 1);

        setParsedRows(parsed);
        setStep("review");
      } catch (err) {
        toast.error("Erro ao processar ficheiro");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseDate = (val: any): string => {
    if (!val) return new Date().toISOString().slice(0, 10);
    if (typeof val === "number") {
      // Excel serial date
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().slice(0, 10);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  };

  const matchedRows = parsedRows.filter((r) => r.status === "matched");
  const unmatchedRows = parsedRows.filter((r) => r.status !== "matched");

  // Check for existing sales on the same dates/zones
  const matchedDates = useMemo(() => [...new Set(matchedRows.map(r => r.date))], [matchedRows]);
  const matchedZoneIds = useMemo(() => [...new Set(matchedRows.map(r => r.matched_zone_id).filter(Boolean))], [matchedRows]);

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
    for (const row of matchedRows) {
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
  }, [matchedRows, existingSalesForDates]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficeId) throw new Error("Selecione uma bilheteira");
      const toInsert = matchedRows.map((r) => ({
        zone_id: r.matched_zone_id!,
        lot_id: r.matched_lot_id || null,
        sale_date: r.date,
        quantity: r.quantity,
        unit_price: r.unit_price,
        ticket_office_id: selectedOfficeId,
        notes: `Importação ${fileName}`,
        source: "import" as const,
      }));

      if (toInsert.length === 0) throw new Error("Nenhuma venda para importar");

      const { error } = await supabase.from("ticket_sales").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_sales"] });
      toast.success(`${matchedRows.length} vendas importadas com sucesso`);
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
    onClose();
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
              <h4 className="text-sm font-medium">Formato esperado (CSV/Excel)</h4>
              <p className="text-xs text-muted-foreground">
                Colunas obrigatórias: <strong>Data</strong>, <strong>Evento</strong>, <strong>Zona</strong>, <strong>Quantidade</strong>, <strong>Preço Unitário</strong>
                <br />
                Coluna opcional: <strong>Lote</strong> <span className="text-muted-foreground/70">(se não existir, a venda é registada por zona)</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="pb-1 text-left">Data</th>
                      <th className="pb-1 text-left">Evento</th>
                      <th className="pb-1 text-left">Zona</th>
                      <th className="pb-1 text-left">Lote <span className="font-normal text-muted-foreground/60">(opc.)</span></th>
                      <th className="pb-1 text-right">Quantidade</th>
                      <th className="pb-1 text-right">Preço Unitário</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr>
                      <td className="py-1">2026-04-02</td>
                      <td>Festival Verão</td>
                      <td>Plateia</td>
                      <td>1º Lote</td>
                      <td className="text-right">150</td>
                      <td className="text-right">35.00</td>
                    </tr>
                    <tr className="opacity-60">
                      <td className="py-1">2026-04-02</td>
                      <td>Concerto Jazz</td>
                      <td>Geral</td>
                      <td>—</td>
                      <td className="text-right">200</td>
                      <td className="text-right">20.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={!selectedOfficeId}
                variant="outline"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {fileName || "Carregar ficheiro CSV/Excel"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" /> {matchedRows.length} correspondidas
              </span>
              {unmatchedRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-amber-500">
                  <AlertCircle className="h-4 w-4" /> {unmatchedRows.length} sem correspondência
                </span>
              )}
            </div>

            {matchedRows.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Vendas a importar
                </h4>
                <div className="overflow-x-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Evento</TableHead>
                        <TableHead className="text-xs">Zona</TableHead>
                        <TableHead className="text-xs">Lote</TableHead>
                        <TableHead className="text-xs text-right">Qtd</TableHead>
                        <TableHead className="text-xs text-right">Preço</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matchedRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-xs">{r.event_name}</TableCell>
                          <TableCell className="text-xs">{r.zone}</TableCell>
                          <TableCell className="text-xs">{r.lot}</TableCell>
                          <TableCell className="text-xs text-right">{r.quantity}</TableCell>
                          <TableCell className="text-xs text-right">{formatCurrency(r.unit_price)}</TableCell>
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
                            {r.status === "unmatched" ? "Evento não encontrado" : "Zona/Lote não encontrado"}
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
                disabled={matchedRows.length === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? "A importar…" : `Importar ${matchedRows.length} vendas`}
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
