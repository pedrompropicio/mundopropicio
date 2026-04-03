import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Ticket, Plus, Layers, TrendingUp, ShoppingCart, ChevronDown, ChevronRight, Trash2, Pencil,
} from "lucide-react";
import { TotalTicketLoadModal, DailySalesUploadModal } from "@/components/TicketUploadModals";
import { TicketOfficeSalesImport } from "@/components/TicketOfficeSalesImport";

interface SaleForm {
  lot_id: string;
  sale_date: string;
  quantity: string;
  unit_price: string;
  notes: string;
}

const emptySale: SaleForm = {
  lot_id: "",
  sale_date: new Date().toISOString().slice(0, 10),
  quantity: "",
  unit_price: "",
  notes: "",
};

export default function TicketManagement() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleForm, setSaleForm] = useState<SaleForm>(emptySale);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // Admin lot editing
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotEditForm, setLotEditForm] = useState({ name: "", quantity: "", price: "" });
  const [addingLotZoneId, setAddingLotZoneId] = useState<string | null>(null);
  const [newLotForm, setNewLotForm] = useState({ name: "", quantity: "", price: "" });

  // Admin zone editing
  const [addingZone, setAddingZone] = useState(false);
  const [newZoneForm, setNewZoneForm] = useState({ name: "", total_capacity: "" });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      // Sort: parent events first, then their children grouped underneath
      const parents = (data || []).filter(e => !e.parent_event_id);
      const children = (data || []).filter(e => !!e.parent_event_id);
      const sorted: typeof data = [];
      for (const parent of parents) {
        sorted.push(parent);
        const kids = children.filter(c => c.parent_event_id === parent.id);
        kids.sort((a, b) => a.date.localeCompare(b.date));
        sorted.push(...kids);
      }
      // Add orphan children (no matching parent) at the end
      const usedIds = new Set(sorted.map(e => e.id));
      for (const c of children) {
        if (!usedIds.has(c.id)) sorted.push(c);
      }
      return sorted;
    },
  });

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const isParentEvent = selectedEvent?.event_type === "multi_day" && !selectedEvent?.parent_event_id;

  const { data: zones = [] } = useQuery({
    queryKey: ["ticket-mgmt-zones", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data, error } = await supabase.from("event_ticket_zones").select("*").eq("event_id", selectedEventId).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const { data: lots = [] } = useQuery({
    queryKey: ["ticket-mgmt-lots", selectedEventId],
    queryFn: async () => {
      const zoneIds = zones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds).order("lot_number");
      if (error) throw error;
      return data;
    },
    enabled: zones.length > 0,
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["ticket-sales", selectedEventId],
    queryFn: async () => {
      const lotIds = lots.map((l) => l.id);
      if (lotIds.length === 0) return [];
      const { data, error } = await supabase.from("ticket_sales").select("*").in("lot_id", lotIds).order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: lots.length > 0,
  });

  // Mutations
  const saveSaleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        lot_id: saleForm.lot_id,
        sale_date: saleForm.sale_date,
        quantity: parseInt(saleForm.quantity) || 0,
        unit_price: parseFloat(saleForm.unit_price) || 0,
        notes: saleForm.notes || null,
      };
      if (editingSaleId) {
        const { error } = await supabase.from("ticket_sales").update(payload).eq("id", editingSaleId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ticket_sales").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-sales", selectedEventId] });
      toast({ title: editingSaleId ? "Venda atualizada!" : "Venda registada!" });
      setSaleModalOpen(false);
      setSaleForm(emptySale);
      setEditingSaleId(null);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-sales", selectedEventId] });
      toast({ title: "Venda eliminada" });
    },
  });

  const getZoneCapacityValidation = async (zoneId: string, currentLotId?: string | null) => {
    const [{ data: zone, error: zoneError }, { data: zoneLots, error: lotsError }] = await Promise.all([
      supabase.from("event_ticket_zones").select("id, name, total_capacity").eq("id", zoneId).single(),
      supabase.from("event_ticket_lots").select("id, quantity, lot_number").eq("zone_id", zoneId),
    ]);

    if (zoneError) throw zoneError;
    if (lotsError) throw lotsError;
    if (!zone) throw new Error("Zona não encontrada.");

    const filteredLots = (zoneLots ?? []).filter((lot) => lot.id !== currentLotId);
    const allocatedQuantity = filteredLots.reduce((sum, lot) => sum + Number(lot.quantity), 0);

    return { zone, zoneLots: zoneLots ?? [], allocatedQuantity };
  };

  const updateLotMutation = useMutation({
    mutationFn: async ({ id, zoneId, name, quantity, price }: { id: string; zoneId: string; name: string; quantity: number; price: number }) => {
      if (!name.trim()) throw new Error("O nome do lote é obrigatório");
      const { zone, allocatedQuantity } = await getZoneCapacityValidation(zoneId, id);

      if (zone.total_capacity > 0 && allocatedQuantity + quantity > zone.total_capacity) {
        const remaining = Math.max(zone.total_capacity - allocatedQuantity, 0);
        throw new Error(`Capacidade excedida! A zona "${zone.name}" tem capacidade para ${zone.total_capacity.toLocaleString()} lugares. Restam ${remaining.toLocaleString()} disponíveis.`);
      }

      const { error } = await supabase.from("event_ticket_lots").update({ name: name.trim(), quantity, price }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots", selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-sales", selectedEventId] });
      toast({ title: "Lote atualizado!" });
      setEditingLotId(null);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const addLotMutation = useMutation({
    mutationFn: async ({ zoneId, name, quantity, price }: { zoneId: string; name: string; quantity: number; price: number }) => {
      const { zone, zoneLots, allocatedQuantity } = await getZoneCapacityValidation(zoneId);

      if (zone.total_capacity > 0 && allocatedQuantity + quantity > zone.total_capacity) {
        const remaining = Math.max(zone.total_capacity - allocatedQuantity, 0);
        throw new Error(`Capacidade excedida! A zona "${zone.name}" tem capacidade para ${zone.total_capacity.toLocaleString()} lugares. Restam ${remaining.toLocaleString()} disponíveis.`);
      }

      const { error } = await supabase.from("event_ticket_lots").insert({
        zone_id: zoneId,
        name,
        quantity,
        price,
        lot_number: zoneLots.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots", selectedEventId] });
      toast({ title: "Lote adicionado!" });
      setAddingLotZoneId(null);
      setNewLotForm({ name: "", quantity: "", price: "" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteLotMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check if lot has sales before deleting
      const { data: lotSales } = await supabase.from("ticket_sales").select("id").eq("lot_id", id).limit(1);
      if (lotSales && lotSales.length > 0) {
        throw new Error("Não é possível eliminar um lote que já tem vendas registadas.");
      }
      const { error } = await supabase.from("event_ticket_lots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-lots", selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-sales", selectedEventId] });
      toast({ title: "Lote eliminado" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const addZoneMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("event_ticket_zones").insert({
        event_id: selectedEventId,
        name: newZoneForm.name,
        total_capacity: parseInt(newZoneForm.total_capacity) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-mgmt-zones", selectedEventId] });
      toast({ title: "Zona criada!" });
      setAddingZone(false);
      setNewZoneForm({ name: "", total_capacity: "" });
    },
  });

  // Computed values
  const getZoneLots = (zoneId: string) => lots.filter((l) => l.zone_id === zoneId).sort((a, b) => Number(a.price) - Number(b.price));
  const getLotSales = (lotId: string) => sales.filter((s) => s.lot_id === lotId);
  const getLotSold = (lotId: string) => getLotSales(lotId).reduce((s, sale) => s + Number(sale.quantity), 0);
  const getLotRevenue = (lotId: string) => getLotSales(lotId).reduce((s, sale) => s + Number(sale.quantity) * Number(sale.unit_price), 0);

  const getZoneSold = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + getLotSold(l.id), 0);
  const getZoneCapacity = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + l.quantity, 0);
  const getZoneForecastRevenue = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + l.quantity * Number(l.price), 0);
  const getZoneActualRevenue = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + getLotRevenue(l.id), 0);

  // Sort zones by max lot price (most expensive first)
  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const maxPriceA = Math.max(0, ...lots.filter(l => l.zone_id === a.id).map(l => Number(l.price)));
      const maxPriceB = Math.max(0, ...lots.filter(l => l.zone_id === b.id).map(l => Number(l.price)));
      return maxPriceB - maxPriceA;
    });
  }, [zones, lots]);

  const totalCapacity = zones.reduce((s, z) => s + getZoneCapacity(z.id), 0);
  const totalSold = zones.reduce((s, z) => s + getZoneSold(z.id), 0);
  const totalForecastRevenue = zones.reduce((s, z) => s + getZoneForecastRevenue(z.id), 0);
  const totalActualRevenue = zones.reduce((s, z) => s + getZoneActualRevenue(z.id), 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

  const toggleZone = (id: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openSaleModal = (lotId?: string) => {
    const lot = lotId ? lots.find((l) => l.id === lotId) : null;
    setSaleForm({
      ...emptySale,
      lot_id: lotId || "",
      unit_price: lot ? String(lot.price) : "",
    });
    setEditingSaleId(null);
    setSaleModalOpen(true);
  };

  const openEditSale = (sale: any) => {
    setSaleForm({
      lot_id: sale.lot_id,
      sale_date: sale.sale_date,
      quantity: String(sale.quantity),
      unit_price: String(sale.unit_price),
      notes: sale.notes || "",
    });
    setEditingSaleId(sale.id);
    setSaleModalOpen(true);
  };

  // selectedEvent already declared above

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Gestão de Bilhetes</h1>
        <p className="text-sm text-muted-foreground">Registe vendas, acompanhe a ocupação e gerencie lotes de bilhetes</p>
      </div>

      {/* Event selector + bulk import */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label className="text-sm font-medium">Selecionar Evento</Label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="mt-2 w-full max-w-md">
                <SelectValue placeholder="Escolha um evento…" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.parent_event_id ? `  ↳ ${e.name}` : e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar Vendas (Bilheteira)
          </Button>
        </div>
      </div>

      <TicketOfficeSalesImport open={bulkImportOpen} onClose={() => setBulkImportOpen(false)} />

      {selectedEventId && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Ticket className="h-4 w-4 text-primary" /> Bilhetes Vendidos
              </div>
              <p className="font-mono text-xl font-bold">{totalSold.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">/ {totalCapacity.toLocaleString()}</span></p>
              <Progress value={occupancyPct} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground">{occupancyPct}% de ocupação</p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-4 w-4 text-primary" /> Zonas / Lotes
              </div>
              <p className="font-mono text-xl font-bold">{zones.length} <span className="text-sm text-muted-foreground font-normal">/ {lots.length} lotes</span></p>
              <p className="text-xs text-muted-foreground">{sales.length} vendas registadas</p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-success" /> Receita Prevista
              </div>
              <p className="font-mono text-xl font-bold text-muted-foreground">{formatCurrency(totalForecastRevenue)}</p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShoppingCart className="h-4 w-4 text-success" /> Receita Realizada
              </div>
              <p className="font-mono text-xl font-bold text-success">{formatCurrency(totalActualRevenue)}</p>
              {totalForecastRevenue > 0 && (
                <p className="text-xs text-muted-foreground">{Math.round((totalActualRevenue / totalForecastRevenue) * 100)}% do previsto</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {isParentEvent ? (
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Eventos do tipo "Múltiplos Dias" não possuem bilheteira própria.
                Configure a bilheteira nos sub-eventos individualmente.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => openSaleModal()} disabled={lots.length === 0}>
                <Plus className="h-4 w-4 mr-2" /> Registar Venda
              </Button>
              <TotalTicketLoadModal events={events} />
              <DailySalesUploadModal events={events} />
              {isAdmin && (
                <Button variant="outline" onClick={() => { setAddingZone(true); setNewZoneForm({ name: "", total_capacity: "" }); }}>
                  <Plus className="h-4 w-4 mr-2" /> Nova Zona
                </Button>
              )}
            </div>
          )}

          {!isParentEvent && (
          <>
          {/* Add zone inline */}
          {addingZone && isAdmin && (
            <div className="glass rounded-xl p-4 flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs">Nome da Zona</Label>
                <Input value={newZoneForm.name} onChange={(e) => setNewZoneForm({ ...newZoneForm, name: e.target.value })} placeholder="Ex: Plateia" />
              </div>
              <div className="w-32">
                <Label className="text-xs">Capacidade</Label>
                <Input type="number" min="0" value={newZoneForm.total_capacity} onChange={(e) => setNewZoneForm({ ...newZoneForm, total_capacity: e.target.value })} />
              </div>
              <Button onClick={() => addZoneMutation.mutate()} disabled={!newZoneForm.name || addZoneMutation.isPending}>Criar</Button>
              <Button variant="ghost" onClick={() => setAddingZone(false)}>Cancelar</Button>
            </div>
          )}

          {/* Zone progress bars */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedZones.map((zone) => {
              const cap = getZoneCapacity(zone.id);
              const sold = getZoneSold(zone.id);
              const pct = cap > 0 ? Math.round((sold / cap) * 100) : 0;
              return (
                <div key={zone.id} className="glass rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{zone.name}</p>
                    <span className="text-xs font-mono text-muted-foreground">{sold.toLocaleString()} / {cap.toLocaleString()}</span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{pct}% vendido</span>
                    <span>{formatCurrency(getZoneActualRevenue(zone.id))}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zones / Lots detail */}
          <div className="space-y-3">
            {sortedZones.map((zone) => {
              const zoneLots = getZoneLots(zone.id);
              const isExpanded = expandedZones.has(zone.id);

              return (
                <div key={zone.id} className="glass rounded-xl overflow-hidden">
                  <button onClick={() => toggleZone(zone.id)} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/30">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <Ticket className="h-4 w-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{zone.name}</p>
                      <p className="text-xs text-muted-foreground">{zoneLots.length} lotes · Cap: {(zone.total_capacity ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Vendido</p>
                        <span className="font-mono font-bold">{getZoneSold(zone.id).toLocaleString()}</span>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Receita</p>
                        <span className="font-mono font-bold text-success">{formatCurrency(getZoneActualRevenue(zone.id))}</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/30 px-4 pb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lote</TableHead>
                            <TableHead className="text-right">Carga</TableHead>
                            <TableHead className="text-right">Preço Unit.</TableHead>
                            <TableHead className="text-right">Vendidos</TableHead>
                            <TableHead className="text-right">Disponível</TableHead>
                            <TableHead className="text-right">Receita Prev.</TableHead>
                            <TableHead className="text-right">Receita Real</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {zoneLots.map((lot) => {
                            const sold = getLotSold(lot.id);
                            const available = lot.quantity - sold;
                            const revenue = getLotRevenue(lot.id);
                            const isEditingThis = editingLotId === lot.id;

                            return (
                              <TableRow key={lot.id}>
                                <TableCell className="font-medium">
                                  <span className="text-xs text-muted-foreground mr-1">{lot.lot_number}º</span>
                                  {isEditingThis ? (
                                    <Input className="w-32 inline-block" value={lotEditForm.name} onChange={(e) => setLotEditForm({ ...lotEditForm, name: e.target.value })} />
                                  ) : (
                                    lot.name
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {isEditingThis ? (
                                    <Input type="number" min="0" className="w-20 text-right ml-auto" value={lotEditForm.quantity} onChange={(e) => setLotEditForm({ ...lotEditForm, quantity: e.target.value })} />
                                  ) : (
                                    lot.quantity.toLocaleString()
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {isEditingThis ? (
                                    <Input type="number" step="0.01" min="0" className="w-24 text-right ml-auto" value={lotEditForm.price} onChange={(e) => setLotEditForm({ ...lotEditForm, price: e.target.value })} />
                                  ) : (
                                    formatCurrency(Number(lot.price))
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold">{sold.toLocaleString()}</TableCell>
                                <TableCell className={`text-right font-mono ${available <= 0 ? "text-destructive" : "text-success"}`}>
                                  {available.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(lot.quantity * Number(lot.price))}</TableCell>
                                <TableCell className="text-right font-mono text-success font-semibold">{formatCurrency(revenue)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    {isEditingThis ? (
                                      <>
                                        <Button size="sm" variant="ghost" onClick={() => updateLotMutation.mutate({ id: lot.id, zoneId: zone.id, name: lotEditForm.name, quantity: parseInt(lotEditForm.quantity) || 0, price: parseFloat(lotEditForm.price) || 0 })}>
                                          Salvar
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingLotId(null)}>Cancelar</Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openSaleModal(lot.id)} title="Registar venda">
                                          <ShoppingCart className="h-3.5 w-3.5" />
                                        </Button>
                                        {isAdmin && (
                                          <>
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingLotId(lot.id); setLotEditForm({ name: lot.name, quantity: String(lot.quantity), price: String(lot.price) }); }} title="Editar lote">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm("Eliminar este lote?")) deleteLotMutation.mutate(lot.id); }} title="Eliminar lote">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {/* Add new lot row (admin) */}
                          {isAdmin && addingLotZoneId === zone.id && (
                            <TableRow className="bg-primary/5">
                              <TableCell>
                                <Input placeholder="Nome do lote" value={newLotForm.name} onChange={(e) => setNewLotForm({ ...newLotForm, name: e.target.value })} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input type="number" min="0" className="w-20 text-right ml-auto" value={newLotForm.quantity} onChange={(e) => setNewLotForm({ ...newLotForm, quantity: e.target.value })} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input type="number" step="0.01" min="0" className="w-24 text-right ml-auto" value={newLotForm.price} onChange={(e) => setNewLotForm({ ...newLotForm, price: e.target.value })} />
                              </TableCell>
                              <TableCell colSpan={4}></TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" onClick={() => addLotMutation.mutate({ zoneId: zone.id, name: newLotForm.name, quantity: parseInt(newLotForm.quantity) || 0, price: parseFloat(newLotForm.price) || 0 })} disabled={!newLotForm.name || addLotMutation.isPending}>
                                    Criar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setAddingLotZoneId(null)}>Cancelar</Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>

                      {isAdmin && addingLotZoneId !== zone.id && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setAddingLotZoneId(zone.id); setNewLotForm({ name: "", quantity: "", price: "" }); }}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Novo Lote
                        </Button>
                      )}

                      {/* Recent sales for this zone */}
                      {zoneLots.some((l) => getLotSales(l.id).length > 0) && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Vendas Recentes — {zone.name}</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {zoneLots.flatMap((l) =>
                              getLotSales(l.id).map((sale) => ({
                                ...sale,
                                lotName: l.name,
                                lotNumber: l.lot_number,
                              }))
                            )
                              .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
                              .slice(0, 10)
                              .map((sale: any) => (
                                <div key={sale.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 text-sm">
                                  <span className="text-xs text-muted-foreground w-20">{new Date(sale.sale_date).toLocaleDateString("pt-PT")}</span>
                                  <span className="flex-1 truncate">{sale.lotNumber}º {sale.lotName}</span>
                                  <span className="font-mono">{Number(sale.quantity).toLocaleString()} bilhetes</span>
                                  <span className="font-mono text-success">{formatCurrency(Number(sale.quantity) * Number(sale.unit_price))}</span>
                                  <div className="flex gap-1">
                                    <button onClick={() => openEditSale(sale)} className="rounded p-1 hover:bg-secondary" title="Editar">
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    {isAdmin && (
                                      <button onClick={() => { if (confirm("Eliminar esta venda?")) deleteSaleMutation.mutate(sale.id); }} className="rounded p-1 hover:bg-destructive/20" title="Eliminar">
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {zones.length === 0 && (
              <div className="glass rounded-xl p-8 text-center">
                <Ticket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Este evento não tem zonas de bilhetes configuradas.</p>
                {isAdmin && (
                  <Button variant="outline" className="mt-3" onClick={() => { setAddingZone(true); setNewZoneForm({ name: "", total_capacity: "" }); }}>
                    <Plus className="h-4 w-4 mr-2" /> Criar Zona
                  </Button>
                )}
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}

      {/* Sale registration modal */}
      <Dialog open={saleModalOpen} onOpenChange={setSaleModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSaleId ? "Editar Venda" : "Registar Venda de Bilhetes"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lote</Label>
              <Select value={saleForm.lot_id} onValueChange={(v) => {
                const lot = lots.find((l) => l.id === v);
                setSaleForm({ ...saleForm, lot_id: v, unit_price: lot ? String(lot.price) : saleForm.unit_price });
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o lote…" />
                </SelectTrigger>
                <SelectContent>
                  {sortedZones.map((zone) => {
                    const zoneLots = getZoneLots(zone.id);
                    return zoneLots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {zone.name} — {lot.name} ({formatCurrency(Number(lot.price))})
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data da Venda</Label>
                <Input type="date" className="mt-1" value={saleForm.sale_date} onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })} />
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min="1" className="mt-1" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Preço Unitário (€)</Label>
              <Input type="number" step="0.01" min="0" className="mt-1" value={saleForm.unit_price} onChange={(e) => setSaleForm({ ...saleForm, unit_price: e.target.value })} />
            </div>
            {saleForm.lot_id && saleForm.quantity && (
              <div className="rounded-lg bg-success/10 p-3 text-sm">
                <p className="font-medium">Total: <span className="font-mono text-success">{formatCurrency((parseInt(saleForm.quantity) || 0) * (parseFloat(saleForm.unit_price) || 0))}</span></p>
                {(() => {
                  const lot = lots.find((l) => l.id === saleForm.lot_id);
                  if (!lot) return null;
                  const currentSold = getLotSold(lot.id) - (editingSaleId ? (parseInt(saleForm.quantity) || 0) : 0);
                  const afterSale = currentSold + (parseInt(saleForm.quantity) || 0);
                  const available = lot.quantity - afterSale;
                  return (
                    <p className="text-xs text-muted-foreground mt-1">
                      Após esta venda: {afterSale.toLocaleString()} vendidos / {lot.quantity.toLocaleString()} disponíveis
                      {available < 0 && <span className="text-destructive ml-1">(excede em {Math.abs(available)})</span>}
                    </p>
                  );
                })()}
              </div>
            )}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea className="mt-1" rows={2} value={saleForm.notes} onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })} placeholder="Observações…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveSaleMutation.mutate()} disabled={!saleForm.lot_id || !saleForm.quantity || saveSaleMutation.isPending}>
              {editingSaleId ? "Atualizar" : "Registar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
