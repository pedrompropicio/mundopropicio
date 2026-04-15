import { SalesLogPanel } from "@/components/SalesLogPanel";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Plus, Trash2, Check, X, Ticket, Layers, ChevronDown, ChevronRight, Store, CheckCircle2, Lock, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { TicketForecastImportModal } from "@/components/TicketForecastImportModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  eventId: string;
  eventDateId?: string | null;
  eventStatus?: string;
  sessionId?: string | null;
}

interface ZoneForm {
  name: string;
  total_capacity: string;
}

interface LotForm {
  name: string;
  quantity: string;
  price: string;
  iva_rate: string;
  lot_type: string;
}

const emptyZone: ZoneForm = { name: "", total_capacity: "" };
const emptyLot: LotForm = { name: "", quantity: "", price: "", iva_rate: "6", lot_type: "regular" };

const lotTypeLabels: Record<string, string> = { regular: "Regular", promo: "Promo", special: "Especial" };
const lotTypeBadgeClass: Record<string, string> = {
  regular: "",
  promo: "bg-warning/15 text-warning border-warning/30",
  special: "bg-primary/15 text-primary border-primary/30",
};

/** Extract net (ex-IVA) from gross price where IVA is included ("por dentro") */
function netFromGross(gross: number, ivaRate: number): number {
  return gross / (1 + ivaRate / 100);
}

function ivaFromGross(gross: number, ivaRate: number): number {
  return gross - netFromGross(gross, ivaRate);
}

export function EventTicketing({ eventId, eventDateId, eventStatus, sessionId }: Props) {
  const [forecastImportOpen, setForecastImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const isEventLocked = eventStatus === "completed";
  const isEditor = !isAdmin && !isManager;
  const canEditTickets = isEventLocked ? false : isEditor ? eventStatus === "planning" : true;
  const canManageOffices = (isAdmin || hasPermission("manage_accounts")) && !isEventLocked;
  const [addingZone, setAddingZone] = useState(false);
  const [zoneForm, setZoneForm] = useState<ZoneForm>(emptyZone);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [addingLotForZone, setAddingLotForZone] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState<LotForm>(emptyLot);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const zoneNameRef = useRef<HTMLInputElement>(null);
  const lotNameRef = useRef<HTMLInputElement>(null);

  // Ticket offices state
  const [addingOffice, setAddingOffice] = useState(false);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [commissionNotes, setCommissionNotes] = useState("");
  const [deletingOfficeId, setDeletingOfficeId] = useState<string | null>(null);

  useEffect(() => {
    if ((addingZone || editingZoneId) && zoneNameRef.current) {
      // Multiple attempts to ensure focus works in all contexts
      const attempts = [50, 150, 300];
      attempts.forEach(delay => {
        setTimeout(() => {
          if (zoneNameRef.current) {
            zoneNameRef.current.focus();
            zoneNameRef.current.click();
          }
        }, delay);
      });
    }
  }, [addingZone, editingZoneId]);

  useEffect(() => {
    if ((addingLotForZone || editingLotId) && lotNameRef.current) lotNameRef.current.focus();
  }, [addingLotForZone, editingLotId]);

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["event_ticket_zones", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: allLots = [] } = useQuery({
    queryKey: ["event_ticket_lots", eventId],
    queryFn: async () => {
      const zoneIds = zones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("*")
        .in("zone_id", zoneIds)
        .order("lot_number");
      if (error) throw error;
      return data;
    },
    enabled: zones.length > 0,
  });

  // Fetch event data for last_sales_date
  const { data: eventData } = useQuery({
    queryKey: ["event-ticketing-meta", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("last_sales_date").eq("id", eventId).single();
      if (error) throw error;
      return data;
    },
  });

  // === Ticket Offices queries & mutations ===
  const { data: officeAssignments = [] } = useQuery({
    queryKey: ["event_ticket_office_assignments", eventId, eventDateId],
    queryFn: async () => {
      let q = supabase
        .from("event_ticket_office_assignments")
        .select("*, financial_accounts:financial_account_id(id, name, contact_name)")
        .eq("event_id", eventId);
      if (eventDateId) {
        q = q.eq("event_date_id", eventDateId);
      } else {
        q = q.is("event_date_id", null);
      }
      const { data, error } = await q.order("created_at");
      if (error) throw error;
      return data;
    },
  });

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
  });

  const availableOffices = allTicketOffices.filter(
    (to: any) => !officeAssignments.some((a: any) => a.financial_account_id === to.id)
  );

  const addOfficeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficeId) throw new Error("Selecione uma bilheteira");
      const { error } = await supabase.from("event_ticket_office_assignments").insert({
        event_id: eventId,
        financial_account_id: selectedOfficeId,
        event_date_id: eventDateId || null,
        commission_notes: commissionNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      setAddingOffice(false);
      setSelectedOfficeId("");
      setCommissionNotes("");
      sonnerToast.success("Bilheteira associada ao evento");
    },
    onError: (err: any) => sonnerToast.error("Erro", { description: err.message }),
  });

  const deleteOfficeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ticket_office_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      setDeletingOfficeId(null);
      sonnerToast.success("Bilheteira desassociada");
    },
    onError: (err: any) => { sonnerToast.error("Erro", { description: err.message }); setDeletingOfficeId(null); },
  });

  const updateOfficeNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("event_ticket_office_assignments")
        .update({ commission_notes: notes.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      sonnerToast.success("Notas atualizadas");
    },
  });

  const conciliateOfficeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("event_ticket_office_assignments")
        .update({ is_conciliated: true, conciliated_at: new Date().toISOString(), conciliated_by: user?.email || "system" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      sonnerToast.success("Bilheteira marcada como conciliada");
    },
    onError: (err: any) => sonnerToast.error("Erro", { description: err.message }),
  });

  const unconciliateOfficeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("event_ticket_office_assignments")
        .update({ is_conciliated: false, conciliated_at: null, conciliated_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_office_assignments", eventId, eventDateId] });
      sonnerToast.success("Conciliação revertida");
    },
  });

  // Zone CRUD
  const saveZoneMutation = useMutation({
    mutationFn: async ({ form, id }: { form: ZoneForm; id: string | null }) => {
      const payload: any = {
        event_id: eventId,
        name: form.name,
        total_capacity: parseInt(form.total_capacity) || 0,
      };
      if (sessionId) payload.session_id = sessionId;
      if (id) {
        const { error } = await supabase.from("event_ticket_zones").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("event_ticket_zones").insert(payload).select("id").single();
        if (error) throw error;
        setExpandedZones((prev) => new Set(prev).add(data.id));
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId] });
      toast({ title: vars.id ? "Zona atualizada!" : "Zona criada!" });
      setAddingZone(false);
      setEditingZoneId(null);
      setZoneForm(emptyZone);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ticket_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId] });
      toast({ title: "Zona eliminada" });
    },
  });

  // Lot CRUD
  const saveLotMutation = useMutation({
    mutationFn: async ({ form, zoneId, id }: { form: LotForm; zoneId: string; id: string | null }) => {
      // Fetch fresh zone AND lots from DB to validate capacity
      const [{ data: freshZone, error: zoneError }, { data: freshLots }] = await Promise.all([
        supabase.from("event_ticket_zones").select("id, name, total_capacity").eq("id", zoneId).single(),
        supabase.from("event_ticket_lots").select("id, quantity, lot_number").eq("zone_id", zoneId),
      ]);
      if (zoneError) throw zoneError;
      const currentLots = freshLots ?? [];

      const newQty = parseInt(form.quantity) || 0;

      // Validate capacity with fresh data
      if (freshZone && freshZone.total_capacity > 0) {
        const existingTotal = currentLots
          .filter((l) => l.id !== id)
          .reduce((s, l) => s + l.quantity, 0);
        if (existingTotal + newQty > freshZone.total_capacity) {
          const remaining = Math.max(freshZone.total_capacity - existingTotal, 0);
          throw new Error(`Capacidade excedida! A zona "${freshZone.name}" tem capacidade para ${freshZone.total_capacity.toLocaleString()} bilhetes. Restam ${remaining.toLocaleString()} disponíveis.`);
        }
      }

      const nextLotNumber = id ? currentLots.find((l) => l.id === id)?.lot_number ?? 1 : currentLots.length + 1;
      const payload: any = {
        zone_id: zoneId,
        name: form.name,
        quantity: newQty,
        price: parseFloat(form.price) || 0,
        iva_rate: parseInt(form.iva_rate) || 6,
        lot_number: nextLotNumber,
        lot_type: form.lot_type || "regular",
      };
      if (id) {
        const { error } = await supabase.from("event_ticket_lots").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_ticket_lots").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId] });
      toast({ title: vars.id ? "Lote atualizado!" : "Lote adicionado!" });
      if (!vars.id) {
        setLotForm(emptyLot);
        setTimeout(() => lotNameRef.current?.focus(), 50);
      } else {
        setEditingLotId(null);
        setAddingLotForZone(null);
        setLotForm(emptyLot);
      }
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteLotMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_ticket_lots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId] });
      toast({ title: "Lote eliminado" });
    },
  });

  const toggleZone = (id: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEditZone = (z: any) => {
    setZoneForm({ name: z.name, total_capacity: String(z.total_capacity) });
    setEditingZoneId(z.id);
    setAddingZone(false);
  };

  const startEditLot = (l: any) => {
    setLotForm({ name: l.name, quantity: String(l.quantity), price: String(l.price), iva_rate: String(l.iva_rate ?? 6), lot_type: l.lot_type || "regular" });
    setEditingLotId(l.id);
    setAddingLotForZone(null);
  };

  const cancelZone = () => { setAddingZone(false); setEditingZoneId(null); setZoneForm(emptyZone); };
  const cancelLot = () => { setAddingLotForZone(null); setEditingLotId(null); setLotForm(emptyLot); };

  const handleZoneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSaveZone(); }
    else if (e.key === "Escape") cancelZone();
  };

  const handleLotKeyDown = (e: React.KeyboardEvent, zoneId: string) => {
    if (e.key === "Enter") { e.preventDefault(); handleSaveLot(zoneId); }
    else if (e.key === "Escape") cancelLot();
  };

  const handleSaveZone = () => {
    if (!zoneForm.name) { toast({ title: "Insira o nome da zona", variant: "destructive" }); return; }
    saveZoneMutation.mutate({ form: zoneForm, id: editingZoneId });
  };

  const handleSaveLot = (zoneId: string) => {
    if (!lotForm.name || !lotForm.quantity || lotForm.price === "") {
      toast({ title: "Preencha todos os campos do lote", variant: "destructive" }); return;
    }

    saveLotMutation.mutate({ form: lotForm, zoneId, id: editingLotId });
  };

  // Totals — gross, net, IVA
  const getZoneLots = (zoneId: string) => allLots.filter((l) => l.zone_id === zoneId).sort((a, b) => Number(a.price) - Number(b.price));
  const getZoneGrossRevenue = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + l.quantity * Number(l.price), 0);
  const getZoneNetRevenue = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => {
    const rate = Number((l as any).iva_rate ?? 6);
    return s + l.quantity * netFromGross(Number(l.price), rate);
  }, 0);
  const getZoneIva = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => {
    const rate = Number((l as any).iva_rate ?? 6);
    return s + l.quantity * ivaFromGross(Number(l.price), rate);
  }, 0);
  const getZoneTotalTickets = (zoneId: string) => getZoneLots(zoneId).reduce((s, l) => s + l.quantity, 0);

  // Filter zones by session if specified
  const filteredZones = useMemo(() => {
    if (!sessionId) return zones;
    return zones.filter((z: any) => z.session_id === sessionId);
  }, [zones, sessionId]);

  const filteredZoneIds = useMemo(() => new Set(filteredZones.map((zone: any) => zone.id)), [filteredZones]);

  const filteredLots = useMemo(
    () => allLots.filter((lot) => filteredZoneIds.has(lot.zone_id)),
    [allLots, filteredZoneIds],
  );

  // Sort zones by max lot price (most expensive first)
  const sortedZones = useMemo(() => {
    return [...filteredZones].sort((a, b) => {
      const maxPriceA = Math.max(0, ...allLots.filter(l => l.zone_id === a.id).map(l => Number(l.price)));
      const maxPriceB = Math.max(0, ...allLots.filter(l => l.zone_id === b.id).map(l => Number(l.price)));
      return maxPriceB - maxPriceA;
    });
  }, [filteredZones, allLots]);

  const totalGrossRevenue = filteredZones.reduce((s, z) => s + getZoneGrossRevenue(z.id), 0);
  const totalNetRevenue = filteredZones.reduce((s, z) => s + getZoneNetRevenue(z.id), 0);
  const totalIva = filteredZones.reduce((s, z) => s + getZoneIva(z.id), 0);
  const totalTickets = filteredZones.reduce((s, z) => s + getZoneTotalTickets(z.id), 0);
  const totalCapacity = filteredZones.reduce((s, z) => s + z.total_capacity, 0);

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50";

  const renderLotRow = (lot: any, isEditing: boolean, zoneId: string) => {
    const grossPrice = parseFloat(isEditing ? lotForm.price : String(lot.price)) || 0;
    const ivaRate = parseInt(isEditing ? lotForm.iva_rate : String((lot as any).iva_rate ?? 6)) || 0;
    const qty = parseInt(isEditing ? lotForm.quantity : String(lot.quantity)) || 0;
    const net = netFromGross(grossPrice, ivaRate);
    const iva = ivaFromGross(grossPrice, ivaRate);
    const subtotalGross = qty * grossPrice;
    const subtotalNet = qty * net;
    const subtotalIva = qty * iva;

    if (isEditing) {
      return (
        <tr key={lot?.id || "new"} className="bg-primary/5" onKeyDown={(e) => handleLotKeyDown(e, zoneId)}>
          <td className="py-1.5 pr-2">
            <div className="flex items-center gap-1.5">
              <input ref={lotNameRef} value={lotForm.name} onChange={(e) => setLotForm({ ...lotForm, name: e.target.value })} className={inputClass} placeholder="Nome do lote…" autoFocus />
              <select value={lotForm.lot_type} onChange={(e) => setLotForm({ ...lotForm, lot_type: e.target.value })} className={`${inputClass} w-24`}>
                <option value="regular">Regular</option>
                <option value="promo">Promo</option>
                <option value="special">Especial</option>
              </select>
            </div>
          </td>
          <td className="py-1.5 pr-2">
            <input type="number" min="0" value={lotForm.quantity} onChange={(e) => setLotForm({ ...lotForm, quantity: e.target.value })} className={`${inputClass} w-20 text-right`} placeholder="0" />
          </td>
          <td className="py-1.5 pr-2">
            <input type="number" step="0.01" min="0" value={lotForm.price} onChange={(e) => setLotForm({ ...lotForm, price: e.target.value })} className={`${inputClass} w-20 text-right`} placeholder="0,00" />
          </td>
          <td className="py-1.5 pr-2">
            <select value={lotForm.iva_rate} onChange={(e) => setLotForm({ ...lotForm, iva_rate: e.target.value })} className={`${inputClass} w-16`}>
              <option value="23">23%</option><option value="13">13%</option><option value="6">6%</option><option value="0">0%</option>
            </select>
          </td>
          <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(subtotalNet)}</td>
          <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(subtotalIva)}</td>
          <td className="py-1.5 text-right font-mono text-muted-foreground">{formatCurrency(subtotalGross)}</td>
          <td className="py-1.5 text-right">
            <div className="flex justify-end gap-1">
              <button onClick={() => handleSaveLot(zoneId)} disabled={saveLotMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelLot} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr key={lot.id} className="group hover:bg-muted/20 transition-colors">
        <td className="py-2 pr-3">
          <span className="text-xs text-muted-foreground mr-1.5">{lot.lot_number}º</span>
          {lot.name}
          {lot.lot_type && lot.lot_type !== "regular" && (
            <span className={`ml-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${lotTypeBadgeClass[lot.lot_type] || ""}`}>
              {lotTypeLabels[lot.lot_type] || lot.lot_type}
            </span>
          )}
        </td>
        <td className="py-2 text-right font-mono">{lot.quantity.toLocaleString()}</td>
        <td className="py-2 text-right font-mono">{formatCurrency(Number(lot.price))}</td>
        <td className="py-2 text-right font-mono text-xs text-muted-foreground">{ivaRate}%</td>
        <td className="py-2 text-right font-mono text-xs text-muted-foreground">{formatCurrency(subtotalNet)}</td>
        <td className="py-2 text-right font-mono text-xs text-muted-foreground">{formatCurrency(subtotalIva)}</td>
        <td className="py-2 text-right font-mono font-semibold text-success">{formatCurrency(subtotalGross)}</td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEditTickets && (
              <>
                <button onClick={() => startEditLot(lot)} className="rounded p-1 hover:bg-secondary" title="Editar">
                  <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button onClick={() => deleteLotMutation.mutate(lot.id)} className="rounded p-1 hover:bg-destructive/20" title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ticket className="h-4 w-4 text-primary" /> Total de Bilhetes
          </div>
          <p className="font-mono text-lg font-bold">{totalTickets.toLocaleString()}</p>
          {totalCapacity > 0 && (
            <p className="text-xs text-muted-foreground">Capacidade: {totalCapacity.toLocaleString()}</p>
          )}
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-success font-bold">€</span> Receita Bruta
          </div>
          <p className="font-mono text-lg font-bold text-success">{formatCurrency(totalGrossRevenue)}</p>
          {totalCapacity > 0 && (
            <p className="text-xs text-muted-foreground">Preço médio: {formatCurrency(totalGrossRevenue / totalCapacity)}</p>
          )}
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-warning font-bold">%</span> IVA Incluído
          </div>
          <p className="font-mono text-lg font-bold text-warning">{formatCurrency(totalIva)}</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4 text-primary" /> Receita Líquida
          </div>
          <p className="font-mono text-lg font-bold text-primary">{formatCurrency(totalNetRevenue)}</p>
          <p className="text-xs text-muted-foreground">{filteredZones.length} zonas · {filteredLots.length} lotes</p>
        </div>
      </div>

      {/* Zones list */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">Zonas de Bilhetes <HelpTooltip text={helpTexts.eventTicketing} size={13} /></h3>
          <div className="flex items-center gap-2">
            {canEditTickets && (
              <>
                <Button variant="outline" size="sm" onClick={() => setForecastImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Importar Previsão
                </Button>
                <TicketForecastImportModal open={forecastImportOpen} onClose={() => setForecastImportOpen(false)} />
              </>
            )}
          {canEditTickets && (
            <button
              onClick={() => { setAddingZone(true); setEditingZoneId(null); setZoneForm(emptyZone); }}
              disabled={addingZone}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Nova Zona
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-muted-foreground text-sm">A carregar…</p>
        ) : (
          <div className="space-y-3">
            {sortedZones.map((zone) => {
              const zoneLots = getZoneLots(zone.id);
              const zoneGross = getZoneGrossRevenue(zone.id);
              const zoneNet = getZoneNetRevenue(zone.id);
              const zoneIvaTotal = getZoneIva(zone.id);
              const zoneTotalTickets = getZoneTotalTickets(zone.id);
              const isExpanded = expandedZones.has(zone.id);
              const isEditing = editingZoneId === zone.id;

              return (
                <div key={zone.id} className="rounded-lg border border-border/50 overflow-hidden">
                  {isEditing ? (
                    <div className="flex items-center gap-2 p-3 bg-primary/5" onKeyDown={handleZoneKeyDown}>
                      <input ref={zoneNameRef} value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} className={`${inputClass} flex-1`} placeholder="Nome da zona…" autoFocus />
                      <input type="number" min="0" value={zoneForm.total_capacity} onChange={(e) => setZoneForm({ ...zoneForm, total_capacity: e.target.value })} className={`${inputClass} w-28`} placeholder="Capacidade" />
                      <button onClick={handleSaveZone} disabled={saveZoneMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={cancelZone} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleZone(zone.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <Ticket className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{zone.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {zoneLots.length} lote{zoneLots.length !== 1 ? "s" : ""} · {zoneTotalTickets.toLocaleString()} bilhetes · Cap.: {(zone.total_capacity ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-semibold text-success text-sm">{formatCurrency(zoneGross)}</span>
                        <p className="text-xs text-muted-foreground font-mono">Líq. {formatCurrency(zoneNet)}</p>
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {canEditTickets && (
                          <>
                            <button onClick={() => startEditZone(zone)} className="rounded p-1 hover:bg-secondary" title="Editar zona">
                              <svg className="h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                            <button onClick={() => { if (confirm("Eliminar esta zona e todos os seus lotes?")) deleteZoneMutation.mutate(zone.id); }} className="rounded p-1 hover:bg-destructive/20" title="Eliminar zona">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {isExpanded && !isEditing && (
                    <div className="border-t border-border/30 bg-secondary/10 p-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="pb-2 text-left font-medium">Lote</th>
                              <th className="pb-2 text-right font-medium">Qtd.</th>
                              <th className="pb-2 text-right font-medium">Preço c/IVA</th>
                              <th className="pb-2 text-right font-medium">IVA %</th>
                              <th className="pb-2 text-right font-medium">Valor s/IVA</th>
                              <th className="pb-2 text-right font-medium">IVA (€)</th>
                              <th className="pb-2 text-right font-medium">Total c/IVA</th>
                              <th className="pb-2 text-right font-medium w-20">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/20">
                            {zoneLots.map((lot) => renderLotRow(lot, editingLotId === lot.id, zone.id))}
                            {addingLotForZone === zone.id && renderLotRow(null, true, zone.id)}
                          </tbody>
                          {zoneLots.length > 0 && (
                            <tfoot>
                              <tr className="border-t border-border/40">
                                <td className="py-2 text-xs font-medium text-muted-foreground">Total Zona</td>
                                <td className="py-2 text-right font-mono font-bold">{zoneTotalTickets.toLocaleString()}</td>
                                <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                                  {zoneTotalTickets > 0 ? `Ø ${formatCurrency(zoneGross / zoneTotalTickets)}` : "—"}
                                </td>
                                <td />
                                <td className="py-2 text-right font-mono font-semibold">{formatCurrency(zoneNet)}</td>
                                <td className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">{formatCurrency(zoneIvaTotal)}</td>
                                <td className="py-2 text-right font-mono font-bold text-success">{formatCurrency(zoneGross)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {canEditTickets && (
                        <button
                          onClick={() => { setAddingLotForZone(zone.id); setEditingLotId(null); setLotForm(emptyLot); }}
                          disabled={addingLotForZone === zone.id}
                          className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          <Plus className="h-3 w-3" /> Adicionar Lote
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add zone inline */}
            {addingZone && (
              <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 animate-fade-in relative z-50 pointer-events-auto" onKeyDown={handleZoneKeyDown} onClick={(e) => e.stopPropagation()}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-2">
                    <Ticket className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      ref={zoneNameRef}
                      autoFocus
                      value={zoneForm.name}
                      onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                      className={`${inputClass} min-w-0 flex-1 text-foreground`}
                      placeholder="Nome da zona (ex: VIP, Plateia, Geral)…"
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={zoneForm.total_capacity}
                    onChange={(e) => setZoneForm({ ...zoneForm, total_capacity: e.target.value })}
                    className={`${inputClass} w-full text-foreground md:w-36`}
                    placeholder="Capacidade"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleSaveZone} disabled={saveZoneMutation.isPending} className="rounded p-1.5 bg-success/15 text-success hover:bg-success/25 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={cancelZone} className="rounded p-1.5 hover:bg-secondary"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                </div>
              </div>
            )}

            {filteredZones.length === 0 && !addingZone && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {sessionId ? "Sem zonas configuradas para esta sessão." : "Sem zonas configuradas. Crie a primeira zona de bilhetes."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Revenue breakdown */}
      {filteredZones.length > 0 && filteredLots.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Resumo de Receita por Zona</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-medium">Zona</th>
                <th className="pb-2 text-right font-medium pl-4">Bilhetes</th>
                <th className="pb-2 text-right font-medium pl-4">Capacidade</th>
                <th className="pb-2 text-right font-medium pl-6">Preço Médio</th>
                <th className="pb-2 text-right font-medium pl-6">Valor s/IVA</th>
                <th className="pb-2 text-right font-medium pl-6">IVA</th>
                <th className="pb-2 text-right font-medium pl-6">Total c/IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sortedZones.map((z) => {
                const gross = getZoneGrossRevenue(z.id);
                const net = getZoneNetRevenue(z.id);
                const iva = getZoneIva(z.id);
                const tix = getZoneTotalTickets(z.id);
                return (
                  <tr key={z.id}>
                    <td className="py-2.5 font-medium">{z.name}</td>
                    <td className="py-2.5 text-right font-mono pl-4">{tix.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{(z.total_capacity ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-6">{tix > 0 ? formatCurrency(gross / tix) : "—"}</td>
                    <td className="py-2.5 text-right font-mono pl-6">{formatCurrency(net)}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-muted-foreground pl-6">{formatCurrency(iva)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-success pl-6">{formatCurrency(gross)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50 font-bold">
                <td className="py-2.5">Total</td>
                <td className="py-2.5 text-right font-mono pl-4">{totalTickets.toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{totalCapacity.toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-6">{totalTickets > 0 ? formatCurrency(totalGrossRevenue / totalTickets) : "—"}</td>
                <td className="py-2.5 text-right font-mono pl-6">{formatCurrency(totalNetRevenue)}</td>
                <td className="py-2.5 text-right font-mono text-xs text-muted-foreground pl-6">{formatCurrency(totalIva)}</td>
                <td className="py-2.5 text-right font-mono text-success pl-6">{formatCurrency(totalGrossRevenue)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* === Bilheteiras Associadas === */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Store className="h-4 w-4" /> Bilheteiras Associadas
          </h3>
          {canManageOffices && (
            <button
              onClick={() => setAddingOffice(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Associar Bilheteira
            </button>
          )}
        </div>

        {officeAssignments.length === 0 && !addingOffice ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Nenhuma bilheteira associada a este evento.</p>
            {canManageOffices && (
              <button onClick={() => setAddingOffice(true)} className="text-xs text-primary hover:underline">
                Associar bilheteira →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {officeAssignments.map((a: any) => (
              <div key={a.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{a.financial_accounts?.name}</span>
                    {a.is_conciliated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> Conciliada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canManageOffices && !a.is_conciliated && (
                      <>
                        <button onClick={() => conciliateOfficeMutation.mutate(a.id)} disabled={conciliateOfficeMutation.isPending} className="rounded-md p-1 text-muted-foreground hover:bg-emerald-500/20 hover:text-emerald-500 transition-colors" title="Marcar como conciliada">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeletingOfficeId(a.id)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {canManageOffices && a.is_conciliated && (
                      <button onClick={() => unconciliateOfficeMutation.mutate(a.id)} disabled={unconciliateOfficeMutation.isPending} className="rounded-md p-1 text-emerald-500 hover:bg-amber-500/20 hover:text-amber-500 transition-colors" title="Reverter conciliação">
                        <Lock className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Textarea
                    defaultValue={a.commission_notes ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (a.commission_notes ?? "")) {
                        updateOfficeNotesMutation.mutate({ id: a.id, notes: e.target.value });
                      }
                    }}
                    placeholder="Negociação de comissão (ex: 5% sobre vendas online)"
                    rows={1}
                    className="text-xs"
                    disabled={!canManageOffices}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {addingOffice && (
          <div className="rounded-lg border border-primary/30 p-3 space-y-3 mt-3 bg-primary/5">
            <div>
              <Label className="text-xs">Bilheteira *</Label>
              <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma bilheteira" />
                </SelectTrigger>
                <SelectContent>
                  {availableOffices.map((to: any) => (
                    <SelectItem key={to.id} value={to.id}>{to.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notas de comissão</Label>
              <Textarea value={commissionNotes} onChange={(e) => setCommissionNotes(e.target.value)} placeholder="Termos da comissão" rows={2} className="mt-1 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => addOfficeMutation.mutate()} disabled={!selectedOfficeId || addOfficeMutation.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                {addOfficeMutation.isPending ? "A guardar…" : "Associar"}
              </button>
              <button onClick={() => { setAddingOffice(false); setSelectedOfficeId(""); setCommissionNotes(""); }} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sales Log */}
      <SalesLogPanel
        eventId={eventId}
        lastSalesDate={(eventData as any)?.last_sales_date ?? null}
        isEditable={canEditTickets}
        sessionId={sessionId}
      />

      <AlertDialog open={!!deletingOfficeId} onOpenChange={() => setDeletingOfficeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desassociar bilheteira?</AlertDialogTitle>
            <AlertDialogDescription>A bilheteira será removida deste evento. As vendas registadas não serão eliminadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingOfficeId && deleteOfficeMutation.mutate(deletingOfficeId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Desassociar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
