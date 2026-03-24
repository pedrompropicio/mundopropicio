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
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro"));
    reader.readAsDataURL(file);
  });
}

// ── Total Ticket Load Modal ──
export function TotalTicketLoadModal({ events }: TicketUploadModalsProps) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [loadType, setLoadType] = useState<"realizado" | "previsto">("realizado");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreview([]);
    setExtracting(true);

    try {
      const base64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
        body: { pdf_base64: base64, extraction_type: "total" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const rows: ParsedRow[] = (data.rows || []).map((r: any) => ({
        zona: String(r.zona || "Geral"),
        lote: String(r.lote || "Lote"),
        quantidade: parseInt(r.quantidade_total ?? r.quantidade) || 0,
        quantidade_vendida: parseInt(r.quantidade_vendida) ?? parseInt(r.quantidade_total ?? r.quantidade) ?? 0,
        preco: parseFloat(r.preco) || 0,
        iva_rate: parseInt(r.iva_rate) || 6,
      }));

      if (rows.length === 0) {
        toast({ title: "Nenhum dado encontrado no PDF", variant: "destructive" });
      } else {
        setPreview(rows);
        toast({ title: `${rows.length} linhas extraídas do PDF` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao extrair dados do PDF", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || preview.length === 0) throw new Error("Selecione evento e ficheiro");

      // Check if event is completed and has no pre-existing ticketing setup
      const selectedEvent = events.find(e => e.id === eventId);
      const isCompleted = selectedEvent?.status === "completed";

      const { data: preExistingZones } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .eq("event_id", eventId)
        .limit(1);
      const hadPlanning = (preExistingZones?.length ?? 0) > 0;

      // For completed events without prior planning, use sold qty as capacity (no planning data)
      const salesOnlyMode = loadType === "realizado" && isCompleted && !hadPlanning;

      const zoneMap = new Map<string, ParsedRow[]>();
      preview.forEach(r => {
        const existing = zoneMap.get(r.zona) || [];
        existing.push(r);
        zoneMap.set(r.zona, existing);
      });

      for (const [zoneName, lots] of zoneMap) {
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

        const { data: existingLots } = await supabase
          .from("event_ticket_lots")
          .select("id")
          .eq("zone_id", zoneId);
        const baseNumber = (existingLots?.length || 0);

        // Sort lots by price ASC before assigning lot_number
        const sortedLots = [...lots].sort((a, b) => a.preco - b.preco);

        for (let i = 0; i < sortedLots.length; i++) {
          const lot = sortedLots[i];
          // quantity = total loaded capacity (both modes); sales tracked separately
          const { error } = await supabase.from("event_ticket_lots").insert({
            zone_id: zoneId,
            name: lot.lote,
            quantity: lot.quantidade,
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
                lot_id: createdLots[0].id,
                sale_date: new Date().toISOString().slice(0, 10),
                quantity: lot.quantidade_vendida,
                unit_price: lot.preco,
                notes: "Carga total via upload PDF",
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
    setExtracting(false);
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
              <FileText className="h-5 w-5 text-primary" />
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
              {loadType === "previsto" && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Cria zonas e lotes sem registar vendas
                </p>
              )}
              {loadType === "realizado" && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Cria zonas, lotes e regista vendas automaticamente
                </p>
              )}
            </div>

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

            {preview.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Dados extraídos — {preview.length} linhas
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
                      {preview.map((r, i) => (
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!eventId || preview.length === 0 || uploadMutation.isPending || extracting}
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
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }
    setFile(f);
    setPreview([]);
    setExtracting(true);

    try {
      const base64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-ticket-pdf", {
        body: { pdf_base64: base64, extraction_type: "daily_sales" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const rows: ParsedSaleRow[] = (data.rows || []).map((r: any) => ({
        zona: String(r.zona || ""),
        lote: String(r.lote || ""),
        quantidade: parseInt(r.quantidade) || 0,
        preco_unitario: parseFloat(r.preco_unitario) || 0,
      }));

      if (rows.length === 0) {
        toast({ title: "Nenhum dado encontrado no PDF", variant: "destructive" });
      } else {
        setPreview(rows);
        toast({ title: `${rows.length} linhas extraídas do PDF` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao extrair dados do PDF", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || preview.length === 0) throw new Error("Selecione evento e ficheiro");

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
        let matchedLot = lots.find(l => {
          const lotMatch = l.name.toLowerCase() === row.lote.toLowerCase();
          if (row.zona) {
            const zone = zones.find(z => z.id === l.zone_id);
            return lotMatch && zone?.name.toLowerCase() === row.zona.toLowerCase();
          }
          return lotMatch;
        });

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
          notes: "Upload de vendas diária via PDF",
        });

        if (error) throw error;
        imported++;
      }

      if (skipped > 0) {
        toast({
          title: `${imported} vendas importadas, ${skipped} ignoradas`,
          description: "Algumas linhas não corresponderam a lotes existentes.",
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
    setExtracting(false);
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
              <FileText className="h-5 w-5 text-primary" />
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
                A IA extrairá automaticamente lotes, quantidades e preços do PDF
              </p>
            </div>

            {preview.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Dados extraídos — {preview.length} linhas
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
                      {preview.map((r, i) => (
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!eventId || !saleDate || preview.length === 0 || uploadMutation.isPending || extracting}
            >
              {uploadMutation.isPending ? "A importar…" : "Importar Vendas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
