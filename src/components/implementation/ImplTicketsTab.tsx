import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Save, X } from "lucide-react";

interface Props {
  implementation: any;
  event: any;
  allEvents: any[];
  eventDates?: any[];
  eventSessions?: any[];
}

export function ImplTicketsTab({ implementation, event, allEvents }: Props) {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>(event?.id || "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  // Fetch zones for the selected event
  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["impl-zones", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("*, event_sessions:session_id(label)")
        .eq("event_id", selectedEventId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const zoneIds = zones.map((z: any) => z.id);

  // Fetch lots for all zones
  const { data: lots = [] } = useQuery({
    queryKey: ["impl-lots", zoneIds],
    queryFn: async () => {
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("*")
        .in("zone_id", zoneIds)
        .order("lot_number");
      if (error) throw error;
      return data;
    },
    enabled: zoneIds.length > 0,
  });

  const updateLot = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("event_ticket_lots").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["impl-lots"] });
      toast.success("Lote atualizado");
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startEdit = (lot: any) => {
    setEditingId(lot.id);
    setEditValues({
      name: lot.name,
      price: lot.price,
      quantity: lot.quantity,
      iva_rate: lot.iva_rate,
      lot_type: lot.lot_type,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateLot.mutate({
      id: editingId,
      updates: {
        name: editValues.name,
        price: Number(editValues.price),
        quantity: Number(editValues.quantity),
        iva_rate: Number(editValues.iva_rate),
        lot_type: editValues.lot_type,
      },
    });
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";

  const totalTickets = lots.reduce((s: number, l: any) => s + Number(l.quantity), 0);
  const totalRevenue = lots.reduce((s: number, l: any) => s + Number(l.price) * Number(l.quantity), 0);

  return (
    <div className="space-y-4">
      {/* Event selector */}
      {allEvents.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Evento:</span>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allEvents.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.parent_event_id ? "↳ " : "🎤 "}{e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-6 text-sm">
        <span>{zones.length} zonas</span>
        <span>{lots.length} lotes</span>
        <span>Total bilhetes: {totalTickets.toLocaleString("pt-PT")}</span>
        <span className="font-semibold">Receita potencial: {fmtMoney(totalRevenue)}</span>
      </div>

      {/* Zones and lots */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead>Sessão</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">A carregar…</TableCell>
                  </TableRow>
                ) : zones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhuma zona configurada para este evento
                    </TableCell>
                  </TableRow>
                ) : (
                  zones.map((zone: any) => {
                    const zoneLots = lots.filter((l: any) => l.zone_id === zone.id);
                    if (zoneLots.length === 0) {
                      return (
                        <TableRow key={zone.id}>
                          <TableCell className="font-medium">{zone.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{zone.event_sessions?.label || "—"}</TableCell>
                          <TableCell colSpan={7} className="text-xs text-muted-foreground italic">Sem lotes</TableCell>
                        </TableRow>
                      );
                    }
                    return zoneLots.map((lot: any, li: number) => {
                      const isEditing = editingId === lot.id;
                      return (
                        <TableRow key={lot.id} className={isEditing ? "bg-primary/5" : ""}>
                          <TableCell className={li === 0 ? "font-medium" : ""}>{li === 0 ? zone.name : ""}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{li === 0 ? (zone.event_sessions?.label || "—") : ""}</TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input className="h-7 text-xs w-32" value={editValues.name} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} />
                            ) : (
                              <span className="text-sm">{lot.name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Select value={editValues.lot_type} onValueChange={(v) => setEditValues({ ...editValues, lot_type: v })}>
                                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="regular">Regular</SelectItem>
                                  <SelectItem value="promo">Promo</SelectItem>
                                  <SelectItem value="special">Especial</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="text-xs">{lot.lot_type}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <Input type="number" step="0.01" className="h-7 text-xs text-right w-20" value={editValues.price} onChange={(e) => setEditValues({ ...editValues, price: e.target.value })} />
                            ) : (
                              <span className="font-mono text-sm">{fmtMoney(Number(lot.price))}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <Input type="number" className="h-7 text-xs text-right w-20" value={editValues.quantity} onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })} />
                            ) : (
                              <span className="font-mono text-sm">{Number(lot.quantity).toLocaleString("pt-PT")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <Select value={String(editValues.iva_rate)} onValueChange={(v) => setEditValues({ ...editValues, iva_rate: Number(v) })}>
                                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="13">13%</SelectItem>
                                  <SelectItem value="23">23%</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs">{lot.iva_rate}%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtMoney(Number(lot.price) * Number(lot.quantity))}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                                    <Save className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(lot)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
