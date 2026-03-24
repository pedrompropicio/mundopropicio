import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { read, utils } from "xlsx";

interface Event {
  id: string;
  name: string;
  parent_event_id: string | null;
  event_type: string;
  status: string;
}

interface TicketUploadModalsProps {
  events: Event[];
}

interface ParsedRow {
  zona: string;
  lote: string;
  quantidade: number;
  preco: number;
  iva_rate?: number;
}

interface ParsedSaleRow {
  zona: string;
  lote: string;
  quantidade: number;
  preco_unitario: number;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function parseFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = utils.sheet_to_json<Record<string, any>>(ws);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro"));
    reader.readAsArrayBuffer(file);
  });
}

function mapTotalRows(rows: Record<string, any>[]): ParsedRow[] {
  return rows.map((row, idx) => {
    const keys = Object.keys(row);
    const normalized: Record<string, any> = {};
    keys.forEach(k => { normalized[normalizeHeader(k)] = row[k]; });

    const zona = String(normalized["zona"] || normalized["zone"] || "Geral").trim();
    const lote = String(normalized["lote"] || normalized["lot"] || `Lote ${idx + 1}`).trim();
    const quantidade = parseInt(normalized["quantidade"] || normalized["qty"] || normalized["quantity"] || "0") || 0;
    const preco = parseFloat(normalized["preco"] || normalized["price"] || normalized["valor"] || "0") || 0;
    const iva_rate = parseInt(normalized["iva"] || normalized["iva_rate"] || "6") || 6;

    return { zona, lote, quantidade, preco, iva_rate };
  });
}

function mapSaleRows(rows: Record<string, any>[]): ParsedSaleRow[] {
  return rows.map((row, idx) => {
    const keys = Object.keys(row);
    const normalized: Record<string, any> = {};
    keys.forEach(k => { normalized[normalizeHeader(k)] = row[k]; });

    const zona = String(normalized["zona"] || normalized["zone"] || "").trim();
    const lote = String(normalized["lote"] || normalized["lot"] || "").trim();
    const quantidade = parseInt(normalized["quantidade"] || normalized["qty"] || normalized["quantity"] || "0") || 0;
    const preco_unitario = parseFloat(normalized["preco"] || normalized["preco_unitario"] || normalized["price"] || normalized["valor"] || "0") || 0;

    return { zona, lote, quantidade, preco_unitario };
  });
}

// ── Total Ticket Load Modal ──
export function TotalTicketLoadModal({ events }: TicketUploadModalsProps) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [loadType, setLoadType] = useState<"realizado" | "previsto">("realizado");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const rows = await parseFile(f);
      const mapped = mapTotalRows(rows);
      setPreview(mapped);
    } catch {
      toast({ title: "Erro ao ler ficheiro", variant: "destructive" });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || preview.length === 0) throw new Error("Selecione evento e ficheiro");

      // Group by zone
      const zoneMap = new Map<string, ParsedRow[]>();
      preview.forEach(r => {
        const existing = zoneMap.get(r.zona) || [];
        existing.push(r);
        zoneMap.set(r.zona, existing);
      });

      for (const [zoneName, lots] of zoneMap) {
        // Check if zone already exists
        const { data: existingZones } = await supabase
          .from("event_ticket_zones")
          .select("id, name")
          .eq("event_id", eventId)
          .ilike("name", zoneName);

        let zoneId: string;
        if (existingZones && existingZones.length > 0) {
          zoneId = existingZones[0].id;
        } else {
          const totalCap = lots.reduce((s, l) => s + l.quantidade, 0);
          const { data: newZone, error } = await supabase
            .from("event_ticket_zones")
            .insert({ event_id: eventId, name: zoneName, total_capacity: totalCap })
            .select("id")
            .single();
          if (error) throw error;
          zoneId = newZone.id;
        }

        // Get existing lots count for lot_number
        const { data: existingLots } = await supabase
          .from("event_ticket_lots")
          .select("id")
          .eq("zone_id", zoneId);
        let lotNumber = (existingLots?.length || 0) + 1;

        for (const lot of lots) {
          const { error } = await supabase.from("event_ticket_lots").insert({
            zone_id: zoneId,
            name: lot.lote,
            quantity: lot.quantidade,
            price: lot.preco,
            iva_rate: lot.iva_rate || 6,
            lot_number: lotNumber++,
          });
          if (error) throw error;

          // If "realizado", also create sales records
          if (loadType === "realizado") {
            // Find the lot just created
            const { data: createdLots } = await supabase
              .from("event_ticket_lots")
              .select("id")
              .eq("zone_id", zoneId)
              .eq("name", lot.lote)
              .order("created_at", { ascending: false })
              .limit(1);

            if (createdLots && createdLots.length > 0) {
              await supabase.from("ticket_sales").insert({
                lot_id: createdLots[0].id,
                sale_date: new Date().toISOString().slice(0, 10),
                quantity: lot.quantidade,
                unit_price: lot.preco,
                notes: "Carga total via upload",
              });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-sales"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots"] });
      toast({ title: `Carga ${loadType === "realizado" ? "realizada" : "prevista"} importada com sucesso!` });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const handleClose = () => {
    setOpen(false);
    setEventId("");
    setLoadType("realizado");
    setFile(null);
    setPreview([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectedEvent = events.find(e => e.id === eventId);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" /> Carga Total
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Carga de Bilhete Total
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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
              {loadType === "previsto" && selectedEvent && selectedEvent.status !== "planning" && (
                <p className="text-xs text-warning mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Carga prevista é normalmente usada para eventos em planeamento
                </p>
              )}
            </div>

            <div>
              <Label>Ficheiro (Excel / CSV)</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 mt-1 transition-colors hover:border-primary/50 hover:bg-primary/5">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : "Clique para selecionar ficheiro"}
                </span>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".csv,.xls,.xlsx" />
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Colunas esperadas: Zona, Lote, Quantidade, Preço, IVA (opcional)
              </p>
            </div>

            {preview.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Pré-visualização — {preview.length} linhas
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="text-left px-3 py-1">Zona</th>
                        <th className="text-left px-3 py-1">Lote</th>
                        <th className="text-right px-3 py-1">Qtd</th>
                        <th className="text-right px-3 py-1">Preço</th>
                        <th className="text-right px-3 py-1">IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="px-3 py-1">{r.zona}</td>
                          <td className="px-3 py-1">{r.lote}</td>
                          <td className="px-3 py-1 text-right font-mono">{r.quantidade.toLocaleString()}</td>
                          <td className="px-3 py-1 text-right font-mono">{r.preco.toFixed(2)}€</td>
                          <td className="px-3 py-1 text-right font-mono">{r.iva_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 20 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1">…e mais {preview.length - 20} linhas</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!eventId || preview.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "A importar…" : `Importar ${loadType === "realizado" ? "Realizado" : "Previsto"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Daily Sales Upload Modal ──
export function DailySalesUploadModal({ events }: TicketUploadModalsProps) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedSaleRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const rows = await parseFile(f);
      const mapped = mapSaleRows(rows);
      setPreview(mapped);
    } catch {
      toast({ title: "Erro ao ler ficheiro", variant: "destructive" });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || preview.length === 0) throw new Error("Selecione evento e ficheiro");

      // Fetch zones and lots for this event
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name")
        .eq("event_id", eventId);

      if (!zones || zones.length === 0) throw new Error("Este evento não tem zonas de bilhetes configuradas.");

      const zoneIds = zones.map(z => z.id);
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, name, zone_id, price")
        .in("zone_id", zoneIds);

      if (!lots || lots.length === 0) throw new Error("Este evento não tem lotes configurados.");

      let imported = 0;
      let skipped = 0;

      for (const row of preview) {
        // Find matching lot by name (and optionally zone)
        let matchedLot = lots.find(l => {
          const lotMatch = l.name.toLowerCase() === row.lote.toLowerCase();
          if (row.zona) {
            const zone = zones.find(z => z.id === l.zone_id);
            return lotMatch && zone?.name.toLowerCase() === row.zona.toLowerCase();
          }
          return lotMatch;
        });

        // Fallback: match just by lot name
        if (!matchedLot) {
          matchedLot = lots.find(l => l.name.toLowerCase() === row.lote.toLowerCase());
        }

        if (!matchedLot) {
          skipped++;
          continue;
        }

        const { error } = await supabase.from("ticket_sales").insert({
          lot_id: matchedLot.id,
          sale_date: saleDate,
          quantity: row.quantidade,
          unit_price: row.preco_unitario || Number(matchedLot.price),
          notes: "Upload de vendas diária",
        });

        if (error) throw error;
        imported++;
      }

      if (skipped > 0) {
        toast({
          title: `${imported} vendas importadas, ${skipped} ignoradas`,
          description: "Algumas linhas não corresponderam a lotes existentes.",
          variant: "default",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-sales"] });
      toast({ title: "Vendas diárias importadas com sucesso!" });
      handleClose();
    },
    onError: (err: any) => toast({ title: "Erro na importação", description: err.message, variant: "destructive" }),
  });

  const handleClose = () => {
    setOpen(false);
    setEventId("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setFile(null);
    setPreview([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" /> Vendas Diárias
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Upload de Vendas Diárias
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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

            <div>
              <Label>Data da Venda</Label>
              <Input type="date" className="mt-1" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>

            <div>
              <Label>Ficheiro (Excel / CSV)</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 mt-1 transition-colors hover:border-primary/50 hover:bg-primary/5">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : "Clique para selecionar ficheiro"}
                </span>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFile} accept=".csv,.xls,.xlsx" />
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">
                Colunas esperadas: Zona (opcional), Lote, Quantidade, Preço (opcional, usa preço do lote)
              </p>
            </div>

            {preview.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Pré-visualização — {preview.length} linhas
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
                      {preview.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="px-3 py-1">{r.zona || "—"}</td>
                          <td className="px-3 py-1">{r.lote}</td>
                          <td className="px-3 py-1 text-right font-mono">{r.quantidade.toLocaleString()}</td>
                          <td className="px-3 py-1 text-right font-mono">{r.preco_unitario ? `${r.preco_unitario.toFixed(2)}€` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 20 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1">…e mais {preview.length - 20} linhas</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!eventId || !saleDate || preview.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "A importar…" : "Importar Vendas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
