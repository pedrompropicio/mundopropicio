import { SalesLogPanel } from "@/components/SalesLogPanel";
import { EventCourtesiesEditor } from "@/components/EventCourtesiesEditor";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Plus, Trash2, Check, X, Ticket, Layers, ChevronDown, ChevronRight, Store, CheckCircle2, Lock, Upload, FileText } from "lucide-react";
import { exportEventTicketingToPDF } from "@/lib/export-event-ticketing-pdf";
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
import { useEventScenario } from "@/contexts/EventScenarioContext";
import { BPScenarioSelector } from "@/components/bp-versions/BPScenarioSelector";
import { useBPVersions } from "@/hooks/useBPVersions";
import { Sparkles } from "lucide-react";
import { isComboAllowed, coerceLotKind } from "@/lib/combo-gating";
import { computeZoneAllocations, validateLotAgainstCapacity } from "@/lib/combo-capacity";
import { useEventIvaCountry } from "@/hooks/useEventIvaCountry";

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
  lot_kind: string; // 'simple' | 'combo'
  consumes_zone_ids: string[]; // só relevante se lot_kind='combo'
}

const emptyZone: ZoneForm = { name: "", total_capacity: "" };
const emptyLot: LotForm = { name: "", quantity: "", price: "", iva_rate: "6", lot_type: "regular", lot_kind: "simple", consumes_zone_ids: [] };

const lotKindLabels: Record<string, string> = { simple: "Simples", combo: "Combo" };
const lotKindBadgeClass: Record<string, string> = {
  simple: "",
  combo: "bg-primary/15 text-primary border-primary/30",
};

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
  // Taxas de IVA do país da cidade do evento (PT por defeito).
  const { rates: ivaRates } = useEventIvaCountry(eventId);
  const [forecastImportOpen, setForecastImportOpen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isManager, hasPermission } = useAuth();
  const { selectedVersionId, setSelectedVersionId, isScenarioMode } = useEventScenario();
  const { data: bpVersions = [] } = useBPVersions(eventId);
  const scenarioLabelForExport = useMemo(() => {
    if (!selectedVersionId) return null;
    const v = bpVersions.find((x) => x.id === selectedVersionId);
    if (!v) return null;
    return v.scenario_label ?? `v${v.version_number}`;
  }, [selectedVersionId, bpVersions]);
  const isEventLocked = eventStatus === "completed" && !isScenarioMode; // sandbox unlocks edits
  const canManageTicketsPerm = hasPermission("manage_tickets");
  const isEditor = !isAdmin && !isManager;
  // Admin/Manager: sempre. Editores: só na fase de planeamento, salvo permissão granular "manage_tickets".
  const canEditTickets = isEventLocked
    ? false
    : isEditor
      ? eventStatus === "planning" || canManageTicketsPerm
      : true;
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
    queryKey: ["event_ticket_zones", eventId, selectedVersionId ?? "active"],
    queryFn: async () => {
      let q = supabase
        .from("event_ticket_zones")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at");
      if (selectedVersionId) q = q.eq("version_id", selectedVersionId);
      else q = q.is("version_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: allLots = [] } = useQuery({
    queryKey: ["event_ticket_lots", eventId, selectedVersionId ?? "active"],
    queryFn: async () => {
      const zoneIds = zones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      let q = supabase
        .from("event_ticket_lots")
        .select("*")
        .in("zone_id", zoneIds)
        .order("lot_number");
      if (selectedVersionId) q = q.eq("version_id", selectedVersionId);
      else q = q.is("version_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: zones.length > 0,
  });

  // Fetch event data for last_sales_date + event_type + parent (gating do Combo)
  const { data: eventData } = useQuery({
    queryKey: ["event-ticketing-meta", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("last_sales_date, event_type, parent_event_id")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Datas do evento — necessárias para saber se é multi-dia
  const { data: eventDates = [] } = useQuery({
    queryKey: ["event-ticketing-dates", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_dates")
        .select("id")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Combo só faz sentido em FESTIVAL multi-dia (>1 data) e não em sub-eventos de turnê.
  const comboGating = useMemo(
    () => ({
      event_type: (eventData as any)?.event_type ?? null,
      parent_event_id: (eventData as any)?.parent_event_id ?? null,
      event_dates_count: eventDates.length,
    }),
    [eventData, eventDates],
  );
  const comboAllowed = useMemo(() => isComboAllowed(comboGating), [comboGating]);

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
        version_id: selectedVersionId, // null=Active, uuid=scenario sandbox
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
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId, selectedVersionId ?? "active"] });
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
      queryClient.invalidateQueries({ queryKey: ["event_ticket_zones", eventId, selectedVersionId ?? "active"] });
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId, selectedVersionId ?? "active"] });
      toast({ title: "Zona eliminada" });
    },
  });

  // Lot CRUD
  const saveLotMutation = useMutation({
    mutationFn: async ({ form, zoneId, id }: { form: LotForm; zoneId: string; id: string | null }) => {
      const { data: allZones, error: zonesError } = await supabase
        .from("event_ticket_zones").select("id, name, total_capacity").eq("event_id", eventId);
      if (zonesError) throw zonesError;
      const zoneIds = (allZones ?? []).map((z: any) => z.id);
      const { data: lotsAll } = zoneIds.length
        ? await supabase.from("event_ticket_lots")
            .select("id, zone_id, quantity, lot_number, is_combo, consumes_zone_ids")
            .in("zone_id", zoneIds)
        : { data: [] as any[] };
      const currentLots = (lotsAll ?? []).filter((l: any) => l.zone_id === zoneId);
      const newQty = parseInt(form.quantity) || 0;
      const kind = coerceLotKind(form.lot_kind, comboGating);
      const isCombo = kind === "combo";
      // Combo: garante que a zona âncora também é consumida (UX defensiva)
      const consumesZoneIds = isCombo
        ? Array.from(new Set([zoneId, ...(form.consumes_zone_ids || [])]))
        : [];

      const err = validateLotAgainstCapacity(
        { zone_id: zoneId, quantity: newQty, is_combo: isCombo, consumes_zone_ids: consumesZoneIds },
        ((allZones ?? []) as any[]).map((z) => ({ id: z.id, name: z.name, total_capacity: z.total_capacity })),
        ((lotsAll ?? []) as any[]).map((l: any) => ({
          id: l.id, zone_id: l.zone_id, quantity: l.quantity,
          is_combo: !!l.is_combo, consumes_zone_ids: l.consumes_zone_ids ?? [],
        })),
        id,
      );
      if (err) throw new Error(err);

      const nextLotNumber = id ? currentLots.find((l: any) => l.id === id)?.lot_number ?? 1 : currentLots.length + 1;
      const payload: any = {
        zone_id: zoneId,
        name: form.name,
        quantity: newQty,
        price: parseFloat(form.price) || 0,
        iva_rate: parseInt(form.iva_rate) || 6,
        lot_number: nextLotNumber,
        lot_type: form.lot_type || "regular",
        lot_kind: kind,
        is_combo: isCombo,
        consumes_zone_ids: consumesZoneIds,
        version_id: selectedVersionId,
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
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId, selectedVersionId ?? "active"] });
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
      queryClient.invalidateQueries({ queryKey: ["event_ticket_lots", eventId, selectedVersionId ?? "active"] });
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
    setLotForm({
      name: l.name,
      quantity: String(l.quantity),
      price: String(l.price),
      iva_rate: String(l.iva_rate ?? 6),
      lot_type: l.lot_type || "regular",
      lot_kind: coerceLotKind(l.lot_kind, comboGating),
      consumes_zone_ids: Array.isArray(l.consumes_zone_ids) ? l.consumes_zone_ids : [],
    });
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

  const zonePublicSummary = useMemo(() => {
    const allocations = computeZoneAllocations(
      sortedZones.map((z: any) => ({ id: z.id, name: z.name, total_capacity: z.total_capacity })),
      allLots.map((l: any) => ({
        id: l.id,
        zone_id: l.zone_id,
        quantity: l.quantity,
        is_combo: !!l.is_combo || l.lot_kind === "combo",
        consumes_zone_ids: l.consumes_zone_ids ?? [],
      })),
    );
    const allocationByZone = new Map(allocations.map((a) => [a.zone_id, a]));
    const revenueByAnchorZone = new Map<string, { tickets: number; gross: number; net: number; iva: number }>();
    for (const z of sortedZones) revenueByAnchorZone.set(z.id, { tickets: 0, gross: 0, net: 0, iva: 0 });
    for (const l of filteredLots as any[]) {
      const rate = Number(l.iva_rate ?? 6);
      const qty = Number(l.quantity) || 0;
      const price = Number(l.price) || 0;
      const current = revenueByAnchorZone.get(l.zone_id);
      if (!current) continue;
      current.tickets += qty;
      current.gross += qty * price;
      current.net += qty * netFromGross(price, rate);
      current.iva += qty * ivaFromGross(price, rate);
    }
    return sortedZones.map((z: any) => ({
      zone: z,
      public: allocationByZone.get(z.id) ?? {
        zone_id: z.id,
        zone_name: z.name,
        capacity: Number(z.total_capacity || 0),
        used_simple: 0,
        used_combo: 0,
        used_total: 0,
        remaining: Number(z.total_capacity || 0),
        exceeded: false,
      },
      revenue: revenueByAnchorZone.get(z.id) ?? { tickets: 0, gross: 0, net: 0, iva: 0 },
    }));
  }, [allLots, filteredLots, sortedZones]);

  const zonePublicTotals = useMemo(() => zonePublicSummary.reduce(
    (acc, row) => ({
      simple: acc.simple + row.public.used_simple,
      combo: acc.combo + row.public.used_combo,
      total: acc.total + row.public.used_total,
      tickets: acc.tickets + row.revenue.tickets,
      gross: acc.gross + row.revenue.gross,
      net: acc.net + row.revenue.net,
      iva: acc.iva + row.revenue.iva,
    }),
    { simple: 0, combo: 0, total: 0, tickets: 0, gross: 0, net: 0, iva: 0 },
  ), [zonePublicSummary]);

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
      const otherZonesForCombo = filteredZones.filter((z: any) => z.id !== zoneId);
      const isComboEditing = lotForm.lot_kind === "combo";
      return (
        <>
        <tr key={lot?.id || "new"} className="bg-primary/5" onKeyDown={(e) => handleLotKeyDown(e, zoneId)}>
          <td className="py-1.5 pr-2">
            <div className="flex items-center gap-1.5">
              <input ref={lotNameRef} value={lotForm.name} onChange={(e) => setLotForm({ ...lotForm, name: e.target.value })} className={inputClass} placeholder="Nome do lote…" autoFocus />
              {comboAllowed && (
                <select
                  value={lotForm.lot_kind}
                  onChange={(e) => setLotForm({ ...lotForm, lot_kind: e.target.value, consumes_zone_ids: e.target.value === "combo" ? lotForm.consumes_zone_ids : [] })}
                  className={`${inputClass} w-24`}
                  title="Tipo: Simples (1 zona) ou Combo (multi-zona)"
                >
                  <option value="simple">Simples</option>
                  <option value="combo">Combo</option>
                </select>
              )}
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
              {ivaRates.map((r) => (<option key={r} value={String(r)}>{r}%</option>))}
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
        {isComboEditing && (
          <tr className="bg-primary/5">
            <td colSpan={8} className="px-2 pb-3">
              <div className="rounded border border-primary/30 bg-background/40 p-2.5">
                <div className="text-xs font-medium text-primary mb-1.5 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Combo — zonas adicionais consumidas (cada bilhete vendido abate 1 lugar em cada uma)
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">
                  A zona âncora <strong>já é consumida automaticamente</strong>. Selecione as outras zonas-dia para as quais o combo dá direito a entrar.
                </div>
                {otherZonesForCombo.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Não há outras zonas neste evento. Crie as zonas-dia antes de configurar o combo.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {otherZonesForCombo.map((z: any) => {
                      const checked = (lotForm.consumes_zone_ids || []).includes(z.id);
                      return (
                        <label key={z.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs cursor-pointer transition-colors ${checked ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:bg-secondary/40"}`}>
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={checked}
                            onChange={(e) => {
                              const cur = new Set(lotForm.consumes_zone_ids || []);
                              if (e.target.checked) cur.add(z.id); else cur.delete(z.id);
                              setLotForm({ ...lotForm, consumes_zone_ids: Array.from(cur) });
                            }}
                          />
                          {z.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
        </>
      );
    }


    return (
      <tr key={lot.id} className="group hover:bg-muted/20 transition-colors">
        <td className="py-2 pr-3">
          <span className="text-xs text-muted-foreground mr-1.5">{lot.lot_number}º</span>
          {lot.name}
          {lot.lot_kind === "combo" && (
            <span className={`ml-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${lotKindBadgeClass.combo}`}>
              Combo
            </span>
          )}
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
      {/* Scenario selector — só aparece se existir pelo menos 1 cenário no evento */}
      <BPScenarioSelector
        eventId={eventId}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
      />

      {/* Banner de sandbox — apenas em modo cenário */}
      {isScenarioMode && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-start gap-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-primary">A editar bilheteira de um cenário sandbox</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              As alterações em zonas e lotes ficam isoladas neste cenário e não afetam a Versão Ativa em produção.
              As vendas reais (Log de Vendas) continuam vinculadas à Versão Ativa.
            </p>
          </div>
        </div>
      )}

      {/* Banner Combo/Passe — só em festivais multi-dia */}
      {comboAllowed && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-primary">Festival multi-dia — secção Passes/Combos disponível</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Cria <strong>Passes/Combos</strong> abaixo (1 produto multi-zona, com vantagens próprias) para vender bilhetes válidos para vários dos {eventDates.length} dias do festival.
              Cada combo vendido conta como 1 pessoa em cada dia coberto, mas a receita é registada uma única vez no DRE.
            </p>
          </div>
        </div>
      )}

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

      {/* Secção dedicada de Combos foi removida — combos agora são lotes
          com is_combo=true dentro das próprias zonas (UI rica vem na próxima iteração). */}

      {/* Zones list */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">Zonas de Bilhetes <HelpTooltip text={helpTexts.eventTicketing} size={13} /></h3>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setExportingPDF(true);
                try {
                  await exportEventTicketingToPDF({
                    eventId,
                    includeChildren: true,
                    versionId: selectedVersionId,
                    scenarioLabel: scenarioLabelForExport,
                  });
                  sonnerToast.success(
                    selectedVersionId ? "PDF do cenário gerado" : "PDF da Bilheteria gerado",
                  );
                } catch (err: any) {
                  sonnerToast.error("Erro ao gerar PDF", { description: err?.message ?? String(err) });
                } finally {
                  setExportingPDF(false);
                }
              }}
              disabled={exportingPDF}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
              title="Exportar relatório de conferência da Bilheteria em PDF"
            >
              <FileText className="h-3.5 w-3.5" /> {exportingPDF ? "A gerar…" : "PDF"}
            </button>
            {canEditTickets && (
              <Button variant="outline" size="sm" onClick={() => setForecastImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Importar Previsão
              </Button>
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
          <TicketForecastImportModal open={forecastImportOpen} onClose={() => setForecastImportOpen(false)} />

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
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Resumo de Público e Receita por Zona/Dia</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-medium">Zona</th>
                <th className="pb-2 text-right font-medium pl-4">Público</th>
                <th className="pb-2 text-right font-medium pl-4">Simples</th>
                <th className="pb-2 text-right font-medium pl-4">Combos</th>
                <th className="pb-2 text-right font-medium pl-4">Capacidade</th>
                <th className="pb-2 text-right font-medium pl-4">Bilhetes vendidos</th>
                <th className="pb-2 text-right font-medium pl-6">Preço Médio</th>
                <th className="pb-2 text-right font-medium pl-6">Valor s/IVA</th>
                <th className="pb-2 text-right font-medium pl-6">IVA</th>
                <th className="pb-2 text-right font-medium pl-6">Total c/IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {zonePublicSummary.map(({ zone: z, public: attendance, revenue }) => {
                const tix = Math.round(revenue.tickets);
                const publicTotal = Math.round(attendance.used_total);
                const gross = revenue.gross;
                const net = revenue.net;
                const iva = revenue.iva;
                return (
                  <tr key={z.id}>
                    <td className="py-2.5 font-medium">{z.name}</td>
                    <td className="py-2.5 text-right font-mono font-semibold pl-4">{publicTotal.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{Math.round(attendance.used_simple).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{Math.round(attendance.used_combo).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{(z.total_capacity ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{tix.toLocaleString()}</td>
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
                <td className="py-2.5 text-right font-mono pl-4">{Math.round(zonePublicTotals.total).toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{Math.round(zonePublicTotals.simple).toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{Math.round(zonePublicTotals.combo).toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{totalCapacity.toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-4">{Math.round(zonePublicTotals.tickets).toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono text-muted-foreground pl-6">{zonePublicTotals.tickets > 0 ? formatCurrency(zonePublicTotals.gross / zonePublicTotals.tickets) : "—"}</td>
                <td className="py-2.5 text-right font-mono pl-6">{formatCurrency(zonePublicTotals.net)}</td>
                <td className="py-2.5 text-right font-mono text-xs text-muted-foreground pl-6">{formatCurrency(zonePublicTotals.iva)}</td>
                <td className="py-2.5 text-right font-mono text-success pl-6">{formatCurrency(zonePublicTotals.gross)}</td>
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

      {/* Sales Log — sempre vinculado à Versão Ativa, nunca aos cenários sandbox */}
      {!isScenarioMode && (
        <SalesLogPanel
          eventId={eventId}
          lastSalesDate={(eventData as any)?.last_sales_date ?? null}
          isEditable={canEditTickets}
          sessionId={sessionId}
        />
      )}
      {isScenarioMode && (
        <div className="glass rounded-xl p-4 text-xs text-muted-foreground border border-dashed">
          Log de vendas reais não está disponível em modo cenário — volta à Versão Ativa para registar/visualizar vendas.
        </div>
      )}

      {/* Cortesias por dia × zona × cenário (Real / Break Even / Projecção) */}
      {!isScenarioMode && <EventCourtesiesEditor eventId={eventId} />}

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
